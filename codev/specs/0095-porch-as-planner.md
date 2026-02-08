# Specification: Porch as Planner (Task Integration)

## Metadata
- **ID**: 0095
- **Status**: draft
- **Created**: 2026-02-08

## Clarifying Questions Asked

1. **Q: Could we modify porch to generate a task list and reuse Claude Code's features?**
   A: Yes. The idea is porch becomes a planner, not an orchestrator. It reads the current state and emits Claude Code tasks for the next batch of work.

2. **Q: Shouldn't status.yaml go away if we're using tasks?**
   A: No. Tasks are session-scoped (they die when the conversation ends). status.yaml is still needed for cross-session persistence — if a builder session dies mid-implementation, porch needs to know where it left off on the next invocation.

3. **Q: Who is the executor?**
   A: Claude Code is the executor. Porch no longer spawns Claude via Agent SDK. Instead, Claude Code (the builder) calls porch to get its next tasks, executes them, then calls porch again.

4. **Q: How does the iteration loop work?**
   A: Porch generates tasks for ONE build-verify iteration at a time. After consultation results come back, Claude calls porch again. Porch reads the results, decides whether to iterate or advance, and emits the next batch of tasks.

## Problem Statement

Porch currently has a dual role: it is both the **planner** (deciding what phase comes next, what the build-verify loop should do) and the **orchestrator** (spawning Claude via Agent SDK, running consultations as subprocesses, managing the event loop). This coupling creates several problems:

1. **Invisible execution**: When porch runs, the user sees nothing until the phase completes. There's no progress tracking, no task list, no incremental status.
2. **Redundant runtime**: Porch spawns Claude via Agent SDK, but the builder is already running inside a Claude Code session. This creates a Claude-inside-Claude nesting that wastes tokens and context.
3. **Fragile process management**: Porch manages subprocess lifecycles (Claude SDK, consult CLI), timeouts, retries, and circuit breakers — all infrastructure that Claude Code already handles.
4. **No user interaction during execution**: Once `porch run` starts, the user can't intervene until a gate or failure. With tasks, the user can see progress and interact.

## Current State

### Execution Model

`porch run <id>` enters a while loop:
1. Reads `status.yaml` to determine current phase and iteration
2. If build needed: spawns Claude via `@anthropic-ai/claude-agent-sdk` with a phase prompt, captures output to a file, retries up to 3 times with exponential backoff
3. If verify needed: spawns 3 parallel `consult` CLI subprocesses, parses verdicts
4. If all approve: runs `on_complete` (commit/push), requests gate
5. If changes requested: increments iteration, injects review feedback into next prompt, loops
6. Gate blocks execution until `porch approve` is called

### Key State (`status.yaml`)

- `phase`: Current protocol phase (specify, plan, implement, review)
- `iteration`: Current build-verify iteration (1-based, persisted)
- `build_complete`: Whether build finished in current iteration
- `history[]`: All previous iterations with build output paths + review file paths
- `gates{}`: Gate status (pending/approved with timestamps)
- `plan_phases[]`: Extracted plan phases with per-phase status
- `current_plan_phase`: Which plan phase is active
- `awaiting_input`: Whether worker signaled BLOCKED

### Existing Precedent: `--single-phase` mode

`porch run --single-phase` already does something close to the proposed model. It runs ONE build-verify cycle, then exits with structured JSON (`__PORCH_RESULT__`):
```json
{"phase": "specify", "status": "gate_needed", "gate": "spec-approval", "reviews": [...]}
```
The builder's Claude then interprets this result and decides what to do next. This proves the "porch as advisor" pattern works.

### What Works Well Today

- Deterministic phase transitions driven by protocol.json
- Comprehensive iteration history with feedback injection
- Pre-approved artifact detection (YAML frontmatter)
- Atomic state writes (temp file + rename)
- Gate mechanics preventing automation from bypassing human approval

## Desired State

Porch becomes a **pure planner**: given the current state (status.yaml + filesystem), it emits a batch of Claude Code tasks for the next step. Claude Code executes the tasks. When the batch completes (or hits a gate), Claude calls porch again.

### Invocation Flow

```
Builder session starts
  |
  v
Claude calls: porch next <id>
  |
  v
Porch reads: status.yaml + protocol.json + filesystem
  |
  v
Porch emits: TaskCreate calls (or structured JSON that Claude interprets)
  |
  v
Claude Code creates tasks, executes them
  |
  v
Tasks complete (or hit gate boundary)
  |
  v
Claude calls: porch next <id>  (loop)
```

### Example: SPIR Protocol for Spec 0094

**Invocation 1** (spec exists, not yet reviewed):
```
Tasks emitted:
  1. Run 3-way consultation on spec (consult spec 0094 --model gemini/codex/claude)
  2. Read consultation results, incorporate feedback, update spec if needed
  3. [GATE] Request human approval of spec (porch gate 0094)
```

**Invocation 2** (spec approved, no plan exists):
```
Tasks emitted:
  1. Read the approved spec, create implementation plan
  2. Run 3-way consultation on plan
  3. Incorporate feedback, update plan
  4. [GATE] Request human approval of plan (porch gate 0094)
```

**Invocation 3** (plan approved with 2 phases):
```
Tasks emitted:
  1. Implement Phase 1: Update CSS mobile block
  2. Implement Phase 2: Add .new-shell-row class in JS
  3. Run build check (npm run build)
  4. Run test check (npm test)
  5. Run 3-way review on implementation
  6. If reviewers flag issues: fix and re-consult (up to N iterations)
  7. [GATE] Request human approval
```

### What Porch Still Does

- Reads protocol.json to determine phase ordering, checks, gates
- Reads status.yaml to know current phase, iteration, history
- Reads filesystem to detect pre-approved artifacts
- Computes the next batch of tasks based on all the above
- Updates status.yaml when phases advance (via `porch done`, `porch approve`)
- Tracks iteration history (build outputs, review files)

### What Porch No Longer Does

- Spawns Claude via Agent SDK (claude.ts)
- Manages subprocess lifecycles
- Runs the while loop / event loop
- Manages timeouts, retries, circuit breakers (Claude Code handles its own)
- Streams output to files (Claude Code does this natively)

### What Claude Code Gains

- Native task progress UI (spinners, completion status)
- User can see what's happening at every step
- User can intervene between tasks
- Tasks are visible in the conversation, not hidden in a subprocess

## Stakeholders
- **Primary Users**: Builders (AI agents running inside Claude Code sessions)
- **Secondary Users**: Architects (humans monitoring builder progress)
- **Technical Team**: Codev maintainers
- **Business Owners**: Project owner (Waleed)

## Success Criteria
- [ ] `porch next <id>` reads state and outputs structured task definitions
- [ ] Claude Code builder can consume task definitions and create tasks
- [ ] status.yaml is updated correctly across session boundaries
- [ ] Pre-approved artifact detection still works (phases skipped)
- [ ] Gates still require explicit human approval via `porch approve`
- [ ] Build-verify iteration loop works across invocations (iteration count persists)
- [ ] History tracking preserved (build outputs + review files referenced)
- [ ] Existing protocols (SPIR, MAINTAIN, TICK) work without modification to protocol.json
- [ ] A builder can be killed and restarted, and `porch next` picks up where it left off

## Constraints

### Technical Constraints
- Claude Code tasks are session-scoped — they do not persist across sessions
- status.yaml must remain the persistent state store
- Protocol definitions (protocol.json) should not change
- Must support all existing phase types: build_verify, per_plan_phase
- Consultation still runs via `consult` CLI (no change to that tool)

### Business Constraints
- Backward compatible: `porch run` should still work for users not using Claude Code
- The `porch approve` gate workflow must remain human-only

## Assumptions
- Claude Code's TaskCreate/TaskUpdate API is available to porch (either directly or via structured output that Claude interprets)
- The builder's Claude Code session has access to `consult`, `git`, and build tools
- One builder session works on one project at a time

## Solution Approaches

### Approach 1: Structured JSON Output

Porch outputs task definitions as structured JSON. Claude Code reads the output and creates tasks.

```
$ porch next 0094
{
  "tasks": [
    {
      "subject": "Run 3-way consultation on spec",
      "activeForm": "Running spec consultation",
      "description": "Run: consult spec 0094 --model gemini && consult spec 0094 --model codex && consult spec 0094 --model claude\n\nRun all three in parallel in the background."
    },
    {
      "subject": "Incorporate consultation feedback",
      "activeForm": "Incorporating reviewer feedback",
      "description": "Read consultation output files. If any REQUEST_CHANGES, update the spec to address feedback. Re-commit.",
      "blockedBy": [0]
    }
  ],
  "gate": "spec-approval",
  "phase": "specify",
  "iteration": 1
}
```

**Pros**:
- Porch stays a simple CLI tool, no dependency on Claude Code internals
- Output is testable and inspectable
- Works with any executor that can read JSON

**Cons**:
- Requires Claude to interpret JSON and call TaskCreate — an extra translation layer
- Task descriptions must be comprehensive enough for Claude to execute without further context

**Estimated Complexity**: Medium
**Risk Level**: Low

### Approach 2: Claude Code Skill

Porch is wrapped as a Claude Code skill (`/porch 0094`). The skill reads porch output and directly calls TaskCreate.

**Pros**:
- Seamless UX — user just types `/porch 0094`
- No JSON interpretation needed — skill handles the translation
- Can directly access TaskCreate/TaskUpdate APIs

**Cons**:
- Tighter coupling to Claude Code's skill system
- Skill code needs to understand task API
- Harder to test in isolation

**Estimated Complexity**: Medium
**Risk Level**: Medium

### Approach 3: Hybrid (Recommended)

Porch outputs structured JSON (Approach 1). A thin Claude Code skill (`/porch`) calls `porch next`, parses the JSON, and creates tasks. This separates concerns:
- Porch: state machine logic, protocol knowledge
- Skill: translation layer between porch JSON and Claude Code tasks

**Pros**:
- Clean separation of concerns
- Porch remains independently testable
- Skill is thin and simple
- Both pieces can evolve independently

**Cons**:
- Two things to maintain (porch CLI + skill wrapper)

**Estimated Complexity**: Medium
**Risk Level**: Low

## Open Questions

### Critical (Blocks Progress)
- [x] Does status.yaml stay? **Yes** — tasks are session-scoped, need persistent state.
- [ ] How does Claude signal task completion back to porch? Options: (a) Claude calls `porch done <id>` after each batch, (b) porch infers from filesystem on next `porch next` call, (c) hybrid.
- [ ] Should `porch run` (the current orchestrator mode) be kept as a fallback, or removed?

### Important (Affects Design)
- [ ] How should iteration failures be communicated? If consultation returns REQUEST_CHANGES, the next `porch next` call should emit "fix and re-consult" tasks. Does porch need to be told the consultation failed, or does it read the review files directly?
- [ ] For `per_plan_phase` protocols, does porch emit tasks for ALL plan phases at once, or one phase at a time?
- [ ] Should the AWAITING_INPUT signal still exist, or do tasks make it redundant (user can see the task is stuck)?

### Nice-to-Know (Optimization)
- [ ] Could porch directly output Claude Code TaskCreate tool-call JSON, avoiding the need for a separate skill?

## Performance Requirements
- `porch next` should complete in <2 seconds (it's a read + compute, no network)
- No change to consultation or build performance (those are unchanged)

## Security Considerations
- Gate approval must still require `--a-human-explicitly-approved-this` flag
- No change to authentication model

## Test Scenarios

### Functional Tests
1. **Happy path**: `porch next` on a fresh project emits specify tasks; after spec approval, emits plan tasks; after plan approval, emits implement tasks
2. **Resume after crash**: Builder dies mid-implementation. New session calls `porch next`. Porch reads status.yaml, emits remaining tasks for current phase.
3. **Pre-approved artifact**: Spec has `approved:` frontmatter. `porch next` skips specify, emits plan tasks directly.
4. **Iteration loop**: Consultation returns REQUEST_CHANGES. Next `porch next` call emits "fix and re-consult" tasks with previous feedback injected.
5. **Gate blocking**: `porch next` after verify-approve emits gate task. Until `porch approve` is called, subsequent `porch next` calls emit "waiting for approval" status.

### Non-Functional Tests
1. `porch next` completes in <2s on a project with 10+ iterations of history
2. Large status.yaml files (50+ history entries) don't cause issues

## Dependencies
- **Claude Code task API**: TaskCreate, TaskUpdate, TaskList
- **Existing porch modules**: state.ts, protocol.ts, plan.ts, prompts.ts (reused)
- **Removed dependency**: claude.ts (Agent SDK spawning) — no longer needed for task mode

## References
- `codev/resources/protocol-format.md` — Protocol to Task Conversion algorithm (already documented)
- `packages/codev/src/commands/porch/run.ts` — Current execution loop
- `packages/codev/src/commands/porch/state.ts` — State management
- `packages/codev/src/commands/porch/types.ts` — State schema

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|-------------------|
| Task descriptions not detailed enough for Claude to execute | Medium | High | Include full prompt content in task descriptions, test with real protocols |
| Session dies mid-iteration, tasks lost | Medium | Low | status.yaml tracks iteration + history; `porch next` regenerates tasks |
| Backward compatibility break for `porch run` users | Low | Medium | Keep `porch run` as legacy mode initially |
| Gate approval timing — user approves in one session, builder in another | Low | Medium | status.yaml gates persist; `porch next` checks gate status on each call |

## Notes

The `--single-phase` mode in the current `porch run` already demonstrates this pattern: it runs one cycle, outputs `__PORCH_RESULT__` JSON, and lets the outer Claude decide what's next. This spec generalizes that pattern into the primary execution model.

The Protocol to Task Conversion algorithm documented in `protocol-format.md` provides the conceptual foundation. This spec makes it concrete and addresses the state management, iteration, and gate concerns that the simple conversion algorithm glossed over.

---

## Amendments

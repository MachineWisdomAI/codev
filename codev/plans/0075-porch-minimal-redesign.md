# Plan 0075: Porch Minimal Redesign (Porch Outer)

## Overview

Redesign porch so it is the outer loop that spawns and controls Claude, rather than Claude calling porch commands. This gives hard enforcement of phase transitions and prevents Claude from bypassing protocol.

## Dependencies

- Existing porch command structure (`packages/codev/src/commands/porch/`)
- Claude CLI (`claude` command)
- Existing state management (`state.ts`, `protocol.ts`)

## Implementation Phases

```json
{
  "phases": [
    {
      "id": "phase_1",
      "title": "Core Run Loop and REPL",
      "description": "Implement the main run loop that spawns Claude and accepts user commands"
    },
    {
      "id": "phase_2",
      "title": "Claude Spawning and Output Monitoring",
      "description": "Spawn Claude with output to file, watch for signals"
    },
    {
      "id": "phase_3",
      "title": "Phase Prompts and Integration",
      "description": "Build phase-specific prompts, update af kickoff to use porch run"
    }
  ]
}
```

### Phase 1: Core Run Loop and REPL

**Goal:** Create the main `porch run <id>` command with a simple REPL.

**Files to create/modify:**

| File | Action |
|------|--------|
| `packages/codev/src/commands/porch/run.ts` | Create: Main run loop |
| `packages/codev/src/commands/porch/repl.ts` | Create: REPL implementation |
| `packages/codev/src/commands/porch/index.ts` | Modify: Add `run` subcommand |

**Steps:**

1. **Create `run.ts`** with the main loop:
   - Load state for project
   - Determine current phase
   - Build phase-specific prompt
   - Spawn Claude with output to file
   - Enter REPL loop
   - Handle signals and advance state

2. **Create `repl.ts`** with commands:
   - `t` / `tail` - Tail Claude's output file
   - `i` / `interact` - Switch to interactive mode
   - `a` / `approve` - Approve current gate
   - `s` / `status` - Show current status
   - `q` / `quit` - Kill Claude and exit
   - `Enter` - Refresh status display

3. **Status line display:**
   ```
   [0074] phase: specify | stage: writing | claude: running (2m 34s)
   > _
   ```

**Verification:**
```bash
# Command parses and shows help
node packages/codev/bin/porch.js run --help

# Can start with a project ID
node packages/codev/bin/porch.js run 0074
```

### Phase 2: Claude Spawning and Output Monitoring

**Goal:** Spawn Claude with output to file, detect completion signals.

**Files to create/modify:**

| File | Action |
|------|--------|
| `packages/codev/src/commands/porch/claude.ts` | Create: Claude spawning/monitoring |
| `packages/codev/src/commands/porch/signals.ts` | Create: Signal detection |

**Steps:**

1. **Create `claude.ts`**:
   - Spawn Claude with `child_process.spawn`
   - Redirect stdout/stderr to `.porch/claude-output.txt`
   - Track process state (running, exited, killed)
   - Provide methods: `kill()`, `isRunning()`, `getExitCode()`

2. **Create `signals.ts`**:
   - Watch output file for signal markers
   - Detect: `PHASE_COMPLETE`, `GATE_NEEDED`, `BLOCKED: <reason>`
   - Return signal type and any payload

3. **Output file management:**
   - Create `.porch/` directory if needed
   - Clear output file at start of each phase
   - Rotate old output files (keep last 5)

**Verification:**
```bash
# Can spawn Claude and capture output
node packages/codev/bin/porch.js run 0074
# Type 't' to tail and see Claude output
```

### Phase 3: Phase Prompts and Integration

**Goal:** Build phase-specific prompts, update kickoff to use porch run.

**Files to create/modify:**

| File | Action |
|------|--------|
| `packages/codev/src/commands/porch/prompts.ts` | Create: Phase prompt templates |
| `packages/codev/src/agent-farm/commands/kickoff.ts` | Modify: Use `porch run` |

**Steps:**

1. **Create `prompts.ts`**:
   - Template for each phase (specify, plan, implement, defend, evaluate, review)
   - Include: phase instructions, files to create/modify, exit criteria
   - Inject project-specific context (ID, title, spec path, plan path)

2. **Example prompt structure:**
   ```markdown
   # Phase: Specify

   You are writing the specification for project 0074: remove-today-summary

   ## Your Task
   1. Read the existing codebase to understand what needs to be removed
   2. Write the spec at: codev/specs/0074-remove-today-summary.md
   3. Run 3-way consultation and add results to spec
   4. Commit the spec file

   ## When Done
   Output exactly: PHASE_COMPLETE
   If you need human input: GATE_NEEDED
   If you are stuck: BLOCKED: <reason>
   ```

3. **Update kickoff.ts**:
   - Change from running Claude directly to running `porch run <id>`
   - Porch becomes the outer loop that manages Claude

4. **Gate handling in REPL:**
   - When `GATE_NEEDED` detected, show gate prompt
   - User types `a` to approve
   - Porch updates status.yaml with approval
   - Porch spawns Claude for next phase

**Verification:**
```bash
# Full flow test
af kickoff -p 0075 -t "test-feature"
# Should start porch run, which spawns Claude
# User can tail, interact, approve gates
```

## Success Criteria

1. `porch run <id>` works as outer loop
2. Claude spawns with phase-specific prompts
3. Output goes to `.porch/claude-output.txt`
4. REPL accepts commands while Claude runs
5. Signals detected and state advances
6. Gates block until user approves
7. `af kickoff` uses porch run

## Estimated Scope

| Metric | Value |
|--------|-------|
| New files | 4 (run.ts, repl.ts, claude.ts, prompts.ts) |
| Modified files | 2 (index.ts, kickoff.ts) |
| Lines of code | ~500 |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Claude CLI interface changes | Low | Medium | Abstract spawn logic, easy to update |
| Signal detection unreliable | Medium | High | Simple text markers, clear documentation |
| REPL complexity grows | Low | Low | Keep commands minimal (5 commands max) |

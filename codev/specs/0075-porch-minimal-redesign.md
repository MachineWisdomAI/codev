# Spec 0075: Porch Minimal Redesign (v3 - Build-Verify Cycles)

## Problem Statement

The current porch design treats 3-way consultations as an afterthought - something Claude runs, or something bolted on as "verification". This is backwards. **Build-verify cycles should be first-class citizens** in protocol execution.

## Proposed Solution

Porch orchestrates **build-verify cycles** where:
1. **BUILD**: Porch spawns Claude to create an artifact (spec, plan, code, PR)
2. **VERIFY**: Porch runs 3-way consultation (Gemini, Codex, Claude)
3. **ITERATE**: If any reviewer says REQUEST_CHANGES, feedback is fed back to Claude
4. **COMPLETE**: When all approve (or max iterations), commit + push + proceed

### Design Principles

1. **3-way reviews are automatic** - Porch runs them, not Claude
2. **Feedback loops** - Consultation feedback feeds back into next Claude iteration
3. **Capped iterations** - Max N attempts before proceeding to gate
4. **Commit boundaries** - Each stage ends with commit + push
5. **Human gates** - Come after build-verify cycles, not within them

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  BUILD-VERIFY CYCLE (repeated up to max_iterations)            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────┐                                              │
│  │ BUILD         │  Porch spawns Claude with:                   │
│  │ (Claude)      │  - Phase prompt                              │
│  │               │  - Previous feedback (if iteration > 1)      │
│  └───────┬───────┘                                              │
│          │ Claude signals PHASE_COMPLETE                        │
│          ▼                                                      │
│  ┌───────────────┐                                              │
│  │ VERIFY        │  Porch runs in parallel:                     │
│  │ (3-way)       │  - consult --model gemini <artifact>         │
│  │               │  - consult --model codex <artifact>          │
│  │               │  - consult --model claude <artifact>         │
│  └───────┬───────┘                                              │
│          │                                                      │
│          ▼                                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ All APPROVE?                                               │  │
│  │   YES → commit + push → proceed to GATE                   │  │
│  │   NO  → synthesize feedback → next iteration              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Max iterations reached? → proceed to GATE anyway              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### SPIDER Protocol Flow

```
SPECIFY (build-verify cycle)
    │
    ├── BUILD: Claude writes spec
    ├── VERIFY: 3-way reviews spec
    ├── ITERATE: Until all approve or max_iterations
    ├── COMMIT: git add spec && git commit && git push
    │
    └── GATE: spec-approval (human)

PLAN (build-verify cycle)
    │
    ├── BUILD: Claude writes plan
    ├── VERIFY: 3-way reviews plan
    ├── ITERATE: Until all approve or max_iterations
    ├── COMMIT: git add plan && git commit && git push
    │
    └── GATE: plan-approval (human)

IMPLEMENT (build-verify cycle per plan phase)
    │
    ├── For each plan phase:
    │   ├── BUILD: Claude implements code + tests
    │   ├── VERIFY: 3-way reviews implementation
    │   ├── ITERATE: Until all approve or max_iterations
    │   └── COMMIT: git add files && git commit && git push
    │
    └── (no human gate per phase)

REVIEW (build-verify cycle)
    │
    ├── BUILD: Claude creates review doc + PR
    ├── VERIFY: 3-way reviews entire PR
    ├── ITERATE: Until all approve or max_iterations
    ├── COMMIT: git add review && git commit && git push
    │
    └── GATE: pr-ready (human) → merge PR
```

### Protocol Definition

The protocol.json format expresses build-verify cycles:

```json
{
  "phases": [
    {
      "id": "specify",
      "name": "Specify",
      "type": "build_verify",
      "build": {
        "prompt": "specify.md",
        "artifact": "codev/specs/${PROJECT_ID}-*.md"
      },
      "verify": {
        "type": "spec-review",
        "models": ["gemini", "codex", "claude"],
        "parallel": true
      },
      "max_iterations": 3,
      "on_complete": {
        "commit": true,
        "push": true
      },
      "gate": "spec-approval"
    }
  ]
}
```

### Feedback Synthesis

When verification fails, porch synthesizes feedback for the next iteration:

```markdown
# Previous Review Feedback

## Gemini (REQUEST_CHANGES)
- Missing error handling for edge case X
- Consider adding Y to requirements

## Codex (APPROVE)
- Looks good overall

## Claude (REQUEST_CHANGES)
- Unclear success criteria for item 3

---

Please address the above feedback and signal PHASE_COMPLETE when done.
```

This is prepended to Claude's prompt on subsequent iterations.

### Consultation Output

Porch captures consultation verdicts:

| Verdict | Meaning |
|---------|---------|
| `APPROVE` | No changes needed, ready to proceed |
| `REQUEST_CHANGES` | Issues found, needs revision |

Porch parses the final line of each consultation for the verdict.

### State Tracking

```yaml
id: "0075"
title: "porch-minimal-redesign"
protocol: "spider"
phase: "specify"
iteration: 2
max_iterations: 3
last_feedback:
  gemini: { verdict: "REQUEST_CHANGES", summary: "..." }
  codex: { verdict: "APPROVE", summary: "..." }
  claude: { verdict: "REQUEST_CHANGES", summary: "..." }
gates:
  spec-approval: { status: "pending" }
```

### REPL Commands

Same as before, but simplified since consultations are automatic:

| Command | Description |
|---------|-------------|
| `t` / `tail` | Tail the current output |
| `s` / `status` | Show current status |
| `a` / `approve` | Approve current gate |
| `q` / `quit` | Kill current process and exit |
| `Enter` | Refresh status |

### Display During Verify Phase

```
[0075] SPECIFY - Iteration 2/3
  BUILD: complete
  VERIFY: running...
    gemini: running (45s)
    codex:  APPROVE
    claude: running (30s)

> _
```

## Success Criteria

1. Build-verify cycles are first-class in protocol.json
2. Porch runs 3-way consultations automatically (not Claude)
3. Feedback from failed verifications feeds back to next iteration
4. Each stage ends with commit + push
5. Human gates come after build-verify cycles complete
6. Max iteration cap prevents infinite loops
7. Clean status display showing build/verify progress

## Out of Scope

- Multiple concurrent Claude sessions
- Desktop notifications
- Custom consultation models per phase

## Consultation

(To be filled after 3-way review)

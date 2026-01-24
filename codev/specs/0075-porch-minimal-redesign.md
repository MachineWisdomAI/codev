# Spec 0075: Porch Minimal Redesign (v2 - Porch Outer)

## Problem Statement

The "Claude outer" approach (Claude calls porch as a tool) doesn't work reliably:
- Claude doesn't follow instructions consistently
- Claude edits files it shouldn't (status.yaml)
- Claude skips porch commands and does its own thing
- No hard enforcement of phase transitions

We need porch to be the outer loop with hard control over Claude.

## Proposed Solution

**Porch is the outer loop.** Porch spawns Claude for each phase, monitors output, and controls transitions.

### Design Principles

1. **Simple REPL** - Porch runs a minimal command loop
2. **Async Claude** - Claude runs in background, output to file
3. **File watching** - Porch watches output file until Claude finishes
4. **User control** - User can tail, interact, or approve at any time
5. **Hard state control** - Only porch modifies status.yaml

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  PORCH (outer loop)                                     │
│  ┌─────────────────────────────────────────────────────┐│
│  │  Simple REPL                                        ││
│  │  - Watches Claude output file                       ││
│  │  - Accepts user commands                            ││
│  │  - Updates status.yaml                              ││
│  └─────────────────────────────────────────────────────┘│
│                          │                              │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────────┐│
│  │  CLAUDE (spawned per phase)                         ││
│  │  - Runs with phase-specific prompt                  ││
│  │  - Output goes to file                              ││
│  │  - No access to status.yaml                         ││
│  │  - Exits when phase work complete                   ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## REPL Commands

The porch REPL accepts these commands while Claude is running:

| Command | Description |
|---------|-------------|
| `t` / `tail` | Tail the current Claude session output |
| `i` / `interact` | Switch to interactive mode (user can type to Claude) |
| `a` / `approve` | Approve the current gate |
| `s` / `status` | Show current project status |
| `q` / `quit` | Kill Claude and exit porch |
| `Enter` | Refresh status display |

### Default Behavior

When no command is entered, porch shows a status line:
```
[0074] phase: specify | stage: writing | claude: running (2m 34s)
> _
```

## Phase Execution Flow

### 1. Porch starts

```bash
porch run 0074
```

Porch:
1. Loads status.yaml
2. Determines current phase and stage
3. Builds phase-specific prompt for Claude
4. Spawns Claude with output to `.porch/claude-output.txt`
5. Enters REPL loop

### 2. Claude runs

Claude executes the phase work:
- Specify: Write the spec, run consultations
- Plan: Write the plan with JSON phases
- Implement: Write code for current plan phase
- Defend: Write tests
- Evaluate: Run 3-way review, commit
- Review: Create PR

Claude's prompt includes:
- The phase instructions
- What files to create/modify
- Clear exit criteria ("when done, output PHASE_COMPLETE")

### 3. Porch detects completion

Porch watches Claude's output for:
- `PHASE_COMPLETE` - Claude finished the phase successfully
- `GATE_NEEDED` - Claude needs human approval
- `BLOCKED: <reason>` - Claude is stuck
- Process exit - Claude crashed or was killed

### 4. Porch advances state

When Claude signals completion:
1. Porch runs phase checks (build, test, etc.)
2. If checks pass, porch updates status.yaml
3. Porch determines next phase
4. If gate required, porch waits for user approval
5. Porch spawns Claude for next phase

## Gate Handling

When a phase has a gate (e.g., spec-approval):

1. Claude finishes phase work, outputs `GATE_NEEDED`
2. Porch displays:
   ```
   ════════════════════════════════════════════════════════════
   GATE: spec-approval

   Review the spec at: codev/specs/0074-remove-today-summary.md

   Type 'a' or 'approve' to approve and continue.
   ════════════════════════════════════════════════════════════
   [0074] phase: specify | WAITING FOR APPROVAL
   > _
   ```
3. User reviews the artifact
4. User types `a` to approve
5. Porch updates status.yaml with approval
6. Porch spawns Claude for next phase

## Claude Prompts

Each phase gets a specific prompt. Example for `specify` phase:

```markdown
# Phase: Specify

You are writing the specification for project 0074: remove-today-summary

## Your Task

1. Read the existing codebase to understand what needs to be removed
2. Write the spec at: codev/specs/0074-remove-today-summary.md
3. Run 3-way consultation and add results to spec
4. Commit the spec file

## Requirements

- Spec must have: Summary, Motivation, Requirements, Acceptance Criteria
- Spec must have ## Consultation section with 3-way review results
- Spec must NOT contain implementation phases (those go in the plan)

## When Done

Output exactly: PHASE_COMPLETE

If you need human input, output: GATE_NEEDED
If you are stuck, output: BLOCKED: <reason>
```

## State File

Same as before - status.yaml tracks project state:

```yaml
id: "0074"
title: "remove-today-summary"
protocol: "spider"
phase: "specify"
plan_phases: []
current_plan_phase: null
gates:
  spec-approval: { status: "pending" }
  plan-approval: { status: "pending" }
started_at: "2026-01-23T..."
updated_at: "2026-01-23T..."
```

**Critical**: Only porch modifies this file. Claude never touches it.

## Output File

Claude's output goes to `.porch/claude-output.txt`:
- Porch watches this file for signals
- User can `tail` to see progress
- File is cleared at start of each phase

## Implementation

### Core Loop (pseudocode)

```typescript
async function run(projectId: string) {
  const state = loadState(projectId);

  while (true) {
    const phase = getCurrentPhase(state);
    if (!phase) break; // Protocol complete

    // Build prompt for this phase
    const prompt = buildPhasePrompt(state, phase);

    // Spawn Claude with output to file
    const claude = spawnClaude(prompt, OUTPUT_FILE);

    // REPL loop while Claude runs
    while (claude.running) {
      const input = await promptUser(getStatusLine(state));

      switch (input) {
        case 't': tailOutput(); break;
        case 'i': interactiveMode(claude); break;
        case 'a': approveGate(state); break;
        case 's': showStatus(state); break;
        case 'q': claude.kill(); return;
      }

      // Check for Claude signals
      const signal = checkOutputForSignal(OUTPUT_FILE);
      if (signal === 'PHASE_COMPLETE') break;
      if (signal === 'GATE_NEEDED') waitForApproval(state);
      if (signal.startsWith('BLOCKED:')) handleBlocked(signal);
    }

    // Run checks and advance
    if (await runChecks(phase)) {
      advancePhase(state);
      saveState(state);
    }
  }

  console.log('Protocol complete!');
}
```

### File Structure

```
packages/codev/src/commands/porch/
├── index.ts        # CLI entry point
├── run.ts          # Main run loop (NEW)
├── repl.ts         # REPL implementation (NEW)
├── claude.ts       # Claude spawning/monitoring (NEW)
├── prompts.ts      # Phase prompt templates (NEW)
├── state.ts        # State management (existing)
├── protocol.ts     # Protocol loading (existing)
├── plan.ts         # Plan parsing (existing)
└── checks.ts       # Check running (existing)
```

## Success Criteria

1. Porch is the outer loop - Claude never runs unsupervised
2. User can tail, interact, or approve at any time
3. Only porch modifies status.yaml
4. Claude signals completion with simple text markers
5. Gates block until user explicitly approves
6. Phase checks run before advancing
7. Clean REPL interface with status display

## Out of Scope

- Desktop notifications
- Complex signal parsing (just simple text markers)
- Nested substates
- Multiple concurrent Claude sessions

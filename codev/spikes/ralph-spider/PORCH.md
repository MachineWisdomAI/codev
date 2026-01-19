# Porch - Protocol Orchestrator

Porch is the TypeScript CLI implementation resulting from the Ralph-SPIDER spike (Spec 0072).

## CLI Usage

```bash
# List available protocols
codev porch list

# Initialize a project with a protocol
codev porch init spider 0073 user-auth

# Run the protocol loop
codev porch run spider 0073

# Approve a gate
codev porch approve 0073 specify_approval

# Check status
codev porch status 0073

# Show protocol definition
codev porch show spider
```

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would execute without running |
| `--no-claude` | Skip Claude invocations (for testing) |
| `--poll-interval <s>` | Override gate check interval |
| `--description <text>` | Project description (for init) |

---

## Protocol Definition Format

Protocols are defined in JSON files at `codev/porch/protocols/<name>.json`.

### Schema

```json
{
  "$schema": "./protocol-schema.json",
  "name": "spider",
  "version": "1.0.0",
  "description": "SPIDER: Specify, Plan, Implement, Defend, Evaluate, Review",

  "phases": [
    {
      "id": "specify",
      "name": "Specify",
      "prompt": "specify.md",
      "substates": ["draft", "review"],
      "initial_substate": "draft",
      "signals": {
        "SPEC_READY_FOR_REVIEW": "specify:review"
      }
    },
    {
      "id": "complete",
      "name": "Complete",
      "terminal": true
    }
  ],

  "gates": [
    {
      "id": "specify_approval",
      "after_state": "specify:review",
      "next_state": "plan:draft",
      "type": "human",
      "description": "Human approval of specification"
    }
  ],

  "transitions": {
    "specify:draft": {
      "default": "specify:review"
    },
    "specify:review": {
      "on_gate_pass": "plan:draft",
      "wait_for": "specify_approval"
    }
  },

  "initial_state": "specify:draft",

  "config": {
    "poll_interval": 30,
    "max_iterations": 100,
    "prompts_dir": "prompts"
  }
}
```

### Phase Definition

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique phase identifier |
| `name` | string | Display name |
| `prompt` | string | Prompt file in `prompts/` directory |
| `substates` | string[] | Optional sub-states (e.g., ["draft", "review"]) |
| `initial_substate` | string | Starting substate |
| `signals` | object | Signal → next state mapping |
| `terminal` | boolean | If true, this is the final state |
| `backpressure` | object | Commands that must pass before transition |

### Gate Definition

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique gate identifier |
| `after_state` | string | State that triggers this gate |
| `next_state` | string | State to transition to after gate passes |
| `type` | "human" \| "automated" | Approval type |
| `description` | string | Human-readable description |

### Transition Configuration

| Field | Description |
|-------|-------------|
| `default` | Next state when phase completes normally |
| `on_gate_pass` | Next state when gate is approved |
| `wait_for` | Gate ID to wait for |
| `on_backpressure_pass` | Next state when backpressure checks pass |
| `on_backpressure_fail` | State to return to when checks fail |

### Backpressure Configuration

```json
"backpressure": {
  "tests_pass": {
    "command": "npm test",
    "on_fail": "defend"
  },
  "build_pass": {
    "command": "npm run build",
    "on_fail": "implement"
  }
}
```

---

## State File Format

Project state is stored in `codev/status/<project-id>-<name>.md`.

### Example

```yaml
---
# Protocol Orchestrator Status File
# Protocol: spider
# Project: 0073 - user-auth
# Created: 2026-01-19T10:00:00Z

id: "0073"
title: "user-auth"
protocol: "spider"
current_state: "specify:draft"
current_phase: ""

# Human approval gates
gates:
  specify_approval:
    human: { status: pending }
  plan_approval:
    human: { status: pending }

# Backpressure gates
backpressure:
  tests_pass: { status: pending }
  build_pass: { status: pending }

# Implementation phase tracking
phases: {}
---

## Project Description

<!-- Add a brief description of what this project will build -->

## Log

- 2026-01-19 10:00: Initialized spider protocol
- 2026-01-19 10:05: State changed to specify:review
- 2026-01-19 10:10: Gate specify_approval approved
- 2026-01-19 10:10: State changed to plan:draft
```

### Gate Status Values

| Status | Meaning |
|--------|---------|
| `pending` | Not yet approved |
| `passed` | Approved and can proceed |
| `failed` | Rejected (requires re-work) |

---

## Signal-Based Communication

Claude outputs signals using XML tags to indicate phase completion:

```xml
<signal>SPEC_READY_FOR_REVIEW</signal>
<signal>PLAN_READY_FOR_REVIEW</signal>
<signal>PHASE_IMPLEMENTED</signal>
<signal>TESTS_PASSING</signal>
<signal>EVALUATION_COMPLETE</signal>
<signal>REVIEW_COMPLETE</signal>
```

The orchestrator extracts these signals and uses them to determine state transitions.

---

## Available Protocols

### SPIDER (Full Development)

```
specify:draft → specify:review → [GATE] → plan:draft → plan:review → [GATE] →
implement → defend → evaluate → review → complete
```

Phases: `specify` → `plan` → `implement` → `defend` → `evaluate` → `review` → `complete`

Gates:
- `specify_approval` - Human approves spec before planning
- `plan_approval` - Human approves plan before implementation

### TICK (Fast Amendments)

```
understand → implement → verify → complete
```

No gates - fully autonomous for small changes to existing specs.

### BUGFIX (Issue Fixes)

```
diagnose → fix → test → pr → complete
```

No gates - autonomous bug fixing from GitHub issues.

---

## File Locations

| Path | Description |
|------|-------------|
| `packages/codev/src/commands/porch/` | TypeScript implementation |
| `codev-skeleton/porch/protocols/` | Protocol JSON definitions |
| `codev-skeleton/porch/prompts/` | Phase prompt templates |
| `codev/status/` | Runtime state files |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        codev porch                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Protocol   │───▶│   Status     │───▶│   Claude     │  │
│  │   JSON       │    │   File       │    │   CLI        │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         ▼                   ▼                   ▼           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Phases     │    │   Gates      │    │   Signals    │  │
│  │   Prompts    │    │   States     │    │   Output     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Loop Flow

1. **Read state** from status file
2. **Check for gate** blocking current state
   - If blocked: poll until approved
3. **Load prompt** for current phase
4. **Invoke Claude** with phase prompt + status context
5. **Extract signal** from output
6. **Update state** based on signal or default transition
7. **Repeat** until terminal state

---

## Extending Protocols

### Adding a New Protocol

1. Create `codev/porch/protocols/myprotocol.json`
2. Define phases, gates, transitions
3. Create prompts in `codev/porch/prompts/`
4. Test with `codev porch init myprotocol 0001 test-project`

### Adding a Phase to Existing Protocol

1. Add phase object to `phases` array
2. Add transitions for the new phase
3. Create prompt file
4. Update any affected transitions

### Custom Backpressure

Define commands that must pass before state transition:

```json
{
  "id": "deploy",
  "backpressure": {
    "staging_healthy": {
      "command": "curl -f https://staging.example.com/health",
      "on_fail": "deploy"
    }
  }
}
```

---

## Implementation Notes

### Why TypeScript?

- Integrated with existing codev CLI
- Type safety for protocol definitions
- Better error messages
- Easier to extend and maintain

### Fresh Context Pattern

Each Claude invocation receives:
- Current status file contents
- Phase-specific prompt
- Protocol and project metadata

No reliance on conversation memory - state is always in files.

### Gate Polling

When blocked by a gate, the orchestrator:
1. Logs the blocked state
2. Sleeps for `poll_interval` seconds
3. Re-checks gate status
4. Continues when approved

This allows async approval via `codev porch approve`.

---
approved: 2026-02-17
validated: [architect]
---

# Spec 399: af cron — Scheduled Workspace Tasks

## Problem

Automated monitoring tasks that should run periodically (CI health checks, builder status sweeps, stale PR detection) currently require the architect to remember to check manually. Today's CI failure streak (50 consecutive red builds) went unnoticed because nothing was watching.

## Solution

Add a lightweight cron scheduler to Tower that runs workspace-defined tasks on a schedule and delivers results via `af send` to the architect.

### Architecture

Tower already has interval-based patterns (rate limit cleanup, shellper periodic cleanup). `af cron` follows the same pattern — a scheduler loop that ticks on an interval, checks for due tasks, and executes them.

```
Tower Server
├── existing intervals (rate limit, shellper cleanup)
└── CronScheduler (new)
    ├── loads task definitions from .af-cron/ per workspace
    ├── tracks last-run timestamps in SQLite
    └── executes tasks → sends results via af send to architect
```

### Task Definition Format

Each workspace can have a `.af-cron/` directory with YAML task files:

```yaml
# .af-cron/ci-health.yaml
name: CI Health Check
schedule: "*/30 * * * *"    # every 30 minutes
enabled: true
command: gh run list --limit 5 --json status,conclusion --jq '[.[] | select(.conclusion == "failure")] | length'
condition: "output != '0'"  # only notify if failures found
message: "CI Alert: ${output} recent failures. Run `gh run list --limit 5` to investigate."
target: architect           # who gets the af send
```

```yaml
# .af-cron/stale-prs.yaml
name: Stale PR Check
schedule: "0 */4 * * *"    # every 4 hours
enabled: true
command: gh pr list --json number,title,updatedAt --jq '[.[] | select((now - (.updatedAt | fromdateiso8601)) > 86400)] | length'
condition: "output != '0'"
message: "Stale PRs: ${output} PRs haven't been updated in 24+ hours."
target: architect
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Human-readable task name |
| `schedule` | yes | Cron expression (standard 5-field) |
| `enabled` | no | Default `true`. Set `false` to disable without deleting |
| `command` | yes | Shell command to execute |
| `condition` | no | JS expression evaluated against `output` (string). If omitted, always notifies |
| `message` | yes | Message template. `${output}` is replaced with command stdout |
| `target` | no | Default `architect`. Could also be a builder ID |
| `timeout` | no | Command timeout in seconds. Default 30 |
| `cwd` | no | Working directory. Default is workspace root |

### Schedule Parsing

Standard 5-field cron: `minute hour day-of-month month day-of-week`

Shortcuts:
- `@hourly` — `0 * * * *`
- `@daily` — `0 9 * * *` (9am, not midnight)
- `@startup` — run once when Tower starts

No need for a full cron library — a minimal parser handling `*`, `*/N`, and fixed values covers the use cases.

### Execution Model

1. **Tick interval**: Scheduler checks every 60 seconds
2. **Per-workspace**: Loads `.af-cron/*.yaml` from each known workspace
3. **Deduplication**: Tracks `last_run` per task in SQLite — only runs if schedule says it's due
4. **Execution**: Spawns shell command via `child_process.execSync` (with timeout)
5. **Condition check**: If `condition` is set, evaluates it. If falsy, skip notification
6. **Delivery**: Calls Tower's internal send handler to deliver message to target terminal
7. **Logging**: Results logged to Tower log file

### SQLite Schema

```sql
CREATE TABLE cron_tasks (
  id TEXT PRIMARY KEY,              -- workspace_path + task_name hash
  workspace_path TEXT NOT NULL,
  task_name TEXT NOT NULL,
  last_run INTEGER,                 -- unix timestamp
  last_result TEXT,                 -- 'success' | 'failure' | 'skipped'
  last_output TEXT,                 -- truncated stdout
  UNIQUE(workspace_path, task_name)
);
```

### CLI Commands

```bash
af cron list                    # List all cron tasks for current workspace
af cron list --all              # List across all workspaces
af cron status                  # Show last run times and results
af cron run <task-name>         # Manually trigger a task now
af cron enable <task-name>      # Enable a disabled task
af cron disable <task-name>     # Disable without deleting
```

### Tower API Routes

```
GET  /api/cron/tasks              # List tasks (optional ?workspace= filter)
GET  /api/cron/tasks/:name/status # Get task status and history
POST /api/cron/tasks/:name/run    # Manually trigger a task
```

### Dashboard Integration

Add a "Cron" section to the workspace overview showing:
- Task name, schedule, last run, last result
- Manual "Run Now" button
- Enable/disable toggle

This is optional and can be a follow-up.

## What Changes

1. **New module**: `packages/codev/src/agent-farm/servers/tower-cron.ts` — scheduler, task loading, execution
2. **Tower server**: Start scheduler in listen callback, stop in gracefulShutdown
3. **Tower routes**: Add `/api/cron/*` routes
4. **SQLite migrations**: Add `cron_tasks` table
5. **AF CLI**: Add `af cron` subcommand
6. **Skeleton**: Add `.af-cron/` to gitignore template, add example task files

## What Stays The Same

- `af send` mechanism (reused as-is)
- Workspace detection
- Tower startup/shutdown lifecycle (just adds one more interval)
- No changes to builder or architect roles

## Scope

- Cron parser: minimal, no external dependencies
- Execution: synchronous shell commands with timeout (no parallel task execution)
- No retry logic — if a task fails, it reports the failure and waits for next schedule
- Dashboard integration deferred to follow-up

## Acceptance Criteria

- [ ] `.af-cron/*.yaml` files are loaded per workspace
- [ ] Tasks execute on schedule and deliver messages via `af send`
- [ ] Conditional notifications work (only alert when condition is true)
- [ ] `af cron list` shows configured tasks
- [ ] `af cron status` shows last run times and results
- [ ] `af cron run <name>` triggers immediate execution
- [ ] Task state persists across Tower restarts (SQLite)
- [ ] Disabled tasks are skipped
- [ ] Command timeouts work (don't hang Tower)
- [ ] Tower log shows cron activity

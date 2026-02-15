# Spec 0115: Consultation Metrics & Cost Tracking

## Problem

The `consult` CLI runs 3-way parallel reviews (Gemini, Codex, Claude) which are expensive and time-consuming. A single consultation round spawns three model invocations, each taking 60-250 seconds, with no measurement of cost or duration beyond a per-project text log (`$PROJECT/.consult/history.log`) that records model name, duration, and a 100-character query preview. There is no aggregation, no cost tracking, no way to answer questions like:

- How much are we spending on consultations per week?
- Which model is slowest? Which fails most often?
- How much time does the spec-review phase add to SPIR?
- Are porch-automated consultations more expensive than manual ones?

The existing `logQuery()` function (consult/index.ts line 237) writes a flat text file per project. This is not queryable, not centralized, and does not capture token usage, cost, exit codes, or protocol context.

## Motivation

- **Cost visibility**: Each consult round costs $5-25+ depending on models and codebase size. Without measurement, there is no feedback loop on spending.
- **Performance insight**: Duration varies wildly (Codex is often 60s, Claude SDK can be 200s+). Tracking this enables informed decisions about model selection and timeout tuning.
- **Protocol analytics**: Knowing how many consultations each protocol triggers (SPIR averages 3 rounds, TICK 1, BUGFIX 1) helps quantify the overhead of multi-agent review.
- **Failure detection**: Consultations silently fail (exit code non-zero) and the builder retries. Without metrics, repeated failures are invisible.

## Requirements

### R1: SQLite metrics database

Store all consultation metrics in a global SQLite database at `~/.codev/metrics.db` (not per-project — consultations span multiple repos).

**Schema** (`consultation_metrics` table):

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Row ID |
| `timestamp` | TEXT NOT NULL | ISO 8601 UTC timestamp of invocation start |
| `model` | TEXT NOT NULL | Model identifier: `gemini`, `codex`, `claude` |
| `review_type` | TEXT | Review type flag: `spec-review`, `plan-review`, `impl-review`, `pr-ready`, `integration-review`, or null for general |
| `subcommand` | TEXT NOT NULL | Consult subcommand: `pr`, `spec`, `plan`, `impl`, `general` |
| `protocol` | TEXT | Protocol context: `spir`, `tick`, `bugfix`, `manual` |
| `project_id` | TEXT | Porch project ID if applicable (e.g., `0108`, `bugfix-269`), null for manual invocations |
| `duration_seconds` | REAL NOT NULL | Wall-clock duration from subprocess start to exit |
| `input_tokens` | INTEGER | Input/prompt tokens if parseable from subprocess output, null otherwise |
| `output_tokens` | INTEGER | Output/completion tokens if parseable, null otherwise |
| `cost_usd` | REAL | Estimated cost in USD if calculable, null otherwise |
| `exit_code` | INTEGER NOT NULL | Subprocess exit code (0 = success) |
| `workspace_path` | TEXT NOT NULL | Absolute path to the git repository root |
| `error_message` | TEXT | First 500 chars of stderr if exit_code != 0, null on success |

Create `~/.codev/` directory if it does not exist. Use `better-sqlite3` (already a project dependency) for synchronous writes.

**Migration**: Create the table on first access with `CREATE TABLE IF NOT EXISTS`. No migration framework needed for v1 — this is a new database.

### R2: Time measurement

Wrap every consult invocation to measure wall-clock duration:

1. Record `startTime = Date.now()` immediately before spawning the subprocess (or starting the Claude SDK session).
2. Record `endTime = Date.now()` when the subprocess exits (or SDK session completes).
3. Compute `duration_seconds = (endTime - startTime) / 1000`.

This is partially done already — `runConsultation()` captures `startTime` and computes duration for the `logQuery()` call. Extend this to also write to SQLite.

### R3: Token and cost capture

Where possible, parse token usage from subprocess output:

- **Codex (OpenAI)**: Codex CLI prints a summary line on exit that may include token counts. If present, parse `input_tokens` and `output_tokens`. Cost can be estimated using known per-token pricing for `gpt-5.2-codex` (store pricing as a config constant, update manually when pricing changes).
- **Gemini**: Gemini CLI may report usage statistics. If parseable, capture tokens and estimate cost using Gemini 3 Pro pricing.
- **Claude (Agent SDK)**: The SDK `result` message may include usage metadata. If `message.usage` or similar fields are present, capture them. The Claude SDK streams messages — check the final `result` event for usage data.

**Important**: Token/cost capture is best-effort. If a model's CLI does not expose token counts, store null. Never fail a consultation because token parsing failed. Wrap all parsing in try/catch and log warnings to stderr on parse failure.

### R4: Protocol and project context

When porch invokes `consult`, it must pass protocol and project context so the metrics record knows what triggered it.

**Mechanism**: Add two new CLI flags to the `consult` command:

```
--protocol <spir|tick|bugfix>
--project-id <id>
```

These are optional. When omitted (manual invocations), `protocol` defaults to `manual` and `project_id` defaults to null.

**Porch integration**: In `next.ts`, the consultation command strings already include model, type, output path, etc. Add `--protocol ${state.protocol} --project-id ${state.id}` to the command template.

### R5: `consult stats` subcommand

Add a new subcommand `consult stats` that queries `~/.codev/metrics.db` and displays summary statistics.

**Default output** (no flags):

```
Consultation Metrics (last 30 days)
====================================

Total invocations: 47
Total duration:    4.2 hours
Total cost:        $182.50 (estimated, 31 with cost data)
Success rate:      93.6% (44/47)

By Model:
  gemini   16 calls   avg 72s    $38.20   94% success
  codex    16 calls   avg 95s    $44.30   88% success
  claude   15 calls   avg 185s   $100.00  100% success

By Review Type:
  impl-review        24 calls   avg 132s   $98.00
  spec-review         9 calls   avg  85s   $34.50
  plan-review         8 calls   avg  78s   $30.00
  integration-review  6 calls   avg 110s   $20.00

By Protocol:
  spir     30 calls   $142.00
  bugfix   12 calls   $28.50
  manual    5 calls   $12.00
```

**Flags**:

| Flag | Description |
|------|-------------|
| `--days <N>` | Limit to last N days (default: 30) |
| `--model <name>` | Filter by model |
| `--type <name>` | Filter by review type |
| `--protocol <name>` | Filter by protocol |
| `--project <id>` | Filter by project ID |
| `--last <N>` | Show last N individual invocations (table format) |
| `--json` | Output as JSON instead of table |

**Individual invocations** (`--last N`):

```
Last 5 consultations:
TIMESTAMP            MODEL   TYPE         DURATION  COST     EXIT  PROJECT
2026-02-15 14:32:01  claude  impl-review  185.2s    $6.50    0     0108
2026-02-15 14:32:01  codex   impl-review   92.1s    $2.80    0     0108
2026-02-15 14:32:01  gemini  impl-review   68.4s    $2.40    0     0108
2026-02-15 12:10:45  claude  spec-review  142.0s    $4.20    0     0113
2026-02-15 12:10:44  codex   spec-review   78.3s    $2.10    1     0113
```

### R6: Async metrics recording

Metrics recording must NOT slow down the consult flow. After the subprocess exits and the duration is computed:

1. Write the metrics row to SQLite synchronously (better-sqlite3 is sync and fast — a single INSERT takes <1ms).
2. This happens **after** the subprocess has completed and output has been written, so it does not add latency to the consultation itself.
3. If the SQLite write fails (e.g., disk full, permissions), log a warning to stderr and continue. Never throw.

The <100ms overhead requirement is easily met since better-sqlite3 INSERTs are sub-millisecond.

### R7: Retain existing log

Keep the existing `logQuery()` text log as-is. It serves a different purpose (per-project quick history). The SQLite database is the new structured store. Do not remove or modify `logQuery()`.

## Design Details

### New files

| File | Purpose |
|------|---------|
| `packages/codev/src/commands/consult/metrics.ts` | MetricsDB class: open/create database, insert row, query for stats |
| `packages/codev/src/commands/consult/stats.ts` | `consult stats` subcommand implementation |
| `packages/codev/src/commands/consult/token-parser.ts` | Best-effort token/cost parsing from subprocess output |

### Modified files

| File | Change |
|------|--------|
| `packages/codev/src/commands/consult/index.ts` | Add `--protocol` and `--project-id` flags to `ConsultOptions`. After each consultation completes, call `MetricsDB.record()`. |
| `packages/codev/src/commands/porch/next.ts` | Add `--protocol` and `--project-id` flags to consultation command templates |
| CLI argument parser (wherever `consult` subcommands are registered) | Add `stats` subcommand routing and flag parsing |

### MetricsDB API

```typescript
interface MetricsRecord {
  timestamp: string;        // ISO 8601
  model: string;
  reviewType: string | null;
  subcommand: string;
  protocol: string;         // defaults to 'manual'
  projectId: string | null;
  durationSeconds: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  exitCode: number;
  workspacePath: string;
  errorMessage: string | null;
}

class MetricsDB {
  constructor();                              // Opens/creates ~/.codev/metrics.db
  record(entry: MetricsRecord): void;         // INSERT row
  query(filters: StatsFilters): MetricsRow[]; // SELECT with filters
  summary(filters: StatsFilters): StatsSummary; // Aggregated summary
  close(): void;
}
```

### Token parsing strategy

Create a `parseTokenUsage(model: string, output: string): TokenUsage | null` function that attempts to extract token counts from subprocess stdout/stderr. This is inherently fragile — CLI output formats change. The function should:

1. Use model-specific regex patterns to find token counts
2. Return null (not throw) if parsing fails
3. Log a debug-level message when parsing fails so we can update patterns

Cost estimation uses a static pricing table:

```typescript
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  codex:  { inputPer1M: 2.00, outputPer1M: 8.00 },   // gpt-5.2-codex pricing
  gemini: { inputPer1M: 1.25, outputPer1M: 10.00 },   // gemini-3-pro-preview pricing
  claude: { inputPer1M: 15.00, outputPer1M: 75.00 },   // claude-opus-4-6 pricing
};
```

Update these constants manually when pricing changes. They are only used for estimation.

## Non-Requirements

- No real-time dashboard or web UI for metrics
- No alerting on cost thresholds (can be added later as a separate spec)
- No modification to the consultation subprocesses themselves (Gemini CLI, Codex CLI, Claude SDK internals)
- No API-level token tracking — we instrument at the `consult` CLI level, not inside each model's SDK
- No automatic pricing updates — pricing constants are updated manually
- No metrics export (CSV, etc.) beyond the `--json` flag

## Acceptance Criteria

1. Every `consult` invocation (manual or porch-automated) creates a row in `~/.codev/metrics.db` with at minimum: timestamp, model, subcommand, duration, exit code, and workspace path.
2. `consult stats` displays a summary table with total invocations, duration, cost, and success rate broken down by model, review type, and protocol.
3. `consult stats --last 10` displays the 10 most recent invocations in tabular format.
4. `consult stats --json` outputs the same data as JSON.
5. Metrics recording adds <100ms overhead to consult invocations (measured by comparing before/after wall-clock times).
6. When porch invokes consult, the resulting metrics row includes the correct `protocol` and `project_id` values.
7. Token/cost fields are populated when the model CLI provides parseable usage data; null otherwise.
8. SQLite write failures do not cause `consult` to fail — warning logged to stderr, consultation result preserved.
9. Works for all three models (gemini, codex, claude) and all subcommands (pr, spec, plan, impl, general).

## Testing

1. **Unit test**: `MetricsDB.record()` inserts a row; `MetricsDB.query()` retrieves it with correct values. Use a temp file for the test database.
2. **Unit test**: `MetricsDB.summary()` correctly aggregates duration, cost, and success rate across multiple rows.
3. **Unit test**: `parseTokenUsage()` extracts tokens from sample Codex output; returns null for unparseable output.
4. **Unit test**: `consult stats` formatting — verify table output matches expected format for known data.
5. **Unit test**: Filter flags (`--days`, `--model`, `--type`, `--protocol`, `--project`) correctly narrow query results.
6. **Integration test**: Run `consult --dry-run` with `--protocol` and `--project-id` flags, verify flags are accepted without error.
7. **Unit test**: SQLite write failure (e.g., read-only path) logs warning but does not throw.

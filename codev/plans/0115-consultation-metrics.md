# Plan: Consultation Metrics & Cost Tracking

## Metadata
- **Specification**: codev/specs/0115-consultation-metrics.md
- **Created**: 2026-02-15

## Executive Summary

Add time/cost measurement to every `consult` invocation. Store metrics in a global SQLite database (`~/.codev/metrics.db`), extract token counts from structured model output (Claude SDK result, Gemini JSON, Codex JSONL), compute costs, and provide a `consult stats` subcommand for querying.

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "MetricsDB and Usage Extractor"},
    {"id": "phase_2", "title": "Consult Integration and Output Unwrapping"},
    {"id": "phase_3", "title": "Stats Subcommand and CLI Routing"},
    {"id": "phase_4", "title": "Porch Integration and Tests"}
  ]
}
```

## Phase Breakdown

### Phase 1: MetricsDB and Usage Extractor
**Dependencies**: None

#### Objectives
- Create the SQLite metrics database module
- Create the usage extraction module for all three models

#### Files
- **Create** `packages/codev/src/commands/consult/metrics.ts`
- **Create** `packages/codev/src/commands/consult/usage-extractor.ts`

#### Implementation Details

**`metrics.ts`** — MetricsDB class:

```typescript
class MetricsDB {
  constructor()       // Opens/creates ~/.codev/metrics.db, sets WAL + busy_timeout=5000, CREATE TABLE IF NOT EXISTS
  record(entry: MetricsRecord): void   // INSERT row, try/catch with stderr warning on failure
  query(filters: StatsFilters): MetricsRow[]  // SELECT with WHERE clauses from filters
  summary(filters: StatsFilters): StatsSummary // Aggregated stats (totals, by-model, by-type, by-protocol)
  close(): void
}
```

- Database path: `~/.codev/metrics.db`
- Directory creation: `fs.mkdirSync(~/.codev, { recursive: true, mode: 0o700 })`
- Pragmas: `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout = 5000`
- Schema: single `consultation_metrics` table with 15 columns per spec R1
- `record()`: wrap INSERT in try/catch — on failure, `console.error()` warning, never throw
- `summary()`: use SQL aggregation (COUNT, SUM, AVG, GROUP BY) for the three breakdowns (model, review_type, protocol)

**`usage-extractor.ts`** — Token/cost extraction:

```typescript
interface UsageData {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

function extractUsage(model: string, output: string, sdkResult?: SDKResultMessage): UsageData | null
function extractReviewText(model: string, output: string): string | null
```

- **Claude**: Read `total_cost_usd`, `usage.input_tokens`, `usage.output_tokens`, `usage.cache_read_input_tokens` from `sdkResult`. No parsing needed.
- **Gemini**: Parse JSON, extract `stats.models.*.tokens.prompt` (input), `.candidates` (output), `.cached` (cached). Extract `response` field for review text.
- **Codex**: Parse JSONL, find `turn.completed` events, sum `usage.input_tokens`, `.cached_input_tokens`, `.output_tokens`. Extract assistant `message` events for review text.
- **Cost**: Claude = `total_cost_usd` from SDK. Gemini/Codex = `(input - cached) * inputRate + cached * cachedRate + output * outputRate`. Null if any token count missing.
- Static pricing constants: `codex: { inputPer1M: 2.00, cachedInputPer1M: 1.00, outputPer1M: 8.00 }`, `gemini: { inputPer1M: 1.25, cachedInputPer1M: 0.315, outputPer1M: 10.00 }`
- `extractReviewText()`: returns plain text from structured output (Gemini JSON `response` field, Codex JSONL `message` events). Returns null on parse failure.
- All parsing wrapped in try/catch — return null on failure, log warning to stderr.

#### Acceptance Criteria
- MetricsDB creates database and table on first construction
- `record()` inserts a row retrievable by `query()`
- `record()` warns on failure but does not throw
- `extractUsage()` correctly handles all three model formats
- `extractUsage()` returns null for malformed input
- `extractReviewText()` returns plain text from structured output
- Cost computation returns null when any token count is missing

#### Tests
- Spec tests 1, 2, 3, 4, 5, 9, 12

---

### Phase 2: Consult Integration and Output Unwrapping
**Dependencies**: Phase 1

#### Objectives
- Wire MetricsDB into the consultation flow
- Change subprocess stdout handling to always pipe
- Add JSON/JSONL output flags to Gemini and Codex commands
- Unwrap structured output to extract review text

#### Files
- **Modify** `packages/codev/src/commands/consult/index.ts`

#### Implementation Details

**Timestamp capture**: Record `timestamp = new Date().toISOString()` at invocation start (before spawning subprocess or starting SDK session). This is the invocation start time per spec R1, not the completion time.

**Protocol default**: When `protocol` is not provided via `--protocol` flag (manual invocations), default to `'manual'`. When `projectId` is not provided, default to `null`. Apply these defaults in the `consult()` function before calling `MetricsDB.record()`.

**Do NOT modify or remove the existing `logQuery()` call** — it serves a different purpose (per-project quick history) per spec R7.

**Claude path** (`runClaudeConsultation`, lines 272-337):
- Capture the `result` message when `message.type === 'result'` and `message.subtype === 'success'`. Store a reference to it.
- After the for-await loop, call `extractUsage('claude', '', sdkResult)` to get usage data.
- After writing output file (line 326-330), call `MetricsDB.record()` with the captured data (using the `timestamp` captured at start).
- On SDK error (line 319-322), still record metrics with `exitCode: 1`, `errorMessage: exception.message.substring(0, 500)`, null tokens/cost.

**Subprocess path** (`runConsultation`, lines 342-501):
- Change `stdoutMode` (line 450) from `outputPath ? 'pipe' : 'inherit'` to `'pipe'` unconditionally. This is needed to capture structured JSON/JSONL for token extraction.
- Add `--output-format json` to Gemini command args (line 409): change to `cmd = [config.cli, ...config.args, '--output-format', 'json', query]`
- Add `--json` to Codex command args (line 415-423): add `'--json'` to the cmd array.
- In the `proc.stdout.on('data')` handler (line 460-464):
  - For **Codex**: Parse each JSONL line as it arrives. If it's a `message` event with `role: "assistant"`, extract text and write to `process.stdout` in real-time. Buffer all lines for final token extraction.
  - For **Gemini**: Buffer everything (JSON is one blob). No real-time streaming possible.
- In `proc.on('close')` (line 467):
  - Call `extractReviewText(model, rawOutput)` to get plain text.
  - If extraction succeeds: write extracted text to `outputPath` and to stdout (for Gemini, which was buffered).
  - If extraction fails: write raw output to `outputPath` as-is (critical fallback per spec).
  - Call `extractUsage(model, rawOutput)` to get token/cost data.
  - Call `MetricsDB.record()` with all collected data.
  - On non-zero exit code, record with `exitCode: code`, `errorMessage: "Process exited with code N"`.

**Key change to stdout flow**:
- Currently: stdout is `'inherit'` (pass-through) when no outputPath → user sees raw output
- New: stdout is always `'pipe'` → we buffer, parse, and re-emit extracted text
- For Codex: stream assistant message text to `process.stdout` in real-time as JSONL events arrive
- For Gemini: buffer entire JSON response, then write `response` field text to `process.stdout` after completion

**ConsultOptions interface** (line 43-53): Add `protocol?: string` and `projectId?: string` fields.

#### Acceptance Criteria
- Every consultation records a metrics row (manual and porch-automated)
- Claude consultations capture exact cost and token data from SDK
- Gemini/Codex consultations capture exact tokens from structured output
- Review files contain plain text (not raw JSON/JSONL)
- Parse failures fall back to raw output (never empty review files)
- Metrics write failures warn but don't break consultation

#### Tests
- Spec tests 10, 11, 14

---

### Phase 3: Stats Subcommand and CLI Routing
**Dependencies**: Phase 1

#### Objectives
- Create the `consult stats` subcommand
- Handle CLI routing (make `-m` optional for `stats`)

#### Files
- **Create** `packages/codev/src/commands/consult/stats.ts`
- **Modify** `packages/codev/src/cli.ts`

#### Implementation Details

**`cli.ts`** (lines 84-114):
- Change `.requiredOption('-m, --model ...')` to `.option('-m, --model ...')` (make optional)
- In the action handler (line 97-113): if `subcommand === 'stats'`, import and call `handleStats(args, options)` then return. Otherwise, validate that `options.model` is present (throw `"Missing required option: -m, --model"` if missing).
- Add new options to the consult command definition:
  - `--protocol <name>` — protocol context (spir, tick, bugfix)
  - `--project-id <id>` — porch project ID

**`stats.ts`**:
- `handleStats(args: string[], options)` function
- Check if `~/.codev/metrics.db` exists. If not: print "No metrics data found. Run a consultation first." and return.
- Stats-specific flags (defined as Commander options on the consult command, but only used when `subcommand === 'stats'`):
  - `--days <N>` — limit to last N days (default: 30)
  - `--model <name>` — filter by model (note: in stats context this means "filter by", not "use")
  - `--type <name>` — filter by review type
  - `--protocol <name>` — filter by protocol
  - `--project <id>` — filter by project ID
  - `--last <N>` — show last N individual invocations (table format)
  - `--json` — output as JSON instead of table
- All these flags are registered on the consult command in `cli.ts` with `.option()` so Commander knows about them (avoids unknown option issues). They are simply ignored for non-stats subcommands.
- Default view (no `--last`): summary table matching spec R5 format
- `--last N`: individual invocations table
- `--json`: output as JSON
- Use `MetricsDB.summary()` and `MetricsDB.query()` for data retrieval.

#### Acceptance Criteria
- `consult stats` works without `-m` flag
- `consult spec 42` still requires `-m` (fails without it)
- Summary output matches spec R5 format
- `--last N` shows individual invocations
- `--json` outputs JSON
- Filter flags correctly narrow results
- Cold start (no DB) prints message and exits 0

#### Tests
- Spec tests 6, 7, 8, 13

---

### Phase 4: Porch Integration and Tests
**Dependencies**: Phase 2, Phase 3

#### Objectives
- Add `--protocol` and `--project-id` flags to porch consultation commands
- Write all unit and integration tests

#### Files
- **Modify** `packages/codev/src/commands/porch/next.ts`
- **Create** `packages/codev/src/commands/consult/__tests__/metrics.test.ts`

#### Implementation Details

**`next.ts`** (lines 436-438, 471-472):
- Append `--protocol ${state.protocol} --project-id ${state.id}` to the consultation command template strings.
- `state.protocol` and `state.id` are already in scope at these locations.

**Tests** (`packages/codev/src/commands/consult/__tests__/metrics.test.ts`) — co-located with source per project convention:
All 14 spec tests:
1. MetricsDB.record() + query() round-trip
2. MetricsDB.summary() aggregation
3. extractUsage() for Gemini JSON
4. extractUsage() for Codex JSONL (multi-turn)
5. extractUsage() for Claude SDK result
6. Stats formatting
7. Stats filter flags
8. CLI flag acceptance (--protocol, --project-id)
9. SQLite write failure handling
10. Gemini output unwrapping
11. Codex output unwrapping
12. Concurrent MetricsDB writes (WAL)
13. Cold start (no DB)
14. JSON parse failure fallback

Test approach:
- Use temp directories for test databases (avoid touching real `~/.codev/metrics.db`)
- Use sample JSON/JSONL fixtures for extraction tests
- Mock `SDKResultMessage` for Claude extraction tests

#### Acceptance Criteria
- Porch-driven consultations include `--protocol` and `--project-id` in metrics
- All 14 spec tests pass
- No changes to existing test behavior

#### Tests
- All 14 spec tests

## Dependency Map
```
Phase 1 (MetricsDB + Extractor) ──→ Phase 2 (Consult Integration)
     │                                         │
     └──→ Phase 3 (Stats CLI) ──→ Phase 4 (Porch + Tests)
                                               │
                         Phase 2 ──────────────┘
```

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Codex `--json` flag behavior differs from documented | Low | Medium | Fallback: raw output preserved, null metrics. Test with actual CLI. |
| Gemini `--output-format json` buffers break long consultations | Low | Low | Acceptable trade-off per spec. Future: `--session-summary` flag. |
| Concurrent WAL writes still hit SQLITE_BUSY | Very Low | Low | busy_timeout=5000ms gives 5s retry window. record() has try/catch. |
| Making `-m` optional introduces regression | Low | Medium | Validate `-m` required for all subcommands except `stats` in handler. |

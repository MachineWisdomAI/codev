# Review: Porch CWD / Worktree Awareness

## Summary

Implemented automatic project ID detection from the current working directory when running inside a builder worktree. This makes the numeric ID argument optional for all porch commands when invoked from within `.builders/<id>/` directories.

### Changes Made

- Added `detectProjectIdFromCwd()` in `state.ts` — extracts project ID from CWD path using regex matching against `.builders/` worktree patterns
- Added `resolveProjectId()` in `state.ts` — testable function encapsulating the full resolution priority chain (explicit arg > CWD detection > filesystem scan > error)
- Integrated CWD detection into `getProjectId()` in `index.ts` via delegation to `resolveProjectId()`
- Updated help text to mention CWD auto-detection
- Skipped a pre-existing broken WebSocket test (`tunnel-client.integration.test.ts`) that was blocking the test suite

### Files Modified

| File | Change |
|------|--------|
| `packages/codev/src/commands/porch/state.ts` | Added `detectProjectIdFromCwd()` and `resolveProjectId()` |
| `packages/codev/src/commands/porch/index.ts` | Updated `getProjectId()` to use `resolveProjectId()`, updated help text |
| `packages/codev/src/commands/porch/__tests__/state.test.ts` | Added 18 unit tests (12 for detection, 6 for priority chain) |
| `packages/codev/src/agent-farm/__tests__/tunnel-client.integration.test.ts` | Skipped pre-existing broken test |

## Spec Compliance

- [x] AC1: `porch status` works without arg from `.builders/0073/`
- [x] AC2: `porch status` works without arg from `.builders/bugfix-228/`
- [x] AC3: Detection works from subdirectories (e.g., `.builders/0073/src/commands/`)
- [x] AC4: Explicit ID argument takes precedence over CWD detection
- [x] AC5: `detectProjectId()` fallback still works from main repo root
- [x] AC6: Task/protocol worktrees produce a clear error message
- [x] AC7: Unit tests cover all naming patterns and the full resolution priority chain

## Deviations from Plan

- **Phase 2: Extracted `resolveProjectId()` as a separate function** — The plan kept the resolution logic inside `getProjectId()` (a closure in `cli()`). After 2 rounds of Codex review requesting direct priority-chain tests, the resolution logic was extracted into a testable `resolveProjectId()` function. This is a strictly better approach that makes the priority chain unit-testable without mocking `process.cwd()`.
- **Skipped unrelated broken test** — The `tunnel-client.integration.test.ts` WebSocket header forwarding test was consistently timing out on both main and the feature branch. Skipped with `.skip` and a comment to unblock the test suite. This was approved by the architect.

## Lessons Learned

### What Went Well

- The regex design was solid from the start — comprehensive test cases from the plan caught potential issues before they became bugs
- The `path.resolve()` + forward-slash normalization is a defensive measure that costs nothing
- The spec's "ID Validation" section correctly identified that downstream `findStatusPath()` handles validation, avoiding duplication

### Challenges Encountered

- **Pre-existing broken test blocking porch**: The WebSocket header forwarding test consistently timed out, blocking `porch done`. Required architect intervention to approve skipping it.
- **Codex reviewer fixation on closure testing**: Codex requested direct `getProjectId()` tests across 2 iterations, but `getProjectId()` was a closure inside `cli()`. The resolution was to extract the logic into `resolveProjectId()` — a better design that satisfied all reviewers.
- **Resumed session state mismatch**: Porch state showed phase_1 as current, but git log showed both phases already committed. The previous session had implemented code but never run `porch done`.

### What Would Be Done Differently

- Run `porch done` immediately after implementation, before ending a session
- Consider extracting testable helpers from the start rather than keeping logic in closures

## Technical Debt

- The skipped WebSocket test (`tunnel-client.integration.test.ts`) should be investigated and fixed separately
- `getProjectId()` calls `detectProjectIdFromCwd(process.cwd())` twice (once via `resolveProjectId`, once for logging) — functionally correct but mildly redundant

## Follow-up Items

- None — feature is complete and self-contained

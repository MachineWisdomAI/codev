# Review: Tower Codebase Hygiene

## Summary

Systematic cleanup of post-migration debt across the Tower codebase, addressing 11 acceptance criteria from Spec 0099. Five phases of implementation spanning dead code removal, naming fixes, CLI consolidation, state management (file tab persistence), and error handling with deduplication.

## Spec Compliance

- [x] AC1: `orphan-handler.ts` deleted (Phase 1)
- [x] AC2: All user-facing messages reference Tower, not dashboard-server (Phase 2)
- [x] AC3: `shell.ts`, `open.ts` use TowerClient with auth headers (Phase 3)
- [x] AC4: `attach.ts` generates correct Tower URLs (Phase 3)
- [x] AC5: File tabs survive Tower restart via `file_tabs` SQLite table (Phase 4)
- [x] AC6: No duplicate `getSessionName` or `encodeProjectPath` implementations (Phase 3 + Phase 5)
- [x] AC7: All existing tests pass; new tests for file tab persistence and session naming (Phase 4 + Phase 5)
- [x] AC8: Builder/UtilTerminal types no longer carry `port`/`pid` fields (Phase 1)
- [x] AC9: `getGateStatusForProject()` reads porch status from filesystem (Phase 3)
- [x] AC10: `--remote` flag removed from `af start` (Phase 1)
- [x] AC11: Tower error responses are structured JSON with `console.error` logging (Phase 5)

## Deviations from Plan

- **Phase 3**: `getGateStatusForProject` was extracted to `utils/gate-status.ts` (not originally in plan) after Codex flagged that tests were duplicating parsing logic. The extraction made the function independently testable.
- **Phase 4**: File tab helpers were extracted to `utils/file-tabs.ts` with `db` parameter injection after Codex flagged that tests exercised raw SQLite instead of production code. This added a clean separation between the pure DB operations and the Tower-specific wrappers.
- **Phase 5**: `getSessionName` was renamed to `getBuilderSessionName` in the shared module to clarify its scope when exported (builder sessions vs architect sessions).
- **Phase 5**: The `architect.ts` `getSessionName()` (zero-param, architect-specific) was intentionally left in place since it has a different signature and purpose from the builder naming convention.

## Key Metrics

- **19 commits** on the branch
- **585 tests** passing (582 existing + 3 new)
- **46 test files** (45 existing + 1 new)
- **Files created**: `utils/gate-status.ts`, `utils/file-tabs.ts`, `utils/session.ts`, `__tests__/gate-status.test.ts`, `__tests__/file-tab-persistence.test.ts`, `__tests__/session-utils.test.ts`
- **Files deleted**: `orphan-handler.ts`
- **Net LOC impact**: Approximately -80 lines (dead code removal exceeds additions)

## Lessons Learned

### What Went Well
- The five-phase ordering (dead code → naming → CLI → state → errors) was effective. Each phase was independently committable and testable with no cross-phase regressions.
- 3-way consultation caught real issues: Codex consistently pushed for tests to exercise production code rather than duplicating logic, which led to better module extraction patterns.
- SQLite write-through pattern for file tabs was clean to implement because the existing migration infrastructure was already in place.

### Challenges Encountered
- **Codex test expectations**: Codex repeatedly requested that tests import and call actual production functions rather than duplicating SQL queries. This required extracting gate-status and file-tab helpers into separate modules with dependency injection. The resulting code is better, but it added 2 extra iterations to Phases 3 and 4.
- **Naming ambiguity**: The spec referenced "shell.ts error handling" which could mean either `utils/shell.ts` (the shell exec utility) or `commands/shell.ts` (the `af shell` CLI command). The plan clarified this refers to `commands/shell.ts`, but it was initially confusing.

### What Would Be Done Differently
- **Extract testable modules upfront**: When writing functions that wrap global singletons (like `getGlobalDb()`), immediately extract the core logic with parameter injection for testability. This would have avoided iteration 2 rework in Phases 3 and 4.
- **Check all three reviewers' patterns early**: Codex consistently favored testing actual exported functions over raw SQL. Knowing this pattern from Phase 1 would have saved time in later phases.

### Methodology Improvements
- The porch consultation cycle works well for catching real issues but adds latency when the same reviewer pattern repeats. Consider a "fast approve" path when the only reviewer requesting changes has had its specific feedback addressed.

## Technical Debt

- Tower error response format has two conventions: terminal routes use `{ error: 'CODE', message: '...' }` while project/file routes use `{ error: message }`. A future pass could unify these.
- `readTree()` in the `/api/files` route silently catches errors and returns `[]`. This is intentional for permission-denied directories but could mask other issues.

## Follow-up Items

- None required. All spec items are addressed.

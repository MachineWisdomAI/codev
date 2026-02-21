# Review: Dashboard Statistics Tab in Right Panel

## Metadata
- **Spec**: codev/specs/456-dashboard-statistics-tab-in-ri.md
- **Plan**: codev/plans/456-dashboard-statistics-tab-in-ri.md
- **PR**: #488
- **Date**: 2026-02-21

## Summary

Implemented a Statistics tab in the dashboard right panel that aggregates project health metrics from three data sources: GitHub CLI (merged PRs, closed issues, backlogs), consultation metrics DB, and active builder count. The implementation spans three phases: backend data layer, API endpoint, and dashboard UI.

## What Went Well

1. **Clean separation of concerns**: The `statistics.ts` service cleanly aggregates from three independent sources, each wrapped in try/catch for graceful degradation. The handler in `tower-routes.ts` is minimal and delegates to the service.

2. **Existing patterns made integration smooth**: The dashboard's tab system, always-mounted rendering pattern, and CSS variable system were well-established, making the UI phase largely a matter of following existing conventions.

3. **Multi-agent consultation caught real issues**: All three phases had reviewers flag the same core issues (multi-issue PR parsing, missing endpoint tests, duplicate fetch), confirming the value of 3-way review.

## What Could Be Improved

1. **Test mocking complexity**: The statistics service test required careful Vitest 4 mocking patterns (`vi.hoisted()` + class-based constructor mocks). The initial approach using `Object.defineProperty` on the MetricsDB class was fundamentally broken — it modified a static getter while the constructor used a module-level constant. Lesson: understand the module's internals before designing mocks.

2. **Duplicate React effects**: The initial `useStatistics` hook had two `useEffect` hooks both depending on `isActive`, causing double-fetches on tab activation. A single merged effect is cleaner and avoids the issue.

## Deviations from Plan

1. **`gh pr list --search` instead of `gh search prs`**: The plan specified `gh search prs` but the implementation uses `gh pr list --state merged --search "merged:>=DATE"`. This is functionally equivalent and better because `gh pr list` is repo-scoped by default (no OWNER/REPO needed) and returns `mergedAt` in JSON output.

2. **Cache key includes workspace path**: The spec described caching keyed by `range` alone. The implementation uses `${workspaceRoot}:${range}` to support multi-workspace correctness in workspace-scoped routes.

## Test Coverage

| Area | Tests | Coverage |
|------|-------|---------|
| statistics.ts (service) | 27 | fetchMergedPRs, fetchClosedIssues, computeStatistics (full assembly, partial failures, null averages, project completion, caching, throughput) |
| metrics.ts (costByProject) | 6 | Top 10 by cost, null exclusion, empty array, limit, days filter |
| tower-routes.ts (endpoint) | 6 | Route dispatch, invalid range, default range, refresh, no workspace, range=all |
| StatisticsView (component) | 15 | Loading, sections, null values, errors, per-model table, cost-per-project, range switch, refresh |
| **Total** | **54** | |

## Lessons Learned

1. **Vitest 4 constructor mocks need class syntax**: `vi.fn(() => ({...}))` fails as "not a constructor". Use `class MockClass { ... }` inside `vi.mock()` factory with `vi.hoisted()` for shared mock functions.

2. **Merge overlapping React effects**: Two effects depending on the same state variable both fire on change, causing unintended duplicate side effects. A single merged effect is always cleaner.

3. **Multi-agent review catches different things**: Gemini and Codex consistently flagged the same issues (showing agreement), while Claude provided nuanced architectural notes. The combination is more valuable than any single reviewer.

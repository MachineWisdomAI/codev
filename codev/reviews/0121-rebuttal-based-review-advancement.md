# Review: Rebuttal-Based Review Advancement

## Summary

Replaced porch's "fix issues" iteration loop with a rebuttal-based advancement flow. When 3-way consultation returns REQUEST_CHANGES, porch now emits a "write rebuttal" task instead of incrementing iteration and re-running the build. When the builder writes a rebuttal file, porch advances immediately — no second consultation round. This ensures builders engage with review feedback while eliminating wasted API calls from re-consultations that never change the outcome.

## Spec Compliance

- [x] REQUEST_CHANGES → porch emits "write rebuttal" task (not "fix issues")
- [x] Rebuttal file exists → porch advances via handleVerifyApproved (no second consultation)
- [x] All APPROVE → advances immediately (unchanged behavior)
- [x] Iteration NOT incremented when emitting "write rebuttal" task
- [x] max_iterations stays at 1 in both protocol.json files (no config changes)
- [x] Existing tests updated, new tests for rebuttal detection

## Deviations from Plan

- **Safety valve removed**: The plan said "Max iterations safety valve still works at 1 (rebuttal check happens before it)." In practice, the safety valve is unreachable with max_iterations=1 and the rebuttal flow (iteration never increments), so it was removed entirely rather than kept as dead code. The rebuttal IS the safety mechanism.
- **>50 bytes size check removed**: The original spec included a minimum file size check for rebuttals. The architect explicitly removed this requirement — rebuttal just needs to exist.

## Lessons Learned

### What Went Well
- The change was surgical: 2 files modified (next.ts + next.test.ts), net -23 lines of code
- The existing `findRebuttalFile()` function required zero changes — it already does exactly what's needed
- Test infrastructure (createTestDir, makeState, etc.) made adding tests trivial

### Challenges Encountered
- **Ordering of rebuttal check vs safety valve**: With max_iterations=1, the safety valve fires before the builder can write a rebuttal. Solved by putting the rebuttal emission before the safety valve check, then removing the safety valve entirely since it's unreachable.
- **History recording semantics**: The old code recorded history at `iteration - 1` because it incremented first. The rebuttal path records at `iteration` since there's no increment. Subtle but important distinction.

### What Would Be Done Differently
- The spec and plan should have been updated simultaneously rather than in separate passes — multiple rounds of corrections for stale references to max_iterations=5 and >50 bytes size checks

## Technical Debt
- None introduced. Net reduction in code complexity.

## Follow-up Items
- The globally installed porch still runs old code. Changes take effect on next release.
- Consider updating the MAINTAIN protocol's max_iterations (currently 3-5) to use the rebuttal model too.

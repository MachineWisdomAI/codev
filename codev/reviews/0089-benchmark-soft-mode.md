# Review 0089: Porch Build Counter

## Summary

Added `PORCH_BUILD_COUNTER_KEY` constant to standardize build counting key names in porch state files.

## Files Changed

| File | Change |
|------|--------|
| `packages/codev/src/commands/porch/build-counter.ts` | New file — exports `PORCH_BUILD_COUNTER_KEY = 'porch.total_builds'` |
| `packages/codev/src/commands/porch/__tests__/build-counter.test.ts` | New file — unit tests for the constant |

## Test Results

- 10 test files, 113 tests passed
- New test file adds 2 tests verifying value and type of the constant

## Consultation Summary

### Phase 1 (impl-review)
All three models (Gemini, Codex, Claude) confirmed the constant was correctly implemented. All flagged that the spec's Solution section mentions a `showStatus` update in `run.ts`, but this is absent from both the Acceptance Criteria and the Files Changed table in the spec's Technical Implementation section.

### Phase 2 (impl-review)
- **Gemini**: REQUEST_CHANGES (showStatus update missing)
- **Codex**: REQUEST_CHANGES (showStatus update missing)
- **Claude**: APPROVE — correctly identified that Acceptance Criteria is authoritative and doesn't require `run.ts` changes

### Resolution
The spec is internally inconsistent: the Solution section mentions a `run.ts` update, but the Acceptance Criteria and Technical Implementation sections do not. The Acceptance Criteria is the authoritative section. Both acceptance criteria are met:
1. `build-counter.ts` exports `PORCH_BUILD_COUNTER_KEY` with value `'porch.total_builds'`
2. All existing tests pass

## Spec Quality Note

The spec should be updated to either remove the `run.ts` mention from the Solution section or add it to Acceptance Criteria if actually required.

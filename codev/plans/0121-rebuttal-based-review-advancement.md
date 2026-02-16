# Plan: Rebuttal-Based Review Advancement

## Metadata
- **Specification**: codev/specs/0121-rebuttal-based-review-advancement.md
- **Created**: 2026-02-16

## Executive Summary

Replace porch's "fix issues" iteration loop with a rebuttal-based advancement flow. When reviews request changes, the builder writes a rebuttal file instead of revising the artifact. Porch detects the rebuttal and advances immediately — no second consultation round. This eliminates wasted API calls while ensuring builders engage with feedback.

The change is surgical: modify the decision logic in `next.ts` (lines 486-567) and update `max_iterations` in both `protocol.json` files to 5 as a safety valve.

## Success Metrics
- [ ] When reviews REQUEST_CHANGES, porch emits "write rebuttal" task (not "fix issues")
- [ ] When rebuttal file exists (>50 bytes), `porch done` advances past the review
- [ ] No second consultation round runs after a rebuttal
- [ ] All-approve fast path unchanged (advance immediately, no rebuttal needed)
- [ ] Existing tests updated, new tests for rebuttal detection
- [ ] `max_iterations` set to 5 in both protocol.json files

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Rebuttal advancement logic and config"},
    {"id": "phase_2", "title": "Tests for rebuttal flow"}
  ]
}
```

## Phase Breakdown

### Phase 1: Rebuttal advancement logic and config
**Dependencies**: None

#### Objectives
- Modify `next.ts` to detect rebuttals and advance, or emit "write rebuttal" tasks
- Update `max_iterations` to 5 in both protocol.json files

#### Deliverables
- [ ] Rebuttal detection logic in `handleBuildVerify()` (after `allApprove` check, before max_iterations)
- [ ] "Write rebuttal" task emission replacing "fix issues" task
- [ ] `max_iterations` updated to 5 in `codev/protocols/spir/protocol.json`
- [ ] `max_iterations` updated to 5 in `codev-skeleton/protocols/spir/protocol.json`

#### Implementation Details

**File: `packages/codev/src/commands/porch/next.ts`**

After line 490 (where `allApprove()` returns false), insert rebuttal detection:

1. Call `findRebuttalFile(workspaceRoot, state, state.iteration)` to check if the builder already wrote a rebuttal for the current iteration's reviews
2. If rebuttal exists and file size >50 bytes:
   - Record reviews in `state.history` (same pattern as lines 527-542)
   - Call `handleVerifyApproved()` to advance — no second consultation
3. If rebuttal missing or too small:
   - Instead of the current "fix issues" task (lines 553-559), emit a "write rebuttal" task
   - Task description includes: review file paths with verdicts, target rebuttal file path, instructions for addressing REQUEST_CHANGES points
   - Do NOT increment `state.iteration` — the rebuttal is part of the current iteration
   - Do NOT re-emit the full build prompt — builder should write a rebuttal, not rebuild

**Note on iteration handling**: The current flow increments iteration at line 524 before emitting "fix issues". The new flow should NOT increment iteration when emitting "write rebuttal" — the rebuttal is the response to iteration N's reviews, not the start of iteration N+1. Iteration only matters for the safety valve now.

**Files: `codev/protocols/spir/protocol.json` and `codev-skeleton/protocols/spir/protocol.json`**

Change all `"max_iterations": 1` to `"max_iterations": 5` across all phase definitions (specify, plan, implement, review).

#### Acceptance Criteria
- [ ] When reviews include REQUEST_CHANGES and no rebuttal exists: emits "write rebuttal" task
- [ ] When reviews include REQUEST_CHANGES and rebuttal exists (>50 bytes): calls handleVerifyApproved
- [ ] When all reviews APPROVE: advances immediately (unchanged behavior)
- [ ] Max iterations safety valve still works (force-advance at 5)
- [ ] Iteration is NOT incremented when emitting "write rebuttal" task

#### Rollback Strategy
Revert the commit. The change is isolated to one function in `next.ts` and config values.

---

### Phase 2: Tests for rebuttal flow
**Dependencies**: Phase 1

#### Objectives
- Update existing tests in `next.test.ts` that depend on the old "fix issues" behavior
- Add new tests covering rebuttal detection, advancement, and edge cases

#### Deliverables
- [ ] Existing iteration tests updated to reflect new "write rebuttal" behavior
- [ ] New test: REQUEST_CHANGES + rebuttal exists → advances (no second consultation)
- [ ] New test: REQUEST_CHANGES + rebuttal missing → emits "write rebuttal" task
- [ ] New test: REQUEST_CHANGES + rebuttal too small (<50 bytes) → emits "write rebuttal" task
- [ ] New test: all APPROVE → advances immediately (regression test)
- [ ] New test: max_iterations reached → force-advance (safety valve regression test)
- [ ] All existing tests still pass

#### Implementation Details

**File: `packages/codev/tests/unit/porch/next.test.ts`**

Update tests that currently expect "Fix issues from review" subjects to expect "Write rebuttal" subjects instead.

New test cases:
1. **Rebuttal advancement**: Setup reviews with REQUEST_CHANGES, write a rebuttal file >50 bytes, call `porchNext()` → expect `handleVerifyApproved` behavior (status advances)
2. **Rebuttal emission**: Setup reviews with REQUEST_CHANGES, no rebuttal file → expect task with "Write rebuttal" subject and description containing review file paths
3. **Small rebuttal rejected**: Setup reviews with REQUEST_CHANGES, write rebuttal file <50 bytes → expect "Write rebuttal" task emitted (not advancement)
4. **All approve unchanged**: Setup reviews all APPROVE → expect immediate advancement (no rebuttal check)
5. **Safety valve**: Set iteration to 5 (max), reviews with REQUEST_CHANGES, no rebuttal → expect force-advance or gate behavior

Use existing test patterns: `createTestDir()`, `setupProtocol()`, `makeState()`, `setupState()`, review file creation with `VERDICT:` lines.

#### Acceptance Criteria
- [ ] All new tests pass
- [ ] All existing tests pass (no regressions)
- [ ] Tests cover the 5 scenarios listed above
- [ ] No overmocking — use real file system operations for rebuttal detection

#### Rollback Strategy
Revert the test commit. Tests are independent of production code changes.

---

## Dependency Map
```
Phase 1 (logic + config) ──→ Phase 2 (tests)
```

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Existing tests break due to "fix issues" → "write rebuttal" rename | High | Low | Update test expectations in Phase 2 |
| Rebuttal file size check too strict/lenient | Low | Low | 50 bytes is well below any real rebuttal; adjust if needed |
| Iteration counter semantics change breaks other code | Low | Medium | Audit all `state.iteration` references in next.ts |

## Validation Checkpoints
1. **After Phase 1**: `npm run build` succeeds; manual review of logic flow
2. **After Phase 2**: `npm test` passes; all new and existing tests green

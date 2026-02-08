---
approved: 2026-02-02
validated: [gemini, codex, claude]
---

# Spec 0089: Porch Build Counter

## Problem

The porch module lacks a way to track total builds across sessions. A `PORCH_BUILD_COUNTER_KEY` constant would standardize the key name used for build counting in state files.

## Questions & Answers

1. **Q**: Where should the constant live? **A**: In a new `build-counter.ts` file in the porch directory.
2. **Q**: What format? **A**: A simple string constant.

## Solution

Add a `PORCH_BUILD_COUNTER_KEY` constant to `packages/codev/src/commands/porch/build-counter.ts` that exports the standardized key name. Update the `showStatus` function in `run.ts` to display the key name for debugging.

## Acceptance Criteria

- [ ] `build-counter.ts` exports `PORCH_BUILD_COUNTER_KEY` string constant with value `'porch.total_builds'`
- [ ] Existing tests still pass

## Technical Implementation

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `PORCH_BUILD_COUNTER_KEY` | `'porch.total_builds'` | Standardized key for build counting |

### Files Changed

| File | Change |
|------|--------|
| `packages/codev/src/commands/porch/build-counter.ts` | New file, exports `PORCH_BUILD_COUNTER_KEY` |

### Test Strategy

1. Unit test: verify `PORCH_BUILD_COUNTER_KEY` equals expected value
2. Existing tests pass without modification

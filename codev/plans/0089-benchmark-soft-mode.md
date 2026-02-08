---
approved: 2026-02-02
validated: [gemini, codex, claude]
---

# Plan 0089: Porch Build Counter

```json
{"phases": [{"id": "phase_1", "title": "Add build counter constant"}, {"id": "phase_2", "title": "Add test for build counter"}]}
```

## Phase 1: Add build counter constant

### Files to create
- `packages/codev/src/commands/porch/build-counter.ts` — Export `PORCH_BUILD_COUNTER_KEY = 'porch.total_builds'`

## Phase 2: Add test for build counter

### Tests
- Add a test in `packages/codev/src/commands/porch/__tests__/build-counter.test.ts` that imports `PORCH_BUILD_COUNTER_KEY` and verifies it equals `'porch.total_builds'`

# Plan: Remove Dead Vanilla Dashboard Code

## Metadata
- **Specification**: `codev/specs/0111-remove-dead-vanilla-dashboard.md`

## Executive Summary

Delete the dead vanilla JS dashboard directory and its associated test file. Verify nothing breaks.

## Success Metrics
- [ ] `packages/codev/templates/dashboard/` deleted (16 files)
- [ ] `packages/codev/src/agent-farm/__tests__/clipboard.test.ts` deleted
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm pack --dry-run` shows no `templates/dashboard/` files

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Delete Dead Code"},
    {"id": "phase_2", "title": "Verify and Validate"}
  ]
}
```

## Phase Breakdown

### Phase 1: Delete Dead Code
**Dependencies**: None

#### Objectives
- Remove all dead vanilla dashboard files and dead test code

#### Deliverables
- [ ] `packages/codev/templates/dashboard/` directory deleted (16 files)
- [ ] `packages/codev/src/agent-farm/__tests__/clipboard.test.ts` deleted

#### Implementation Details
1. `rm -rf packages/codev/templates/dashboard/` — removes the entire dead directory
2. `rm packages/codev/src/agent-farm/__tests__/clipboard.test.ts` — removes the dead test file

Files **not** modified:
- `packages/codev/src/__tests__/templates.test.ts` — the `isUpdatableFile('templates/dashboard.html')` assertion tests prefix-matching logic, not file existence

#### Acceptance Criteria
- [ ] `templates/dashboard/` no longer exists
- [ ] `clipboard.test.ts` no longer exists
- [ ] Active templates still present: `tower.html`, `open.html`, `3d-viewer.html`, `vendor/`

#### Rollback Strategy
`git revert` the commit — files are restored from git history.

---

### Phase 2: Verify and Validate
**Dependencies**: Phase 1

#### Objectives
- Confirm build, tests, and packaging are all clean after deletion

#### Deliverables
- [ ] Clean build
- [ ] All tests pass
- [ ] Package contents verified

#### Implementation Details
All npm commands run from `packages/codev/`:

1. `npm run build` — verify clean build
2. `npm test` — verify all tests pass
3. `npm pack --dry-run` — verify no `templates/dashboard/` files in package output
4. `grep -r "templates/dashboard" packages/codev/` — verify no stale references (searches all of `packages/codev/`, not just `src/`)
5. Verify `packages/codev/dashboard/dist/` exists and is intact (React dashboard unaffected)

#### Acceptance Criteria
- [ ] Build succeeds with zero errors
- [ ] All tests pass
- [ ] No `templates/dashboard/` entries in `npm pack --dry-run` output
- [ ] No stale references in `packages/codev/`
- [ ] React dashboard dist directory intact

#### Rollback Strategy
If verification fails, revert Phase 1 commit and investigate.

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Accidental deletion of active templates | Low | High | Spec explicitly lists what to keep; `rm -rf` targets only `dashboard/` subdirectory |
| Hidden runtime reference to vanilla dashboard | Low | Medium | Verified via grep — no source references exist |

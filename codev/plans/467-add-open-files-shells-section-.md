# Plan: Add Open Files & Shells Section to Workspace Overview

## Metadata
- **ID**: plan-2026-02-21-open-files-shells
- **Status**: draft
- **Specification**: `codev/specs/467-add-open-files-shells-section-.md`
- **Created**: 2026-02-21

## Executive Summary

Implement Approach 1 from the spec: lightweight PTY output activity tracking with a new React component. The work breaks into two phases: (1) backend extension to track and expose `lastDataAt`, and (2) frontend component and integration.

## Success Metrics
- [ ] All specification success criteria met
- [ ] Test coverage >90% for new code
- [ ] Existing E2E tests continue to pass

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "backend_last_data_at", "title": "Backend: PTY Last-Activity Tracking"},
    {"id": "frontend_component", "title": "Frontend: Open Files & Shells Component"}
  ]
}
```

## Phase Breakdown

### Phase 1: Backend: PTY Last-Activity Tracking
**Dependencies**: None

#### Objectives
- Track `lastDataAt` timestamp on PTY output events in `PtySession`
- Expose `lastDataAt` through the `/api/state` response for shell terminals

#### Deliverables
- [ ] `lastDataAt` property on `PtySession` (mirrors existing `lastInputAt` pattern)
- [ ] `lastDataAt` included in shell entries of `/api/state` response
- [ ] `UtilTerminal` type in dashboard `api.ts` extended with `lastDataAt`
- [ ] Unit tests for `lastDataAt` tracking

#### Implementation Details

**`packages/codev/src/terminal/pty-session.ts`**:
- Add `private _lastDataAt: number` field, initialized to `Date.now()` in constructor
- Update `onPtyData()` method to set `this._lastDataAt = Date.now()`
- Add getter `get lastDataAt(): number` (mirrors existing `get lastInputAt()`)

**`packages/codev/src/agent-farm/servers/tower-routes.ts`**:
- In `handleWorkspaceState()`, add `lastDataAt` to each shell entry in the `state.utils` array (line ~1373-1381)
- Read from `session.lastDataAt` on the `PtySession` instance

**`packages/codev/dashboard/src/lib/api.ts`**:
- Add `lastDataAt?: number` to `UtilTerminal` interface

#### Acceptance Criteria
- [ ] `PtySession.lastDataAt` updates on every PTY output event
- [ ] New shells initialize `lastDataAt` to `Date.now()`
- [ ] `/api/state` response includes `lastDataAt` in each `utils[]` entry
- [ ] `UtilTerminal` type includes optional `lastDataAt` field

#### Test Plan
- **Unit Tests**: Test that `PtySession.lastDataAt` initializes to `Date.now()` and updates on `onPtyData` calls
- **Unit Tests**: Test that `handleWorkspaceState` includes `lastDataAt` in shell entries

#### Risks
- **Risk**: PTY data events fire frequently during heavy output
  - **Mitigation**: Single `Date.now()` assignment — negligible cost, same pattern as existing `lastInputAt`

---

### Phase 2: Frontend: Open Files & Shells Component
**Dependencies**: Phase 1

#### Objectives
- Create `OpenFilesShellsSection` React component
- Integrate it into `WorkView` below the Builders section
- Display shells with running/idle status and files with relative paths

#### Deliverables
- [ ] New `OpenFilesShellsSection.tsx` component
- [ ] Integration into `WorkView.tsx`
- [ ] CSS styles for the new section
- [ ] Unit tests for the component
- [ ] E2E test for section visibility

#### Implementation Details

**`packages/codev/dashboard/src/components/OpenFilesShellsSection.tsx`** (new file):
- Props: `utils: UtilTerminal[]`, `annotations: Annotation[]`, `onSelectTab: (id: string) => void`
- If both arrays are empty, return `null` (hidden-when-empty pattern)
- Render two sub-groups: "Shells" and "Files"
- Each shell row: name, status dot (green for running, gray for idle), idle duration
- Each file row: basename, relative path (derived from workspace name in the file path)
- Click handler calls `onSelectTab(util.id)` for shells, `onSelectTab(annotation.id)` for files
- Idle status computed: `Date.now() - lastDataAt > 30_000` = idle
- Idle duration formatted as compact relative: "1m", "5m", "1h", etc.

**`packages/codev/dashboard/src/components/WorkView.tsx`**:
- Import `OpenFilesShellsSection`
- Add section between Builders and Needs Attention sections
- Pass `state.utils`, `state.annotations`, and `onSelectTab`

**`packages/codev/dashboard/src/index.css`**:
- Add styles for shell/file rows using existing CSS variable system
- Status dot: small circle with `--status-active` (green) or `--text-secondary` (gray)
- Row styling consistent with existing `builder-row` / `pr-row` patterns

#### Acceptance Criteria
- [ ] Section appears below Builders, above Needs Attention
- [ ] Section hidden when no shells or files open
- [ ] Shell entries show name, green/gray dot, idle duration
- [ ] File entries show basename and relative path
- [ ] Clicking shell/file calls `onSelectTab` with correct ID
- [ ] Auto-updates via existing 1s polling + SSE
- [ ] Handles missing `lastDataAt` gracefully (treats as idle)

#### Test Plan
- **Unit Tests**: Component renders shells and files correctly
- **Unit Tests**: Component returns null when both arrays empty
- **Unit Tests**: Click handlers call `onSelectTab` with correct IDs
- **Unit Tests**: Running/idle status computed correctly from `lastDataAt`
- **Unit Tests**: Idle threshold boundary (30s vs 31s)
- **E2E**: Section appears in dashboard Work view

#### Risks
- **Risk**: Relative path computation may not cover all file path patterns
  - **Mitigation**: Use simple basename + parent directory extraction; absolute path as tooltip fallback

---

## Dependency Map
```
Phase 1 (Backend) ──→ Phase 2 (Frontend)
```

## Risk Analysis
### Technical Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| PTY output frequency overhead | Low | Low | Single timestamp assignment per event |
| Missing lastDataAt on older sessions | Low | Low | Frontend treats undefined as idle |

## Validation Checkpoints
1. **After Phase 1**: Verify `/api/state` returns `lastDataAt` for shells via curl or browser dev tools
2. **After Phase 2**: Visual check in dashboard — section appears with correct data

## Documentation Updates Required
- [ ] Architecture docs updated if needed

## Notes

This is a small feature. Two phases keep backend and frontend concerns separated, each independently testable and committable.

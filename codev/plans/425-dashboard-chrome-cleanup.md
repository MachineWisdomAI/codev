# Plan: Dashboard Chrome Cleanup

## Metadata
- **ID**: plan-2026-02-18-dashboard-chrome-cleanup
- **Status**: draft
- **Specification**: codev/specs/425-dashboard-chrome-cleanup.md
- **Created**: 2026-02-18

## Executive Summary

Minimal cleanup of dashboard chrome: replace "Agent Farm" branding with project name in header and tab title, remove redundant footer. Approach 1 (minimal) from the spec — frontend-only changes to App.tsx and index.css, plus Playwright test updates.

## Success Metrics
- [ ] Header shows `<project-name> dashboard` (or just `dashboard` for falsy workspace name)
- [ ] Footer/status bar removed (HTML + CSS)
- [ ] Browser tab title shows `<project-name> dashboard`
- [ ] Playwright E2E tests pass
- [ ] No visual regressions

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "chrome_cleanup", "title": "Header, footer, and title cleanup"},
    {"id": "test_updates", "title": "Playwright test updates"}
  ]
}
```

## Phase Breakdown

### Phase 1: Header, footer, and title cleanup
**Dependencies**: None

#### Objectives
- Replace header branding with project name
- Remove footer status bar
- Update browser tab title

#### Deliverables
- [ ] Updated App.tsx with new header, no footer, updated document.title
- [ ] Updated index.html with initial `<title>` changed from "Agent Farm Dashboard" to "dashboard"
- [ ] Updated index.css with removed `.header-meta`, `.builder-count`, `.status-bar` rules
- [ ] Verified layout fills correctly without footer (`.app-body` flex:1 absorbs freed space)

#### Implementation Details

**App.tsx** (`packages/codev/dashboard/src/components/App.tsx`):

1. **Document title** (lines ~43-50): Change from `${state.workspaceName} Agent Farm` / `Agent Farm` to `${state.workspaceName} dashboard` / `dashboard`. Treat falsy workspaceName (undefined, null, empty string) as unavailable.

2. **Header** (lines ~168-175): Replace:
   ```tsx
   <header className="app-header">
     <h1 className="app-title">Agent Farm</h1>
     <div className="header-meta">
       <span className="builder-count">
         {state?.builders?.length ?? 0} builder(s)
       </span>
     </div>
   </header>
   ```
   With:
   ```tsx
   <header className="app-header">
     <h1 className="app-title">
       {state?.workspaceName ? `${state.workspaceName} dashboard` : 'dashboard'}
     </h1>
   </header>
   ```

3. **Footer** (lines ~194-198): Remove the entire `<footer className="status-bar">...</footer>` block.

**index.html** (`packages/codev/dashboard/index.html`):

4. **Initial title** (line 7): Change `<title>Agent Farm Dashboard</title>` to `<title>dashboard</title>` to avoid a brief branding flash before React hydrates.

**index.css** (`packages/codev/dashboard/src/index.css`):

5. Remove `.header-meta` rule (lines ~76-79)
6. Remove `.status-bar` rule (lines ~242-253)
7. `.builder-count` has no CSS rule — nothing to remove

**Layout verification**: After removing the footer, verify `.app-body` (which uses `flex: 1`) correctly fills the freed 24px. No CSS changes should be needed since the footer was `flex-shrink: 0` and `.app-body` will naturally expand.

#### Acceptance Criteria
- [ ] Header shows workspace name + "dashboard" when name available
- [ ] Header shows just "dashboard" when workspace name is falsy
- [ ] No footer rendered
- [ ] Tab title matches header text
- [ ] Dashboard layout fills space correctly without footer

#### Rollback Strategy
Revert the three file changes (App.tsx, index.html, index.css).

---

### Phase 2: Playwright test updates
**Dependencies**: Phase 1

#### Objectives
- Update Playwright tests that assert on "Agent Farm" text
- Audit `dashboard-bugs.test.ts` for legacy selectors that may break on rebuild
- Run Playwright E2E suite to verify everything passes

#### Deliverables
- [ ] Updated `tower-integration.test.ts` assertion
- [ ] Audited `dashboard-bugs.test.ts` for legacy selectors (`.projects-info`, `.dashboard-header`, `.section-tabs`) — remove or update tests targeting elements that don't exist in current codebase
- [ ] All E2E tests pass via explicit Playwright run

#### Implementation Details

**tower-integration.test.ts** (`packages/codev/src/agent-farm/__tests__/e2e/tower-integration.test.ts`):
- Line 49: Change `toContainText('Agent Farm')` → `toContainText('dashboard')`
- Line 92: `.app-title` visibility check — no change needed (class preserved)

**dashboard-bugs.test.ts** (`packages/codev/src/agent-farm/__tests__/e2e/dashboard-bugs.test.ts`):
- Line 92: `.app-title` visibility check — no change needed (class preserved)
- **Audit**: Check tests referencing `.projects-info`, `.dashboard-header`, `.section-tabs` — these target legacy layout elements that may not exist in current UI. If they reference elements removed by our changes or already absent from the DOM, remove those specific test assertions to prevent false failures on rebuild.

**Playwright execution**: Build the dashboard (`npm run build` from `packages/codev/`) then run E2E tests to verify all pass.

#### Acceptance Criteria
- [ ] `tower-integration.test.ts` passes with updated assertion
- [ ] `dashboard-bugs.test.ts` audited for legacy selectors — cleaned up if needed
- [ ] Playwright E2E suite runs green
- [ ] No other E2E tests broken

#### Rollback Strategy
Revert test file changes.

## Validation Checkpoints
1. **After Phase 1**: Visual check — dashboard header shows project name, no footer
2. **After Phase 2**: All Playwright E2E tests pass

## Expert Review
**Date**: 2026-02-18
**Models Consulted**: Gemini, Codex (GPT), Claude
**Key Feedback**:
- **Gemini** (REQUEST_CHANGES): `dashboard-bugs.test.ts` has tests for legacy selectors (`.projects-info`, `.dashboard-header`) that don't exist in current UI — will fail on rebuild. Added audit step to Phase 2.
- **Codex** (REQUEST_CHANGES): Missing explicit Playwright execution step and layout regression check. Added both.
- **Claude** (COMMENT): `index.html` has `<title>Agent Farm Dashboard</title>` that flashes before React hydrates. Added to Phase 1.

**Plan Adjustments**:
- Phase 1: Added `index.html` title update, added layout verification step
- Phase 2: Added audit of `dashboard-bugs.test.ts` legacy selectors, added explicit Playwright run step

## Approval
- [ ] Technical Lead Review
- [x] Expert AI Consultation Complete

# Plan: Terminal Floating Controls

## Metadata
- **ID**: 364
- **Status**: draft
- **Specification**: codev/specs/0364-terminal-refresh-button.md
- **Created**: 2026-02-17

## Executive Summary

Add a `TerminalControls` component rendered inside Terminal.tsx's container div — two small floating icon buttons (refresh + scroll-to-bottom) positioned horizontally in the top-right corner. This is a frontend-only change touching two files.

## Success Metrics
- [ ] Both buttons render in all terminal types (architect, builder, shell)
- [ ] Refresh triggers fitAddon.fit() + sends resize to backend
- [ ] Scroll-to-bottom calls terminal.scrollToBottom()
- [ ] Neither button steals focus from xterm
- [ ] Buttons are semi-transparent, unobtrusive, with hover brightening
- [ ] Touch-friendly on mobile (32px+ tap targets)
- [ ] aria-labels present for accessibility

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "controls_component", "title": "TerminalControls Component"},
    {"id": "styling_and_tests", "title": "Styling and Tests"}
  ]
}
```

## Phase Breakdown

### Phase 1: TerminalControls Component
**Dependencies**: None

#### Objectives
- Create the TerminalControls component with both buttons and wire up all click handlers
- Add `position: relative` to the terminal container

#### Deliverables
- [ ] TerminalControls component with refresh and scroll-to-bottom buttons
- [ ] Inline SVG icons for both buttons
- [ ] Click handlers with proper null-guards and WebSocket readyState checks
- [ ] onPointerDown + preventDefault pattern to avoid focus stealing
- [ ] aria-label attributes on both buttons

#### Implementation Details

**New component: TerminalControls** (defined inside `Terminal.tsx` or as a small function component in the same file)

Props needed:
- `fitRef: React.RefObject<FitAddon | null>`
- `wsRef: React.RefObject<WebSocket | null>`
- `xtermRef: React.RefObject<XTerm | null>`

Refresh click handler:
```
1. Guard: if fitRef.current is null, return
2. Call fitRef.current.fit()
3. Guard: if wsRef.current is null or readyState !== WebSocket.OPEN, return
4. Get cols/rows from xtermRef.current
5. Call sendControl(ws, 'resize', { cols, rows })
```

Scroll-to-bottom click handler:
```
1. Guard: if xtermRef.current is null, return
2. Call xtermRef.current.scrollToBottom()
```

Both buttons use `onPointerDown` with `e.preventDefault()` and `tabIndex={-1}` (matching VirtualKeyboard.tsx pattern).

**Render location**: Inside the terminal container div (the one with `containerRef`). Since xterm opens directly into the containerRef div, the TerminalControls must be rendered as a **sibling** — wrap the existing containerRef div and TerminalControls inside a new wrapper div, or render TerminalControls as a portal/overlay. The simplest approach: add a wrapper div with `position: relative` around the containerRef div. TerminalControls is `position: absolute; top: 8px; right: 8px; z-index: 10`.

Actually, looking at the code more carefully: the containerRef div IS where xterm opens. We need to place the controls inside a **parent wrapper** that has `position: relative`, with both the terminal container and the controls as children.

**Files to modify**:
- `packages/codev/dashboard/src/components/Terminal.tsx`

#### Acceptance Criteria
- [ ] Both buttons render in the top-right corner of the terminal
- [ ] Refresh button calls fitAddon.fit() and sends resize control message
- [ ] Scroll-to-bottom button calls terminal.scrollToBottom()
- [ ] Buttons don't steal focus from the terminal
- [ ] Null-guards prevent crashes when refs are uninitialized
- [ ] aria-labels present on both buttons

#### Test Plan
- **Manual Testing**: Open architect/builder/shell terminal, verify buttons appear, click each, verify focus stays in terminal
- **Playwright**: Test button visibility and click interaction (Phase 2)

#### Rollback Strategy
Revert the single commit — no backend changes, no data migration.

#### Risks
- **Risk**: xterm.js canvas might overlap the absolute-positioned controls
  - **Mitigation**: z-index: 10 should be sufficient; xterm canvas typically uses lower z-index values

---

### Phase 2: Styling and Tests
**Dependencies**: Phase 1

#### Objectives
- Add CSS styles for the controls (opacity, hover, sizing, mobile tap targets)
- Add Playwright tests for button visibility and interaction

#### Deliverables
- [ ] CSS styles in index.css for .terminal-controls and child buttons
- [ ] Hover effects (opacity 0.4 → 0.8)
- [ ] 32px minimum tap targets for mobile
- [ ] Playwright test: buttons visible in terminal
- [ ] Playwright test: buttons don't steal focus

#### Implementation Details

**CSS classes** (added to `index.css`):
- `.terminal-controls` — absolute positioning container, flex row, gap between buttons
- `.terminal-control-btn` — transparent background, no border, cursor pointer, opacity 0.4
- `.terminal-control-btn:hover` — opacity 0.8
- `.terminal-control-btn:active` — opacity 1.0
- Touch-action: manipulation, user-select: none (matching VirtualKeyboard pattern)
- Min width/height: 32px for touch targets, with the SVG icon centered at 16-18px

**Playwright tests** (new test file or added to existing terminal tests):
- Verify both buttons are visible in the DOM
- Verify clicking refresh doesn't move focus away from terminal
- Verify clicking scroll-to-bottom doesn't move focus away from terminal

**Files to modify**:
- `packages/codev/dashboard/src/index.css`
- `packages/codev/tests/e2e/` (new or existing test file)

#### Acceptance Criteria
- [ ] Buttons are semi-transparent (opacity ~0.4) and brighten on hover
- [ ] Touch targets are at least 32px
- [ ] Playwright tests pass for button visibility and focus retention
- [ ] Existing tests still pass

#### Test Plan
- **Playwright**: Button visibility, focus retention after click
- **Visual**: Manually verify on mobile viewport and desktop viewport

#### Rollback Strategy
Revert the single commit.

#### Risks
- **Risk**: Playwright selectors may not find buttons inside xterm container
  - **Mitigation**: Use aria-label selectors which are reliable

## Dependency Map
```
Phase 1 (Controls Component) ──→ Phase 2 (Styling and Tests)
```

## Risk Analysis
### Technical Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| z-index conflicts with xterm canvas | Low | Low | Use z-index: 10; xterm uses lower values |
| Buttons invisible on certain themes | Low | Low | Use fixed opacity values, not theme-dependent colors |

## Validation Checkpoints
1. **After Phase 1**: Both buttons render and function correctly in all terminal types
2. **After Phase 2**: Styles match spec, Playwright tests pass, existing tests unaffected

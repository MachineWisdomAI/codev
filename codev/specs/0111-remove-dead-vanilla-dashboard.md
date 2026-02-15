---
approved: 2026-02-15
validated: [claude]
---

# Spec 0111: Remove Dead Vanilla Dashboard Code

## Problem

The vanilla JS dashboard (`packages/codev/templates/dashboard/`) has been dead code since Spec 0085 replaced it with a React dashboard (`packages/codev/dashboard/`). The 16 files remain in the repo and npm package, causing confusion — an architect spent 20 minutes editing `templates/dashboard/js/projects.js` thinking it was the live code, when the actual code was in the React `StatusPanel.tsx`.

## Solution

Delete `packages/codev/templates/dashboard/` and update the two test files that reference it.

### Files to Delete

```
packages/codev/templates/dashboard/
├── index.html
├── css/
│   ├── files.css
│   ├── projects.css
│   └── tabs.css
└── js/
    ├── main.js
    ├── projects.js
    ├── state.js
    ├── tabs.js
    └── utils.js
```

Plus any other files in `templates/dashboard/` (16 files total per directory listing).

### Files to Update

1. **`packages/codev/src/__tests__/templates.test.ts`** (line ~127): Remove or update the `expect(isUpdatableFile('templates/dashboard.html')).toBe(true)` assertion.

2. **`packages/codev/src/agent-farm/__tests__/clipboard.test.ts`** (lines ~30-34): References `templates/dashboard/js/tabs.js` but already has an `existsSync` guard — will auto-skip. No change needed, but the test block could be removed for cleanliness.

### What to Keep

- `packages/codev/dashboard/` — the active React dashboard (source + dist)
- `packages/codev/templates/tower.html` — Tower homepage (active)
- `packages/codev/templates/open.html` — af open viewer (active)
- `packages/codev/templates/3d-viewer.html` — 3D model viewer (active)
- `packages/codev/templates/vendor/` — PrismJS, marked, DOMPurify (active, added in bugfix #269)

## Scope

- Delete `packages/codev/templates/dashboard/` directory
- Update 1-2 test files
- Verify build passes, all tests pass

## Acceptance Criteria

1. `packages/codev/templates/dashboard/` no longer exists
2. `npm run build` passes
3. `npm test` passes
4. Dashboard still works (React dashboard unaffected)
5. npm package size reduced

## Testing

1. `npm run build` — clean build
2. `npm test` — all tests pass
3. Manual: open dashboard, verify projects panel still works

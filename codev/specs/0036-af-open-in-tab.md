# Spec 0036: Tab Bar Actions & Tooltips

**Status:** spec-draft
**Protocol:** TICK
**Priority:** Low
**Dependencies:** 0007 (Split-Pane Dashboard)
**Blocks:** None

---

## Problem Statement

The agent-farm dashboard tab bar is missing useful actions and information:

1. **No way to open in new browser tab**: Users want standalone tabs for multi-monitor or more screen space
2. **No hover information**: Tabs show only name and icon - no port, path, or status details
3. **No reload for annotation tabs**: After external edits, must close/reopen to see changes

---

## Requirements

### Open in New Tab
1. Add "Open in new tab" button (↗) to each tab header
2. Add "Open in New Tab" option to the right-click context menu
3. Add "Open in New Tab" option to the overflow dropdown (the `[... +N]` menu for hidden tabs)
4. Opens the tab's content URL in a new browser tab
5. Works for all tab types (builder, file, shell)

### Tab Hover Tooltips
6. Show detailed tooltip when hovering over a tab
7. Tooltip content by tab type:
   - **Builder**: Name, port, status, worktree path
   - **File**: Name, full file path, annotation port
   - **Shell**: Name, port

### Reload Button (In Annotation Viewer)
8. Add reload button (↻) to annotation viewer header, next to Edit/View toggle
9. Reloads file content from disk after external edits
10. NOT in tab bar - keep tabs minimal (only ↗ and ×)

### Cleanup: Remove Unused Buttons
10. Remove "Refresh" button from dashboard header (unused)
11. Remove "Stop All" button from dashboard header (unused)

### Accessibility
12. Keyboard navigable buttons
13. ARIA labels on all interactive elements

---

## Technical Context

**File:** `agent-farm/templates/dashboard-split.html` (vanilla HTML/JS, no React)

**Tab data structure:**
```javascript
// Each tab has these properties
{
  id: 'builder-abc123',
  name: 'Builder 0037',
  type: 'builder' | 'file' | 'shell',
  port: 4201,           // Terminal port for builders/shells
  status: 'implementing' // For builders only
}
```

**URL construction:**
- Builders/shells: `http://localhost:${tab.port}`
- Files (annotation): `http://localhost:${annotationPort}?file=${encodeURIComponent(tab.path)}`

---

## Implementation

### 1. Add Button to Tab Header

Modify `renderTabs()` (line ~929) to include an open-external button:

```javascript
return `
  <div class="tab ${isActive ? 'active' : ''}"
       onclick="selectTab('${tab.id}')"
       oncontextmenu="showContextMenu(event, '${tab.id}')"
       data-tab-id="${tab.id}">
    <span class="icon">${icon}</span>
    <span class="name">${tab.name}</span>
    ${statusDot}
    <span class="open-external"
          onclick="event.stopPropagation(); openInNewTab('${tab.id}')"
          title="Open in new tab"
          role="button"
          aria-label="Open ${tab.name} in new tab">↗</span>
    <span class="close" onclick="event.stopPropagation(); closeTab('${tab.id}', event)">&times;</span>
  </div>
`;
```

### 2. Add CSS for Open Button

Add styles near existing `.tab .close` styles (~line 240):

```css
.tab .open-external {
  opacity: 0.4;
  cursor: pointer;
  padding: 2px 4px;
  margin-right: 2px;
  font-size: 12px;
}

.tab:hover .open-external {
  opacity: 0.8;
}

.tab .open-external:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
```

### 3. Add JavaScript Handler

Add function near other tab actions (~line 1200):

```javascript
function openInNewTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  let url;
  if (tab.type === 'file') {
    // Annotation viewer - construct URL with file path
    url = `http://localhost:${state.annotationPort}?file=${encodeURIComponent(tab.path)}`;
  } else {
    // Builder or shell - direct port access
    url = `http://localhost:${tab.port}`;
  }

  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
```

### 4. Add to Context Menu

The existing context menu uses `contextMenuTabId` (set by `showContextMenu()`) to track which tab was right-clicked. Add a new menu item that uses this:

```html
<div class="context-menu hidden" id="context-menu">
  <div class="context-menu-item" onclick="openContextTab()">Open in New Tab</div>
  <div class="context-menu-item" onclick="closeActiveTab()">Close</div>
  <div class="context-menu-item" onclick="closeOtherTabs()">Close Others</div>
  <div class="context-menu-item danger" onclick="closeAllTabs()">Close All</div>
</div>
```

Add handler:

```javascript
function openContextTab() {
  if (contextMenuTabId) {
    openInNewTab(contextMenuTabId);  // Uses the stored tab ID
  }
  hideContextMenu();
}
```

### 5. Add to Overflow Menu

The overflow menu (`[... +N]`) lists hidden tabs. Each entry should have an "open in new tab" action alongside the existing click-to-select behavior.

### 6. Add Reload Button to Annotation Viewer

This change is in `agent-farm/templates/annotate.html`, not the dashboard.

Add reload button next to the Edit/View toggle in the header:

```html
<div class="header-actions">
  <button id="reload-btn" onclick="reloadFile()" title="Reload from disk">↻</button>
  <button id="mode-toggle" onclick="toggleMode()">Edit</button>
</div>
```

Handler:

```javascript
function reloadFile() {
  // Re-fetch and re-render the file content
  loadFile(currentFilePath);
  showToast('Reloaded from disk');
}
```

### 7. Remove Unused Dashboard Buttons

Remove from header (line ~627-628):

```html
<!-- DELETE THESE -->
<button class="btn" onclick="refresh()">Refresh</button>
<button class="btn btn-danger" onclick="stopAll()">Stop All</button>
```

Keep the `refresh()` function (used internally) but remove the `stopAll()` function.

### 8. Add Tab Hover Tooltips

Generate tooltip text based on tab type:

```javascript
function getTabTooltip(tab) {
  const lines = [tab.name];

  if (tab.type === 'builder') {
    lines.push(`Port: ${tab.port}`);
    lines.push(`Status: ${tab.status || 'unknown'}`);
    lines.push(`Worktree: .builders/${tab.id.replace('builder-', '')}`);
  } else if (tab.type === 'file') {
    lines.push(`Path: ${tab.path}`);
    lines.push(`Port: ${state.annotationPort}`);
  } else if (tab.type === 'shell') {
    lines.push(`Port: ${tab.port}`);
  }

  return lines.join('\n');
}
```

Add to tab div:

```javascript
const tooltip = getTabTooltip(tab);
return `
  <div class="tab" title="${tooltip.replace(/"/g, '&quot;')}" ...>
`;
```

---

## UI Mockup

Tab bar (minimal - just ↗ and ×):
```
┌──────────────────────────────────────────────────────────────────┐
│ [🔨 Builder-0037 ↗ ×]  [📄 spec.md ↗ ×]  [... +2]               │
└──────────────────────────────────────────────────────────────────┘
                      ↑            ↑
               Open in new tab   Close
```

Annotation viewer header (reload button here):
```
┌─────────────────────────────────────────────────────────────────┐
│ codev/specs/0036.md                            [↻] [Edit/View]  │
├─────────────────────────────────────────────────────────────────┤
│ (file content)                                                  │
```

Tooltip on hover (builder example):
```
┌─────────────────────────────────┐
│ Builder 0037                    │
│ Port: 4201                      │
│ Status: implementing            │
│ Worktree: .builders/0037        │
└─────────────────────────────────┘
```

Right-click menu (uses `contextMenuTabId` to know which tab):
```
┌─────────────────┐
│ Open in New Tab │  ← calls openInNewTab(contextMenuTabId)
│ Close           │
│ Close Others    │
│ Close All       │
└─────────────────┘
```

---

## Test Scenarios

### Open in New Tab
1. **Builder tab**: Click ↗ → opens terminal at `localhost:PORT` in new browser tab
2. **File tab**: Click ↗ → opens annotation viewer in new browser tab
3. **Context menu**: Right-click → "Open in New Tab" → same as ↗ button
4. **Overflow menu**: Hidden tab "Open" action works

### Tooltips
5. **Builder tooltip**: Hover → shows name, port, status, worktree
6. **File tooltip**: Hover → shows name, full path, annotation port
7. **Shell tooltip**: Hover → shows name, port

### Reload (In Annotation Viewer)
8. **Reload button**: Click ↻ in annotation viewer header → reloads file from disk
9. **External edit**: Edit file externally → click ↻ → see updated content
10. **Toast feedback**: Shows "Reloaded from disk" message

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Tab has no port yet (spawning) | Button disabled or shows toast "Tab not ready" |
| Annotation server not running | Show error toast, don't open blank tab |
| URL contains special characters | Properly encode with `encodeURIComponent()` |

---

## Files to Modify

- `agent-farm/templates/dashboard-split.html` - Tab bar actions, tooltips, remove unused buttons
- `agent-farm/templates/annotate.html` - Add reload button to header

---

## Notes

- No backend changes required
- Uses `noopener,noreferrer` for security when opening new tabs
- Matches existing close button styling for consistency
- Unicode ↗ (U+2197) used for icon - no external dependencies

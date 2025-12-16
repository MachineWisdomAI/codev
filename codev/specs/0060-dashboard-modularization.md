# Spec 0060: Dashboard Modularization

## Problem Statement

The `dashboard-split.html` template has grown to ~4,700 lines, combining HTML structure, CSS styles (~1,800 lines), and JavaScript (~2,700 lines) in a single file. This monolithic structure makes the code difficult to navigate, maintain, and test.

## Goals

1. Split the monolithic HTML file into separate CSS and JS files
2. Further modularize CSS and JS into logical components
3. Maintain single-request serving simplicity (external files loaded by browser)
4. Improve developer experience with proper syntax highlighting and navigation
5. No build step required - files served directly

## Non-Goals

- Build-time concatenation or bundling
- TypeScript conversion (future work)
- Source maps or advanced debugging tools
- Minification or optimization

## Proposed Solution

### File Structure

```
packages/codev/templates/dashboard/
  index.html              # Main HTML structure (~200 lines)

  css/
    variables.css         # CSS custom properties, colors, spacing
    layout.css            # Header, main content, panes
    tabs.css              # Tab bar, tab content, overflow menu
    dialogs.css           # Modals, context menus, toasts
    projects.css          # Projects tab, kanban, status colors
    files.css             # File tree, file search, palette
    activity.css          # Activity summary tab
    utilities.css         # Animations, accessibility, misc

  js/
    state.js              # State management, localStorage
    tabs.js               # Tab creation, rendering, switching
    architect.js          # Architect pane rendering
    projects.js           # Projects tab logic
    files.js              # File tree, file search
    palette.js            # Cmd+P command palette
    activity.js           # Activity summary
    dialogs.js            # Modals, context menus, toasts
    utils.js              # Utilities (escapeHtml, etc.)
    init.js               # Initialization, event listeners
```

### HTML Structure

The `index.html` will:
1. Load CSS files via `<link>` tags
2. Load JS files via `<script>` tags (in dependency order)
3. Contain only HTML structure and minimal inline scripts for injection points

```html
<!DOCTYPE html>
<html>
<head>
  <title>{{PROJECT_NAME}} - Agent Farm</title>
  <link rel="stylesheet" href="/dashboard/css/variables.css">
  <link rel="stylesheet" href="/dashboard/css/layout.css">
  <link rel="stylesheet" href="/dashboard/css/tabs.css">
  <!-- ... more CSS ... -->
</head>
<body>
  <!-- HTML structure -->

  <script src="/dashboard/js/utils.js"></script>
  <script src="/dashboard/js/state.js"></script>
  <script src="/dashboard/js/tabs.js"></script>
  <!-- ... more JS ... -->
  <script src="/dashboard/js/init.js"></script>
</body>
</html>
```

### Server Changes

The dashboard server needs to:
1. Serve `/dashboard/css/*.css` files with `text/css` content type
2. Serve `/dashboard/js/*.js` files with `application/javascript` content type
3. Continue serving `/` as the main dashboard page
4. Process template variables ({{PROJECT_NAME}}) in HTML only

### Module Dependencies

JavaScript files have implicit dependencies:

```
utils.js          # No dependencies (escapeHtml, getFileName)
state.js          # No dependencies (state management)
dialogs.js        # utils.js (toast, context menu)
tabs.js           # state.js, utils.js, dialogs.js
architect.js      # state.js
projects.js       # state.js, utils.js, tabs.js
files.js          # state.js, utils.js, tabs.js
palette.js        # state.js, utils.js, files.js
activity.js       # state.js, utils.js, tabs.js
init.js           # All above (initialization)
```

Files are loaded in order via `<script>` tags (no module system needed).

## Hot Reloading

Automatic browser refresh when CSS/JS files change during development.

### How It Works

1. **File watcher**: Server watches `templates/dashboard/` for changes
2. **SSE endpoint**: `/api/dashboard-changes` sends events when files change
3. **Browser listener**: Connects to SSE, reloads appropriate files

### CSS Hot Reload (no page refresh)

```javascript
// On CSS file change, just swap the stylesheet
const link = document.querySelector(`link[href*="${filename}"]`);
link.href = link.href.split('?')[0] + '?t=' + Date.now();
```

No page refresh needed - avoids "Reload site?" warning from terminal iframes.

### JS Hot Reload (soft refresh)

For JS changes, we need to reload but preserve state:

1. Save state to `sessionStorage` before reload
2. Reload page
3. Restore state from `sessionStorage` on init

This preserves: active tab, expanded sections, scroll positions.

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| State loss on JS reload | Persist to sessionStorage, restore on init |
| Race conditions during reload | Only reload when idle (no pending fetches) |
| Memory leaks from old listeners | Full page reload for JS clears everything |
| Terminal iframe disruption | Iframes survive CSS reload; JS reload reconnects |

## Acceptance Criteria

1. Dashboard functions identically after refactoring
2. No build step required - files served directly
3. Each CSS file < 300 lines
4. Each JS file < 400 lines
5. Clear separation of concerns between modules
6. Browser DevTools show separate files for debugging
7. CSS changes hot reload without page refresh
8. JS changes trigger soft refresh with state preservation
9. All existing functionality preserved:
   - Tab management
   - Projects tab
   - Files tree and search
   - Cmd+P palette
   - Activity summary
   - Builder/shell spawning
   - State persistence

## Testing

1. Manual testing of all dashboard features
2. Verify CSS loads correctly (no FOUC)
3. Verify JS loads in correct order (no undefined errors)
4. Test in Chrome, Safari, Firefox
5. Verify template variable injection still works

## Migration Strategy

1. Create new `dashboard/` directory structure
2. Extract CSS into separate files first
3. Extract JS into separate files
4. Update server to serve new structure
5. Keep old `dashboard-split.html` as backup until verified
6. Delete old file after validation

## Risks

- **Load order issues**: JS files must load in correct order
  - Mitigation: Careful dependency analysis, explicit script order
- **CSS specificity changes**: Splitting may affect cascade
  - Mitigation: Keep selectors unchanged, test thoroughly
- **Caching issues**: Browser may cache old versions
  - Mitigation: Use cache-busting query params if needed

## Future Work

- Convert JS to TypeScript modules
- Add ES modules with import/export
- Consider CSS custom properties consolidation

# Plan: Markdown Preview for af open

## Metadata
- **ID**: 0048
- **Status**: draft
- **Specification**: codev/specs/0048-markdown-preview.md
- **Created**: 2025-12-10

## Executive Summary

Implement a toggle button in the `af open` file viewer that allows users to switch between raw markdown editing and rendered preview modes. The implementation uses marked.js for markdown parsing, DOMPurify for XSS sanitization, and Prism.js (already loaded) for syntax highlighting code blocks.

This is a small, focused change affecting primarily the `open.html` template with minor changes to `open-server.ts`.

## Success Metrics
- [ ] All specification criteria met (see spec for full list)
- [ ] Toggle button visible only for `.md` files
- [ ] Preview renders correctly with syntax-highlighted code blocks
- [ ] XSS attacks blocked (verified with security tests)
- [ ] No regressions in existing edit/save functionality
- [ ] Works in both standalone and dashboard tab contexts

## Phase Breakdown

### Phase 1: Server-Side Changes
**Dependencies**: None

#### Objectives
- Pass file type information to the template so it knows when to show the toggle button

#### Deliverables
- [ ] Update `open-server.ts` to pass `isMarkdown` boolean to template
- [ ] Update template placeholders

#### Implementation Details

**File**: `agent-farm/src/servers/open-server.ts`

Add `isMarkdown` detection and template replacement:

```typescript
// After existing lang detection (around line 59-66)
const isMarkdown = ext === 'md';

// In template replacement section (around line 88-91)
template = template.replace(/\{\{IS_MARKDOWN\}\}/g, String(isMarkdown));
```

#### Acceptance Criteria
- [ ] `{{IS_MARKDOWN}}` placeholder replaced with `true` for .md files
- [ ] `{{IS_MARKDOWN}}` placeholder replaced with `false` for other files
- [ ] Existing functionality unchanged

#### Test Plan
- **Manual Testing**: Open .md file, verify `isMarkdown` is true in page source; open .ts file, verify false

#### Rollback Strategy
Revert the single file change to `open-server.ts`

---

### Phase 2: Add CDN Dependencies
**Dependencies**: Phase 1

#### Objectives
- Load marked.js and DOMPurify libraries via CDN (following existing Prism.js pattern)

#### Deliverables
- [ ] Add marked.js CDN script tag
- [ ] Add DOMPurify CDN script tag
- [ ] Conditional loading only for markdown files

#### Implementation Details

**File**: `agent-farm/templates/open.html`

Add to `<head>` section, after Prism.js CDN links:

```html
<!-- Markdown preview dependencies (loaded only for .md files) -->
<script>
  if ({{IS_MARKDOWN}}) {
    document.write('<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"><\/script>');
    document.write('<script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"><\/script>');
  }
</script>
```

Note: Using `document.write` for conditional loading keeps it simple. Could also use dynamic script injection, but this matches how simple conditional loading is typically done.

#### Acceptance Criteria
- [ ] marked.js loads for .md files
- [ ] DOMPurify loads for .md files
- [ ] Neither loads for non-.md files (verify in Network tab)

#### Test Plan
- **Manual Testing**: Open .md file, check Network tab for marked.min.js and purify.min.js; open .ts file, verify they don't load

#### Rollback Strategy
Remove the CDN script tags

---

### Phase 3: Toggle Button UI
**Dependencies**: Phase 2

#### Objectives
- Add toggle button to toolbar
- Implement basic show/hide toggling between edit and preview containers

#### Deliverables
- [ ] Toggle button in toolbar (visible only for .md files)
- [ ] Preview container div
- [ ] Basic toggle functionality (no rendering yet)
- [ ] Keyboard shortcut (Cmd/Ctrl+Shift+P)

#### Implementation Details

**File**: `agent-farm/templates/open.html`

**HTML structure** (add preview container after editor):

```html
<div id="preview-container" style="display: none; padding: 20px; overflow: auto;"></div>
```

**Toolbar button** (add before save button):

```html
<button id="toggle-preview" style="display: none;" title="Toggle Preview (Cmd+Shift+P)">
  <span id="toggle-icon">👁</span> <span id="toggle-text">Preview</span>
</button>
```

**JavaScript** (toggle logic):

```javascript
const isMarkdown = {{IS_MARKDOWN}};
const toggleBtn = document.getElementById('toggle-preview');
const toggleIcon = document.getElementById('toggle-icon');
const toggleText = document.getElementById('toggle-text');
const editor = document.getElementById('editor');
const previewContainer = document.getElementById('preview-container');
const saveButton = document.getElementById('save-button');

let isPreviewMode = false;

if (isMarkdown) {
  toggleBtn.style.display = 'inline-block';
  toggleBtn.addEventListener('click', toggleMode);

  // Keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p') {
      e.preventDefault();
      toggleMode();
    }
  });
}

function toggleMode() {
  isPreviewMode = !isPreviewMode;

  if (isPreviewMode) {
    editor.style.display = 'none';
    previewContainer.style.display = 'block';
    toggleIcon.textContent = '✏️';
    toggleText.textContent = 'Edit';
    saveButton.disabled = true;
  } else {
    editor.style.display = 'block';
    previewContainer.style.display = 'none';
    toggleIcon.textContent = '👁';
    toggleText.textContent = 'Preview';
    saveButton.disabled = false;
  }
}
```

#### Acceptance Criteria
- [ ] Toggle button visible for .md files
- [ ] Toggle button hidden for non-.md files
- [ ] Clicking toggles between editor and empty preview container
- [ ] Cmd/Ctrl+Shift+P triggers toggle
- [ ] Save button disabled in preview mode

#### Test Plan
- **Manual Testing**:
  - Open .md file, verify toggle button visible
  - Open .ts file, verify toggle button hidden
  - Click toggle, verify editor hides and preview shows
  - Press Cmd+Shift+P, verify toggle works
  - Verify save button grays out in preview mode

#### Rollback Strategy
Remove the toggle button and related JavaScript

---

### Phase 4: Markdown Rendering with Security
**Dependencies**: Phase 3

#### Objectives
- Render markdown content using marked.js
- Sanitize output with DOMPurify
- Configure secure link rendering

#### Deliverables
- [ ] `renderPreview()` function
- [ ] DOMPurify sanitization
- [ ] Secure link renderer (target="_blank" + rel="noopener noreferrer")
- [ ] Preview updates on toggle

#### Implementation Details

**File**: `agent-farm/templates/open.html`

**Configure marked.js with secure link renderer**:

```javascript
if (isMarkdown && typeof marked !== 'undefined') {
  marked.use({
    renderer: {
      link(href, title, text) {
        const titleAttr = title ? ` title="${title}"` : '';
        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
    }
  });
}

function renderPreview() {
  const content = editor.textContent || editor.innerText;
  const rawHtml = marked.parse(content);
  const cleanHtml = DOMPurify.sanitize(rawHtml);
  previewContainer.innerHTML = cleanHtml;
}
```

**Update toggleMode() to call renderPreview()**:

```javascript
function toggleMode() {
  isPreviewMode = !isPreviewMode;

  if (isPreviewMode) {
    renderPreview();  // <-- Add this
    editor.style.display = 'none';
    // ... rest of function
  }
  // ...
}
```

#### Acceptance Criteria
- [ ] Markdown renders as HTML in preview
- [ ] Script tags are stripped (XSS blocked)
- [ ] onerror handlers are stripped (XSS blocked)
- [ ] javascript: URLs are blocked (XSS blocked)
- [ ] Links have target="_blank" rel="noopener noreferrer"

#### Test Plan
- **Security Tests** (Critical):
  - Create test.md with `<script>alert('xss')</script>` - verify no alert
  - Create test.md with `<img onerror="alert('xss')">` - verify no alert
  - Create test.md with `[link](javascript:alert('xss'))` - verify link is sanitized
  - Inspect rendered link elements - verify rel attribute present
- **Manual Testing**:
  - Open spec file, toggle to preview, verify headings/lists render correctly

#### Rollback Strategy
Remove marked.use() configuration and renderPreview() function

---

### Phase 5: Syntax Highlighting in Preview
**Dependencies**: Phase 4

#### Objectives
- Highlight code blocks in preview using Prism.js (already loaded)

#### Deliverables
- [ ] Code blocks have syntax highlighting in preview
- [ ] Language detection works for common languages

#### Implementation Details

**File**: `agent-farm/templates/open.html`

**Update renderPreview() to run Prism.js**:

```javascript
function renderPreview() {
  const content = editor.textContent || editor.innerText;
  const rawHtml = marked.parse(content);
  const cleanHtml = DOMPurify.sanitize(rawHtml);
  previewContainer.innerHTML = cleanHtml;

  // Highlight code blocks with Prism.js
  previewContainer.querySelectorAll('pre code').forEach((block) => {
    // Add language class if detected from code fence
    const langMatch = block.className.match(/language-(\w+)/);
    if (langMatch) {
      block.parentElement.classList.add(`language-${langMatch[1]}`);
    }
    Prism.highlightElement(block);
  });
}
```

#### Acceptance Criteria
- [ ] Code blocks with language specifier (```javascript) are highlighted
- [ ] Code blocks without language specifier render as plain preformatted text
- [ ] Highlighting matches edit mode highlighting style

#### Test Plan
- **Manual Testing**:
  - Open markdown file with JavaScript code block, verify syntax colors in preview
  - Open markdown file with Python code block, verify syntax colors
  - Open markdown file with unlabeled code block, verify it renders but without colors

#### Rollback Strategy
Remove the Prism.js highlighting loop from renderPreview()

---

### Phase 6: Scroll Position & Styling
**Dependencies**: Phase 5

#### Objectives
- Preserve approximate scroll position when toggling
- Apply GitHub-flavored markdown styling

#### Deliverables
- [ ] Scroll position approximately preserved on toggle
- [ ] Preview styled with GFM-like CSS
- [ ] Tables, headings, lists styled appropriately

#### Implementation Details

**File**: `agent-farm/templates/open.html`

**Scroll position handling** (update toggleMode()):

```javascript
function toggleMode() {
  // Capture scroll position as percentage before switching
  const sourceElement = isPreviewMode ? previewContainer : editor;
  const scrollPercent = sourceElement.scrollHeight > 0
    ? sourceElement.scrollTop / sourceElement.scrollHeight
    : 0;

  isPreviewMode = !isPreviewMode;

  if (isPreviewMode) {
    renderPreview();
    editor.style.display = 'none';
    previewContainer.style.display = 'block';
    toggleIcon.textContent = '✏️';
    toggleText.textContent = 'Edit';
    saveButton.disabled = true;
  } else {
    editor.style.display = 'block';
    previewContainer.style.display = 'none';
    toggleIcon.textContent = '👁';
    toggleText.textContent = 'Preview';
    saveButton.disabled = false;
  }

  // Restore approximate scroll position
  const targetElement = isPreviewMode ? previewContainer : editor;
  requestAnimationFrame(() => {
    targetElement.scrollTop = scrollPercent * targetElement.scrollHeight;
  });

  updateToggleButton();
}
```

**CSS styling** (add to `<style>` section):

```css
#preview-container {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: var(--text-primary);
  max-width: 900px;
  margin: 0 auto;
}

#preview-container h1,
#preview-container h2 {
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.3em;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

#preview-container h1 { font-size: 2em; }
#preview-container h2 { font-size: 1.5em; }
#preview-container h3 { font-size: 1.25em; margin-top: 1em; }

#preview-container code {
  background: var(--bg-tertiary);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-size: 0.9em;
}

#preview-container pre {
  background: var(--bg-secondary);
  padding: 16px;
  overflow: auto;
  border-radius: 6px;
  margin: 1em 0;
}

#preview-container pre code {
  background: none;
  padding: 0;
}

#preview-container table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

#preview-container th,
#preview-container td {
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
}

#preview-container th {
  background: var(--bg-secondary);
}

#preview-container tr:nth-child(even) {
  background: var(--bg-tertiary);
}

#preview-container a {
  color: var(--accent);
  text-decoration: underline;
}

#preview-container ul,
#preview-container ol {
  padding-left: 2em;
  margin: 1em 0;
}

#preview-container blockquote {
  border-left: 4px solid var(--border);
  padding-left: 1em;
  margin: 1em 0;
  color: var(--text-secondary);
}
```

#### Acceptance Criteria
- [ ] Scroll position approximately maintained when toggling
- [ ] Headings have proper sizing and border
- [ ] Code blocks have gray background
- [ ] Tables have borders and alternating row colors
- [ ] Links are blue and underlined
- [ ] Lists are properly indented

#### Test Plan
- **Manual Testing**:
  - Scroll to middle of long markdown file, toggle to preview, verify position is approximate
  - Toggle back to edit, verify position is approximate
  - Verify all styling elements look reasonable

#### Rollback Strategy
Remove CSS and scroll position code

---

### Phase 7: Testing & Polish
**Dependencies**: Phase 6

#### Objectives
- Comprehensive testing of all scenarios
- Fix any bugs found
- Edge case handling

#### Deliverables
- [ ] All functional tests pass
- [ ] All security tests pass
- [ ] Edge cases handled gracefully

#### Test Plan

**Functional Tests**:
1. Open .md file → toggle button visible
2. Open .ts file → toggle button NOT visible
3. Click toggle → switches to Preview mode with rendered markdown
4. Click toggle again → switches back to Edit mode
5. Edit content in Edit mode → switch to Preview → see updated content
6. Preview mode → cannot edit content
7. Save button disabled in Preview mode
8. Save works in Edit mode
9. Cmd/Ctrl+Shift+P toggles between modes
10. Works in dashboard tab context

**Security Tests**:
1. `<script>alert('xss')</script>` → script NOT executed
2. `<img onerror="alert('xss')">` → handler NOT executed
3. `[link](javascript:alert('xss'))` → link sanitized/blocked
4. `<iframe src="evil.com">` → iframe removed
5. Links have `rel="noopener noreferrer"` (inspect DOM)

**Edge Cases**:
1. Large markdown file (>1000 lines) renders without freezing
2. Empty markdown file shows empty preview
3. Malformed markdown degrades gracefully

#### Rollback Strategy
N/A - this phase is testing only

---

## Dependency Map
```
Phase 1 (Server) ──→ Phase 2 (CDN) ──→ Phase 3 (Toggle UI) ──→ Phase 4 (Rendering)
                                                                    ↓
                                       Phase 7 (Testing) ←── Phase 6 (Styling) ←── Phase 5 (Highlighting)
```

## Resource Requirements

### Development Resources
- **Engineers**: 1 (familiar with TypeScript, HTML/CSS/JS)
- **Environment**: Local development with `af start`

### Infrastructure
- No database changes
- No new services
- CDN dependencies: jsdelivr.net (marked.js, DOMPurify)

## Integration Points

### External Systems
- **jsdelivr CDN**: For marked.js and DOMPurify
  - **Fallback**: If CDN unavailable, toggle button hidden (feature gracefully degrades)

### Internal Systems
- **open-server.ts**: Minor change to pass `isMarkdown` flag
- **open.html**: Main implementation work

## Risk Analysis

### Technical Risks
| Risk | Probability | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| XSS vulnerability | Low | High | DOMPurify + security tests | Builder |
| CDN unavailable | Low | Medium | Graceful degradation | Builder |
| Performance on large files | Low | Low | Test with 1000+ line files | Builder |

## Validation Checkpoints
1. **After Phase 3**: Toggle button works (no rendering yet)
2. **After Phase 4**: Security tests pass (XSS blocked)
3. **After Phase 6**: All styling applied, scroll works
4. **Before PR**: All Phase 7 tests pass

## Documentation Updates Required
- [ ] CLI command reference (if any behavioral changes documented)

## Post-Implementation Tasks
- [ ] Manual testing in dashboard context
- [ ] Security verification (run XSS test cases)
- [ ] Performance spot check with large markdown file

## Expert Review
<!-- To be filled after consultation -->

## Approval
- [ ] Technical Lead Review
- [ ] Expert AI Consultation Complete

## Change Log
| Date | Change | Reason | Author |
|------|--------|--------|--------|
| 2025-12-10 | Initial plan | Created from spec | Architect |

## Notes
- Implementation details moved from spec per architect review
- Images won't render (known server limitation, out of scope)
- Could extend to HTML/SVG preview in future

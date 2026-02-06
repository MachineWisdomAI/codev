# Implementation Plan: Terminal File Links and File Browser

## Metadata
- **ID**: plan-2026-02-06-terminal-file-links
- **Status**: draft
- **Specification**: [codev/specs/0092-terminal-file-links.md](../specs/0092-terminal-file-links.md)
- **Created**: 2026-02-06
- **Protocol**: SPIDER

## Executive Summary

This plan implements Spec 0092: clickable file paths in terminal output, an enhanced file browser with git status and search, and port consolidation (replacing per-file `open-server.ts` with Tower-served file tabs).

The builder workspace at `.builders/0092/` contains ~90% complete implementation from a prior pass. After thorough code review, **most functionality is already built**. This plan addresses two remaining gaps and adds comprehensive testing.

### Current Implementation Status

| Component | Status | Location |
|-----------|--------|----------|
| Tower file tab API (CRUD) | ✅ Complete | tower-server.ts L2219-2402 |
| Tower git status API | ✅ Complete | tower-server.ts L2487-2528 |
| Tower recent files API | ✅ Complete | tower-server.ts L2531-2548 |
| Tower file tree API (`GET /api/files`) | ❌ **Missing** | api.ts L134 calls it, no server handler |
| FileViewer component | ✅ Complete | FileViewer.tsx (image, video, text, edit, line scroll) |
| FileTree component | ✅ Complete | FileTree.tsx (search, recent, git indicators, tree) |
| File path parsing | ✅ Complete | filePaths.ts (regex, parseFilePath, looksLikeFilePath) |
| Terminal WebLinksAddon | ⚠️ **Partial** | Terminal.tsx L70-87: addon loaded but `urlRegex: undefined` |
| App file open handler | ✅ Complete | App.tsx L23-35 (handleFileOpen → createFileTab) |
| open-server.ts removal | ✅ Complete | File deleted, openPortRange removed |
| Tab system with file type | ✅ Complete | useTabs.ts handles 'file' tab type |
| Tests | ❌ **Missing** | No tests for any Spec 0092 functionality |

## Success Metrics
- [ ] All 16 specification acceptance criteria met
- [ ] File paths in terminal output are clickable
- [ ] File tree loads and displays project structure
- [ ] Git status indicators visible in tree view
- [ ] Search autocomplete filters files
- [ ] Recent files section populated
- [ ] All file viewing goes through Tower (no separate ports)
- [ ] Test coverage for file path parsing, tree building, and integration

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Phase 1: File Tree API Endpoint"},
    {"id": "phase_2", "title": "Phase 2: Terminal File Path Detection"},
    {"id": "phase_3", "title": "Phase 3: Integration Testing and Polish"}
  ]
}
```

## Phase Breakdown

### Phase 1: File Tree API Endpoint
**Dependencies**: None

#### Objectives
- Implement the missing `GET /project/:enc/api/files` endpoint in tower-server.ts
- This unblocks the FileTree component which already has complete frontend implementation

#### Deliverables
- [ ] `GET /api/files` endpoint returning `FileEntry[]` tree structure
- [ ] Directory exclusions: `node_modules/`, `.git/`, `.builders/`, `dist/` excluded
- [ ] Directory traversal limited to 3 levels deep
- [ ] Per-directory entry limit of 1000
- [ ] Path traversal security (reject symlinks escaping project root)
- [ ] Unit tests for `buildFileTree()` function

#### Implementation Details

**File to modify**: `packages/codev/src/agent-farm/servers/tower-server.ts`

Add a `buildFileTree()` helper function and a new route handler. The route should be added between the existing `/api/stop` handler (line 2485) and the `/api/git/status` handler (line 2487). The route uses exact match `apiPath === 'files'` which won't conflict with `apiPath === 'files/recent'`.

```typescript
// GET /api/files - Return project file tree (Spec 0092)
if (req.method === 'GET' && apiPath === 'files') {
  try {
    const tree = buildFileTree(projectPath, {
      maxDepth: 3,
      maxEntriesPerDir: 1000,
      excludeDirs: new Set(['node_modules', '.git', '.builders', 'dist', '.next', '__pycache__', '.venv']),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tree));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
  return;
}
```

`buildFileTree()` implementation:
- `fs.readdirSync(dir, { withFileTypes: true })` for directory listing
- Returns `FileEntry[]` matching the existing dashboard interface (`{ name, path, type, children? }`)
- Sort: directories first, then files, alphabetical within each
- Symlinks: resolve with `fs.realpathSync`, skip if target outside project root
- Permission errors: skip unreadable directories, log warning
- Paths in response are relative to project root (matching frontend expectations)

**File to create**: `packages/codev/src/agent-farm/servers/__tests__/buildFileTree.test.ts`

#### Acceptance Criteria
- [ ] `GET /api/files` returns valid `FileEntry[]` JSON
- [ ] `node_modules/`, `.git/`, `.builders/`, `dist/` excluded from results
- [ ] Directories sorted before files, alphabetical within each group
- [ ] Tree depth limited to 3 levels
- [ ] Symlinks outside project root are skipped
- [ ] FileTree component loads and displays tree when Tower is running

#### Test Plan
- **Unit Tests** (`buildFileTree.test.ts`):
  - Builds correct tree from a temp directory structure
  - Excludes configured directories
  - Respects depth limit
  - Respects entry count limit
  - Sorts directories before files
  - Handles permission-denied directories gracefully
  - Handles symlinks (skip if outside project)
  - Returns empty array for empty directory
- **Manual Testing**: Open dashboard, verify file tree renders with project files

#### Risks
- **Risk**: Large monorepos with thousands of files could cause slow response
  - **Mitigation**: Depth limit (3), entry limit (1000), excluded directories

---

### Phase 2: Terminal File Path Detection
**Dependencies**: None (parallel with Phase 1)

#### Objectives
- Fix WebLinksAddon configuration in Terminal.tsx to detect file paths (not just URLs)
- Enable the full terminal → file viewer click flow

#### Deliverables
- [ ] WebLinksAddon configured with `FILE_PATH_REGEX` for file path detection
- [ ] Separate WebLinksAddon instance for standard URL detection
- [ ] File paths in terminal output are underlined and clickable
- [ ] Click opens file in FileViewer tab with correct line number
- [ ] Regular URLs still open in new browser tab
- [ ] Unit tests for file path regex and parsing

#### Implementation Details

**File to modify**: `packages/codev/dashboard/src/components/Terminal.tsx`

Current state (lines 68-88): WebLinksAddon loaded with `urlRegex: undefined`, meaning only standard URLs are detected. The handler already calls `looksLikeFilePath()` and `onFileOpen()`, but file paths never reach the handler because the addon doesn't match them.

**Fix**: Load two WebLinksAddon instances:

```typescript
import { FILE_PATH_REGEX, parseFilePath, looksLikeFilePath } from '../lib/filePaths.js';

// Addon 1: Standard URL detection (default regex)
const urlLinksAddon = new WebLinksAddon((event, uri) => {
  window.open(uri, '_blank');
});
term.loadAddon(urlLinksAddon);

// Addon 2: File path detection (custom regex)
if (onFileOpen) {
  const fileLinksAddon = new WebLinksAddon(
    (event, uri) => {
      event.preventDefault();
      if (looksLikeFilePath(uri)) {
        const parsed = parseFilePath(uri);
        onFileOpen(parsed.path, parsed.line, parsed.column);
      }
    },
    { urlRegex: FILE_PATH_REGEX }
  );
  term.loadAddon(fileLinksAddon);
}
```

**Validation approach**: Optimistic — validate at click time rather than render time. The `createFileTab` API endpoint already returns 404 for non-existent files. This avoids the performance cost of server round-trips for every regex match.

**File to create**: `packages/codev/dashboard/src/__tests__/filePaths.test.ts`

#### Acceptance Criteria
- [ ] File paths like `src/server.ts` are underlined on hover in terminal
- [ ] Clicking file path opens FileViewer tab
- [ ] Paths with line numbers (`src/server.ts:42`) scroll to correct line
- [ ] Visual Studio format (`file.ts(42,15)`) also works
- [ ] Regular URLs (`https://example.com`) still open in new browser tab
- [ ] Both addon instances coexist without conflicts

#### Test Plan
- **Unit Tests** (`filePaths.test.ts`):
  - `FILE_PATH_REGEX` matches: `src/file.ts`, `./src/file.ts`, `/abs/path.ts`, `file.ts:42`, `file.ts:42:15`, `src/file.ts(42,15)`, `../relative/path.ts`
  - `FILE_PATH_REGEX` does not match: URLs, plain words, domain names
  - `parseFilePath()` extracts correct path/line/column for colon format
  - `parseFilePath()` extracts correct path/line/column for paren format
  - `parseFilePath()` returns path-only when no line info
  - `looksLikeFilePath()` returns true for valid paths, false for URLs and domains
- **Manual Testing**: Run `git status`, `rg "TODO"`, `tsc --noEmit` in terminal and verify file paths are clickable

#### Risks
- **Risk**: Two WebLinksAddon instances may conflict on the same terminal buffer
  - **Mitigation**: xterm.js addons are designed to be composable. Test early; if conflict, fall back to a single addon with combined regex.
- **Risk**: `FILE_PATH_REGEX` uses global flag and lookbehind which may not work with WebLinksAddon
  - **Mitigation**: WebLinksAddon applies regex per-line. May need to strip global flag or adjust anchoring to match addon's requirements. Test with addon's actual execution pattern.

---

### Phase 3: Integration Testing and Polish
**Dependencies**: Phase 1, Phase 2

#### Objectives
- End-to-end testing of all Spec 0092 functionality
- CSS/styling verification for file browser components
- Edge case handling

#### Deliverables
- [ ] E2E test: terminal file link → file viewer opens at correct line
- [ ] E2E test: file tree loads, search works, git indicators display
- [ ] Verify CSS for git status indicators (`.git-modified`, `.git-staged`, `.git-untracked`)
- [ ] Verify CSS for search autocomplete dropdown (`.file-search-suggestions`)
- [ ] Verify CSS for highlighted line (`.highlighted-line`)
- [ ] Edge case: files >10MB show warning
- [ ] Edge case: unicode file paths
- [ ] Mobile viewport test

#### Implementation Details

**Files to modify**:
- `packages/codev/dashboard/src/styles.css` — Verify/add CSS for git indicators, search dropdown, highlighted line
- `packages/codev/dashboard/src/components/FileViewer.tsx` — Add file size check (>10MB warning)

**CSS classes to verify/add**:
```css
.git-modified { color: #e2b93d; }   /* Yellow for modified */
.git-staged { color: #73c991; }     /* Green for staged */
.git-untracked { color: #888; }     /* Gray for untracked */
.highlighted-line { background: rgba(255, 255, 0, 0.15); }
.file-search-suggestions { position: absolute; z-index: 10; ... }
```

**Edge cases to handle**:
1. File >10MB: Check `size` in FileContent response, show warning instead of loading
2. Binary file: Already handled (isImage/isVideo checks, else raw text display)
3. Unicode paths: Ensure regex handles non-ASCII characters in filenames
4. Empty git status: Already handled (returns empty arrays)
5. Git not installed: Already handled (returns error message, falls back gracefully)

#### Acceptance Criteria
- [ ] All 16 acceptance criteria from specification pass
- [ ] No console errors during normal dashboard operation
- [ ] Git indicators are visually distinguishable (M=yellow, A=green, ?=gray)
- [ ] Search dropdown positioned correctly, doesn't overflow viewport
- [ ] Clicking highlighted line in FileViewer scrolls to correct position
- [ ] Mobile: file tree renders, tapping files opens them

#### Test Plan
- **Unit Tests**: Already created in Phases 1 & 2
- **Integration Tests**:
  - Dashboard loads without errors
  - File tree populates from `/api/files`
  - Search input filters file list
  - Git status indicators appear on modified files
  - Recent files section shows opened files
- **Manual Testing Checklist**:
  - [ ] `git status` output → file paths clickable
  - [ ] `rg "pattern"` output → paths with line numbers clickable
  - [ ] Click file in tree → opens in FileViewer
  - [ ] Search "app" → App.tsx appears in results
  - [ ] Mobile viewport (375px) → layout doesn't break

#### Risks
- **Risk**: CSS conflicts with existing dashboard styles
  - **Mitigation**: All classes use `file-` or `git-` prefixes, already scoped

---

## Dependency Map
```
Phase 1 (File Tree API) ──┐
                           ├──→ Phase 3 (Testing & Polish)
Phase 2 (Terminal Links) ──┘
```

Phases 1 and 2 are independent and can be implemented in parallel.

## Risk Analysis

### Technical Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Two WebLinksAddon instances conflict | Low | Medium | Fall back to single addon with combined regex |
| FILE_PATH_REGEX incompatible with addon | Low | High | Test immediately, adapt regex anchoring |
| Large repo file tree too slow | Medium | Medium | Depth/entry limits, excluded directories |
| FILE_PATH_REGEX false positives | Medium | Low | Conservative regex + validation at click time |

### Integration Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Tower not running during testing | Low | Low | Standard dev workflow starts Tower first |
| Git not available in project dir | Low | Low | Git status endpoint returns empty (handled) |

## Validation Checkpoints
1. **After Phase 1**: FileTree component loads and displays project file structure
2. **After Phase 2**: Click file path in terminal → file opens at correct line in FileViewer
3. **After Phase 3**: All 16 spec acceptance criteria verified, all tests pass

## Consultation Log

### First Consultation (After Draft)
- **Gemini Feedback**: *Pending*
- **Codex Feedback**: *Pending*
- **Changes Made**: *Pending*
- **Not Incorporated**: *Pending*

### Second Consultation (After Human Feedback)
- **Gemini Feedback**: *Pending*
- **Codex Feedback**: *Pending*
- **Changes Made**: *Pending*

## Change Log
| Date | Change | Reason | Author |
|------|--------|--------|--------|
| 2026-02-06 | Complete rewrite of plan based on actual builder state | Prior plan was pre-implementation; codebase now ~90% complete | Claude |

## Notes

### Key Architectural Decisions
1. **Two WebLinksAddon instances** (one for URLs, one for file paths) — cleanest separation of concerns
2. **Optimistic file validation** (check at click time via createFileTab API, not at render time) — better performance
3. **Synchronous `buildFileTree`** using `readdirSync` — acceptable for depth-limited (3 levels) trees with exclusions
4. **Inline git status in FileTree** rather than separate `useGitStatus` hook — simpler, already implemented

### What Was Already Built
The builder at `.builders/0092/` completed most of the implementation:
- All Tower API endpoints (file tab CRUD, git status, recent files)
- FileViewer with text/image/video support, editing, line scrolling
- FileTree with search autocomplete, recent files section, git indicators
- File path parsing utilities (regex, parser, validator)
- App.tsx wiring (terminal → handleFileOpen → createFileTab → FileViewer)
- Tab system supporting file tab type
- open-server.ts deletion and config cleanup

Two items remain: the `GET /api/files` endpoint (file tree backend) and fixing the WebLinksAddon regex configuration.

---

## Amendment History

<!-- When adding a TICK amendment, add a new entry below this line in chronological order -->

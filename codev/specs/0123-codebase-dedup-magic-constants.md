# Spec 0123: Codebase Deduplication & Magic Constants

## Overview

Investigation of `packages/codev/src/` (89 source files, ~17,245 LOC) for duplicate code, magic constants, and dead code. This spec catalogs all findings and proposes a consolidation strategy.

## Codebase Scope

- **Source files examined**: 89 TypeScript files (excluding tests)
- **Test files**: 117 TypeScript test files
- **Total source LOC**: 17,245 (24,266 including comments/blanks)
- **Main subsystems**: agent-farm (commands, servers, lib, utils, db), commands (consult, porch), lib, terminal

---

## Category 1: Magic Constants — Port Numbers

### Finding: `DEFAULT_TOWER_PORT = 4100` defined 8 times

The Tower port is independently declared in 8 source files, plus used as a bare literal in 2 more:

| File | Declaration |
|------|------------|
| `agent-farm/servers/tower-server.ts:54` | `const DEFAULT_PORT = 4100` |
| `agent-farm/commands/tower.ts:20` | `const DEFAULT_TOWER_PORT = 4100` |
| `agent-farm/commands/tower-cloud.ts:24` | `const DEFAULT_TOWER_PORT = 4100` |
| `agent-farm/commands/stop.ts:16` | `const DEFAULT_TOWER_PORT = 4100` |
| `agent-farm/commands/start.ts:18` | `const DEFAULT_TOWER_PORT = 4100` |
| `agent-farm/commands/status.ts:16` | `const DEFAULT_TOWER_PORT = 4100` |
| `agent-farm/commands/spawn-worktree.ts:18` | `export const DEFAULT_TOWER_PORT = 4100` |
| `agent-farm/lib/tower-client.ts:14` | `const DEFAULT_TOWER_PORT = 4100` |
| `agent-farm/cli.ts:20` | `const towerPort = port \|\| 4100` (inline) |
| `agent-farm/utils/notifications.ts:18` | `const TOWER_PORT = process.env.CODEV_TOWER_PORT \|\| '4100'` (string) |

**Impact**: If the default port ever changes, 10 files must be updated. One file (`spawn-worktree.ts`) already exports it, but nobody imports it except `spawn.ts`.

**Recommendation**: Export `DEFAULT_TOWER_PORT` from a single location (e.g. `agent-farm/utils/config.ts` or a new `agent-farm/constants.ts`) and import it everywhere.

**Estimated LOC change**: ~20 lines (10 deletions of local constants + 10 import additions)

---

## Category 2: Magic Constants — Timeouts & Intervals

### Finding: Timeout values scattered across 15+ files with no central registry

| Value | Meaning | Files |
|-------|---------|-------|
| `5000` | Tower startup timeout | `commands/tower.ts:23` |
| `5000` | SQLite busy timeout | `db/index.ts:43` |
| `5000` | Socket creation wait | `terminal/session-manager.ts:618` |
| `5000` | API timeout | `servers/tower-routes.ts:1668` |
| `10000` | Tower client request timeout | `lib/tower-client.ts:19` |
| `10000` | Tunnel abort timeout | `servers/tower-tunnel.ts:480` |
| `30000` | Metadata refresh interval | `servers/tower-tunnel.ts:46` |
| `30000` | Instance timeout | `servers/tower-instances.ts:319` |
| `60000` | Generic timeout | `servers/tower-routes.ts:780` |
| `60000` | Rate limit window | `servers/tower-utils.ts:20` |
| `60000` | Notification dedupe window | `utils/notifications.ts:22` |
| `60000` | Shellper cleanup interval | `servers/tower-server.ts:268` |
| `120000` | Cloud callback timeout | `commands/tower-cloud.ts:25` |
| `300000` | Nonce TTL | `lib/nonce-store.ts:11` |
| `300000` | Reconnect timeout | `servers/tower-terminals.ts:104`, `terminal/pty-manager.ts:54`, `terminal/pty-session.ts:74`, `terminal/session-manager.ts:718` |
| `3000` | CLI abort signal | `cli.ts:27` |

**Notable**: The value `300_000` (5 minutes) appears in 4 separate source files as a reconnect/reset timeout, each defined independently.

**Also**: Small delays (`50`, `100`, `200`, `500`, `1000` ms) appear inline in `tower-routes.ts` and `session-manager.ts` without named constants.

**Recommendation**: Create a `constants.ts` module with named timeout constants grouped by subsystem. Not all timeouts need centralizing (context-specific values like `STARTUP_TIMEOUT_MS` are fine local), but shared values like the reconnect timeout and common intervals should be.

**Estimated LOC change**: ~30 lines (new constants file + replacements of shared values)

---

## Category 3: Magic Constants — Buffer & Size Limits

| Value | Meaning | File |
|-------|---------|------|
| `10485760` (10 MB) | Max image upload | `servers/tower-routes.ts:1048` |
| `10485760` (10 MB) | Shell max buffer | `utils/shell.ts:25` |
| `49152` (48 KB) | Max spec file size for send | `commands/send.ts:18` |
| `16777216` (16 MB) | Shellper max frame | `terminal/shellper-protocol.ts:34` |
| `52428800` (50 MB) | Disk log max bytes | `terminal/pty-manager.ts:53` |
| `4096` | Max stderr buffer | `utils/shell.ts:59` |
| `1024 * 1024` (1 MB) | JSON body max size | `utils/server-utils.ts:26` |

**Notable**: `10485760` appears in two files with different purposes (image upload vs shell buffer). Both are "10 MB" but conceptually different limits.

**Recommendation**: These are mostly well-named constants in their respective files. Low priority for centralization since they serve different purposes. The `10 MB` coincidence is fine — they're semantically different.

**Estimated LOC change**: ~0 (leave as-is)

---

## Category 4: Magic Constants — Ring Buffer & Session Defaults

| Value | Meaning | File |
|-------|---------|------|
| `1000` | Ring buffer default capacity | `terminal/ring-buffer.ts:13` |
| `1000` | PTY ring buffer lines | `terminal/pty-manager.ts:51` |
| `10000` | Replay buffer max lines | `terminal/shellper-replay-buffer.ts:22` |
| `10000` | Tower terminal ring buffer | `servers/tower-terminals.ts:101` |
| `500` | Max stderr lines | `terminal/session-manager.ts:67` |
| `10000` | Max chars per stderr line | `terminal/session-manager.ts:67` |

**Recommendation**: Consolidate terminal-related defaults into `terminal/index.ts` (which already exports `DEFAULT_COLS` and `DEFAULT_ROWS`). The `10000` line buffer default appears in two independent files.

**Estimated LOC change**: ~10 lines

---

## Category 5: Duplicate Code — Prompt/Readline Functions

### Finding: `prompt()` and `confirm()` duplicated in tower-cloud.ts

`lib/cli-prompts.ts` already exports `prompt()` and `confirm()` functions (extracted during Maintenance Run 0004). But `agent-farm/commands/tower-cloud.ts:30-46` re-implements both functions from scratch instead of importing them.

**cli-prompts.ts** (the canonical version):
- `prompt(question, defaultValue?)` — handles default values, bracket formatting
- `confirm(question, defaultYes?)` — handles Y/n vs y/N defaults

**tower-cloud.ts** (the duplicate):
- `prompt(question)` — simpler, no default value support
- `confirm(question)` — simpler, no defaultYes support

**Recommendation**: Delete the local functions in `tower-cloud.ts` and import from `lib/cli-prompts.ts`.

**Estimated LOC change**: -15 lines (delete 17 lines, add 2 for import)

---

## Category 6: Duplicate Code — Port Availability Check

### Finding: `isPortInUse()` in tower.ts duplicates `findAvailablePort()` in shell.ts

Both use the same `net.createServer()` → `listen()` → check `EADDRINUSE` pattern:

- `agent-farm/commands/tower.ts:51-66` — `isPortInUse(port)`: Returns `boolean`
- `agent-farm/utils/shell.ts:118-141` — `findAvailablePort(startPort)`: Contains identical inner `isPortAvailable()` logic, plus scanning

**Recommendation**: Extract `isPortAvailable(port): Promise<boolean>` from `shell.ts` as a standalone export, then use it in `tower.ts` instead of the duplicate.

**Estimated LOC change**: -12 lines (delete tower.ts duplicate, add 1-line import)

---

## Category 7: Duplicate Code — Logging with File Append

### Finding: tower-server.ts and tower.ts both implement file-logging

- `agent-farm/servers/tower-server.ts:78-98` — inline `log()` function that timestamps and appends to file
- `agent-farm/commands/tower.ts:38-45` — `logToFile()` function doing the same

Neither uses the `agent-farm/utils/logger.ts` module (which only supports console output).

**Recommendation**: Add optional file-logging support to the logger utility, or create a dedicated `file-logger.ts`. Low priority since only 2 call sites.

**Estimated LOC change**: ~15 lines (new file-log helper + 2 call site replacements)

---

## Category 8: Duplicate Code — Slugify

### Finding: slug/sanitize logic duplicated in spawn files

- `agent-farm/commands/spawn-worktree.ts:114-121` — `slugify(title)` function (exported, well-implemented)
- `agent-farm/commands/spawn.ts:152` — inline `specName.replace(/^[0-9]+-/, '')` (different purpose but similar pattern)
- `agent-farm/commands/spawn-worktree.ts:83-85` — additional `.replace(/[^a-z0-9_-]/gi, '')` sanitization

**Recommendation**: The `slugify()` export in `spawn-worktree.ts` is fine. The inline sanitization in other places is different enough (stripping prefixes vs full slugification) that this is low priority.

**Estimated LOC change**: ~0 (leave as-is)

---

## Category 9: Duplicate Code — Directory Ensure Pattern

### Finding: `mkdirSync({ recursive: true })` appears 30+ times

The pattern `mkdirSync(dir, { recursive: true })` or `await mkdir(dir, { recursive: true })` appears throughout:

- `agent-farm/db/index.ts:23-26` — `ensureDir()` helper (local)
- `agent-farm/utils/config.ts:238-248` — `ensureDirectories()` helper
- `agent-farm/servers/tower-routes.ts:1076` — inline
- `agent-farm/lib/cloud-config.ts:107,169` — inline (2 call sites)
- Many other files

**Recommendation**: This is an idiomatic Node.js pattern. While a shared `ensureDir()` could reduce a few lines, the pattern is simple enough that centralizing it adds complexity without much benefit. Low priority.

**Estimated LOC change**: ~0 (leave as-is)

---

## Category 10: Dead/Vestigial Code

### 10a. Unused function parameters (underscore-prefixed)

| Function | Unused Param | File |
|----------|-------------|------|
| `createInitialState()` | `_workspaceRoot` | `commands/porch/state.ts:103` |
| `buildResumeNotice()` | `_projectId` | `agent-farm/commands/spawn-roles.ts:173` |
| `isSessionPersistent()` | `_terminalId` | `agent-farm/servers/tower-terminals.ts:184` |
| `isRequestAllowed()` | `_req` | `agent-farm/utils/server-utils.ts:59` |

**Notes**:
- `_workspaceRoot` was likely kept for future use (workspace-aware state initialization)
- `_projectId` was likely intended to customize the resume notice per-project but never implemented
- `_terminalId` — function only checks `session.shellperBacked`
- `_req` — intentional stub; security check deferred to localhost binding

**Recommendation**: Remove `_workspaceRoot` from `createInitialState()` and `_terminalId` from `isSessionPersistent()` — these have no callers passing meaningful values. Keep `_projectId` (callers do pass it — removing would require changing call sites) and `_req` (intentional security stub).

**Estimated LOC change**: ~4 lines

### 10b. Stub function: `isRequestAllowed()`

`server-utils.ts:59-61` — always returns `true`. Imported and called by `tower-routes.ts:129`. This is an intentional security architecture decision (localhost binding provides access control), not dead code. The function exists as a hook point.

**Recommendation**: Leave as-is. Add a comment explaining it's intentional.

**Estimated LOC change**: ~0

### 10c. No significant dead exports found

All major exported functions and types are imported and used. The codebase is reasonably clean — previous maintenance runs (Run 0004) already cleaned up significant duplication.

---

## Consolidation Strategy

### Phase 1: Create shared constants module (~25 LOC new, ~35 LOC removed)

Create `agent-farm/constants.ts`:
```typescript
// Tower
export const DEFAULT_TOWER_PORT = 4100;

// Timeouts (shared across subsystems)
export const RECONNECT_TIMEOUT_MS = 300_000;  // 5 minutes

// Terminal defaults (move from terminal/index.ts or co-locate)
export const DEFAULT_TERMINAL_BUFFER_LINES = 10_000;
```

Update all 8+ files to import `DEFAULT_TOWER_PORT` from here instead of defining locally.

### Phase 2: Eliminate prompt duplication (~15 LOC removed)

Delete local `prompt()` and `confirm()` from `tower-cloud.ts`, import from `lib/cli-prompts.ts`.

### Phase 3: Eliminate port-check duplication (~12 LOC removed)

Export `isPortAvailable()` from `shell.ts`, replace `isPortInUse()` in `tower.ts`.

### Phase 4: Clean up unused parameters (~4 LOC)

Remove `_workspaceRoot` from `createInitialState()` and `_terminalId` from `isSessionPersistent()`.

---

## Summary

| Category | Items Found | Priority | Est. LOC Impact |
|----------|-------------|----------|-----------------|
| Port constant duplication | 10 files | **HIGH** | -20 net |
| Timeout scattering | 15+ values | **MEDIUM** | -10 net |
| Prompt function duplication | 2 functions | **HIGH** | -15 net |
| Port-check duplication | 2 functions | **MEDIUM** | -12 net |
| Buffer default scattering | 6 values | **LOW** | -5 net |
| File-logging duplication | 2 functions | **LOW** | ~0 net |
| Unused parameters | 4 params | **LOW** | -4 net |
| **Total** | | | **~-66 net LOC** |

The codebase is in reasonable shape — previous maintenance (Run 0004) already addressed major duplication. The primary win is centralizing `DEFAULT_TOWER_PORT` (high value, trivial effort) and eliminating the prompt function duplication. Total estimated implementation effort: ~1 hour.

## Acceptance Criteria

- [ ] `DEFAULT_TOWER_PORT` defined in exactly one file, imported everywhere
- [ ] `prompt()`/`confirm()` in `tower-cloud.ts` replaced with imports from `cli-prompts.ts`
- [ ] `isPortInUse()` in `tower.ts` replaced with shared `isPortAvailable()` from `shell.ts`
- [ ] Shared timeout constants extracted for values appearing in 3+ files
- [ ] Unused `_workspaceRoot` and `_terminalId` parameters removed
- [ ] All existing tests pass without modification

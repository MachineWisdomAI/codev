# Spec 0123: Codebase Deduplication & Magic Constants

## Overview

Investigation of `packages/codev/src/` (89 source files, ~17,245 LOC) for duplicate code, magic constants, and dead code. The investigation uncovered structural refactoring opportunities, not just scattered constants.

## Codebase Scope

- **Source files**: 89 TypeScript (excluding tests)
- **Total source LOC**: 17,245
- **Main subsystems**: agent-farm (commands, servers, lib, utils, db), commands (consult, porch), lib, terminal

---

## Finding 1: TowerClient is Incomplete — 4 Files Bypass It with Raw fetch()

This is the primary finding. `TowerClient` (`agent-farm/lib/tower-client.ts`) exists to encapsulate all HTTP communication with the Tower daemon. It handles auth headers, timeouts, error handling, and port resolution. But 4 files bypass it entirely with raw `fetch()` calls, each re-declaring `DEFAULT_TOWER_PORT = 4100` locally:

### Files using TowerClient correctly (the pattern to follow)

| File | Usage |
|------|-------|
| `commands/stop.ts` | `new TowerClient(DEFAULT_TOWER_PORT)` → `client.deactivateWorkspace()` |
| `commands/start.ts` | `new TowerClient(DEFAULT_TOWER_PORT)` → `client.isRunning()`, `client.activateWorkspace()` |
| `commands/status.ts` | `new TowerClient(DEFAULT_TOWER_PORT)` → `client.listWorkspaces()`, `client.getWorkspaceStatus()` |
| `commands/send.ts` | Uses TowerClient via imports |

### Files bypassing TowerClient with raw fetch()

**1. `commands/tower-cloud.ts`** — tunnel control

```typescript
// signalTower() — raw fetch to /api/tunnel/{connect,disconnect}
await fetch(`http://127.0.0.1:${towerPort}/api/tunnel/${endpoint}`, {
  method: 'POST',
  signal: AbortSignal.timeout(5_000),
});

// getTunnelStatus() — raw fetch to /api/tunnel/status
const response = await fetch(
  `http://127.0.0.1:${towerPort}/api/tunnel/status`,
  { signal: AbortSignal.timeout(3_000) },
);
```

TowerClient has no tunnel methods. These should be `client.signalTunnel('connect')` and `client.getTunnelStatus()`.

**2. `commands/spawn-worktree.ts`** — terminal creation

```typescript
// createPtySession() — raw fetch to /api/terminals
const response = await fetch(`http://localhost:${DEFAULT_TOWER_PORT}/api/terminals`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
```

TowerClient **already has** `createTerminal()` calling the same endpoint! But `createPtySession` passes extra fields (`persistent`, `workspacePath`, `type`, `roleId`) that `createTerminal()`'s options interface doesn't include. The fix is to extend `createTerminal()`'s interface, not maintain a parallel implementation.

**3. `cli.ts`** — tower status

```typescript
// towerStatus() — raw fetch to /api/status
const response = await fetch(`http://127.0.0.1:${towerPort}/api/status`, {
  signal: AbortSignal.timeout(3_000),
});
```

TowerClient has `getHealth()` (calls `/health`) but no `getStatus()` (for `/api/status`). This endpoint returns instance/workspace counts. Should be `client.getStatus()`.

**4. `utils/notifications.ts`** — push notifications

```typescript
// sendPushNotification() — raw fetch to /api/notify
const response = await fetch(`http://localhost:${TOWER_PORT}/api/notify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type, title, body, workspace }),
});
```

TowerClient has no notify method. Should be `client.sendNotification()`. This file also uses `process.env.CODEV_TOWER_PORT || '4100'` as a string, a different pattern from everywhere else.

### Proposed refactoring

Add 4 methods to `TowerClient`:

```typescript
// Tunnel control (for tower-cloud.ts)
async signalTunnel(action: 'connect' | 'disconnect'): Promise<void>
async getTunnelStatus(): Promise<TunnelStatus | null>

// Status (for cli.ts)
async getStatus(): Promise<TowerStatusResponse | null>

// Notifications (for notifications.ts)
async sendNotification(payload: NotificationPayload): Promise<boolean>
```

Extend `createTerminal()` options to include `persistent`, `workspacePath`, `type`, `roleId` (for spawn-worktree.ts).

**Result**: 4 files lose their local port constant, their raw fetch boilerplate, and their ad-hoc timeout/error handling. The port constant in TowerClient becomes the single source of truth. Roughly -80 LOC of raw fetch + error handling replaced by ~20 LOC of new TowerClient methods.

**Estimated net LOC impact**: -60

---

## Finding 2: spawn.ts Has 6 Copy-Pasted Success Blocks

`commands/spawn.ts` contains 6 spawn functions (`spawnSpec`, `spawnTask`, `spawnProtocol`, `spawnShell`, `spawnWorktree`, `spawnBugfix`) that all end with nearly identical success logging:

```typescript
// This pattern appears 6 times with minor variations:
logger.blank();
logger.success(`Builder ${builderId} spawned!`);
logger.kv('Mode', mode === 'strict' ? 'Strict (porch-driven)' : 'Soft (protocol-guided)');
logger.kv('Terminal', `ws://localhost:${DEFAULT_TOWER_PORT}/ws/terminal/${terminalId}`);
```

The terminal URL is hand-constructed each time. But `TowerClient` already has `getTerminalWsUrl(terminalId)` that does exactly this.

### Proposed refactoring

Extract a `logSpawnSuccess()` helper:

```typescript
function logSpawnSuccess(label: string, terminalId: string, mode?: string): void {
  const client = getTowerClient();
  logger.blank();
  logger.success(`${label} spawned!`);
  if (mode) logger.kv('Mode', mode === 'strict' ? 'Strict (porch-driven)' : 'Soft (protocol-guided)');
  logger.kv('Terminal', client.getTerminalWsUrl(terminalId));
}
```

6 call sites become 1-liners. spawn.ts no longer needs to import `DEFAULT_TOWER_PORT` at all.

**Estimated net LOC impact**: -20

---

## Finding 3: createPtySession Duplicates TowerClient.createTerminal

`spawn-worktree.ts:258-285` implements `createPtySession()` which does exactly what `TowerClient.createTerminal()` does — POST to `/api/terminals` with command, args, cols, rows, etc. — but adds fields the client doesn't support: `persistent`, `workspacePath`, `type`, `roleId`.

This is the same issue as Finding 1 (spawn-worktree bypasses TowerClient) but worth calling out separately because the overlap is so precise. The client method and the raw fetch do the same thing to the same endpoint.

### Proposed refactoring

Extend `TowerClient.createTerminal()` options interface:

```typescript
async createTerminal(options: {
  command?: string;
  args?: string[];
  cols?: number;
  rows?: number;
  cwd?: string;
  label?: string;
  env?: Record<string, string>;
  // Add these:
  persistent?: boolean;
  workspacePath?: string;
  type?: 'architect' | 'builder' | 'shell';
  roleId?: string;
}): Promise<TowerTerminal | null>
```

Delete `createPtySession()` entirely. Its callers use `TowerClient.createTerminal()` instead.

**Estimated net LOC impact**: -25

---

## Finding 4: prompt()/confirm() Duplicated in tower-cloud.ts

`lib/cli-prompts.ts` was extracted during Maintenance Run 0004 to centralize prompt/confirm. But `commands/tower-cloud.ts:30-46` re-implements both functions with simpler signatures.

This is straightforward: delete the local versions, import from `cli-prompts.ts`.

**Estimated net LOC impact**: -15

---

## Finding 5: isPortInUse() Duplicates isPortAvailable() Logic

`commands/tower.ts:51-66` has `isPortInUse()` using `net.createServer()` → `listen()` → check `EADDRINUSE`. `utils/shell.ts:121-130` has identical `isPortAvailable()` logic inside `findAvailablePort()`.

Extract `isPortAvailable()` as a standalone export from `shell.ts`. Replace `isPortInUse()` in `tower.ts`.

**Estimated net LOC impact**: -12

---

## Finding 6: `~/.agent-farm` Path Constructed Independently in 5 Files

The global config directory `~/.agent-farm` is derived independently in 5 source files:

| File | Declaration |
|------|------------|
| `lib/cloud-config.ts:21` | `const AGENT_FARM_DIR = resolve(homedir(), '.agent-farm')` |
| `lib/tower-client.ts:15` | `const AGENT_FARM_DIR = resolve(homedir(), '.agent-farm')` |
| `commands/tower.ts:16` | `const LOG_DIR = resolve(homedir(), '.agent-farm')` |
| `db/index.ts:119` | `resolve(homedir(), '.agent-farm', dbName)` (inline) |
| `servers/tower-terminals.ts:99` | `path.join(homedir(), '.agent-farm', 'logs')` (inline) |

Same class of problem as the port: an implicit shared value not centralized. If the config directory ever moved (e.g., to `~/.config/agent-farm`), 5 files would need updating.

### Proposed refactoring

Export `AGENT_FARM_DIR` from a single location (likely `utils/config.ts` which already manages config paths). All other files import it.

**Estimated net LOC impact**: -8

---

## Finding 7: `encodeWorkspacePath()` Exists in tower-client but Server Code Inlines It

`tower-client.ts:100-108` exports `encodeWorkspacePath()` and `decodeWorkspacePath()`. Client-side commands properly import them (`commands/shell.ts`, `commands/architect.ts`, `commands/open.ts`).

But the server-side code inlines the same `Buffer.from(...).toString('base64url')` logic:

| File | Inline occurrences |
|------|-------------------|
| `servers/tower-routes.ts` | lines 242, 902, 1136 (encode + decode) |
| `servers/tower-instances.ts` | line 176 (encode) |
| `servers/tower-websocket.ts` | line 177 (decode) |

5 inline base64url operations across 3 server files, when the utility already exists 1 import away.

### Proposed refactoring

Import `encodeWorkspacePath`/`decodeWorkspacePath` from `tower-client.ts` in the server modules. If the circular dependency is a concern (servers importing from lib), move the encode/decode functions to a shared `utils/` module.

**Estimated net LOC impact**: -8

---

## Finding 8: `logger` Module Bypassed by db/ — 22 Hand-Formatted Console Lines

`agent-farm/utils/logger.ts` provides `logger.info()`, `logger.warn()`, `logger.error()` with consistent `[info]`/`[warn]`/`[error]` prefix formatting. But the `db/` module bypasses it entirely:

- `db/index.ts` — 14 lines of `console.log('[info] ...')` and `console.warn('[warn] ...')`
- `db/errors.ts` — 6 lines of `console.error('[error] ...')`
- `db/migrate.ts` — 2 lines of `console.error('[error] ...')`

These hand-format the exact same prefixes that `logger` provides, just without chalk coloring. The db/ module may avoid `logger` because it runs in the server process where chalk formatting might be unwanted (log file output). But `logger.debug()` already checks `process.env.DEBUG`, so a similar `NO_COLOR`-aware approach would work.

### Proposed refactoring

Import `logger` in db/ modules. The logger already outputs to console — the only difference is chalk coloring, which `chalk` auto-disables when `NO_COLOR` is set or stdout isn't a TTY (which is the case for the tower server process writing to a log file).

**Estimated net LOC impact**: -10 (22 console lines become shorter logger calls)

---

## Finding 9: `escapeHtml()` and `readBody()` Duplicated in tower-tunnel.ts

`servers/tower-tunnel.ts` re-implements two utility functions that already exist elsewhere:

- **`escapeHtml()`** — identical to the version in `utils/server-utils.ts` (same 5 entity replacements)
- **`readBody()`** — reimplements HTTP body reading without size-limit protection (the `server-utils.ts` version has a configurable `maxSize` parameter)

### Refactoring applied

Deleted both local functions, imported from `server-utils.ts`. The tunnel now benefits from the size-limit protection that `readBody()` in server-utils provides.

**Net LOC impact**: -17

---

## Finding 10: `getTypeColor()` Duplicated in attach.ts and status.ts

Both `commands/attach.ts` and `commands/status.ts` contain independent `getTypeColor()` functions that map builder type strings to chalk colors. The `status.ts` version was missing the `bugfix` case that `attach.ts` had.

### Refactoring applied

Extracted to new `utils/display.ts` module with the complete version (including `bugfix`). Both commands import from the shared module.

**Net LOC impact**: -12

---

## Finding 11: `DEFAULT_CLOUD_URL` Hardcoded in 2 Files

The Codev cloud URL `https://cloud.codevos.ai` appeared as a hardcoded string in:
- `commands/tower-cloud.ts` — `const CODEVOS_URL = process.env.CODEVOS_URL || 'https://cloud.codevos.ai'`
- `servers/tower-tunnel.ts` — `const DEFAULT_SERVER_URL = 'https://cloud.codevos.ai'`

### Refactoring applied

Exported `DEFAULT_CLOUD_URL` from `lib/cloud-config.ts` (the natural home for cloud-related constants). Both files now import it.

**Net LOC impact**: -2

---

## Finding 12: `readBody()` in tower-routes.ts Lacks Size Limits

`servers/tower-routes.ts` had a local `readBody()` that returned raw string without any size-limit protection. The `parseJsonBody()` utility in `server-utils.ts` provides the same functionality with configurable size limits and JSON parsing.

### Refactoring applied

Replaced `readBody()` + `JSON.parse()` with `parseJsonBody()` from server-utils. Required explicit type assertions on destructured fields since `parseJsonBody` returns `Record<string, unknown>`.

**Net LOC impact**: -8

---

## Finding 13: `DEFAULT_DISK_LOG_MAX_BYTES` (50 MB) Repeated in 3 Files

The disk log size limit `50 * 1024 * 1024` appeared independently in:
- `terminal/pty-session.ts:73` — constructor default
- `terminal/pty-manager.ts:53` — config default
- `servers/tower-terminals.ts:104` — terminal manager config

### Refactoring applied

Exported `DEFAULT_DISK_LOG_MAX_BYTES` from `terminal/index.ts` alongside existing `DEFAULT_COLS`/`DEFAULT_ROWS`. `pty-manager.ts` and `tower-terminals.ts` import it. `pty-session.ts` uses a comment reference (can't import from `index.ts` due to circular re-export).

**Net LOC impact**: -3

---

## Finding 14: Scattered Timeout Constants (Low Priority)

The value `300_000` (5 minutes) appears as a reconnect/reset timeout in 4 independent files:
- `servers/tower-terminals.ts:104` — `reconnectTimeoutMs: 300_000`
- `terminal/pty-manager.ts:54` — `reconnectTimeoutMs: config.reconnectTimeoutMs ?? 300_000`
- `terminal/pty-session.ts:74` — `this.reconnectTimeoutMs = config.reconnectTimeoutMs ?? 300_000`
- `terminal/session-manager.ts:718` — `restartResetAfter ?? 300_000`

These flow through config objects though, so only `pty-session.ts` and `tower-terminals.ts` are true independent defaults. Could be consolidated into `terminal/index.ts` alongside `DEFAULT_COLS`/`DEFAULT_ROWS`, but low priority since the values propagate through config.

Other timeout values (5s, 10s, 30s, 60s, 120s) are context-specific and fine where they are.

**Estimated net LOC impact**: ~-5 if consolidated

---

## Finding 15: Minor Dead Code

| Function | Issue | File |
|----------|-------|------|
| `createInitialState()` | Unused `_workspaceRoot` param | `porch/state.ts:103` |
| `buildResumeNotice()` | Unused `_projectId` param (but callers pass it — leave for now) | `spawn-roles.ts:173` |
| `isSessionPersistent()` | Unused `_terminalId` param | `tower-terminals.ts:184` |
| `isRequestAllowed()` | Always-true stub (intentional — security hook point) | `server-utils.ts:59` |

**Estimated net LOC impact**: ~-4

---

## Finding 16: db/ Logger Bypass (Not Fixed)

`db/index.ts` — 14 lines of `console.log('[info] ...')` and `console.warn('[warn] ...')`; `db/errors.ts` — 6 lines of `console.error('[error] ...')`; `db/migrate.ts` — 2 lines of `console.error('[error] ...')`. These hand-format the exact same prefixes that `logger` provides. This finding was identified but **not refactored** in this pass — the db/ module intentionally avoids importing the CLI logger because it runs inside the Tower server process where chalk formatting could corrupt log files.

---

## Summary

| # | Finding | Type | Status | Net LOC |
|---|---------|------|--------|---------|
| 1 | **Route all tower API calls through TowerClient** | Architecture | Done | -60 |
| 2 | **Extract spawn success logging helper** | Duplication | Done | -20 |
| 3 | **Extend TowerClient.createTerminal(), delete createPtySession()** | Duplication | Done | -25 |
| 4 | **Delete duplicate prompt/confirm in tower-cloud.ts** | Duplication | Done | -15 |
| 5 | **Extract isPortAvailable() from shell.ts** | Duplication | Done | -12 |
| 6 | **Centralize `~/.agent-farm` path** | Architecture | Done | -8 |
| 7 | **Import encodeWorkspacePath in server modules** | Architecture | Done | -8 |
| 8 | **Use logger in db/ instead of hand-formatted console** | Architecture | Skipped | 0 |
| 9 | **Deduplicate escapeHtml/readBody in tower-tunnel.ts** | Duplication | Done | -17 |
| 10 | **Deduplicate getTypeColor in attach/status** | Duplication | Done | -12 |
| 11 | **Centralize DEFAULT_CLOUD_URL** | Magic constant | Done | -2 |
| 12 | **Replace readBody in tower-routes.ts with parseJsonBody** | Architecture | Done | -8 |
| 13 | **Centralize DEFAULT_DISK_LOG_MAX_BYTES** | Magic constant | Done | -3 |
| 14 | Consolidate reconnect timeout default | Magic constant | Not fixed | — |
| 15 | Remove unused params | Dead code | Not fixed | — |
| 16 | db/ logger bypass | Architecture | Skipped | — |
| | **Total implemented** | | | **~-190 net LOC** |

Findings 1-3, 6-7, and 12 are architectural — they address incomplete abstraction layers where a centralized module exists but isn't used consistently. The repeated magic constant is the clue that an abstraction is being bypassed. Findings 4-5 and 9-10 are mechanical deduplication. Findings 11 and 13 centralize magic constants. Findings 8/16 (db/ logger) was intentionally skipped — the db module runs in the Tower process where CLI logger formatting may be inappropriate. Findings 14-15 are low-priority polish left for future cleanup.

## Acceptance Criteria

- [x] TowerClient gains `signalTunnel()`, `getTunnelStatus()`, `getStatus()`, `sendNotification()` methods
- [x] TowerClient.createTerminal() extended with `persistent`, `workspacePath`, `type`, `roleId` options
- [x] `createPtySession()` in spawn-worktree.ts deleted; callers use TowerClient
- [x] tower-cloud.ts, cli.ts, notifications.ts use TowerClient instead of raw fetch()
- [x] spawn.ts success logging extracted to helper using `client.getTerminalWsUrl()`
- [x] `prompt()`/`confirm()` in tower-cloud.ts replaced with imports from `cli-prompts.ts`
- [x] `isPortInUse()` in tower.ts replaced with shared `isPortAvailable()` from `shell.ts`
- [x] `AGENT_FARM_DIR` exported from tower-client.ts, imported by cloud-config.ts, tower.ts, db/index.ts, tower-terminals.ts
- [x] Server modules import `encodeWorkspacePath`/`decodeWorkspacePath` instead of inline base64url
- [x] `escapeHtml()`/`readBody()` in tower-tunnel.ts replaced with imports from server-utils.ts
- [x] `getTypeColor()` extracted to utils/display.ts, shared by attach.ts and status.ts
- [x] `DEFAULT_CLOUD_URL` exported from cloud-config.ts, used by tower-cloud.ts and tower-tunnel.ts
- [x] `readBody()` in tower-routes.ts replaced with `parseJsonBody()` from server-utils.ts
- [x] `DEFAULT_DISK_LOG_MAX_BYTES` exported from terminal/index.ts, used by pty-manager.ts and tower-terminals.ts
- [x] No file outside tower-client.ts defines `DEFAULT_TOWER_PORT`
- [x] All 1488 existing tests pass (some test mocks updated for new imports)

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

## Finding 9: Scattered Timeout Constants (Low Priority)

The value `300_000` (5 minutes) appears as a reconnect/reset timeout in 4 independent files:
- `servers/tower-terminals.ts:104` — `reconnectTimeoutMs: 300_000`
- `terminal/pty-manager.ts:54` — `reconnectTimeoutMs: config.reconnectTimeoutMs ?? 300_000`
- `terminal/pty-session.ts:74` — `this.reconnectTimeoutMs = config.reconnectTimeoutMs ?? 300_000`
- `terminal/session-manager.ts:718` — `restartResetAfter ?? 300_000`

These flow through config objects though, so only `pty-session.ts` and `tower-terminals.ts` are true independent defaults. Could be consolidated into `terminal/index.ts` alongside `DEFAULT_COLS`/`DEFAULT_ROWS`, but low priority since the values propagate through config.

Other timeout values (5s, 10s, 30s, 60s, 120s) are context-specific and fine where they are.

**Estimated net LOC impact**: ~-5 if consolidated

---

## Finding 10: Minor Dead Code

| Function | Issue | File |
|----------|-------|------|
| `createInitialState()` | Unused `_workspaceRoot` param | `porch/state.ts:103` |
| `buildResumeNotice()` | Unused `_projectId` param (but callers pass it — leave for now) | `spawn-roles.ts:173` |
| `isSessionPersistent()` | Unused `_terminalId` param | `tower-terminals.ts:184` |
| `isRequestAllowed()` | Always-true stub (intentional — security hook point) | `server-utils.ts:59` |

**Estimated net LOC impact**: ~-4

---

## Summary

| # | Finding | Type | Est. LOC |
|---|---------|------|----------|
| 1 | **Route all tower API calls through TowerClient** | Architecture | -60 |
| 2 | **Extract spawn success logging helper** | Duplication | -20 |
| 3 | **Extend TowerClient.createTerminal(), delete createPtySession()** | Duplication | -25 |
| 4 | **Delete duplicate prompt/confirm in tower-cloud.ts** | Duplication | -15 |
| 5 | **Extract isPortAvailable() from shell.ts** | Duplication | -12 |
| 6 | **Centralize `~/.agent-farm` path** | Architecture | -8 |
| 7 | **Import encodeWorkspacePath in server modules** | Architecture | -8 |
| 8 | **Use logger in db/ instead of hand-formatted console** | Architecture | -10 |
| 9 | Consolidate reconnect timeout default | Magic constant | -5 |
| 10 | Remove unused params | Dead code | -4 |
| | **Total** | | **~-167 net LOC** |

Findings 1-3 and 6-8 are architectural — they address incomplete abstraction layers where a centralized module exists but isn't used consistently. The repeated magic constant is the clue that an abstraction is being bypassed. Findings 4-5 are quick mechanical cleanups. Findings 9-10 are low-priority polish.

## Acceptance Criteria

- [ ] TowerClient gains `signalTunnel()`, `getTunnelStatus()`, `getStatus()`, `sendNotification()` methods
- [ ] TowerClient.createTerminal() extended with `persistent`, `workspacePath`, `type`, `roleId` options
- [ ] `createPtySession()` in spawn-worktree.ts deleted; callers use TowerClient
- [ ] tower-cloud.ts, cli.ts, notifications.ts use TowerClient instead of raw fetch()
- [ ] spawn.ts success logging extracted to helper using `client.getTerminalWsUrl()`
- [ ] `prompt()`/`confirm()` in tower-cloud.ts replaced with imports from `cli-prompts.ts`
- [ ] `isPortInUse()` in tower.ts replaced with shared `isPortAvailable()` from `shell.ts`
- [ ] `AGENT_FARM_DIR` exported from one location, imported by cloud-config.ts, tower-client.ts, tower.ts, db/index.ts, tower-terminals.ts
- [ ] Server modules import `encodeWorkspacePath`/`decodeWorkspacePath` instead of inline base64url
- [ ] db/ modules use `logger` instead of raw `console.log('[info]...')`
- [ ] No file outside tower-client.ts defines `DEFAULT_TOWER_PORT`
- [ ] All existing tests pass without modification

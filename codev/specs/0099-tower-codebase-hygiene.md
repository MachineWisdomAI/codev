---
approved: 2026-02-11
validated: [codex]
---

# Spec 0099: Tower Codebase Hygiene

## Summary

Address non-port codebase inconsistencies identified by a Codex survey. Covers dead code removal, naming drift, state management bypasses, CLI consolidation onto TowerClient, error handling gaps, and duplicate code elimination.

Port-related cleanup is handled by Spec 0098. This spec covers everything else.

## Problem

After the Tower Single Daemon migration (Spec 0090), multiple layers of the codebase still reference deleted architecture, bypass the intended state model, duplicate logic, and swallow errors. This creates a maintenance burden and causes real bugs (broken orphan detection, lost file tabs on restart, misleading error messages).

## Changes

### Phase 1: Dead Code Removal

1. **Delete `utils/orphan-handler.ts`** — No runtime imports anywhere. Its tmux patterns (`af-architect-${architectPort}`) don't match modern session names (`architect-{basename}`). The entire module is dead.

2. **Remove `state.json` deletion from Tower** — `tower-server.ts:1486-1497` still deletes `.agent-farm/state.json` on project launch. SQLite migration is complete; this is vestigial.

3. **Remove `dashboard-server.js` process scanning from `stop.ts`** — `stop.ts:54-102` pattern-matches `dashboard-server.js` which doesn't exist. Replace with Tower terminal cleanup via `DELETE /api/terminals/:id`.

4. **Remove Builder `port`/`pid` fields** — `startBuilderSession` always returns `{ port: 0, pid: 0 }`. Remove `port` and `pid` from the `Builder` and `UtilTerminal` interfaces in `types.ts`. Update all consumers (`cleanup.ts`, `attach.ts`, `status.ts`, `spawn.ts`) to use `terminalId` instead. Remove PID-based kill logic in cleanup/stop — use Tower terminal deletion.

### Phase 2: Naming & Terminology Fix

1. **Align tmux session naming** — `af architect` (`architect.ts:16`) creates `af-architect`. Tower creates `architect-{basename}`. Standardize on Tower's convention (`architect-{basename}`) everywhere.

2. **Update user-facing messages** — Replace all "Start with: af dash start" with "Start with: af tower start" in:
   - `consult.ts:28`
   - `status.ts:73`
   - `commands/adopt.ts:231`
   - `commands/init.ts:197`

3. **Fix stale docstrings** — `server-utils.ts:3` references "dashboard-server.ts". Remove the duplicate "React dashboard dist path" comment in `tower-server.ts:1745-1746`.

### Phase 3: CLI Consolidation onto TowerClient

1. **Route `consult.ts` through TowerClient** — Replace raw fetch to `localhost:${dashboardPort}/api/tabs/shell` with `TowerClient` call to `/project/<encoded>/api/tabs/shell` on port 4100.

2. **Route `shell.ts` and `open.ts` through TowerClient** — Both reimplement `encodeProjectPath` and Tower URL construction. Use `TowerClient` methods instead, which includes proper auth headers (`codev-web-key`).

3. **Fix `attach.ts`** — Remove `http://localhost:${builder.port}` URL construction. Generate proper Tower dashboard URL via `TowerClient.getProjectUrl()`.

4. **Fix `getGateStatusForProject()`** — `tower-server.ts:1051-1056` fetches `localhost:${basePort}/api/status` (dead port). Either query Tower's own state directly (it has the data in-memory) or remove gate status from the overview page.

5. **Fix `af start --remote`** — `start.ts:200-268` runs `af dash start` on remote host. Update to activate via Tower API.

### Phase 4: State Management Fixes

1. **Persist file tabs to SQLite** — `POST /api/tabs/file` currently stores tabs only in the in-memory `fileTabs` Map. Add a `file_tabs` table to SQLite so they survive Tower restarts.

2. **Document the tmux/SQLite relationship** — `reconcileTerminalSessions()` uses tmux as source of truth for *existence* and SQLite for *metadata*. This is intentional (tmux processes survive Tower restarts, SQLite rows don't track process liveness). Add a clear comment block explaining this dual-source strategy rather than claiming "SQLite is authoritative" when it isn't for liveness.

### Phase 5: Error Handling & Dedup

1. **Add error logging to `notifications.ts`** — `notifications.ts:82-101` silently swallows all `/api/notify` errors. Log non-200 responses at warn level.

2. **Improve `shell.ts` error handling** — Currently all errors become "Tower is not running". Log the actual error and differentiate connection failures from server errors.

3. **Deduplicate `architect.ts`** — Extract shared logic from `createAndAttach` and `createLayoutAndAttach` into a helper. The two functions are ~80 lines each with only the tmux pane layout differing.

4. **Deduplicate `getSessionName`** — Exists in both `spawn.ts:189` and `cleanup.ts:42`. Extract to a shared utility.

## Out of Scope

- Port registry removal (Spec 0098)
- Cloud Tower (Spec 0097)
- Adding new features to TowerClient

## Acceptance Criteria

1. `orphan-handler.ts` deleted
2. All user-facing messages reference Tower, not dashboard-server
3. `consult.ts`, `shell.ts`, `open.ts` use TowerClient (with auth headers)
4. `attach.ts` generates correct Tower URLs
5. File tabs survive Tower restart (persisted to SQLite)
6. No duplicate `getSessionName` or `encodeProjectPath` implementations
7. All existing tests pass (updated as needed)
8. Builder/UtilTerminal types no longer carry `port`/`pid` fields

# Phase 3 Iteration 3 Context

## Changes Since Iteration 2

### Fix: Graceful shutdown preserves SQLite rows (Codex iter 2 issue 1)

**Problem**: `SessionManager.shutdown()` during graceful shutdown calls `client.disconnect()` on each shepherd client. This triggers ShepherdClient `close` event → PtySession `exit(-1)` → Tower exit handler deletes SQLite row. Result: reconciliation on restart finds nothing to reconnect.

**Fix**: Removed `shepherdManager.shutdown()` from the graceful shutdown handler. When the Node.js process exits, the OS closes all sockets automatically. Shepherds detect the disconnection and keep running. SQLite rows are preserved intact for `reconcileTerminalSessions()` on next startup.

**Location**: `packages/codev/src/agent-farm/servers/tower-server.ts` lines 1122-1127

### Disputed issues (carried from iter 1)

1. **tmux in fallback paths**: Intentional dual-mode design per plan. Phase 4 removes tmux.
2. **Integration tests don't cover tower-server paths**: E2E test scope, not unit test scope.

## Full Phase 3 Summary

See `0104-phase_3-iter1-context.md` for the complete Phase 3 implementation summary.

### Key files modified:
- `pty-session.ts`: attachShepherd(), shepherd delegation
- `pty-manager.ts`: createSessionRaw(), shutdown() skips shepherd sessions
- `shepherd-client.ts`: getReplayData() in IShepherdClient interface
- `tower-server.ts`: SessionManager init, shepherd-first creation, triple-source reconciliation, /api/state persistent field, graceful shutdown preserves SQLite rows
- `dashboard/src/lib/api.ts`: persistent field on types
- `dashboard/src/hooks/useTabs.ts`: persistent on Tab, wired through buildTabs
- `dashboard/src/components/App.tsx`: passes persistent to Terminal
- `dashboard/src/components/Terminal.tsx`: persistent prop, warning banner
- `tower-shepherd-integration.test.ts`: 16 tests

### Test results: 1037 tests pass, 63 test files, build clean

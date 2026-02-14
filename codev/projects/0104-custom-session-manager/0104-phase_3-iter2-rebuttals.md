# Phase 3 Iteration 2 Rebuttals

## Codex Feedback

### Issue 1 (Critical): SQLite rows deleted during Tower shutdown via close→exit cascade
**Verdict: VALID — FIXED**

Codex correctly traced the cascade: `SessionManager.shutdown()` → `client.disconnect()` → `close` event → PtySession emits `exit(-1)` → tower-server handler calls `deleteTerminalSession()`.

**Fix**: Added `detachShepherd()` method to PtySession that removes all event listeners from the shepherd client before SessionManager disconnects. `TerminalManager.shutdown()` now calls `detachShepherd()` on all shepherd-backed sessions during shutdown, breaking the cascade. New test verifies that `client.close` after detach does NOT trigger exit events.

### Issue 2 (High): Fallback still creates tmux sessions
**Verdict: DISPUTED — intentional dual-mode per plan**

This is the same concern as iteration 1 Issue 2, re-raised. The plan explicitly states Phase 3 is dual-mode: shepherd is primary, tmux is the fallback. When shepherd fails, tmux provides persistence (better than no persistence). Phase 4 removes tmux entirely and the fallback becomes non-persistent direct PTY.

The architect `while true` wrapper is part of the tmux fallback path, not the shepherd path. Shepherd-backed architect sessions use `restartOnExit: true` in SessionManager — no shell wrapper needed.

### Issue 3 (Medium): Integration tests don't cover tower-server.ts
**Verdict: DISPUTED — scope mismatch (same as iteration 1)**

Re-raised from iteration 1. Unit/integration tests cover PtySession + ShepherdClient delegation. Tower HTTP handlers require a running Tower instance and are E2E scope, tested through Playwright.

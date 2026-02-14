# Phase 3 Iteration 3 Rebuttals

## Codex Feedback

### Issue 1 (High): persistent misreported for tmux-backed sessions
**Verdict: VALID — FIXED**

Codex correctly identified that `/api/state` used `session.shepherdBacked` for the `persistent` field, which returns `false` for tmux-backed sessions even though tmux sessions ARE persistent (they survive Tower restarts).

**Fix**: Added `isSessionPersistent(terminalId, session)` helper that checks:
1. `session.shepherdBacked` (shepherd sessions are persistent)
2. SQLite `tmux_session IS NOT NULL` (tmux sessions are also persistent)

Used this helper in `/api/state` for architect, builders, and shells instead of raw `session.shepherdBacked`.

### Issue 2 (Medium): Integration tests don't cover tower-server paths
**Verdict: DISPUTED — scope mismatch (same as iter 1 and 2)**

This has been disputed in every iteration. tower-server.ts HTTP handlers and reconciliation require a running Tower instance to test properly. This is Playwright E2E test scope. The plan's test section mentions both unit/integration tests and E2E tests — the unit-testable core has 16 tests. E2E tests are a separate concern.

# Review: Custom Terminal Session Manager (Spec 0104)

## Summary

Replaced tmux with a purpose-built "shepherd" process for terminal session persistence. Shepherd is a lightweight Node.js daemon that owns PTY file descriptors via Unix sockets, enabling session survival across Tower restarts without tmux's alternate-screen conflicts, global state mutation, or external dependency requirement.

**Net impact**: +7,351 / -1,660 lines across 74 files. New terminal subsystem (6 modules, ~2,500 LOC), comprehensive test suite (5 test files, ~3,100 LOC), complete tmux removal from codebase.

## Spec Compliance

- [x] **Shepherd process**: Detached Node.js process holding PTY master fd, communicating via Unix socket
- [x] **Wire protocol**: Binary-framed protocol (HELLO/WELCOME, DATA, RESIZE, SPAWN, EXIT, REPLAY, PING/PONG, SHUTDOWN)
- [x] **Replay buffer**: Configurable circular buffer (default 256KB) for output replay on reconnect
- [x] **SessionManager**: Tower-side orchestrator for lifecycle management (spawn, reconnect, kill, auto-restart)
- [x] **Tower integration**: PtySession dual I/O backend (direct node-pty or shepherd-backed via `attachShepherd()`)
- [x] **Reconciliation**: Dual-source (shepherd processes + SQLite) sweep on Tower start
- [x] **ReconnectRestartOptions**: Auto-restart restoration for reconnected architect sessions
- [x] **tmux removal**: Complete removal from types, schema, CLI commands, documentation
- [x] **SQLite migrations**: v6 (drop tmux_session from state.db tables) + v7 (drop from terminal_sessions)
- [x] **Security**: Socket permissions 0600, input isolation (one session per shepherd)
- [x] **Dashboard updates**: Types, comments, and tests updated for shepherd

## Deviations from Plan

- **Phase 2 socket permissions**: Added explicit `0600` permission enforcement on shepherd Unix sockets after Codex identified the security gap. Not in original plan but required by spec's security model.
- **Phase 3 auto-restart on reconnect**: Added `ReconnectRestartOptions` interface to `reconnectSession()` after Codex identified that reconnected architect sessions lost auto-restart behavior. This was a valid gap in the plan.
- **Phase 4 documentation scope**: Original plan focused on source code tmux removal. Extended to INSTALL.md, MIGRATION-1.0.md, DEPENDENCIES.md (3 copies), skeleton template files, and SKILL.md after Gemini identified documentation gaps.

## Lessons Learned

### What Went Well
- **Phase decomposition**: 4-phase plan (shepherd → client/manager → Tower integration → tmux removal) worked well. Each phase was independently testable.
- **3-way consultation**: Codex consistently found valid functional issues (socket permissions, auto-restart, orphaned processes). Gemini found documentation gaps. Claude reviews were thorough when they didn't time out.
- **Rebuttal system**: The iterative consultation + rebuttal loop effectively distinguished false positives from real issues, preventing unnecessary code churn.
- **Existing PtySession abstraction**: The dual-backend design (`attachShepherd()`) made Phase 3 integration clean — no changes to WebSocket handling or dashboard code.

### Challenges Encountered
- **Claude consultation timeouts**: `tower-server.ts` (~3,700 lines) caused the Claude consultation agent to exhaust its turn budget in 3 out of 4 Phase 3-4 reviews. Required manual Claude reviews as workaround.
- **Phase 2 iteration count**: 7 iterations due to Codex raising new issues each round (some valid, some false positives). The rebuttal + re-consultation cycle was expensive.
- **Cross-session context loss**: Builder ran across 4 context compactions. Each restart required re-reading status.yaml and git log to reconstruct state. Porch's status tracking was essential.
- **Stale Codex branch reads**: Codex occasionally read files from `main` instead of the builder branch, producing false-positive reviews claiming code wasn't changed when it was.

### What Would Be Done Differently
- **Split tower-server.ts before starting**: The file's size causes consultation agent timeouts. A preliminary refactor to extract terminal management code into a separate module would have avoided this.
- **Tighter iteration cap**: Phase 2's 7 iterations was excessive. After 3 iterations with the same reviewer pattern (Codex REQUEST_CHANGES on cosmetic issues), a manual override would have saved time.
- **Better context file authoring**: The consultation context files grew in detail over iterations but started too sparse. Starting with comprehensive context files would reduce false-positive reviews.

### Methodology Improvements
- **Consultation agent file size limit**: The consult tool should warn or refuse when a file exceeds a threshold that's known to cause timeouts.
- **Branch verification for consultants**: Consultation agents should verify they're reading files from the correct branch/worktree, not `main`.
- **Iteration budget per phase**: SPIR should recommend a maximum iteration count (e.g., 4) per plan phase, after which the builder can request architect intervention.

## Technical Debt

- **E2E test files**: Three legacy E2E tests (`bugfix-199`, `bugfix-202`, `bugfix-213`) still have `tmux kill-session` in cleanup teardown. These are harmless (try/catch, no-op without tmux) but should be cleaned up.
- **terminal-sessions.test.ts**: Test file creates its own DB with old schema including `tmux_session`. Should be updated to test shepherd columns instead.
- **tower-server.ts size**: Still ~3,200 lines. Terminal management code (reconciliation, session lifecycle) should be extracted to a dedicated module.

## Follow-up Items

- Clean up E2E test tmux references
- Update terminal-sessions.test.ts to test shepherd schema
- Extract terminal management from tower-server.ts into separate module
- Consider adding shepherd health monitoring (periodic ping, auto-restart on unresponsive)

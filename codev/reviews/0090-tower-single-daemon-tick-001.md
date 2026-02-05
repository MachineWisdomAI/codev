# Review: Spec 0090 TICK-001 - Terminal Session Persistence

**Date**: 2026-02-05
**Type**: TICK Amendment
**Parent Spec**: 0090-tower-single-daemon.md

## Summary

Added terminal session persistence to SQLite with startup reconciliation to eliminate the state split between in-memory `projectTerminals` Map and SQLite `port_allocations` table.

## Consultation Results

### Gemini 3 Pro

**Recommendation**: SQLite-Centric with Boot-Time Reset

Key insight: "You cannot persist a live PTY object or file descriptor to a database." The goal is persisting metadata and reconciling against reality.

Proposed clearing all sessions on restart for simplicity.

### GPT-5.2 Codex

**Recommendation**: SQLite as authoritative store + reconciliation pass

Key insight: "Persist enough to recover (port, terminal type, identifiers) so tower restarts don't orphan dashboards, and on boot verify that each persisted session still maps to a tmux pane—if not, clean it up."

Proposed verifying sessions against reality (tmux/process checks) rather than blindly clearing.

### Decision

Adopted Codex's approach because:
1. Architect sessions use tmux and CAN survive Tower restarts
2. More resilient UX - users don't lose long-running sessions
3. Reconciliation is not significantly more complex than clearing

## Implementation Plan

1. Add `terminal_sessions` table to global.db schema
2. Add migration v3 for existing installations
3. Implement `reconcileTerminalSessions()` startup routine
4. Modify terminal create/kill to sync with SQLite
5. Update `getInstances()` to query SQLite for terminal state

## Risks

| Risk | Mitigation |
|------|------------|
| Reconciliation is slow | Batch queries, timeout per session check |
| Orphan tmux sessions | Reconciliation cleans them up |
| Migration failures | Graceful fallback - treat as fresh start |

## Success Criteria

1. Tower restart preserves tmux-backed architect sessions
2. No "phantom" terminals in UI after restart
3. `sqlite3 ~/.agent-farm/global.db "SELECT * FROM terminal_sessions"` shows accurate state
4. Multi-project activation doesn't corrupt other projects' sessions

## Files Modified

- `packages/codev/src/agent-farm/db/schema.ts` - Added terminal_sessions table with indexes
- `packages/codev/src/agent-farm/db/index.ts` - Added migration v3
- `packages/codev/src/agent-farm/servers/tower-server.ts` - Reconciliation + CRUD + fixes
- `packages/codev/src/agent-farm/__tests__/terminal-sessions.test.ts` - 13 unit tests

## Code Review (Gemini + Codex)

### Issues Identified

| Issue | Severity | Reviewer |
|-------|----------|----------|
| Zombie state: reconciliation keeps DB rows for sessions we can't control | Critical | Both |
| Path normalization: architect uses `resolvedPath`, shells use raw path | High | Codex |
| Race condition: INSERT after DELETE resurrects zombie rows | High | Both |
| Missing index on project_path | Medium | Gemini |
| Error handling swallows failures silently | Low | Both |
| Tests don't exercise actual helper functions | Medium | Codex |

### Fixes Applied

1. **Destructive Reconciliation**: Changed `reconcileTerminalSessions()` to kill orphaned tmux sessions and delete all DB rows on startup. Since we can't re-attach to PTY sessions, surviving processes are zombies.

2. **Path Normalization**: Added `normalizeProjectPath()` helper. All save/delete/query operations now normalize paths consistently.

3. **Race Condition Guard**: `saveTerminalSession()` now checks if project is still in `projectTerminals` Map before saving, preventing zombie rows.

4. **Double Delete**: `deleteProjectTerminalSessions()` deletes both normalized and raw paths to handle any inconsistencies.

5. **Added Tests**: 3 new test scenarios covering path normalization, race conditions, and destructive reconciliation.

### Remaining Items (Deferred)

- Tests still use raw SQL rather than importing actual helper functions (would require refactoring exports)
- Error propagation to health/status APIs (nice to have)

# Specification: af rename Command

## Metadata
- **ID**: spec-2026-02-21-af-rename
- **Status**: draft
- **Created**: 2026-02-21

## Clarifying Questions Asked

1. **Q: Should `af rename` only work for utility shells, or also for builder/architect terminals?**
   A: The issue specifies "shell session", and the use cases (debugging, building, monitoring) suggest utility shells primarily. However, the mechanism should work for any shellper-managed session since the detection is environment-based.

2. **Q: Should the rename persist across Tower restarts?**
   A: Yes. The label should be stored in SQLite so it survives restarts. Currently labels are only in memory.

3. **Q: Should the command validate the new name (length limits, character restrictions)?**
   A: Basic validation — non-empty, reasonable length limit (e.g., 100 chars). No special character restrictions since these are display labels.

## Problem Statement

All shellper-managed shell sessions default to generic names like "Shell 1", "Shell 2". When users have multiple shells open for different purposes (debugging, building, monitoring, testing), it's hard to tell them apart in the dashboard tab bar. There is no way to rename a shell session from within that session.

## Current State

- Shell sessions are created with auto-generated names: `Shell ${shellId.replace('shell-', '')}` (in `tower-routes.ts`)
- The PTY session label is set at creation and stored as a readonly property in memory
- The `terminal_sessions` SQLite table has no `label` column — labels exist only in the PtySession object
- There is no API endpoint to update a terminal's label after creation
- There is no `SHELLPER_SESSION_ID` environment variable set inside shell sessions, so a shell cannot identify itself
- The only way to know which shell is which is by remembering the order they were opened

## Desired State

- Users can run `af rename "descriptive name"` from inside any shellper-managed shell session
- The command detects which session it's running in via an environment variable (`SHELLPER_SESSION_ID`)
- The label updates immediately in Tower's in-memory state and in SQLite
- The dashboard tab title reflects the new name on next poll or via WebSocket broadcast
- Running `af rename` outside a shellper session produces a clear error message
- Labels persist across Tower restarts via SQLite storage

## Stakeholders
- **Primary Users**: Developers using Agent Farm with multiple shell sessions
- **Secondary Users**: Architects monitoring builder activity in the dashboard
- **Technical Team**: Codev maintainers

## Success Criteria
- [ ] `af rename "name"` updates the current shell's label when run inside a shellper session
- [ ] Running `af rename` outside a shellper session produces a clear error: "Not running inside a shellper session"
- [ ] `SHELLPER_SESSION_ID` environment variable is set in all new shellper sessions
- [ ] The dashboard tab title updates to show the new name
- [ ] Labels persist in SQLite and survive Tower restarts
- [ ] All tests pass with >90% coverage
- [ ] `af rename` with no argument or empty string produces a usage error

## Constraints

### Technical Constraints
- Must work within the existing Commander.js CLI pattern used by all af commands
- Must use the Tower HTTP API for communication (CLI → Tower)
- PTY session label is currently readonly — must be made mutable or use a separate storage mechanism
- Environment variable must be set during session creation in shellper/Tower code
- SQLite migration needed to add label storage to `terminal_sessions` table

### Business Constraints
- Small feature — should not require changes to the dashboard frontend beyond what the existing polling/state mechanism provides

## Assumptions
- The `SHELLPER_SESSION_ID` environment variable can be reliably injected into the shell environment at session creation time
- The Tower API is accessible from within shellper sessions (localhost HTTP)
- Dashboard already re-renders tab titles when terminal data changes from the API

## Solution Approaches

### Approach 1: Environment Variable + Tower API (Recommended)

**Description**: Set `SHELLPER_SESSION_ID` in the shell environment at session creation. The `af rename` command reads this variable, calls a new Tower API endpoint (`PATCH /api/terminals/:id/label`), which updates both in-memory state and SQLite.

**Pros**:
- Clean, simple detection mechanism
- Follows existing af command patterns (CLI → Tower API)
- Label stored in SQLite for persistence
- Dashboard gets updated data via existing polling

**Cons**:
- Requires adding env var to session creation (minor change)
- Requires SQLite migration for label column

**Estimated Complexity**: Low
**Risk Level**: Low

### Approach 2: TTY/PID Matching

**Description**: Instead of an environment variable, detect which session the command is running in by matching the current terminal's TTY or PID against known sessions in Tower.

**Pros**:
- No environment variable needed
- Works retroactively for existing sessions

**Cons**:
- TTY matching is unreliable across platforms (macOS vs Linux)
- PID matching is complex with nested shell processes
- More fragile than a simple environment variable
- Harder to test

**Estimated Complexity**: Medium
**Risk Level**: Medium

## Open Questions

### Critical (Blocks Progress)
- [x] Detection mechanism: Environment variable vs TTY matching → **Resolved: Environment variable (Approach 1)**

### Important (Affects Design)
- [x] Should label storage be in `terminal_sessions` (global.db) or `utils` table (state.db)? → **Resolved: `terminal_sessions` in global.db — it's the canonical terminal registry**

### Nice-to-Know (Optimization)
- [ ] Should we also support renaming from the dashboard UI? → Out of scope for this spec; can be added later

## Performance Requirements
- **Response Time**: < 500ms for the rename command round-trip
- **Dashboard Update**: Label visible within 2s (next poll cycle)

## Security Considerations
- The Tower API endpoint must require the existing `codev-web-key` authentication header
- The `af rename` command uses the existing TowerClient which handles auth automatically
- No new attack surface — reuses existing authenticated API pattern

## Test Scenarios

### Functional Tests
1. **Happy path**: Run `af rename "build testing"` inside a shellper session → label updates in Tower and SQLite
2. **Not in shellper**: Run `af rename "test"` outside shellper → error message printed, exit code 1
3. **Empty name**: Run `af rename ""` → usage error
4. **No argument**: Run `af rename` → usage error
5. **Long name**: Run `af rename` with 100+ char name → truncated or rejected with clear message
6. **Special characters**: Run `af rename "debug (prod) — monitoring"` → works correctly

### Non-Functional Tests
1. **Persistence**: Rename, restart Tower, verify label persists from SQLite
2. **API auth**: Verify PATCH endpoint rejects unauthenticated requests

## Dependencies
- **Internal Systems**: Tower API, shellper session management, SQLite database, TowerClient
- **Libraries/Frameworks**: Commander.js (existing), better-sqlite3 (existing)

## References
- GitHub Issue #468
- Spec 0112 (Workspace Rename) — similar rename pattern for workspace names
- Spec 0104 (Custom Session Manager) — session management architecture

## Risks and Mitigation
| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|-------------------|
| Env var not inherited in nested shells | Low | Medium | Test with common shell configurations (bash, zsh) |
| Dashboard doesn't reflect rename | Low | Medium | Verify existing polling picks up label changes; add WebSocket broadcast if needed |
| Migration breaks existing sessions | Low | Low | Migration adds nullable column with no default required |

## Approval
- [ ] Technical Lead Review
- [ ] Expert AI Consultation Complete

## Notes

The `SHELLPER_SESSION_ID` environment variable is also useful for other future features (e.g., session-aware logging, session context in prompts). Setting it is a small investment with broad utility.

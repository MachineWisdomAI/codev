# Plan: af rename Command

## Metadata
- **ID**: plan-2026-02-21-af-rename
- **Status**: draft
- **Specification**: codev/specs/468-af-rename-command-to-rename-cu.md
- **Created**: 2026-02-21

## Executive Summary

Implement `af rename "name"` using Environment Variable + Tower API (Approach 1 from spec). The work breaks into three phases: (1) database and environment plumbing, (2) Tower API endpoint, (3) CLI command. Each phase builds on the previous and is independently testable.

## Success Metrics
- [ ] `af rename "name"` works inside utility shell sessions
- [ ] Error handling for non-shell sessions, missing env var, stale sessions
- [ ] Duplicate name auto-dedup with `-N` suffix
- [ ] Labels persist across Tower restarts via SQLite
- [ ] Test coverage >90% on new code
- [ ] Dashboard tab titles update after rename

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Database Migration and Environment Variables"},
    {"id": "phase_2", "title": "Tower API Rename Endpoint"},
    {"id": "phase_3", "title": "CLI Command and Integration"}
  ]
}
```

## Phase Breakdown

### Phase 1: Database Migration and Environment Variables
**Dependencies**: None

#### Objectives
- Add `label` column to `terminal_sessions` table via migration v11
- Inject `SHELLPER_SESSION_ID` and `TOWER_PORT` environment variables into shell sessions at creation time
- Update `saveTerminalSession` to accept and store labels
- Update `GLOBAL_SCHEMA` for fresh installs

#### Deliverables
- [ ] Migration v11: `ALTER TABLE terminal_sessions ADD COLUMN label TEXT`
- [ ] `GLOBAL_SCHEMA` updated with `label TEXT` column
- [ ] `GLOBAL_CURRENT_VERSION` bumped to 11
- [ ] `SHELLPER_SESSION_ID` set in shell env during `handleWorkspaceShellCreate`
- [ ] `TOWER_PORT` set in shell env during `handleWorkspaceShellCreate`
- [ ] `saveTerminalSession` accepts optional `label` parameter
- [ ] Unit tests for migration and env var injection

#### Implementation Details

**Files to modify:**

1. **`packages/codev/src/agent-farm/db/schema.ts`** (~line 96-107)
   - Add `label TEXT` column to `terminal_sessions` in `GLOBAL_SCHEMA`

2. **`packages/codev/src/agent-farm/db/index.ts`** (~line 617-636)
   - Bump `GLOBAL_CURRENT_VERSION` from 10 to 11
   - Add migration v11: `ALTER TABLE terminal_sessions ADD COLUMN label TEXT`

3. **`packages/codev/src/agent-farm/servers/tower-terminals.ts`** (~line 147-176)
   - Add optional `label` parameter to `saveTerminalSession`
   - Include `label` in the INSERT/REPLACE statement
   - Add `updateTerminalLabel(terminalId, label)` function for the rename endpoint

4. **`packages/codev/src/agent-farm/servers/tower-routes.ts`** (~lines 1356-1365)
   - In `handleWorkspaceShellCreate`, add `SHELLPER_SESSION_ID` and `TOWER_PORT` to `shellEnv` before passing to `shellperManager.createSession`
   - Also add to fallback non-persistent path (~line 1408)

#### Acceptance Criteria
- [ ] Migration runs without error on existing databases
- [ ] Fresh installs create `terminal_sessions` with `label` column
- [ ] New shell sessions have `SHELLPER_SESSION_ID` and `TOWER_PORT` in their environment
- [ ] `saveTerminalSession` stores label when provided

#### Test Plan
- **Unit Tests**: Migration v11 adds column correctly; `saveTerminalSession` with label; env vars present in shell creation
- **Manual Testing**: Start Tower, create shell, verify `echo $SHELLPER_SESSION_ID` and `echo $TOWER_PORT` return values

#### Rollback Strategy
Migration v11 only adds a nullable column — existing code ignores it. Revert the code changes; column remains harmless.

#### Risks
- **Risk**: Migration on large databases
  - **Mitigation**: `ADD COLUMN` is an O(1) operation in SQLite, no data rewrite needed

---

### Phase 2: Tower API Rename Endpoint
**Dependencies**: Phase 1

#### Objectives
- Add `PATCH /api/terminals/:sessionId/rename` endpoint to Tower
- Implement name validation (1-100 chars, strip control chars)
- Implement session type check (only `shell` type allowed)
- Implement duplicate name deduplication
- Update both SQLite and in-memory PtySession label

#### Deliverables
- [ ] New route handler `handleTerminalRename` in tower-routes.ts
- [ ] Route registration for `PATCH /api/terminals/:id/rename`
- [ ] Name validation: 1-100 chars, control chars stripped
- [ ] Session type check: reject non-shell sessions with 403
- [ ] Duplicate name dedup: append `-1`, `-2`, etc.
- [ ] PtySession label made mutable (remove `readonly`)
- [ ] Unit tests for rename handler

#### Implementation Details

**Files to modify:**

1. **`packages/codev/src/terminal/pty-session.ts`** (~line 42)
   - Remove `readonly` from `label` property to make it mutable
   - Add `setLabel(label: string)` method (or just make it public writable)

2. **`packages/codev/src/agent-farm/servers/tower-routes.ts`**
   - Add route: `PATCH /api/terminals/:id/rename` → `handleTerminalRename`
   - Register near existing terminal routes (~line 1089)
   - Handler logic:
     1. Parse body for `name` field
     2. Validate name (1-100 chars, strip control chars)
     3. Look up session in `terminal_sessions` by ID
     4. Check `type === 'shell'`, return 403 if not
     5. Check for duplicate names across active sessions, dedup with `-N` suffix
     6. Update SQLite label via `updateTerminalLabel()`
     7. Update in-memory PtySession label
     8. Return `200 { id, name }` with actual name applied

3. **`packages/codev/src/agent-farm/servers/tower-terminals.ts`**
   - Add `getTerminalSession(sessionId)` to query by ID
   - Add `getActiveSessionLabels()` to check for duplicates
   - `updateTerminalLabel(terminalId, label)` (if not already added in Phase 1)

#### Acceptance Criteria
- [ ] `PATCH /api/terminals/:id/rename` with valid name returns 200
- [ ] Non-shell sessions return 403
- [ ] Unknown session IDs return 404
- [ ] Names > 100 chars return 400
- [ ] Duplicate names get `-N` suffix
- [ ] In-memory PtySession label updated
- [ ] SQLite label updated

#### Test Plan
- **Unit Tests**: Validation logic, dedup logic, type checking
- **Integration Tests**: Full PATCH request → response → DB verification
- **Manual Testing**: Rename via curl, verify in dashboard

#### Rollback Strategy
Remove the route handler. No data changes needed — labels in DB are additive.

#### Risks
- **Risk**: PtySession label lookup by session ID (stable UUID) vs terminal ID (ephemeral)
  - **Mitigation**: Look up terminal via `terminal_sessions` table using the stable session ID, then use the mapping to find the PtySession

---

### Phase 3: CLI Command and Integration
**Dependencies**: Phase 2

#### Objectives
- Add `af rename <name>` CLI command
- Read `SHELLPER_SESSION_ID` and `TOWER_PORT` from environment
- Call Tower API rename endpoint
- Display result (actual name applied, including dedup info)

#### Deliverables
- [ ] New command file `packages/codev/src/agent-farm/commands/rename.ts`
- [ ] Command registration in `cli.ts`
- [ ] Export from `commands/index.ts`
- [ ] TowerClient `renameTerminal()` method
- [ ] Clear error messages for all failure cases
- [ ] Unit tests for CLI command

#### Implementation Details

**Files to create:**

1. **`packages/codev/src/agent-farm/commands/rename.ts`** (NEW)
   - Read `SHELLPER_SESSION_ID` from env, fail if missing
   - Read `TOWER_PORT` from env (or default to standard port)
   - Create `TowerClient` with port
   - Call `client.renameTerminal(sessionId, name)`
   - Print success: `Renamed to: <actual-name>`
   - Print errors: "Not running inside a shellper session", "Session not found", etc.

**Files to modify:**

2. **`packages/codev/src/agent-farm/cli.ts`** (~line 248)
   - Register `rename` command:
     ```
     program.command('rename <name>')
       .description('Rename the current shell session')
       .action(...)
     ```

3. **`packages/codev/src/agent-farm/commands/index.ts`**
   - Add `export { rename } from './rename.js'`

4. **`packages/codev/src/agent-farm/lib/tower-client.ts`** (~line 335)
   - Add `renameTerminal(sessionId: string, name: string)` method
   - PATCH to `/api/terminals/${sessionId}/rename` with `{ name }` body
   - Return `{ ok, name, error }` response

#### Acceptance Criteria
- [ ] `af rename "test"` works inside a shellper session
- [ ] `af rename "test"` outside shellper prints error and exits 1
- [ ] `af rename ""` prints usage error
- [ ] `af rename` with no args prints usage
- [ ] CLI displays actual name (including dedup suffix if applied)

#### Test Plan
- **Unit Tests**: Env var detection, TowerClient method, error handling
- **Integration Tests**: Full CLI → Tower API → DB round-trip (if feasible in test harness)
- **Manual Testing**: Open shell in dashboard, run `af rename "monitoring"`, verify tab updates

#### Rollback Strategy
Remove command file and registration. No data impact.

#### Risks
- **Risk**: `TOWER_PORT` not set in legacy sessions
  - **Mitigation**: Fall back to default Tower port if env var is missing

---

## Dependency Map
```
Phase 1 (DB + Env Vars) ──→ Phase 2 (API Endpoint) ──→ Phase 3 (CLI Command)
```

## Integration Points
### Internal Systems
- **Tower API**: New PATCH endpoint for rename
- **SQLite**: Migration v11, label storage and queries
- **PtySession**: Label mutation
- **TowerClient**: New method for CLI → Tower communication
- **Dashboard**: Existing polling picks up label changes (no frontend changes)

## Risk Analysis
### Technical Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| PtySession ID mismatch after restart | Low | Medium | Look up via stable session ID in terminal_sessions |
| Migration failure on existing DB | Low | Low | Simple ADD COLUMN is safe in SQLite |
| Dashboard not reflecting changes | Low | Medium | Verify polling reads label; add WebSocket broadcast if needed |

## Validation Checkpoints
1. **After Phase 1**: Run migration, verify column exists; create shell, verify env vars set
2. **After Phase 2**: curl PATCH endpoint, verify DB and in-memory update
3. **After Phase 3**: Full `af rename` flow from inside a shell session

## Documentation Updates Required
- [ ] CLI command reference (af commands list)

## Approval
- [ ] Technical Lead Review
- [ ] Expert AI Consultation Complete

## Notes

The `af shell --name` bug (name parameter ignored during creation) is a related issue but out of scope for this plan. It can be fixed as a trivial bonus during Phase 2 since the code is being modified there anyway, but is not a requirement.

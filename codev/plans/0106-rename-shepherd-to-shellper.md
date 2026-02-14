# Plan: Rename Shepherd to Shellper

## Metadata
- **ID**: plan-2026-02-14-rename-shepherd-to-shellper
- **Status**: draft
- **Specification**: codev/specs/0106-rename-shepherd-to-shellper.md
- **Created**: 2026-02-14

## Executive Summary

Pure mechanical rename refactoring. Three phases: (1) rename source files and update all code references, (2) write the SQLite migration and update schema, (3) update documentation. Each phase is independently testable and builds on the previous.

## Success Metrics
- [ ] `grep -ri shepherd packages/codev/src/` returns zero hits (excluding old migration code and dist/)
- [ ] All existing tests pass with new names
- [ ] `npm run build` succeeds
- [ ] SQLite migration (v8) handles column rename and value update
- [ ] Living documentation updated

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Rename Source Files and Update Code References"},
    {"id": "phase_2", "title": "SQLite Migration and Schema Update"},
    {"id": "phase_3", "title": "Documentation Updates"}
  ]
}
```

## Phase Breakdown

### Phase 1: Rename Source Files and Update Code References
**Dependencies**: None

#### Objectives
- Rename all 5 source files and 4 test files from `shepherd-*` to `shellper-*`
- Update all class, interface, method, and variable names
- Update all import paths
- Update all code comments referencing shepherd

#### Deliverables
- [ ] 5 source files renamed via `git mv`
- [ ] 4 test files renamed via `git mv`
- [ ] All class/interface renames applied (ShepherdProcess → ShellperProcess, etc.)
- [ ] All method renames applied (attachShepherd → attachShellper, etc.)
- [ ] All variable/property renames applied (~15 variables)
- [ ] All import paths updated
- [ ] Socket path pattern updated (`shepherd-*.sock` → `shellper-*.sock`)
- [ ] Code comments updated
- [ ] Build succeeds
- [ ] All tests pass

#### Implementation Details

**File renames** (source, `packages/codev/src/terminal/`):
- `shepherd-protocol.ts` → `shellper-protocol.ts`
- `shepherd-process.ts` → `shellper-process.ts`
- `shepherd-client.ts` → `shellper-client.ts`
- `shepherd-main.ts` → `shellper-main.ts`
- `shepherd-replay-buffer.ts` → `shellper-replay-buffer.ts`

**File renames** (tests, `packages/codev/src/terminal/__tests__/`):
- `shepherd-protocol.test.ts` → `shellper-protocol.test.ts`
- `shepherd-process.test.ts` → `shellper-process.test.ts`
- `shepherd-client.test.ts` → `shellper-client.test.ts`
- `tower-shepherd-integration.test.ts` → `tower-shellper-integration.test.ts`

**Files requiring content updates** (not renamed):
- `terminal/pty-session.ts` (~49 refs)
- `terminal/session-manager.ts` (~28 refs)
- `terminal/pty-manager.ts` (~3 refs)
- `agent-farm/servers/tower-server.ts` (~114 refs)
- `agent-farm/commands/spawn.ts` (~1 ref)
- `agent-farm/utils/shell.ts` (~1 ref)
- `agent-farm/__tests__/terminal-sessions.test.ts` (~28 refs)
- `terminal/__tests__/session-manager.test.ts` (~115 refs)
- Dashboard components if shepherd references exist

**Approach**: Use `git mv` for file renames. For content updates, use search-and-replace within each file — replace class names, method names, variable names, import paths, and comments. Process files in dependency order: renamed files first (they define exports), then consumers.

#### Acceptance Criteria
- [ ] `grep -ri shepherd packages/codev/src/` returns zero hits (excluding db/index.ts migration code)
- [ ] `npm run build` succeeds
- [ ] All tests pass

#### Test Plan
- **Unit Tests**: Existing tests renamed and updated — all must pass
- **Build**: `npm run build` compiles without errors
- **Grep**: Zero shepherd references in src/ (excluding migrations)

---

### Phase 2: SQLite Migration and Schema Update
**Dependencies**: Phase 1

#### Objectives
- Update GLOBAL_SCHEMA to use `shellper_*` column names
- Write migration v8 using table-rebuild pattern
- Update stored socket path values
- Rename physical socket files on disk

#### Deliverables
- [ ] `schema.ts` GLOBAL_SCHEMA updated with `shellper_*` columns
- [ ] Migration v8 added to `db/index.ts`
- [ ] Socket file rename logic in migration
- [ ] Build succeeds
- [ ] Tests pass

#### Implementation Details

**Schema update** (`agent-farm/db/schema.ts`):
- Change `shepherd_socket TEXT` → `shellper_socket TEXT`
- Change `shepherd_pid INTEGER` → `shellper_pid INTEGER`
- Change `shepherd_start_time INTEGER` → `shellper_start_time INTEGER`

**Migration v8** (`agent-farm/db/index.ts`):
- Follow v7's table-rebuild pattern:
  1. CREATE `terminal_sessions_new` with `shellper_*` columns
  2. INSERT from old table mapping `shepherd_*` → `shellper_*`
  3. DROP old table, RENAME new table
  4. Recreate indexes
- UPDATE stored socket path values: `REPLACE(shellper_socket, 'shepherd-', 'shellper-')`
- Scan `~/.codev/run/` for `shepherd-*.sock`, rename to `shellper-*.sock`
- Wrap in try-catch consistent with existing migration pattern

**Test updates** (`agent-farm/__tests__/terminal-sessions.test.ts`):
- Update schema references from `shepherd_*` to `shellper_*`
- Update test data and assertions

#### Acceptance Criteria
- [ ] GLOBAL_SCHEMA uses `shellper_*` column names
- [ ] Migration v8 exists and follows table-rebuild pattern
- [ ] `npm run build` succeeds
- [ ] All tests pass

#### Test Plan
- **Unit Tests**: Existing terminal-sessions tests pass with new column names
- **Build**: Compiles without errors

---

### Phase 3: Documentation Updates
**Dependencies**: Phase 1

#### Objectives
- Update all living documentation to use Shellper naming
- Leave historical documents (0104 specs/plans/reviews) unchanged

#### Deliverables
- [ ] `codev/resources/arch.md` updated
- [ ] `codev-skeleton/resources/commands/agent-farm.md` updated
- [ ] `codev-skeleton/protocols/maintain/protocol.md` updated
- [ ] `README.md` updated
- [ ] `INSTALL.md` updated
- [ ] `MIGRATION-1.0.md` updated

#### Implementation Details

**Files to update:**
- `codev/resources/arch.md` — glossary entry, architecture sections, debugging commands, terminal system documentation (~64 refs)
- `codev-skeleton/resources/commands/agent-farm.md` — command references (~2 refs)
- `codev-skeleton/protocols/maintain/protocol.md` — protocol references (~3 refs)
- `README.md` (~1 ref)
- `INSTALL.md` (~1 ref)
- `MIGRATION-1.0.md` (~1 ref)

**Files NOT updated** (historical records):
- `codev/specs/0104-custom-session-manager.md`
- `codev/plans/0104-custom-session-manager.md`
- `codev/reviews/0104-custom-session-manager.md`
- `codev/projects/0104-*/` artifacts
- `codev/projectlist.md` (0104 entry)

#### Acceptance Criteria
- [ ] `grep -ri shepherd` in living docs returns zero hits
- [ ] Historical docs unchanged

#### Test Plan
- **Manual**: Grep living docs for shepherd references
- **Build**: Still compiles after doc changes (no code impact)

---

## Dependency Map
```
Phase 1 (Source) ──→ Phase 2 (Migration)
      │
      └──────────→ Phase 3 (Docs)
```

## Risk Analysis
### Technical Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Missed shepherd reference | Low | Low | grep-based AC catches all |
| Import path typo breaks build | Low | Low | Build check after each phase |
| Migration v8 conflicts with existing data | Low | Medium | Table-rebuild pattern proven in v7 |

## Validation Checkpoints
1. **After Phase 1**: `grep -ri shepherd packages/codev/src/` clean, build passes, tests pass
2. **After Phase 2**: Schema updated, migration works, build passes, tests pass
3. **After Phase 3**: Docs updated, final grep across entire repo

## Notes
- This is a mechanical rename with ~350+ individual replacements across ~15 files
- The grep-based acceptance criterion is the safety net — if anything is missed, it will be caught
- Old migration code (v6, v7) must retain shepherd references as they are historically correct

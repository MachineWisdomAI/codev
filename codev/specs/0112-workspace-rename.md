---
approved: 2026-02-15
validated: [gemini, codex, claude]
---

# Spec 0112: Rename "Project" → "Workspace" for Repository Concept

## Problem

The word "project" is used for two different things in the codebase:

1. **Repository/codebase** (Tower, dashboard, CLI): `projectPath`, `projectTerminals`, `known_projects`, `getProjectUrl()` — refers to a git repository managed by Tower (e.g., `codev-public`, `todo-app`)

2. **Work-unit** (porch, projectlist, specs): `projectId`, `af spawn -p 0108`, `projectlist.md` — refers to a tracked unit of work with a spec/plan/review lifecycle

This causes real confusion. An architect spent 20 minutes in the wrong file because "project" was ambiguous. The upcoming Spec 0110 (Messaging Infrastructure) introduces a `project:agent` addressing format that makes the collision even worse.

### Consultation

Three-way consultation (Gemini, Codex, Claude) unanimously recommended:
- **"workspace"** for the repository/codebase concept (VS Code precedent, natural hierarchy)
- **"project"** stays for work-units (right scale from bugfixes to platform rewrites)

## Solution

Rename all uses of "project" that mean "repository/codebase" to **"workspace"** throughout Tower, Agent Farm, dashboard, and CLI code. Keep "project" for work-units (porch, projectlist, specs).

### Vocabulary

| Term | Means | Examples |
|------|-------|---------|
| **Workspace** | A git repository managed by Tower | `codev-public`, `todo-app` |
| **Project** | A tracked unit of work (spec/plan/review) | `0108`, `0110`, `0111` |

### Rename Map

#### Database Schema (`db/schema.ts` + migrations)

| Before | After |
|--------|-------|
| `terminal_sessions.project_path` | `terminal_sessions.workspace_path` |
| `file_tabs.project_path` | `file_tabs.workspace_path` |
| `known_projects` table | `known_workspaces` table |
| `known_projects.project_path` | `known_workspaces.workspace_path` |
| `idx_terminal_sessions_project` | `idx_terminal_sessions_workspace` |
| `idx_file_tabs_project` | `idx_file_tabs_workspace` |

**Migration**: Add migration **v9** to `global.db` (the only database with affected tables; `state.db` is unaffected). SQLite requires CREATE-new, INSERT-SELECT, DROP-old for table renames with column renames. Follow the existing pattern used in v7/v8 migrations.

**Schema comments**: Update inline comments in `GLOBAL_SCHEMA` (e.g., `"-- project this terminal belongs to"` → `"-- workspace this terminal belongs to"`, `"across all projects"` → `"across all workspaces"`).

#### Type Definitions (`tower-types.ts`)

| Before | After |
|--------|-------|
| `ProjectTerminals` | `WorkspaceTerminals` |
| `DbTerminalSession.project_path` | `DbTerminalSession.workspace_path` |
| `InstanceStatus.projectPath` | `InstanceStatus.workspacePath` |
| `InstanceStatus.projectName` | `InstanceStatus.workspaceName` |

#### Tower Terminals (`tower-terminals.ts`)

| Before | After |
|--------|-------|
| `projectTerminals` Map | `workspaceTerminals` Map |
| `getProjectTerminals()` | `getWorkspaceTerminals()` |
| `getProjectTerminalsEntry()` | `getWorkspaceTerminalsEntry()` |
| `saveTerminalSession(_, projectPath, ...)` | `saveTerminalSession(_, workspacePath, ...)` |
| `deleteProjectTerminalSessions()` | `deleteWorkspaceTerminalSessions()` |
| `getTerminalSessionsForProject()` | `getTerminalSessionsForWorkspace()` |
| `loadFileTabsForProject()` | `loadFileTabsForWorkspace()` |
| `getTerminalsForProject()` | `getTerminalsForWorkspace()` |

#### Tower Instances (`tower-instances.ts`)

| Before | After |
|--------|-------|
| `registerKnownProject()` | `registerKnownWorkspace()` |
| `getKnownProjectPaths()` | `getKnownWorkspacePaths()` |
| `InstanceDeps.projectTerminals` | `InstanceDeps.workspaceTerminals` |
| `InstanceDeps.getProjectTerminalsEntry` | `InstanceDeps.getWorkspaceTerminalsEntry` |
| `InstanceDeps.deleteProjectTerminalSessions` | `InstanceDeps.deleteWorkspaceTerminalSessions` |
| `InstanceDeps.getTerminalsForProject` | `InstanceDeps.getTerminalsForWorkspace` |
| `isProject` in directory suggestions | `isWorkspace` |

#### Tower Routes (`tower-routes.ts`)

| Before | After |
|--------|-------|
| `handleProjectAction()` | `handleWorkspaceAction()` |
| `handleProjectRoutes()` | `handleWorkspaceRoutes()` |
| `handleProjectState()` | `handleWorkspaceState()` |
| `handleProjectShellCreate()` | `handleWorkspaceShellCreate()` |
| `handleProjectFileTabCreate()` | `handleWorkspaceFileTabCreate()` |
| `handleProjectFileGet()` | `handleWorkspaceFileGet()` |
| `handleProjectFileRaw()` | `handleWorkspaceFileRaw()` |
| `handleProjectFileSave()` | `handleWorkspaceFileSave()` |
| `handleProjectTabDelete()` | `handleWorkspaceTabDelete()` |
| `handleProjectStopAll()` | `handleWorkspaceStopAll()` |
| `handleProjectFiles()` | `handleWorkspaceFiles()` |
| `handleProjectGitStatus()` | `handleWorkspaceGitStatus()` |
| `handleProjectRecentFiles()` | `handleWorkspaceRecentFiles()` |
| `handleProjectAnnotate()` | `handleWorkspaceAnnotate()` |
| `projectPath` param (throughout) | `workspacePath` param |

**URL patterns**: Keep `/project/` and `/api/projects/` URLs as-is for this phase. URL changes would break bookmarks and any external integrations. Internal naming is what matters for developer clarity.

#### Tower Utils (`tower-utils.ts`)

| Before | After |
|--------|-------|
| `normalizeProjectPath()` | `normalizeWorkspacePath()` |
| `getProjectName()` | `getWorkspaceName()` |

#### Tower Client (`lib/tower-client.ts`)

| Before | After |
|--------|-------|
| `TowerProject` | `TowerWorkspace` |
| `TowerProjectStatus` | `TowerWorkspaceStatus` |
| `encodeProjectPath()` | `encodeWorkspacePath()` |
| `decodeProjectPath()` | `decodeWorkspacePath()` |
| `activateProject()` | `activateWorkspace()` |
| `deactivateProject()` | `deactivateWorkspace()` |
| `getProjectStatus()` | `getWorkspaceStatus()` |
| `getProjectUrl()` | `getWorkspaceUrl()` |

#### CLI Commands

| File | Before | After |
|------|--------|-------|
| `start.ts` | `projectPath` local var | `workspacePath` |
| `stop.ts` | `projectPath` local var | `workspacePath` |
| `status.ts` | `projectPath`, `projectStatus` | `workspacePath`, `workspaceStatus` |
| `open.ts` | `projectPath` param | `workspacePath` |
| `shell.ts` | `projectPath` param | `workspacePath` |
| `architect.ts` | `projectPath` usage | `workspacePath` |
| `attach.ts` | `projectPath` usage | `workspacePath` |
| `send.ts` | `getProjectStatus` call | `getWorkspaceStatus` |

**Note**: `config.projectRoot` stays as-is — it comes from the Config system which predates Tower and is about the project root directory generically, not Tower's concept of a workspace.

#### File Tabs Utility (`utils/file-tabs.ts`)

| Before | After |
|--------|-------|
| `projectPath` param | `workspacePath` param |

#### Gate Status Utility (`utils/gate-status.ts`)

| Before | After |
|--------|-------|
| `getGateStatusForProject()` | `getGateStatusForWorkspace()` |
| `projectPath` param | `workspacePath` param |

#### Dashboard (`dashboard/src/`)

| File | Before | After |
|------|--------|-------|
| `lib/api.ts` | `DashboardState.projectName` | `DashboardState.workspaceName` |
| `components/App.tsx` | `state.projectName` (document title) | `state.workspaceName` |
| `components/StatusPanel.tsx` | `projectName` in header bar | `workspaceName` |
| Display references to "Project" | "Workspace" where referring to repo | Keep "Projects" for work-unit list |

#### Spawn/Cleanup (Ambiguous Files — Handle Carefully)

These files use BOTH meanings. Only rename the repo-meaning uses:

| File | Keep (work-unit) | Rename (repo) |
|------|-------------------|---------------|
| `spawn.ts` | `projectId`, `options.project` | `{ projectPath: config.projectRoot }` → `{ workspacePath: config.projectRoot }` in registration objects |
| `cleanup.ts` | `projectId`, `options.project` | (none — `config.projectRoot` itself is NOT renamed, and there are no repo-meaning local variables) |
| `spawn-worktree.ts` | `projectId` param | `{ projectPath: config.projectRoot }` → `{ workspacePath: config.projectRoot }` in registration objects |
| `spawn-roles.ts` | `projectId` param | (none — all uses are work-unit) |

**Clarification on `config.projectRoot`**: The config property `config.projectRoot` is NEVER renamed (it's a generic config concept). However, when it's used as a value in objects like `{ projectPath: config.projectRoot }`, the **property name** `projectPath` is a repo-meaning identifier and gets renamed to `workspacePath`. The value (`config.projectRoot`) stays the same.

### What NOT to Rename

- **`projectId`** in porch — this is a work-unit ID (correct usage)
- **`projectlist.md`** — this tracks work-unit projects (correct usage)
- **`codev/projects/`** directory — porch runtime state for work-unit projects (correct usage)
- **`-p` / `--project` CLI flag** in `af spawn` — refers to work-unit (correct usage)
- **`config.projectRoot`** — generic config concept, not Tower-specific
- **URL paths** (`/project/`, `/api/projects/`) — keep for backwards compatibility
- **User-facing dashboard text** saying "Project: codev-public" — update to "Workspace: codev-public" in header only, keep "Projects" group label for the work-unit list

### Tests

Update all test files that reference renamed identifiers. The TypeScript compiler will catch every missed rename at build time.

### Ambiguity Points — Double-Check These

These locations use BOTH meanings of "project" in close proximity. The builder must carefully distinguish which occurrences to rename and which to keep:

1. **`spawn.ts` lines ~140-180**: `projectId` (work-unit "0108") sits next to `config.projectRoot` (repo path) and `registration.projectPath` (repo path). Only rename the repo-meaning ones.

2. **`cleanup.ts` lines ~120-135**: `projectId = options.project` is work-unit, but `config.projectRoot` on line ~92 is repo. The `options.project` CLI flag is work-unit — do NOT rename.

3. **`spawn-worktree.ts` lines ~75-86 and ~260-345**: `projectId` parameter is work-unit (for porch init), but `registration.projectPath` on line ~262 is repo. Same function, different meanings.

4. **`gate-status.ts`**: `getGateStatusForProject(projectPath)` takes a repo path (→ rename to `workspacePath`), but inside it reads `codev/projects/<id>/` which are work-unit directories (→ keep "projects" in path).

5. **`tower-routes.ts` handleTerminalCreate**: `body.projectPath` from the API request means repo path (→ rename in handler). But the terminal might be spawned for a builder working on a "project" (work-unit). Only the path variable changes.

6. **`status.ts` CLI output**: Currently prints `Project: /path/to/repo`. Should print `Workspace: /path/to/repo`. But `af status` also shows builder IDs which are work-unit project IDs — those stay as "Project 0108".

7. **Dashboard `StatusPanel.tsx`**: The "Projects" group header refers to work-unit projects listed in `projectlist.md` — keep as "Projects". But `projectName` in the header bar refers to the repo name — rename to `workspaceName`.

8. **`config.projectRoot`**: This is from the generic Config system, NOT Tower's concept. It means "root of the current working project directory." Do NOT rename — it predates the workspace concept and is used everywhere outside Tower.

## Scope

- ~508 identifier renames across ~15 TypeScript source files
- 1 database migration (column + table renames)
- ~5 dashboard component updates
- Test file updates (compiler-guided)
- No URL/API breaking changes
- No changes to porch, projectlist, or work-unit terminology

## Acceptance Criteria

1. `npm run build` passes with zero TypeScript errors
2. `npm test` passes
3. No remaining uses of "project" meaning "repository" in Tower code (grep verification)
4. `projectId` and work-unit "project" terminology unchanged in porch
5. Database migration cleanly upgrades existing `global.db`
6. Dashboard displays "Workspace" where referring to repository

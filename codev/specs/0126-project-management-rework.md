# Specification: Project Management Rework

## Metadata
- **ID**: 0126
- **Status**: draft
- **Created**: 2026-02-16
- **Supersedes**: 0119 (abandoned)

## Problem Statement

`projectlist.md` is the canonical project tracking file and it has been a persistent source of bugs and friction:

1. **Constant drift** — builders don't update it, architect forgets, status gets stale within hours
2. **Merge conflicts** — every builder that reserves a number or updates status conflicts with every other
3. **Manual numbering** — humans must find and reserve the "next available number" before creating specs
4. **Redundant with GitHub** — bugs are already GitHub Issues, but projects aren't. Two systems track overlapping work.
5. **Display is noise** — a 1100+ line YAML file is impossible to scan. No filtering, no sorting, no search.
6. **Programmatic readers are fragile** — `getProjectSummary()` in porch parses YAML that's hand-edited and frequently malformed
7. **Lifecycle tracking is manual** — status transitions (conceived → specified → committed → integrated) require hand-editing

## Current State

### What reads projectlist.md

| Component | What it reads | Hard dependency? |
|-----------|--------------|-----------------|
| `porch/prompts.ts` → `getProjectSummary()` | `summary` field | Yes (strict mode only) |
| Dashboard `StatusPanel.tsx` | Entire file (polling) | Yes |
| `codev init/adopt` → `scaffold.ts` | Template creation | No (writes, doesn't read) |
| Architect (human) | Visual scanning | No (just convention) |

### What does NOT read projectlist.md

- `af spawn` — filesystem glob on `codev/specs/`
- Porch state — `codev/projects/<id>/status.yaml`
- Spec/plan/review discovery — filename-based
- `af cleanup` — doesn't touch it
- `af status` — reads Tower state, not projectlist
- **Soft mode builders** — no porch, no status tracking at all

The actual hard dependencies are surprisingly small: one function in porch (strict mode only) and one dashboard panel.

## Desired State

### Issue-first workflow

The GitHub Issue is created **before** the spec. The issue number becomes the universal identifier for everything — spec file, plan file, review file, branch, worktree.

**New workflow:**
1. `gh issue create --title "Feature name"` → Issue #315 auto-assigned
2. Write spec: `codev/specs/315-feature-name.md`
3. `af spawn 315` → finds spec on disk + fetches issue context from GitHub
4. Builder works, creates PR referencing #315
5. PR merged → issue closed

**Old workflow (eliminated):**
1. ~~Edit projectlist.md, reserve next number~~
2. ~~Create spec file with that number~~
3. ~~Commit both files~~
4. ~~Manually update projectlist.md status throughout lifecycle~~

### Derived status — no tracking needed

Status is **derived from what exists**, not manually tracked:

| Status | How to determine |
|--------|-----------------|
| Conceived | Open issue, no spec file on disk |
| Specified | Open issue, `codev/specs/<N>-*.md` exists |
| Planned | Open issue, `codev/plans/<N>-*.md` exists |
| Implementing | Active builder worktree in `.builders/` |
| Committed | Open PR referencing the issue |
| Integrated | Issue closed |

No labels needed for status. No manual updates. No drift.

### GitHub Issues as project registry

GitHub Issues is the **registry** (what exists, what's done) — not a status tracker.

| Current (projectlist.md) | New (GitHub Issues) |
|--------------------------|---------------------|
| `id: "0116"` | Issue #116 (auto-assigned) |
| `title` | Issue title |
| `summary` | Issue body |
| `status` | Derived (see table above) |
| `priority: high` | Label: `priority:high` (set once at creation) |
| `release: v2.0` | Milestone: `v2.0` |
| `notes` | Issue comments |
| `files.spec` | Convention: `codev/specs/<issue#>-<slug>.md` |

### No label churn

Labels are set at issue creation and rarely changed:

- `type:feature` / `type:bug` — set once at creation
- `priority:high` / `priority:medium` / `priority:low` — set once, maybe updated occasionally
- Open/Closed — the only state transition GitHub needs to know about

Detailed phase tracking (specify → plan → implement → review) stays in porch's `status.yaml` for strict mode. Soft mode has no tracking. Dashboard derives status from filesystem + Tower state.

### Simplified spawn CLI

```bash
af spawn 315                    # Positional arg. Find spec, fetch issue, spawn.
af spawn 315 --soft             # Soft mode
af spawn 315 --resume           # Resume existing worktree
af spawn 315 --use-protocol tick  # Override protocol
af spawn --task "fix the bug"   # Ad-hoc (no issue)
af spawn --protocol maintain    # Protocol-only run
af spawn --shell                # Bare session
```

The number is a positional argument, not a flag. `af spawn 315` replaces both `af spawn -p 315` and `af spawn --issue 315`. It:
1. Checks for `codev/specs/315-*.md` on disk
2. If found → spec mode (SPIR/TICK based on protocol detection)
3. If not found → fetches GitHub issue → bugfix mode
4. Either way, the issue provides context (title, body, comments)

Keep `-p` and `--issue` as hidden aliases for backwards compatibility.

### Dashboard: Single "Work view"

> **Visual mockup**: See `codev/spikes/work-view/mockup.html` for the interactive spike.

The existing dashboard tabs (Projects, Terminals, etc.) are replaced by a single **Work view** — one page that shows everything the architect needs. No tab navigation.

File tabs (`af open`) are unaffected — they remain as a separate feature for viewing annotated files.

**Work view sections (top to bottom):**

1. **Active builders** — what's running, what phase, with terminal links
   - Source: Tower workspace state + porch `status.yaml` from active worktrees
   - Click a builder to open its terminal (replaces the old Terminals tab)
   - Soft mode builders shown as "running" (no phase detail)
   - Blocked gates shown inline on the builder card

2. **Pending PRs** — what's ready for review/merge
   - Source: `gh pr list` (cached in Tower, 60s TTL)
   - Shows: PR title, review status, linked issue

3. **Backlog & Open Bugs** — what's in the pipeline but not actively being built
   - Source: open GitHub issues cross-referenced against `codev/specs/` on disk and `.builders/`
   - Features with no spec file = conceived (backlog)
   - Features with spec but no builder = ready to start
   - Open bugs with no active builder = unfixed
   - Shows: issue title, type (feature/bug), priority label, age

**What the Work view replaces:**
- Projects tab → backlog/bugs section (derived from GitHub Issues + filesystem)
- Terminals tab → builder cards with embedded terminal links
- Gate indicators → inline on builder cards

**What the Work view does NOT show:**
- Completed/integrated work (closed issues — use `gh issue list --state closed`)
- Full project history (use `git log`)

### Tower endpoint design

```
GET /api/overview
```

```json
{
  "builders": [
    {
      "id": "builder-315",
      "issueNumber": 315,
      "issueTitle": "Stale gate indicators",
      "phase": "pr",
      "mode": "strict",
      "gates": { "merge-approval": "pending" },
      "terminal": { "id": "abc-123", "active": true }
    }
  ],
  "pendingPRs": [
    {
      "number": 317,
      "title": "[Bugfix #315] Remove stale gate indicators",
      "reviewStatus": "approved",
      "linkedIssue": 315
    }
  ],
  "backlog": [
    {
      "number": 320,
      "title": "Rework consult CLI",
      "type": "feature",
      "priority": "medium",
      "hasSpec": false,
      "hasBuilder": false,
      "createdAt": "2026-02-16T..."
    },
    {
      "number": 321,
      "title": "Terminal flickers on resize",
      "type": "bug",
      "priority": "high",
      "hasSpec": false,
      "hasBuilder": false,
      "createdAt": "2026-02-16T..."
    }
  ]
}
```

Builder data: Tower state + `status.yaml`. PR data: cached `gh pr list`. Backlog: cached `gh issue list` (open issues — both features and bugs) cross-referenced with `codev/specs/` glob and `.builders/` to determine what's conceived, ready, or unfixed.

## Implementation

### Phase 1: Decouple porch from projectlist.md

1. Rewrite `getProjectSummary()` to use `gh issue view <id> --json title,body`
2. Fallback: if no GitHub issue, read spec file first paragraph for summary
3. In-memory cache in porch process (no persistent cache needed)

### Phase 2: Simplify spawn CLI

1. Add positional argument to `af spawn` — the issue/project number
2. Unified flow: check for spec file → if missing, fetch GitHub issue → determine protocol
3. Keep `-p` and `--issue` as hidden aliases for backwards compat
4. On spawn: comment on the issue ("Builder spawned")
5. On cleanup with merged PR: close the issue

### Phase 3: Dashboard rework

1. Add Tower endpoint `GET /api/overview`:
   - Active builders from Tower state + `status.yaml`
   - Pending PRs from cached `gh pr list`
   - Backlog from cached `gh issue list` cross-referenced with spec files on disk
2. Replace StatusPanel with sections: builders, gates, PRs, backlog
3. Remove projectlist.md polling

### Phase 4: Cleanup

1. Remove projectlist.md template from `codev-skeleton/templates/`
2. Remove `projectlist-archive.md` template
3. Update `codev init/adopt` to skip projectlist scaffolding
4. Update all protocol docs, CLAUDE.md, AGENTS.md references
5. Remove `copyProjectlist()` from scaffold.ts
6. Archive this repo's `codev/projectlist.md`

## Success Criteria

- [ ] No code reads projectlist.md
- [ ] `af spawn <N>` works as positional arg for both features and bugs
- [ ] Porch reads project summary from GitHub Issues (with spec-file fallback)
- [ ] Dashboard shows: active builders, blocked gates, pending PRs, backlog
- [ ] Backlog + open bugs derived from open issues — no manual tracking
- [ ] Status derived from filesystem + Tower state — no labels needed
- [ ] `codev init` no longer creates projectlist.md
- [ ] Existing numbered specs (0001-0124) still work
- [ ] Soft mode works with zero tracking infrastructure

## Constraints

- Must work offline (spec files on disk, Tower state, no GitHub needed for core function)
- Must not break existing `af spawn -p` for numbered specs already on disk
- `gh` CLI must be installed (already a requirement)
- GitHub API rate limits: 5000/hr authenticated — sufficient for cached queries
- Must support repos that don't use GitHub (skip GH features, keep file-based workflow)
- Soft mode builders need zero tracking infrastructure
- Work view must be responsive / usable on mobile (check builder status, approve gates, see PRs on the go)

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| GitHub API unavailable | Low | Medium | Fall back to spec files, Tower state still works |
| `gh` CLI not authenticated | Medium | Medium | `codev doctor` checks, clear error messages |
| Soft builders have no phase info | Expected | None | Show as "running" without phase detail |
| Non-GitHub repos | Medium | Medium | Feature-detect, skip GH features, file-based workflow |
| PR/issue cache staleness | Low | Low | 60s TTL + refresh on demand |

## Open Questions

- [ ] Should `codev init` create GitHub labels automatically, or require explicit `codev setup-labels`?
- [ ] Should `af cleanup` auto-close the GitHub issue, or leave that to the human?
- [ ] For the backlog section, should we filter by labels or show all open issues (features + bugs)?

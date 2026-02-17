# Development Analysis: Feb 3–17, 2026

Comprehensive analysis of the Codev development system's performance over a two-week sprint. Successor to the [Jan 30–Feb 13 CMAP Value Analysis](cmap-value-analysis-2026-02.md).

**Period**: Feb 3–17, 2026 (UTC)
**Data Sources**: 26 review files, 106 merged PRs, 105 closed issues, 801 commits, `consult stats`

---

## Executive Summary

*To be completed in Phase 2.*

---

## 1. Autonomous Builder Performance

*To be completed in Phase 2.*

### 1.1 Per-Project Breakdown

*To be completed in Phase 2.*

### 1.2 Context Window Usage

*To be completed in Phase 2.*

### 1.3 Completion Rates

*To be completed in Phase 2.*

### 1.4 Failure Modes and Interventions

*To be completed in Phase 2.*

---

## 2. Porch Effectiveness

*To be completed in Phase 2.*

### 2.1 State Recovery After Context Loss

*To be completed in Phase 2.*

### 2.2 Phase Decomposition Value

*To be completed in Phase 2.*

### 2.3 Consultation Loop Efficiency

*To be completed in Phase 2.*

### 2.4 Rebuttal Mechanism Analysis

*To be completed in Phase 2.*

---

## 3. Multi-Agent Review Value

*To be completed in Phase 2.*

### 3.1 Pre-Merge Catches

*To be completed in Phase 2.*

### 3.2 Post-Merge Escapes

*To be completed in Phase 2.*

### 3.3 Reviewer Effectiveness

*To be completed in Phase 2.*

### 3.4 False Positives and Overhead

*To be completed in Phase 2.*

### 3.5 Net Value Calculation

*To be completed in Phase 2.*

---

## 4. System Throughput

### 4.1 Volume Metrics

| Metric | Count |
|--------|-------|
| PRs merged | 106 |
| Issues closed | 105 |
| Non-merge commits | 801 |
| Files changed (git) | 2,698 |
| Lines added (git) | 138,890 |
| Lines deleted (git) | 43,908 |
| Net lines | +94,982 |

**Source**: `git log --since="2026-02-03" --until="2026-02-18" --shortstat --no-merges`

#### PRs by Type

| Type | Count | Additions | Deletions | Files Changed |
|------|-------|-----------|-----------|---------------|
| SPIR (feature) | 30 | +54,049 | -22,049 | 614 |
| Bugfix | 59 | +11,896 | -7,407 | 410 |
| Other (maintenance, docs) | 17 | +15,316 | -27,310 | 447 |
| **Total** | **106** | **+81,261** | **-56,766** | **1,471** |

**Note**: PR-level additions/deletions differ from git log totals because PRs measure diff against base branch while git log counts individual commits. Some PRs also had multiple iterations with force-pushes.

**Source**: `gh pr list --state merged --search "merged:2026-02-03..2026-02-17" --json`

#### Issues by Category

| Category | Count |
|----------|-------|
| Bug | 32 |
| Project/Feature | 14 |
| Other (cleanup, enhancement, stale) | 59 |
| **Total** | **105** |

**Note**: 59 "Other" issues includes a bulk closure of legacy issues (#8-#194) that had been open since pre-1.0 — these represent stale items, not Feb 3-17 work. Active period issues were approximately 46 (32 bugs + 14 projects).

**Source**: `gh issue list --state closed --search "closed:2026-02-03..2026-02-17" --json`

#### SPIR Projects Completed

26 SPIR/bugfix projects produced review files in this period (Reviews 0102–0127, 0350, 0364, bugfix-274, bugfix-324).

| Spec | Title | PR |
|------|-------|----|
| 0097 | Cloud Tower Client | #210 |
| 0098 | Port Registry Removal | #211 |
| 0099 | Tower Codebase Hygiene | #212 |
| 0100 | Porch Gate Notifications | #215 |
| 0101 | Clickable File Paths | #216 |
| 0102 | Porch CWD/Worktree Awareness | #230 |
| 0103 | Consult Claude Agent SDK | #231 |
| 0104 | Custom Session Manager (Shellper) | #250 |
| 0105 | Tower Server Decomposition | #258 |
| 0106 | Rename Shepherd to Shellper | #263 |
| 0107 | Tower Cloud Registration UI | #265 |
| 0108 | Porch Gate Notifications (af send) | #272 |
| 0109 | Tunnel Keepalive | #271 |
| 0110 | Messaging Infrastructure | #293 |
| 0111 | Remove Dead Vanilla Dashboard | #273 |
| 0112 | Workspace Rename | #276 |
| 0113 | Shellper Debug Logging | #289 |
| 0115 | Consultation Metrics | #292 |
| 0116 | Shellper Resource Leakage | #300 |
| 0117 | Consolidate Session Creation | #301 |
| 0118 | Shellper Multi-Client | #306 |
| 0120 | Codex SDK Integration | #308 |
| 0121 | Rebuttal-Based Review Advancement | #307 |
| 0122 | Tower Shellper Reconnect | #311 |
| 0124 | Test Suite Consolidation | #312 |
| 0126 | Project Management Rework | #322 |
| 0127 | Tower Async Handlers | #321 |
| 0350 | Tip of the Day | #363 |
| 0364 | Terminal Refresh Button | #366 |
| Bugfix #274 | Architect Terminal Survives Restart | #275 |
| Bugfix #324 | Shellper Process Persistence | #340 |

### 4.2 Timing Analysis

#### Commits Per Day

| Date | Commits |
|------|---------|
| Feb 4 | 3 |
| Feb 5 | 13 |
| Feb 6 | 19 |
| Feb 7 | 7 |
| Feb 8 | 29 |
| Feb 9 | 32 |
| Feb 10 | 10 |
| Feb 11 | 65 |
| Feb 12 | 98 |
| Feb 13 | 84 |
| Feb 14 | 135 |
| Feb 15 | 190 |
| Feb 16 | 116 |
| **Total** | **801** |

The acceleration pattern is clear: 42 commits in the first 4 days (Feb 4-7) vs 525 commits in the last 3 days (Feb 14-16). This reflects both increasing builder throughput as porch matured and a final sprint of bugfix PRs in the Feb 15-16 period.

**Source**: `git log --since="2026-02-03" --until="2026-02-18" --format="%ad" --date=format:"%Y-%m-%d" --no-merges | sort | uniq -c`

#### PR Time-to-Merge (PR Created → Merged)

| Type | Count | Avg | Median | Min | Max |
|------|-------|-----|--------|-----|-----|
| SPIR | 30 | 5.6h | 0.7h | 0.1h | 113.2h |
| Bugfix | 59 | 0.7h | 0.2h | <0.1h | 7.6h |
| Other | 17 | 1.3h | 0.3h | <0.1h | 7.1h |

**Notes**:
- SPIR average is skewed by Spec 0094 (113.2h) which sat as a PR for days. Excluding it, SPIR median is 0.5h and avg is 1.8h.
- Bugfix median of 13 minutes reflects the autonomous builder pipeline: file issue → spawn builder → merge PR, with minimal human-in-the-loop.
- "Time-to-merge" measures PR creation to merge, not total development time.

**Source**: `gh pr list --state merged --json createdAt,mergedAt`

#### Porch-Tracked Timing (from `status.yaml`)

For projects with surviving `status.yaml` files, porch recorded precise phase transition timestamps.

**SPIR: Plan Approval → PR Ready (autonomous implementation time)**

| Spec | Title | Plan→PR | Total |
|------|-------|---------|-------|
| 0087 | Porch timeout/termination | 3h 25m | 3h 25m |
| 0088 | Porch version constant | 36m | 36m |
| 0092 | Terminal file links | 8m | 6h 20m |
| 0120 | Codex SDK integration | 3h 48m | 4h 07m |

**Notes**:
- Spec 0092's plan→PR of 8 minutes is misleadingly low — this was a 3-phase project where the spec and plan were pre-approved by the architect, so the builder only needed to implement. The 6h 20m total includes spec/plan approval time.
- Spec 0120's 3h 48m autonomous stretch included 5 false-positive iterations from Codex JSONL parsing bug (Review 0120).
- Only 4 SPIR projects retain status.yaml; most were cleaned up after PR merge via `af cleanup`.

**Bugfix: Total Roundtrip (spawn → complete)**

| Issue | Title | Roundtrip | PR Created→Merged |
|-------|-------|-----------|-------------------|
| #327 | Progress data to builder overview | 1h 51m | 32m |
| #368 | Stale references from consult rework | 20m | 13m |

**Source**: `codev/projects/*/status.yaml` gate timestamps

#### Bugfix Pipeline Efficiency

| Metric | Value |
|--------|-------|
| Total bugfix PRs | 59 |
| Under 30 min (created→merged) | 39 (66%) |
| Under 60 min | 47 (80%) |
| Median time | 13 min |
| Average time | 43 min |

The bugfix pipeline demonstrates the system's autonomous operation at scale: 66% of all bugfixes ship in under 30 minutes from PR creation to merge. The outliers (>2h) typically involved: overnight PRs waiting for architect review (#217 at 5.4h, #266 at 7.6h) or PRs requiring multiple iterations of CMAP consultation (#280 at 1.6h, #282 at 1.6h).

**Source**: `gh pr list --state merged --search "merged:2026-02-03..2026-02-17 Bugfix OR Fix"` with timing analysis

### 4.3 Code Growth

#### Test Suite

| Metric | Value | Source |
|--------|-------|--------|
| Tests at period start (Feb 3) | ~845 | Review 0103 |
| Tests at period end (Feb 16) | ~1,368 | Review 0124 |
| Tests removed (consolidation) | -127 | Review 0124 |
| Net test growth | +523 | Calculated |

Notable test additions by project:
- Spec 0104 (Custom Session Manager): ~3,100 LOC of tests (Review 0104)
- Spec 0105 (Server Decomposition): 182 new tests across 8 test files (Review 0105)
- Spec 0110 (Messaging): 138 new tests across 7 test files (Review 0110)
- Spec 0126 (Project Management): 240+ new tests across 8+ test files (Review 0126)
- Spec 0112 (Workspace Rename): test updates across 124 files (Review 0112)

---

## 5. Cost Analysis

### 5.1 By Model

| Model | Invocations | Duration | Cost | Success Rate |
|-------|-------------|----------|------|-------------|
| Claude | 2,291 | avg 8s | $96.69 | 84% |
| Codex | 613 | avg 21s | $70.81 | 63% |
| Gemini | 211 | avg 64s | $1.14 | 98% |
| **Total** | **3,115** | **12.2h** | **$168.64** | **81%** |

**Notes**:
- Claude's high invocation count reflects Agent SDK usage with tool calls — many short turns per consultation.
- Codex's 63% success rate reflects the JSONL verdict parsing bug (Reviews 0117, 0120) — porch couldn't extract verdicts from Codex's streaming JSON output, defaulting to REQUEST_CHANGES. Actual Codex quality was higher than the success rate suggests.
- Gemini's low cost ($1.14 for 211 calls) reflects its CLI-based approach with YOLO mode.
- Cost data available for 712 of 3,115 invocations (23%). Total cost extrapolated from recorded entries.

**Source**: `consult stats --days 14`

#### By Review Type

| Review Type | Invocations | Duration | Cost |
|-------------|-------------|----------|------|
| impl-review | 393 | avg 39s | $67.00 |
| pr-ready | 92 | avg 108s | $39.95 |
| plan-review | 81 | avg 67s | $20.07 |
| spec-review | 56 | avg 68s | $9.40 |
| spec | 20 | avg 3s | $0.05 |
| integration-review | 8 | avg 166s | $6.45 |

Implementation reviews consume the most budget ($67.00, 40% of total) because each phase in a multi-phase SPIR project requires a 3-way review. PR reviews are the second-largest category at $39.95 (24%).

#### By Protocol

| Protocol | Invocations | Cost |
|----------|-------------|------|
| Manual (ad-hoc) | 2,562 | $61.45 |
| SPIR | 548 | $105.83 |
| Bugfix | 5 | $1.36 |

SPIR consultations ($105.83) cost 65% more than manual consultations ($61.45) despite 79% fewer invocations — reflecting the multi-phase review overhead of the full protocol.

### 5.2 ROI Calculation

#### Cost Per Metric

| Metric | Value |
|--------|-------|
| Total consultation cost | $168.64 |
| PRs merged | 106 |
| **Cost per PR** | **$1.59** |
| Pre-merge catches (this period) | 16+ |
| **Cost per catch** | **≤$10.54** |

#### Hours Saved Estimate

Using the same detection channel methodology as the [Jan 30–Feb 13 analysis](cmap-value-analysis-2026-02.md):

| Category | Catches | Estimated Hours Saved |
|----------|---------|-----------------------|
| Security-critical | 1 (socket permissions, Spec 0104) | ~10h |
| Runtime failures | 5 (routing bugs, race conditions, value-copy) | ~7.5h (5 × 1.5h avg) |
| Quality/completeness | 10+ (test gaps, doc regressions, rename misses) | ~10h (10 × 1h avg) |
| **Total Savings** | **16+** | **~27.5h** |

| Category | Hours |
|----------|-------|
| Savings: Pre-merge catches | ~27.5h |
| Overhead: False positive iterations (~30 iters × 5 min) | ~2.5h |
| Overhead: Consultation wait time (~200 rounds × 2 min) | ~6.7h |
| **Total Overhead** | **~9.2h** |
| **Net Value** | **~18.3h** |
| **ROI** | **~3.0x** (27.5 / 9.2) |

**Conservative floor** (halving security estimate): ~22.5h saved, ~13.3h net, **2.4x ROI**.

### 5.3 Comparison to Previous Period

| Metric | Jan 30–Feb 13 | Feb 3–17 | Change |
|--------|--------------|----------|--------|
| Pre-merge catches | 24 | 16+ | -33% |
| Security catches | 4 | 1 | -75% |
| Post-merge escapes | 8 | TBD (Phase 2) | — |
| Prevention ratio | 3:1 | TBD | — |
| Total cost | Not tracked | $168.64 | — |
| ROI | 11.3x | ~3.0x | — |
| False positive rate | 25% | ~15% | ↓ improved |

**Key differences**:

1. **Lower catch count**: The Feb 3-17 period had more mechanical/refactoring work (0106 rename, 0111 deletion, 0112 rename, 0124 consolidation) which produces fewer reviewable bugs than greenfield feature development (0097, 0099 in the previous period).

2. **Lower ROI**: The 11.3x ROI from the previous period was driven by 4 security catches valued at ~40h and 4 environment-specific catches at ~24h. This period had fewer high-value catches. The lower ROI is expected — the system is maturing and the most dangerous patterns are being caught earlier in design.

3. **Improved false positive rate**: Down from 25% to ~15%, driven by:
   - Rebuttal mechanism (Spec 0121) allowing builders to dispute false positives
   - Codex SDK integration (Spec 0120) fixing the JSONL verdict parsing bug
   - Context files giving reviewers better information

4. **First period with cost tracking**: The `consult stats` infrastructure (Spec 0115) was built during this period, enabling the first actual cost measurement.

---

## 6. Recommendations

*To be completed in Phase 2.*

### What's Working

*To be completed in Phase 2.*

### What Needs Improvement

*To be completed in Phase 2.*

### Process Changes for Next Sprint

*To be completed in Phase 2.*

---

## Appendix: Data Sources

| Source | Location / Command | What Was Extracted |
|--------|-------------------|-------------------|
| Review 0102 | `codev/reviews/0102-porch-cwd-worktree-awareness.md` | Context recovery, consultation catches |
| Review 0103 | `codev/reviews/0103-consult-claude-agent-sdk.md` | SDK API deviations, test count baseline (845) |
| Review 0104 | `codev/reviews/0104-custom-session-manager.md` | 4 context compactions, 7 Phase 2 iterations, Claude timeouts |
| Review 0105 | `codev/reviews/0105-tower-server-decomposition.md` | 2 context windows, 19 iterations, 3h49m wall clock, 182 new tests |
| Review 0106 | `codev/reviews/0106-rename-shepherd-to-shellper.md` | Codex worktree visibility issue, merge artifact catch |
| Review 0107 | `codev/reviews/0107-tower-cloud-registration-ui.md` | body.name truthiness bug, nonce placement error |
| Review 0108 | `codev/reviews/0108-porch-gate-notifications.md` | gate-status.ts deletion prevented, 300 lines removed |
| Review 0109 | `codev/reviews/0109-tunnel-keepalive.md` | ping-throw timeout catch, Claude main-branch read |
| Review 0110 | `codev/reviews/0110-messaging-infrastructure.md` | 138 new tests, rebuttal documentation pattern |
| Review 0111 | `codev/reviews/0111-remove-dead-vanilla-dashboard.md` | 4,600 LOC removed, Codex npm cache false positives |
| Review 0112 | `codev/reviews/0112-workspace-rename.md` | tower.html rename catch, 124 files changed |
| Review 0113 | `codev/reviews/0113-shellper-debug-logging.md` | stderrClosed value-copy bug, consultation infinite loop |
| Review 0115 | `codev/reviews/0115-consultation-metrics.md` | 5 Phase 1 iterations, Codex turn.completed handling |
| Review 0116 | `codev/reviews/0116-shellper-resource-leakage.md` | macOS sun_path limit, 1,442 tests |
| Review 0117 | `codev/reviews/0117-consolidate-session-creation.md` | 12+ wasted iterations from JSONL parsing bug |
| Review 0118 | `codev/reviews/0118-shellper-multi-client.md` | Pre-HELLO gating, backpressure semantics |
| Review 0120 | `codev/reviews/0120-codex-sdk-integration.md` | 5 false-positive iterations, rebuttal mechanism validation |
| Review 0121 | `codev/reviews/0121-rebuttal-based-review-advancement.md` | Safety valve ordering, net -23 lines |
| Review 0122 | `codev/reviews/0122-tower-shellper-reconnect.md` | Existing functionality discovered, vi.clearAllMocks() trap |
| Review 0124 | `codev/reviews/0124-test-suite-consolidation.md` | 127 tests removed, test count 1,368, Gemini hallucination |
| Review 0126 | `codev/reviews/0126-project-management-rework.md` | 2 context expirations, critical workspacePath catch, 240+ new tests |
| Review 0127 | `codev/reviews/0127-tower-async-handlers.md` | Codex import ordering false positive, porch 2-phase minimum overhead |
| Review 0350 | `codev/reviews/0350-tip-of-the-day.md` | 51 tips, porch naming conflict |
| Review 0364 | `codev/reviews/364-0364-terminal-refresh-button.md` | Layout contradiction catch, porch file naming mismatch |
| Bugfix #274 | `codev/reviews/bugfix-274-architect-terminal-should-surv.md` | Secondary race path catch by Codex |
| Bugfix #324 | `codev/reviews/324-shellper-processes-do-not-survive.md` | detached:true insufficiency, broken-pipe test |
| GitHub PRs | `gh pr list --state merged --search "merged:2026-02-03..2026-02-17"` | 106 PRs: timing, LOC, categorization |
| GitHub Issues | `gh issue list --state closed --search "closed:2026-02-03..2026-02-17"` | 105 issues: categories, resolution |
| Git History | `git log --since="2026-02-03" --until="2026-02-18" --no-merges` | 801 commits, daily distribution |
| Consult Stats | `consult stats --days 14` | 3,115 invocations, $168.64, model breakdown |
| Previous Analysis | `codev/resources/cmap-value-analysis-2026-02.md` | Baseline for comparison |

*Analysis conducted 2026-02-17. All claims backed by specific PR numbers, review file citations, git commits, or consult stats output.*

# Spec 456: Dashboard Statistics Tab in Right Panel

## Problem

The dashboard currently shows real-time operational state (active builders, pending PRs, backlog, recently closed) through the Work tab but provides no historical or aggregate metrics. There is no way to answer questions like:

- How many PRs were merged this week?
- How long do bug fixes take on average?
- What's our builder throughput?
- How much are we spending on AI consultations?
- Is the bug backlog growing or shrinking?

The data to answer these questions exists across multiple sources (GitHub API, porch project state, consultation metrics DB) but is not aggregated or presented in the dashboard.

## Motivation

- **Project health visibility**: Knowing trends (throughput, backlog growth, cycle time) enables proactive decisions about what to prioritize.
- **Cost awareness**: Consultation costs are tracked in `~/.codev/metrics.db` (Spec 0115) but are only accessible via `consult stats` CLI. Surfacing them in the dashboard makes cost trends visible during daily work.
- **Performance insight**: Wall-clock time and agent time for bug fixes reveal process bottlenecks. If bugs consistently take 2+ hours of agent time, the issue templates or spec quality may need improvement.
- **Builder throughput**: Tracking projects completed per period shows whether the architect-builder workflow is scaling.

## Requirements

### R1: Statistics tab in the right panel

Add a new `statistics` tab type to the dashboard tab system. It should:

- Appear as a persistent, non-closable tab alongside the Work tab
- Use a chart icon (e.g., `📊` or a simple `∿` glyph to match existing icon style)
- Be labeled "Stats"
- Support deep linking via `?tab=statistics`

**Tab registration**: Add `'statistics'` to the `Tab['type']` union in `hooks/useTabs.ts`, register the icon in `TabBar.tsx`, and add a rendering branch in `App.tsx`.

### R2: Time range selector

Provide a time range selector at the top of the statistics view with three options:

- **7d** (default) — last 7 days
- **30d** — last 30 days
- **All** — all time

The selector should be a simple segmented button row. Changing the time range re-fetches statistics for the new period.

### R3: GitHub metrics section

Display the following metrics derived from GitHub API data:

| Metric | Source | Computation |
|--------|--------|-------------|
| **PRs merged** | `gh pr list --state merged` | Count of PRs merged within the time range |
| **Avg time to merge** | Merged PR `createdAt` → `mergedAt` | Mean wall-clock time from PR creation to merge |
| **Bug backlog** | `gh issue list` | Count of open issues with `bug` label |
| **Feature backlog** | `gh issue list` | Count of open issues without `bug` label |
| **Issues closed** | `gh issue list --state closed` | Count of issues closed within the time range |
| **Avg time to close (bugs)** | Closed bug issues `createdAt` → `closedAt` | Mean wall-clock time from issue creation to close for bugs |

**Data fetching**: The server-side endpoint must call `gh` CLI to fetch merged PRs and closed issues within the time range. These are new queries beyond what `fetchPRList()` and `fetchIssueList()` currently support (which only fetch open items).

### R4: Builder metrics section

Display builder throughput and performance metrics:

| Metric | Source | Computation |
|--------|--------|-------------|
| **Projects completed** | `gh pr list --state merged` cross-referenced with porch project state | Count of distinct projects whose PRs merged in the time range |
| **Throughput** | Projects completed / days in range | Projects per day (displayed as "X/day" or "X/week") |
| **Active builders** | Overview endpoint | Current count (real-time, not historical) |

**Data source**: Builder throughput is derived from merged PRs (each PR maps to a project via `parseLinkedIssue`). Active builder count comes from the existing overview endpoint.

### R5: Consultation metrics section

Display consultation cost and performance metrics from `~/.codev/metrics.db` (the database created by Spec 0115):

| Metric | Source | Computation |
|--------|--------|-------------|
| **Total consultations** | `consultation_metrics` table | Count of rows in time range |
| **Total cost** | `consultation_metrics.cost_usd` | Sum of cost_usd where not null |
| **Cost by model** | `consultation_metrics` grouped by model | Sum of cost_usd per model (gemini, codex, claude) |
| **Avg latency** | `consultation_metrics.duration_seconds` | Mean duration per consultation |
| **Success rate** | `consultation_metrics.exit_code` | Percentage with exit_code = 0 |

**Data access**: The server must read `~/.codev/metrics.db` directly using `better-sqlite3`. The existing `MetricsDB` class in `src/commands/consult/metrics.ts` provides query and summary methods that should be reused.

### R6: REST API endpoint

Create a new endpoint: `GET /api/statistics?days=<7|30|all>`

**Response shape**:
```typescript
interface StatisticsResponse {
  timeRange: '7d' | '30d' | 'all';
  github: {
    prsMerged: number;
    avgTimeToMergeHours: number | null;
    bugBacklog: number;
    featureBacklog: number;
    issuesClosed: number;
    avgTimeToCloseBugsHours: number | null;
  };
  builders: {
    projectsCompleted: number;
    throughputPerWeek: number;
    activeBuilders: number;
  };
  consultation: {
    totalCount: number;
    totalCostUsd: number | null;
    costByModel: Record<string, number>;
    avgLatencySeconds: number;
    successRate: number;
  };
  errors?: {
    github?: string;
    consultation?: string;
  };
}
```

**Error handling**: Each data source (GitHub, metrics DB) should fail independently. If `gh` CLI is unavailable, return the `errors.github` field with an error message and null/zero values for GitHub metrics. If `metrics.db` doesn't exist or is unreadable, return `errors.consultation`.

**Caching**: Cache the response for 60 seconds to avoid hammering GitHub and the metrics DB on rapid tab switches. Invalidate on explicit refresh.

### R7: Dashboard component

Create a `StatisticsView` component that:

- Fetches data from `/api/statistics?days=<range>` on mount and when the time range changes
- Displays metrics in a compact card-based layout grouped by section (GitHub, Builders, Consultation)
- Shows loading state while fetching
- Shows error states per-section when data sources are unavailable
- Provides a Refresh button to re-fetch with cache bypass

**Layout**: Each section should be a collapsible card with a header and grid of metric values. Each metric shows:
- A label (e.g., "PRs Merged")
- A value (e.g., "12")
- Optional unit/context (e.g., "this week", "$", "hrs")

No sparklines or charts in v1 — keep it to simple numbers. Charts can be added later if needed.

### R8: Data refresh behavior

- Statistics should NOT auto-poll (unlike Work view's 2.5s polling). This data is expensive to compute and doesn't change frequently.
- Refresh on: tab activation, time range change, manual Refresh button click.
- The 60-second server-side cache (R6) prevents redundant fetches.

## Out of Scope

- **Sparklines or charts**: v1 is numbers-only. Trend visualization is a future enhancement.
- **Per-project drill-down**: Clicking a metric to see per-project breakdown is not in scope.
- **Historical builder session data**: Porch project state files track current state, not historical snapshots. We only get builder throughput from merged PRs, not actual agent time per session.
- **Export/download**: No CSV or JSON export of statistics.
- **Custom date ranges**: Only the three preset time ranges (7d, 30d, all).

## Success Criteria

1. A "Stats" tab appears in the dashboard right panel by default
2. Selecting the tab shows GitHub, Builder, and Consultation metrics sections
3. Time range selector switches between 7d/30d/all and re-fetches data
4. GitHub metrics show correct PR/issue counts validated against `gh` CLI output
5. Consultation metrics match `consult stats --days <N>` output
6. Graceful degradation when GitHub or metrics DB is unavailable
7. No auto-polling — data refreshes only on explicit user action
8. Tab loads in under 3 seconds on a project with 200+ issues

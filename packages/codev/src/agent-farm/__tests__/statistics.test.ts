/**
 * Unit tests for the statistics service (Spec 456, Phase 1).
 *
 * Tests computeStatistics() with mocked GitHub CLI and MetricsDB.
 * Tests fetchMergedPRs/fetchClosedIssues via child_process mock.
 *
 * costByProject tests live in consult/__tests__/metrics.test.ts
 * since they test a MetricsDB method directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock child_process for GitHub CLI calls
// ---------------------------------------------------------------------------

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));
vi.mock('node:util', () => ({
  promisify: () => execFileMock,
}));

// ---------------------------------------------------------------------------
// Mock MetricsDB for computeStatistics tests
// ---------------------------------------------------------------------------

const mockSummary = vi.hoisted(() => vi.fn());
const mockCostByProject = vi.hoisted(() => vi.fn());
const mockClose = vi.hoisted(() => vi.fn());

vi.mock('../../commands/consult/metrics.js', () => ({
  MetricsDB: class MockMetricsDB {
    summary = mockSummary;
    costByProject = mockCostByProject;
    close = mockClose;
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

// Re-import after mocking to get mocked versions
let fetchMergedPRs: typeof import('../../lib/github.js').fetchMergedPRs;
let fetchClosedIssues: typeof import('../../lib/github.js').fetchClosedIssues;
let computeStatistics: typeof import('../servers/statistics.js').computeStatistics;
let clearStatisticsCache: typeof import('../servers/statistics.js').clearStatisticsCache;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();

  // Re-mock after resetModules
  vi.mock('node:child_process', () => ({
    execFile: execFileMock,
  }));
  vi.mock('node:util', () => ({
    promisify: () => execFileMock,
  }));
  vi.mock('../../commands/consult/metrics.js', () => ({
    MetricsDB: class MockMetricsDB {
      summary = mockSummary;
      costByProject = mockCostByProject;
      close = mockClose;
    },
  }));

  const github = await import('../../lib/github.js');
  fetchMergedPRs = github.fetchMergedPRs;
  fetchClosedIssues = github.fetchClosedIssues;

  const stats = await import('../servers/statistics.js');
  computeStatistics = stats.computeStatistics;
  clearStatisticsCache = stats.clearStatisticsCache;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockGhOutput(responses: Record<string, string>) {
  execFileMock.mockImplementation((_cmd: string, args: string[]) => {
    const argsStr = args.join(' ');

    // Match PR list --state merged
    if (argsStr.includes('pr') && argsStr.includes('list') && argsStr.includes('merged')) {
      return Promise.resolve({ stdout: responses.mergedPRs ?? '[]' });
    }
    // Match issue list --state closed
    if (argsStr.includes('issue') && argsStr.includes('list') && argsStr.includes('closed')) {
      return Promise.resolve({ stdout: responses.closedIssues ?? '[]' });
    }
    // Match issue list (open)
    if (argsStr.includes('issue') && argsStr.includes('list') && !argsStr.includes('closed')) {
      return Promise.resolve({ stdout: responses.openIssues ?? '[]' });
    }

    return Promise.resolve({ stdout: '[]' });
  });
}

function defaultSummary() {
  return {
    totalCount: 5,
    totalDuration: 500,
    totalCost: 15.00,
    costCount: 5,
    successCount: 4,
    byModel: [
      { model: 'gemini', count: 2, avgDuration: 80, totalCost: 5.00, costCount: 2, successRate: 100, successCount: 2 },
      { model: 'codex', count: 2, avgDuration: 90, totalCost: 6.00, costCount: 2, successRate: 100, successCount: 2 },
      { model: 'claude', count: 1, avgDuration: 180, totalCost: 4.00, costCount: 1, successRate: 0, successCount: 0 },
    ],
    byType: [
      { reviewType: 'spec', count: 2, avgDuration: 70, totalCost: 3.00, costCount: 2 },
      { reviewType: 'pr', count: 3, avgDuration: 120, totalCost: 12.00, costCount: 3 },
    ],
    byProtocol: [
      { protocol: 'spir', count: 3, totalCost: 10.00, costCount: 3 },
      { protocol: 'tick', count: 2, totalCost: 5.00, costCount: 2 },
    ],
  };
}

function defaultCostByProject() {
  return [
    { projectId: '42', totalCost: 8.50 },
    { projectId: '73', totalCost: 6.50 },
  ];
}

// ---------------------------------------------------------------------------
// fetchMergedPRs
// ---------------------------------------------------------------------------

describe('fetchMergedPRs', () => {
  it('returns parsed merged PRs from gh CLI', async () => {
    const prs = [
      { number: 1, title: 'PR 1', createdAt: '2026-02-10T00:00:00Z', mergedAt: '2026-02-11T00:00:00Z', body: 'Fixes #42' },
    ];
    execFileMock.mockResolvedValueOnce({ stdout: JSON.stringify(prs) });

    const result = await fetchMergedPRs('2026-02-10', '/tmp');
    expect(result).toEqual(prs);
  });

  it('includes --search merged:>=DATE when since is provided', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '[]' });

    await fetchMergedPRs('2026-02-14', '/tmp');

    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--search', 'merged:>=2026-02-14']),
      expect.objectContaining({ cwd: '/tmp' }),
    );
  });

  it('omits --search when since is null', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '[]' });

    await fetchMergedPRs(null, '/tmp');

    const args = execFileMock.mock.calls[0][1] as string[];
    expect(args).not.toContain('--search');
  });

  it('returns null on failure', async () => {
    execFileMock.mockRejectedValueOnce(new Error('gh not found'));

    const result = await fetchMergedPRs('2026-02-14', '/tmp');
    expect(result).toBeNull();
  });

  it('passes --limit 1000', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '[]' });

    await fetchMergedPRs('2026-02-14', '/tmp');

    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--limit', '1000']),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// fetchClosedIssues
// ---------------------------------------------------------------------------

describe('fetchClosedIssues', () => {
  it('returns parsed closed issues from gh CLI', async () => {
    const issues = [
      { number: 42, title: 'Bug', createdAt: '2026-02-10T00:00:00Z', closedAt: '2026-02-11T00:00:00Z', labels: [{ name: 'bug' }] },
    ];
    execFileMock.mockResolvedValueOnce({ stdout: JSON.stringify(issues) });

    const result = await fetchClosedIssues('2026-02-10', '/tmp');
    expect(result).toEqual(issues);
  });

  it('includes --search closed:>=DATE when since is provided', async () => {
    execFileMock.mockResolvedValueOnce({ stdout: '[]' });

    await fetchClosedIssues('2026-02-14', '/tmp');

    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--search', 'closed:>=2026-02-14']),
      expect.objectContaining({ cwd: '/tmp' }),
    );
  });

  it('returns null on failure', async () => {
    execFileMock.mockRejectedValueOnce(new Error('gh not found'));

    const result = await fetchClosedIssues('2026-02-14', '/tmp');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeStatistics
// ---------------------------------------------------------------------------

describe('computeStatistics', () => {
  beforeEach(() => {
    clearStatisticsCache();
    mockSummary.mockReturnValue(defaultSummary());
    mockCostByProject.mockReturnValue(defaultCostByProject());
  });

  it('assembles full statistics from all data sources', async () => {
    const mergedPRs = [
      { number: 1, title: '[Spec 42] Feature', createdAt: '2026-02-10T00:00:00Z', mergedAt: '2026-02-11T12:00:00Z', body: 'Closes #42' },
      { number: 2, title: '[Spec 73] Other', createdAt: '2026-02-12T00:00:00Z', mergedAt: '2026-02-13T00:00:00Z', body: '' },
    ];
    const closedIssues = [
      { number: 42, title: 'Bug fix', createdAt: '2026-02-08T00:00:00Z', closedAt: '2026-02-11T12:00:00Z', labels: [{ name: 'bug' }] },
      { number: 50, title: 'Feature', createdAt: '2026-02-09T00:00:00Z', closedAt: '2026-02-12T00:00:00Z', labels: [] },
    ];
    const openIssues = [
      { number: 100, title: 'Open bug', url: '', labels: [{ name: 'bug' }], createdAt: '2026-02-01T00:00:00Z' },
      { number: 101, title: 'Open feature', url: '', labels: [], createdAt: '2026-02-02T00:00:00Z' },
      { number: 102, title: 'Another feature', url: '', labels: [], createdAt: '2026-02-03T00:00:00Z' },
    ];

    mockGhOutput({
      mergedPRs: JSON.stringify(mergedPRs),
      closedIssues: JSON.stringify(closedIssues),
      openIssues: JSON.stringify(openIssues),
    });

    const result = await computeStatistics('/tmp/workspace', '7', 3);

    expect(result.timeRange).toBe('7d');

    // GitHub metrics
    expect(result.github.prsMerged).toBe(2);
    expect(result.github.avgTimeToMergeHours).toBeCloseTo(30); // (36+24)/2
    expect(result.github.bugBacklog).toBe(1);
    expect(result.github.nonBugBacklog).toBe(2);
    expect(result.github.issuesClosed).toBe(2);
    expect(result.github.avgTimeToCloseBugsHours).toBeCloseTo(84); // 3.5 days

    // Builder metrics
    expect(result.builders.projectsCompleted).toBe(2); // #42 from body, #73 from title
    expect(result.builders.activeBuilders).toBe(3);

    // Consultation metrics (from mock)
    expect(result.consultation.totalCount).toBe(5);
    expect(result.consultation.totalCostUsd).toBe(15.00);
    expect(result.consultation.costByModel).toEqual({ gemini: 5.00, codex: 6.00, claude: 4.00 });
    expect(result.consultation.avgLatencySeconds).toBeCloseTo(100); // 500/5
    expect(result.consultation.successRate).toBeCloseTo(80); // 4/5
    expect(result.consultation.byModel).toHaveLength(3);
    expect(result.consultation.byReviewType).toEqual({ spec: 2, pr: 3 });
    expect(result.consultation.byProtocol).toEqual({ spir: 3, tick: 2 });
    expect(result.consultation.costByProject).toEqual(defaultCostByProject());

    expect(result.errors).toBeUndefined();
  });

  it('returns GitHub error + defaults when gh CLI fails', async () => {
    execFileMock.mockRejectedValue(new Error('gh not found'));

    const result = await computeStatistics('/tmp/workspace', '7', 0);

    expect(result.errors?.github).toBeDefined();
    expect(result.github.prsMerged).toBe(0);
    expect(result.github.avgTimeToMergeHours).toBeNull();
    expect(result.github.bugBacklog).toBe(0);
    expect(result.github.nonBugBacklog).toBe(0);
    expect(result.github.issuesClosed).toBe(0);
    expect(result.github.avgTimeToCloseBugsHours).toBeNull();
    expect(result.builders.projectsCompleted).toBe(0);
    expect(result.builders.throughputPerWeek).toBe(0);
    // Active builders still works (passed in directly)
    expect(result.builders.activeBuilders).toBe(0);

    // Consultation should still work
    expect(result.consultation.totalCount).toBe(5);
    expect(result.errors?.consultation).toBeUndefined();
  });

  it('returns consultation error + defaults when MetricsDB fails', async () => {
    mockGhOutput({ mergedPRs: '[]', closedIssues: '[]', openIssues: '[]' });
    mockSummary.mockImplementation(() => { throw new Error('DB file not found'); });

    const result = await computeStatistics('/tmp/workspace', '7', 0);

    expect(result.errors?.consultation).toBe('DB file not found');
    expect(result.consultation.totalCount).toBe(0);
    expect(result.consultation.totalCostUsd).toBeNull();
    expect(result.consultation.costByModel).toEqual({});
    expect(result.consultation.avgLatencySeconds).toBeNull();
    expect(result.consultation.successRate).toBeNull();
    expect(result.consultation.byModel).toEqual([]);
    expect(result.consultation.byReviewType).toEqual({});
    expect(result.consultation.byProtocol).toEqual({});
    expect(result.consultation.costByProject).toEqual([]);

    // GitHub should still work
    expect(result.github.prsMerged).toBe(0);
    expect(result.errors?.github).toBeUndefined();
  });

  it('returns null averages when no items exist', async () => {
    mockGhOutput({ mergedPRs: '[]', closedIssues: '[]', openIssues: '[]' });
    mockSummary.mockReturnValue({
      totalCount: 0,
      totalDuration: 0,
      totalCost: null,
      costCount: 0,
      successCount: 0,
      byModel: [],
      byType: [],
      byProtocol: [],
    });
    mockCostByProject.mockReturnValue([]);

    const result = await computeStatistics('/tmp/workspace', '7', 0);

    expect(result.github.avgTimeToMergeHours).toBeNull();
    expect(result.github.avgTimeToCloseBugsHours).toBeNull();
    expect(result.consultation.avgLatencySeconds).toBeNull();
    expect(result.consultation.successRate).toBeNull();
  });

  it('excludes PRs without linked issues from projectsCompleted', async () => {
    const mergedPRs = [
      { number: 1, title: 'No link', createdAt: '2026-02-10T00:00:00Z', mergedAt: '2026-02-11T00:00:00Z', body: 'No issue ref' },
      { number: 2, title: '[Spec 42] Feature', createdAt: '2026-02-10T00:00:00Z', mergedAt: '2026-02-11T00:00:00Z', body: '' },
    ];
    mockGhOutput({ mergedPRs: JSON.stringify(mergedPRs), closedIssues: '[]', openIssues: '[]' });

    const result = await computeStatistics('/tmp/workspace', '7', 0);
    expect(result.builders.projectsCompleted).toBe(1); // Only #42
  });

  it('counts distinct issues when multiple PRs link to same issue', async () => {
    const mergedPRs = [
      { number: 1, title: '[Spec 42] Part 1', createdAt: '2026-02-10T00:00:00Z', mergedAt: '2026-02-11T00:00:00Z', body: 'Fixes #42' },
      { number: 2, title: '[Spec 42] Part 2', createdAt: '2026-02-10T00:00:00Z', mergedAt: '2026-02-11T00:00:00Z', body: 'Closes #42' },
    ];
    mockGhOutput({ mergedPRs: JSON.stringify(mergedPRs), closedIssues: '[]', openIssues: '[]' });

    const result = await computeStatistics('/tmp/workspace', '7', 0);
    expect(result.builders.projectsCompleted).toBe(1); // Same issue #42
  });

  it('only counts bug-labeled issues for avgTimeToCloseBugsHours', async () => {
    const closedIssues = [
      { number: 1, title: 'Bug', createdAt: '2026-02-10T00:00:00Z', closedAt: '2026-02-11T00:00:00Z', labels: [{ name: 'bug' }] },
      { number: 2, title: 'Feature', createdAt: '2026-02-10T00:00:00Z', closedAt: '2026-02-15T00:00:00Z', labels: [{ name: 'enhancement' }] },
    ];
    mockGhOutput({ mergedPRs: '[]', closedIssues: JSON.stringify(closedIssues), openIssues: '[]' });

    const result = await computeStatistics('/tmp/workspace', '7', 0);
    // Only bug #1: 24 hours (not averaged with feature #2)
    expect(result.github.avgTimeToCloseBugsHours).toBeCloseTo(24);
  });

  it('derives costByModel from summary.byModel', async () => {
    mockGhOutput({ mergedPRs: '[]', closedIssues: '[]', openIssues: '[]' });
    mockSummary.mockReturnValue({
      ...defaultSummary(),
      byModel: [
        { model: 'gemini', count: 1, avgDuration: 60, totalCost: null, costCount: 0, successRate: 100, successCount: 1 },
        { model: 'codex', count: 1, avgDuration: 80, totalCost: 3.50, costCount: 1, successRate: 100, successCount: 1 },
      ],
    });

    const result = await computeStatistics('/tmp/workspace', '7', 0);
    // gemini has null cost → excluded from costByModel
    expect(result.consultation.costByModel).toEqual({ codex: 3.50 });
  });

  it('uses "all" time range correctly', async () => {
    mockGhOutput({ mergedPRs: '[]', closedIssues: '[]', openIssues: '[]' });

    const result = await computeStatistics('/tmp/workspace', 'all', 0);
    expect(result.timeRange).toBe('all');
  });

  it('uses "30d" time range correctly', async () => {
    mockGhOutput({ mergedPRs: '[]', closedIssues: '[]', openIssues: '[]' });

    const result = await computeStatistics('/tmp/workspace', '30', 0);
    expect(result.timeRange).toBe('30d');
  });

  it('passes null since date for "all" range to GitHub', async () => {
    mockGhOutput({ mergedPRs: '[]', closedIssues: '[]', openIssues: '[]' });

    await computeStatistics('/tmp/workspace', 'all', 0);

    // Check that gh was called without --search qualifier
    const calls = execFileMock.mock.calls;
    const prCall = calls.find((c: unknown[]) => (c[1] as string[]).includes('merged'));
    expect(prCall).toBeDefined();
    const prArgs = prCall![1] as string[];
    expect(prArgs).not.toContain('--search');
  });

  // --- Caching ---

  it('returns cached result on second call within TTL', async () => {
    mockGhOutput({ mergedPRs: '[]', closedIssues: '[]', openIssues: '[]' });

    const result1 = await computeStatistics('/tmp/workspace', '7', 3);
    const result2 = await computeStatistics('/tmp/workspace', '7', 3);

    expect(result1).toBe(result2); // Same reference = from cache
    // GitHub functions called only once
    const prCalls = execFileMock.mock.calls.filter(
      (c: unknown[]) => (c[1] as string[]).includes('merged'),
    );
    expect(prCalls).toHaveLength(1);
  });

  it('bypasses cache when refresh=true', async () => {
    mockGhOutput({ mergedPRs: '[]', closedIssues: '[]', openIssues: '[]' });

    await computeStatistics('/tmp/workspace', '7', 3);
    await computeStatistics('/tmp/workspace', '7', 3, true);

    const prCalls = execFileMock.mock.calls.filter(
      (c: unknown[]) => (c[1] as string[]).includes('merged'),
    );
    expect(prCalls).toHaveLength(2);
  });

  it('does not share cache between different ranges', async () => {
    mockGhOutput({ mergedPRs: '[]', closedIssues: '[]', openIssues: '[]' });

    await computeStatistics('/tmp/workspace', '7', 3);
    await computeStatistics('/tmp/workspace', '30', 3);

    const prCalls = execFileMock.mock.calls.filter(
      (c: unknown[]) => (c[1] as string[]).includes('merged'),
    );
    expect(prCalls).toHaveLength(2);
  });

  // --- Throughput ---

  it('computes throughput for 30d range', async () => {
    const mergedPRs = [
      { number: 1, title: 'PR', createdAt: '2026-02-01T00:00:00Z', mergedAt: '2026-02-02T00:00:00Z', body: 'Fixes #10' },
      { number: 2, title: 'PR', createdAt: '2026-02-01T00:00:00Z', mergedAt: '2026-02-02T00:00:00Z', body: 'Fixes #20' },
      { number: 3, title: 'PR', createdAt: '2026-02-01T00:00:00Z', mergedAt: '2026-02-02T00:00:00Z', body: 'Fixes #30' },
      { number: 4, title: 'PR', createdAt: '2026-02-01T00:00:00Z', mergedAt: '2026-02-02T00:00:00Z', body: 'Fixes #40' },
    ];
    mockGhOutput({ mergedPRs: JSON.stringify(mergedPRs), closedIssues: '[]', openIssues: '[]' });

    const result = await computeStatistics('/tmp/workspace', '30', 0);
    // 4 projects / (30/7 weeks) ≈ 0.9
    const expected = Math.round((4 / (30 / 7)) * 10) / 10;
    expect(result.builders.throughputPerWeek).toBeCloseTo(expected, 1);
  });

  it('computes throughput for 7d range (equals projectsCompleted)', async () => {
    const mergedPRs = [
      { number: 1, title: 'PR', createdAt: '2026-02-01T00:00:00Z', mergedAt: '2026-02-02T00:00:00Z', body: 'Fixes #10' },
      { number: 2, title: 'PR', createdAt: '2026-02-01T00:00:00Z', mergedAt: '2026-02-02T00:00:00Z', body: 'Fixes #20' },
    ];
    mockGhOutput({ mergedPRs: JSON.stringify(mergedPRs), closedIssues: '[]', openIssues: '[]' });

    const result = await computeStatistics('/tmp/workspace', '7', 0);
    // 7d = 1 week, so throughput = projectsCompleted
    expect(result.builders.throughputPerWeek).toBe(2);
  });
});

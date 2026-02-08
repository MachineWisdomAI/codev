/**
 * Tests for buildWithTimeout in claude.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BuildResult } from '../claude.js';

// Mock the Agent SDK before importing claude.ts
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock fs to avoid real file I/O
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

describe('buildWithTimeout', () => {
  let buildWithTimeout: typeof import('../claude.js').buildWithTimeout;

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();

    // Re-mock after resetModules
    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      query: vi.fn(),
    }));
    vi.doMock('node:fs', () => ({
      writeFileSync: vi.fn(),
      appendFileSync: vi.fn(),
    }));

    const claude = await import('../claude.js');
    buildWithTimeout = claude.buildWithTimeout;
  });

  it('returns timeout result when build exceeds deadline', async () => {
    // Mock query to return an async iterator that never resolves
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    (query as ReturnType<typeof vi.fn>).mockReturnValue({
      async *[Symbol.asyncIterator]() {
        // Hang forever
        await new Promise(() => {});
      },
    });

    const result = await buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', 100);

    expect(result.success).toBe(false);
    expect(result.output).toContain('[TIMEOUT]');
    expect(result.duration).toBe(100);
  });

  it('returns normal result before deadline', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    (query as ReturnType<typeof vi.fn>).mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Done!',
          total_cost_usd: 0.05,
          duration_ms: 500,
        };
      },
    });

    const result = await buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', 5000);

    expect(result.success).toBe(true);
    expect(result.output).toContain('Done!');
    expect(result.cost).toBe(0.05);
    expect(result.duration).toBe(500);
  });

  it('returns failure result on SDK exception without throwing', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    (query as ReturnType<typeof vi.fn>).mockReturnValue({
      async *[Symbol.asyncIterator]() {
        throw new Error('SDK connection failed');
      },
    });

    const result = await buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', 5000);

    expect(result.success).toBe(false);
    expect(result.output).toContain('SDK connection failed');
  });

  it('clears timeout timer after successful build', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    (query as ReturnType<typeof vi.fn>).mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'OK',
          total_cost_usd: 0.01,
          duration_ms: 100,
        };
      },
    });

    // If timer isn't cleared, this test would hang or produce unexpected results
    const result = await buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', 50);

    expect(result.success).toBe(true);
  });

  it('captures assistant text blocks in output', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    (query as ReturnType<typeof vi.fn>).mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Step 1 complete' },
              { type: 'text', text: 'Step 2 complete' },
            ],
          },
        };
        yield {
          type: 'result',
          subtype: 'success',
          result: '',
          total_cost_usd: 0.02,
          duration_ms: 200,
        };
      },
    });

    const result = await buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', 5000);

    expect(result.success).toBe(true);
    expect(result.output).toContain('Step 1 complete');
    expect(result.output).toContain('Step 2 complete');
  });

  it('captures tool_use blocks in output', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    (query as ReturnType<typeof vi.fn>).mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
            ],
          },
        };
        yield {
          type: 'result',
          subtype: 'success',
          result: '',
          total_cost_usd: 0.01,
          duration_ms: 100,
        };
      },
    });

    const result = await buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', 5000);

    expect(result.output).toContain('[tool: Bash]');
  });

  it('handles error result subtype from SDK', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    (query as ReturnType<typeof vi.fn>).mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'error',
          duration_ms: 300,
        };
      },
    });

    const result = await buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', 5000);

    expect(result.success).toBe(false);
    expect(result.output).toContain('Agent SDK error');
    expect(result.duration).toBe(300);
  });
});

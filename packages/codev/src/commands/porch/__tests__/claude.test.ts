/**
 * Tests for claude.ts buildWithTimeout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Agent SDK before importing the module under test
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock fs to avoid real file I/O from buildWithSDK internals
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  };
});

import { buildWithTimeout } from '../claude.js';

// Helper to get the mocked query function
async function getMockedQuery() {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  return sdk.query as ReturnType<typeof vi.fn>;
}

describe('buildWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return successful result when build completes before timeout', async () => {
    const mockQuery = await getMockedQuery();

    // Simulate an async iterator that yields a success result
    async function* successStream() {
      yield {
        type: 'result',
        subtype: 'success',
        result: 'Build done',
        total_cost_usd: 0.05,
        duration_ms: 3000,
      };
    }
    mockQuery.mockReturnValue(successStream());

    const resultPromise = buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', 60000);
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.output).toContain('Build done');
    expect(result.cost).toBe(0.05);
    expect(result.duration).toBe(3000);
  });

  it('should return timeout result when build exceeds deadline', async () => {
    const mockQuery = await getMockedQuery();

    // Simulate an async iterator that never resolves
    async function* hangingStream() {
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Starting...' }] } };
      await new Promise(() => {});
    }
    mockQuery.mockReturnValue(hangingStream());

    const resultPromise = buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', 5000);
    await vi.advanceTimersByTimeAsync(5001);
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.output).toContain('[TIMEOUT]');
    expect(result.duration).toBe(5000);
  });

  it('should return failure result when SDK reports error', async () => {
    const mockQuery = await getMockedQuery();

    async function* errorStream() {
      yield {
        type: 'result',
        subtype: 'error',
        duration_ms: 1000,
      };
    }
    mockQuery.mockReturnValue(errorStream());

    const resultPromise = buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', 60000);
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result.success).toBe(false);
  });

  it('should clear timeout when build completes before deadline', async () => {
    const mockQuery = await getMockedQuery();

    async function* fastStream() {
      yield {
        type: 'result',
        subtype: 'success',
        result: 'Done fast',
        total_cost_usd: 0.01,
        duration_ms: 100,
      };
    }
    mockQuery.mockReturnValue(fastStream());

    const clearSpy = vi.spyOn(global, 'clearTimeout');
    const resultPromise = buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', 60000);
    await vi.advanceTimersByTimeAsync(0);
    await resultPromise;

    expect(clearSpy).toHaveBeenCalled();
  });

  it('should handle SDK exception without throwing', async () => {
    const mockQuery = await getMockedQuery();

    async function* throwingStream(): AsyncGenerator<any> {
      throw new Error('SDK connection failed');
    }
    mockQuery.mockReturnValue(throwingStream());

    const resultPromise = buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', 60000);
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.output).toContain('SDK exception');
  });

  it('should use the provided timeoutMs value', async () => {
    const mockQuery = await getMockedQuery();

    async function* hangingStream() {
      await new Promise(() => {});
    }
    mockQuery.mockReturnValue(hangingStream());

    const customTimeout = 2000;
    const resultPromise = buildWithTimeout('test prompt', '/tmp/out.txt', '/tmp', customTimeout);

    await vi.advanceTimersByTimeAsync(1999);
    // Should not have resolved yet - advance past timeout
    await vi.advanceTimersByTimeAsync(2);
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.output).toContain('[TIMEOUT]');
    expect(result.duration).toBe(customTimeout);
  });
});

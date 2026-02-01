/**
 * Tests for buildWithTimeout — timeout-specific behavior
 *
 * Core buildWithSDK tests live in claude.test.ts.
 * This file focuses on the timeout wrapper logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

// Mock the Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

import { buildWithTimeout } from '../claude.js';

describe('buildWithTimeout - timeout behavior', () => {
  let testDir: string;
  let outputPath: string;

  beforeEach(() => {
    testDir = path.join(tmpdir(), `porch-timeout-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    outputPath = path.join(testDir, 'output.txt');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should return timeout result when build hangs past deadline', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    (query as ReturnType<typeof vi.fn>).mockReturnValue(
      (async function* () {
        await new Promise(() => {}); // Never resolves
      })()
    );

    const result = await buildWithTimeout('prompt', outputPath, testDir, 100);

    expect(result.success).toBe(false);
    expect(result.output).toContain('[TIMEOUT]');
    expect(result.duration).toBe(100);
  });

  it('should clear timeout timer when build completes before deadline', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    (query as ReturnType<typeof vi.fn>).mockReturnValue(
      (async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Quick',
          total_cost_usd: 0.01,
          duration_ms: 10,
        };
      })()
    );

    const result = await buildWithTimeout('prompt', outputPath, testDir, 5000);

    expect(result.success).toBe(true);
    expect(result.output).toContain('Quick');
    expect(result.output).not.toContain('[TIMEOUT]');
  });

  it('should not throw on timeout — returns failure result instead', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    (query as ReturnType<typeof vi.fn>).mockReturnValue(
      (async function* () {
        await new Promise(() => {}); // Hang forever
      })()
    );

    const result = await buildWithTimeout('prompt', outputPath, testDir, 50);

    expect(result.success).toBe(false);
    expect(result.output).toContain('[TIMEOUT]');
  });

  it('should use the provided timeoutMs value for deadline', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    (query as ReturnType<typeof vi.fn>).mockReturnValue(
      (async function* () {
        await new Promise(() => {}); // Hang
      })()
    );

    const start = Date.now();
    const result = await buildWithTimeout('prompt', outputPath, testDir, 200);
    const elapsed = Date.now() - start;

    expect(result.success).toBe(false);
    expect(result.duration).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(1000);
  });
});

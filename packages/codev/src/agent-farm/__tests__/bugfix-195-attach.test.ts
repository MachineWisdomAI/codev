/**
 * Regression tests for Bugfix #195 - attach command with PTY-backed builders
 *
 * Tests that af attach properly handles port=0/pid=0 builders (PTY-backed).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Builder } from '../types.js';

// Module-level mock state (must be outside describe for vi.mock hoisting)
const mockBuilders: Builder[] = [];

vi.mock('../state.js', () => ({
  loadState: () => ({ builders: mockBuilders, architect: null, utils: [], annotations: [] }),
  getBuilder: (id: string) => mockBuilders.find(b => b.id === id) ?? null,
  getBuilders: () => mockBuilders,
}));

const mockIsProcessRunning = vi.fn().mockResolvedValue(true);
const mockRun = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
vi.mock('../utils/shell.js', () => ({
  run: (...args: any[]) => mockRun(...args),
  isProcessRunning: (...args: any[]) => mockIsProcessRunning(...args),
  openBrowser: vi.fn().mockResolvedValue(undefined),
}));

const mockFatal = vi.fn((msg: string) => { throw new Error(msg || 'Fatal error'); });
vi.mock('../utils/logger.js', () => ({
  logger: {
    header: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    kv: vi.fn(),
    row: vi.fn(),
    blank: vi.fn(),
    debug: vi.fn(),
  },
  fatal: (...args: any[]) => mockFatal(...args),
}));

describe('Bugfix #195: attach command handles PTY-backed builders', () => {
  beforeEach(() => {
    mockBuilders.length = 0;
    vi.clearAllMocks();
    mockRun.mockResolvedValue({ stdout: '', stderr: '' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should display PTY-backed builders (port=0) with dash instead of 0', async () => {
    mockBuilders.push({
      id: 'task-AAAA',
      name: 'Task: First builder',
      port: 0,
      pid: 0,
      status: 'implementing',
      phase: 'init',
      worktree: '/tmp/1',
      branch: 'builder/task-AAAA',
      tmuxSession: 'builder-proj-task-AAAA',
      type: 'task',
      terminalId: 'term-001',
    });

    const { attach } = await import('../commands/attach.js');
    const { logger } = await import('../utils/logger.js');

    await attach({});

    // Should show builder list with '-' for port instead of '0'
    expect(logger.row).toHaveBeenCalledWith(
      expect.arrayContaining(['-']),
      expect.any(Array),
    );
  });

  it('should not call isProcessRunning when pid=0', async () => {
    mockBuilders.push({
      id: 'task-AAAA',
      name: 'Task: Test',
      port: 0,
      pid: 0,
      status: 'implementing',
      phase: 'init',
      worktree: '/tmp/1',
      branch: 'builder/task-AAAA',
      tmuxSession: 'builder-proj-task-AAAA',
      type: 'task',
      terminalId: 'term-001',
    });

    const { attach } = await import('../commands/attach.js');

    // Attach to tmux session — will throw when trying execSync in test
    await attach({ project: 'task-AAAA' }).catch(() => {});

    // isProcessRunning should NOT have been called with pid=0
    expect(mockIsProcessRunning).not.toHaveBeenCalledWith(0);
  });

  it('should error when trying --browser with port=0 builder', async () => {
    mockBuilders.push({
      id: 'task-AAAA',
      name: 'Task: Test',
      port: 0,
      pid: 0,
      status: 'implementing',
      phase: 'init',
      worktree: '/tmp/1',
      branch: 'builder/task-AAAA',
      tmuxSession: 'builder-proj-task-AAAA',
      type: 'task',
      terminalId: 'term-001',
    });

    const { attach } = await import('../commands/attach.js');

    await expect(attach({ project: 'task-AAAA', browser: true })).rejects.toThrow();
    expect(mockFatal).toHaveBeenCalledWith(expect.stringContaining('no direct port'));
  });

  it('should attach via tmux for PTY-backed builders', async () => {
    mockBuilders.push({
      id: 'task-BBBB',
      name: 'Task: Test',
      port: 0,
      pid: 0,
      status: 'implementing',
      phase: 'init',
      worktree: '/tmp/1',
      branch: 'builder/task-BBBB',
      tmuxSession: 'builder-proj-task-BBBB',
      type: 'task',
    });

    mockRun.mockResolvedValue({ stdout: '', stderr: '' });

    const { attach } = await import('../commands/attach.js');
    const { logger } = await import('../utils/logger.js');

    // This will try to execSync tmux attach, which will throw in test env
    try {
      await attach({ project: 'task-BBBB' });
    } catch {
      // execSync will fail in test — that's expected
    }

    // Should have logged the attach message
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Attaching to builder task-BBBB'));
  });

  it('should show Tower dashboard message when tmux session not found and port=0', async () => {
    mockBuilders.push({
      id: 'task-CCCC',
      name: 'Task: Test',
      port: 0,
      pid: 0,
      status: 'implementing',
      phase: 'init',
      worktree: '/tmp/1',
      branch: 'builder/task-CCCC',
      tmuxSession: 'builder-proj-task-CCCC',
      type: 'task',
    });

    // tmux has-session fails
    mockRun.mockRejectedValue(new Error('session not found'));

    const { attach } = await import('../commands/attach.js');
    const { logger } = await import('../utils/logger.js');

    await expect(attach({ project: 'task-CCCC' })).rejects.toThrow();

    // Should show Tower dashboard message, not http://localhost:0
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Tower dashboard'));
  });
});

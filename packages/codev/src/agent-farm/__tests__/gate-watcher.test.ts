/**
 * Tests for GateWatcher (Spec 0100)
 *
 * Tests gate transition detection, dedup logic, sanitization,
 * and af send failure handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GateWatcher } from '../utils/gate-watcher.js';
import type { GateStatus } from '../utils/gate-status.js';

// Mock child_process.execFile
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: object, cb: (err: Error | null) => void) => {
    cb(null);
  }),
  spawn: vi.fn(),
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

import { execFile } from 'node:child_process';

const mockExecFile = vi.mocked(execFile);
const mockLog = vi.fn();

describe('GateWatcher', () => {
  let watcher: GateWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    watcher = new GateWatcher(mockLog, '/fake/bin/af.js');
  });

  it('sends notification on new gate', async () => {
    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0100',
      requestedAt: '2026-02-12T18:00:00.000Z',
    };

    await watcher.checkAndNotify(gateStatus, '/projects/test');

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const args = mockExecFile.mock.calls[0];
    expect(args[1]).toContain('send');
    expect(args[1]).toContain('architect');
    // Message should include gate info
    const message = args[1]![3];
    expect(message).toContain('GATE: spec-approval');
    expect(message).toContain('Builder 0100');
    expect(message).toContain('porch approve 0100 spec-approval');
  });

  it('deduplicates: same gate on consecutive calls triggers only 1 notification', async () => {
    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0100',
    };

    await watcher.checkAndNotify(gateStatus, '/projects/test');
    await watcher.checkAndNotify(gateStatus, '/projects/test');
    await watcher.checkAndNotify(gateStatus, '/projects/test');

    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('different builders with same gate type trigger separate notifications', async () => {
    const gate1: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0100',
    };

    const gate2: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0101',
    };

    await watcher.checkAndNotify(gate1, '/projects/project-a');
    await watcher.checkAndNotify(gate2, '/projects/project-b');

    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });

  it('gate cleared then re-appeared triggers new notification', async () => {
    const pending: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0100',
    };

    const cleared: GateStatus = { hasGate: false };

    // First appearance
    await watcher.checkAndNotify(pending, '/projects/test');
    expect(mockExecFile).toHaveBeenCalledTimes(1);

    // Cleared
    await watcher.checkAndNotify(cleared, '/projects/test');

    // Re-appeared
    await watcher.checkAndNotify(pending, '/projects/test');
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });

  it('gate transition from one gate to another triggers new notification', async () => {
    const specGate: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0100',
    };

    const planGate: GateStatus = {
      hasGate: true,
      gateName: 'plan-approval',
      builderId: '0100',
    };

    await watcher.checkAndNotify(specGate, '/projects/test');
    await watcher.checkAndNotify(planGate, '/projects/test');

    expect(mockExecFile).toHaveBeenCalledTimes(2);
    const secondMessage = mockExecFile.mock.calls[1][1]![3];
    expect(secondMessage).toContain('plan-approval');
  });

  it('sanitization rejects semicolons and logs warning', async () => {
    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: 'spec;rm -rf /',
      builderId: '0100',
    };

    await watcher.checkAndNotify(gateStatus, '/projects/test');

    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(
      'WARN',
      expect.stringContaining('skipping af send')
    );
  });

  it('sanitization rejects newlines and logs warning', async () => {
    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: 'spec\napproval',
      builderId: '0100',
    };

    await watcher.checkAndNotify(gateStatus, '/projects/test');

    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(
      'WARN',
      expect.stringContaining('skipping af send')
    );
  });

  it('sanitization strips ANSI escape sequences', async () => {
    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: '\x1B[31mspec-approval\x1B[0m',
      builderId: '0100',
    };

    await watcher.checkAndNotify(gateStatus, '/projects/test');

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const message = mockExecFile.mock.calls[0][1]![3];
    expect(message).toContain('spec-approval');
    expect(message).not.toContain('\x1B');
  });

  it('af send failure is logged at warn and swallowed', async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(new Error('tmux not available'));
        return undefined as any;
      }
    );

    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0100',
    };

    // Should not throw
    await watcher.checkAndNotify(gateStatus, '/projects/test');

    expect(mockLog).toHaveBeenCalledWith(
      'WARN',
      expect.stringContaining('af send failed')
    );
  });

  it('does nothing when hasGate is false', async () => {
    const gateStatus: GateStatus = { hasGate: false };

    await watcher.checkAndNotify(gateStatus, '/projects/test');

    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('does nothing when builderId or gateName is missing', async () => {
    const gateStatus: GateStatus = {
      hasGate: true,
      // Missing builderId and gateName
    };

    await watcher.checkAndNotify(gateStatus, '/projects/test');

    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('reset clears all tracked state', async () => {
    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0100',
    };

    await watcher.checkAndNotify(gateStatus, '/projects/test');
    expect(mockExecFile).toHaveBeenCalledTimes(1);

    watcher.reset();

    // Same gate after reset should trigger again
    await watcher.checkAndNotify(gateStatus, '/projects/test');
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });

  it('uses --raw and --no-enter flags in af send call', async () => {
    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0100',
    };

    await watcher.checkAndNotify(gateStatus, '/projects/test');

    const args = mockExecFile.mock.calls[0][1]!;
    expect(args).toContain('--raw');
    expect(args).toContain('--no-enter');
  });
});

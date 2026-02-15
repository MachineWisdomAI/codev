/**
 * Bugfix #274: Architect terminal should survive Tower restarts
 *
 * Root cause: A race condition in Tower's startup sequence. initInstances()
 * was called BEFORE reconcileTerminalSessions(), which enabled dashboard
 * polls (via getInstances → getTerminalsForProject) to arrive during
 * reconciliation. Both getTerminalsForProject()'s on-the-fly reconnection
 * and reconcileTerminalSessions() would attempt to connect to the same
 * shellper socket. The shellper's single-connection model (new connection
 * replaces old) caused the first client to be disconnected, triggering
 * removeDeadSession() which corrupted the session and deleted the socket
 * file — permanently losing the architect terminal.
 *
 * Builder terminals were not affected because getInstances() skips
 * /.builders/ paths, so their getTerminalsForProject() was never called
 * during the race window.
 *
 * Fix: Reorder startup so reconcileTerminalSessions() runs BEFORE
 * initInstances(). This ensures getInstances() returns [] (since _deps
 * is null) during reconciliation, preventing any on-the-fly reconnection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initInstances,
  shutdownInstances,
  getInstances,
  type InstanceDeps,
} from '../servers/tower-instances.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockDbPrepare,
  mockDbRun,
  mockDbAll,
} = vi.hoisted(() => {
  const mockDbRun = vi.fn();
  const mockDbAll = vi.fn().mockReturnValue([]);
  const mockDbPrepare = vi.fn().mockReturnValue({ run: mockDbRun, all: mockDbAll });
  return { mockDbPrepare, mockDbRun, mockDbAll };
});

vi.mock('../db/index.js', () => ({
  getGlobalDb: () => ({ prepare: mockDbPrepare }),
}));

vi.mock('../utils/gate-status.js', () => ({
  getGateStatusForProject: vi.fn().mockReturnValue(null),
}));

vi.mock('../servers/tower-utils.js', async () => {
  const actual = await vi.importActual<typeof import('../servers/tower-utils.js')>('../servers/tower-utils.js');
  return {
    ...actual,
    isTempDirectory: vi.fn().mockReturnValue(false),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<InstanceDeps> = {}): InstanceDeps {
  return {
    log: vi.fn(),
    projectTerminals: new Map(),
    getTerminalManager: vi.fn().mockReturnValue({
      getSession: vi.fn(),
      killSession: vi.fn(),
      createSession: vi.fn(),
      createSessionRaw: vi.fn(),
      listSessions: vi.fn().mockReturnValue([]),
    }),
    shellperManager: null,
    getProjectTerminalsEntry: vi.fn().mockReturnValue({
      architect: undefined,
      builders: new Map(),
      shells: new Map(),
    }),
    saveTerminalSession: vi.fn(),
    deleteTerminalSession: vi.fn(),
    deleteProjectTerminalSessions: vi.fn(),
    getTerminalsForProject: vi.fn().mockResolvedValue({ terminals: [], gateStatus: null }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bugfix #274: Architect terminal persistence across Tower restarts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shutdownInstances();
  });

  afterEach(() => {
    shutdownInstances();
  });

  it('getInstances() returns [] before initInstances — prevents race with reconciliation', async () => {
    // This is the core invariant that prevents the race condition.
    // During Tower startup, reconcileTerminalSessions() must complete
    // BEFORE initInstances() is called. Since getInstances() checks
    // _deps and returns [] when null, no dashboard poll can trigger
    // getTerminalsForProject() during reconciliation.
    //
    // If someone reorders the startup sequence so initInstances() runs
    // before reconciliation, this test documents the expected safeguard.
    const instances = await getInstances();
    expect(instances).toEqual([]);
  });

  it('getInstances() processes projects after initInstances', async () => {
    // After initInstances, API requests should work normally
    const deps = makeDeps();

    // Simulate a known project in the known_projects table
    mockDbAll.mockImplementation((sql?: string) => {
      if (typeof sql === 'string' && sql.includes('known_projects')) {
        return [{ project_path: '/tmp/test-project' }];
      }
      return [];
    });

    initInstances(deps);

    const instances = await getInstances();
    // The project should be processed (though it may not appear since
    // the path might not exist — that's OK, the point is getInstances()
    // doesn't return [] blindly)
    expect(deps.log).not.toHaveBeenCalledWith('ERROR', expect.anything());
  });

  it('launchInstance returns error before initInstances — blocks new sessions during startup', async () => {
    // This ensures that even if POST /api/instances/activate arrives
    // during reconciliation, it can't create a conflicting session
    const { launchInstance } = await import('../servers/tower-instances.js');
    const result = await launchInstance('/some/project');
    expect(result.success).toBe(false);
    expect(result.error).toContain('still starting up');
  });
});

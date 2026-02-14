/**
 * Unit tests for tower-tunnel.ts (Spec 0105 Phase 2)
 *
 * Tests: handleTunnelEndpoint (connect, disconnect, status, 404),
 * initTunnel / shutdownTunnel lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import {
  initTunnel,
  shutdownTunnel,
  handleTunnelEndpoint,
  type TunnelDeps,
} from '../servers/tower-tunnel.js';

// ---------------------------------------------------------------------------
// Mocks (vi.hoisted ensures these exist before vi.mock factories run)
// ---------------------------------------------------------------------------

const {
  mockReadCloudConfig,
  mockGetCloudConfigPath,
  mockMaskApiKey,
  mockConnect,
  mockDisconnect,
  mockGetState,
  mockGetUptime,
  mockSendMetadata,
  mockOnStateChange,
  mockResetCircuitBreaker,
  mockFsWatch,
  mockFsWatcherClose,
} = vi.hoisted(() => ({
  mockReadCloudConfig: vi.fn(),
  mockGetCloudConfigPath: vi.fn().mockReturnValue('/tmp/test-cloud-config/cloud-config.json'),
  mockMaskApiKey: vi.fn((key: string) => `***${key.slice(-4)}`),
  mockConnect: vi.fn(),
  mockDisconnect: vi.fn(),
  mockGetState: vi.fn().mockReturnValue('disconnected'),
  mockGetUptime: vi.fn().mockReturnValue(null),
  mockSendMetadata: vi.fn(),
  mockOnStateChange: vi.fn(),
  mockResetCircuitBreaker: vi.fn(),
  mockFsWatch: vi.fn(),
  mockFsWatcherClose: vi.fn(),
}));

vi.mock('../lib/cloud-config.js', () => ({
  readCloudConfig: (...args: unknown[]) => mockReadCloudConfig(...args),
  getCloudConfigPath: (...args: unknown[]) => mockGetCloudConfigPath(...args),
  maskApiKey: (...args: unknown[]) => mockMaskApiKey(...args),
}));

vi.mock('../lib/tunnel-client.js', () => ({
  TunnelClient: class MockTunnelClient {
    connect = mockConnect;
    disconnect = mockDisconnect;
    getState = mockGetState;
    getUptime = mockGetUptime;
    sendMetadata = mockSendMetadata;
    onStateChange = mockOnStateChange;
    resetCircuitBreaker = mockResetCircuitBreaker;
  },
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      ...actual,
      watch: (...args: unknown[]) => {
        mockFsWatch(...args);
        return { close: mockFsWatcherClose };
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<TunnelDeps> = {}): TunnelDeps {
  return {
    port: 4100,
    log: vi.fn(),
    projectTerminals: new Map(),
    terminalManager: null,
    ...overrides,
  };
}

function makeReq(method: string): http.IncomingMessage {
  return { method } as http.IncomingMessage;
}

function makeRes(): { res: http.ServerResponse; body: () => string; statusCode: () => number } {
  let written = '';
  let code = 0;
  const res = {
    writeHead: vi.fn((status: number) => { code = status; }),
    end: vi.fn((data?: string) => { if (data) written += data; }),
  } as unknown as http.ServerResponse;
  return {
    res,
    body: () => written,
    statusCode: () => code,
  };
}

const FAKE_CONFIG = {
  api_key: 'sk-test-1234abcd',
  tower_id: 'tower-abc',
  tower_name: 'my-tower',
  server_url: 'https://codevos.ai',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tower-tunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no cloud config (unregistered)
    mockReadCloudConfig.mockReturnValue(null);
  });

  afterEach(() => {
    // Always clean up module state between tests
    shutdownTunnel();
  });

  // =========================================================================
  // handleTunnelEndpoint
  // =========================================================================

  describe('handleTunnelEndpoint', () => {
    describe('GET status (unregistered)', () => {
      it('returns registered: false when no cloud config exists', async () => {
        const { res, body, statusCode } = makeRes();
        await handleTunnelEndpoint(makeReq('GET'), res, 'status');

        expect(statusCode()).toBe(200);
        const parsed = JSON.parse(body());
        expect(parsed.registered).toBe(false);
        expect(parsed.state).toBe('disconnected');
        expect(parsed.uptime).toBeNull();
      });
    });

    describe('GET status (registered)', () => {
      it('returns registration details and tunnel state', async () => {
        mockReadCloudConfig.mockReturnValue(FAKE_CONFIG);

        const { res, body, statusCode } = makeRes();
        await handleTunnelEndpoint(makeReq('GET'), res, 'status');

        expect(statusCode()).toBe(200);
        const parsed = JSON.parse(body());
        expect(parsed.registered).toBe(true);
        expect(parsed.towerId).toBe('tower-abc');
        expect(parsed.towerName).toBe('my-tower');
        expect(parsed.serverUrl).toBe('https://codevos.ai');
        expect(parsed.accessUrl).toBe('https://codevos.ai/t/my-tower/');
      });
    });

    describe('GET status (corrupted config)', () => {
      it('returns registered: false when readCloudConfig throws', async () => {
        mockReadCloudConfig.mockImplementation(() => { throw new Error('parse error'); });

        const { res, body, statusCode } = makeRes();
        await handleTunnelEndpoint(makeReq('GET'), res, 'status');

        expect(statusCode()).toBe(200);
        const parsed = JSON.parse(body());
        expect(parsed.registered).toBe(false);
      });
    });

    describe('POST connect', () => {
      it('returns 503 when called before initTunnel (startup guard)', async () => {
        mockReadCloudConfig.mockReturnValue(FAKE_CONFIG);
        const { res, body, statusCode } = makeRes();
        await handleTunnelEndpoint(makeReq('POST'), res, 'connect');

        expect(statusCode()).toBe(503);
        const parsed = JSON.parse(body());
        expect(parsed.success).toBe(false);
        expect(parsed.error).toMatch(/still starting/i);
      });

      it('returns 400 when not registered', async () => {
        // Must init first so the guard passes
        const deps = makeDeps();
        await initTunnel(deps, { getInstances: async () => [] });

        mockReadCloudConfig.mockReturnValue(null);
        const { res, body, statusCode } = makeRes();
        await handleTunnelEndpoint(makeReq('POST'), res, 'connect');

        expect(statusCode()).toBe(400);
        const parsed = JSON.parse(body());
        expect(parsed.success).toBe(false);
        expect(parsed.error).toMatch(/not registered/i);
      });

      it('connects when registered and initTunnel was called', async () => {
        // Initialize first so _deps is set
        const deps = makeDeps();
        await initTunnel(deps, { getInstances: async () => [] });

        // Now test the connect endpoint
        mockReadCloudConfig.mockReturnValue(FAKE_CONFIG);
        mockGetState.mockReturnValue('connecting');

        const { res, body, statusCode } = makeRes();
        await handleTunnelEndpoint(makeReq('POST'), res, 'connect');

        expect(statusCode()).toBe(200);
        const parsed = JSON.parse(body());
        expect(parsed.success).toBe(true);
        expect(mockConnect).toHaveBeenCalled();
      });
    });

    describe('POST disconnect', () => {
      it('returns success even when not connected', async () => {
        const { res, body, statusCode } = makeRes();
        await handleTunnelEndpoint(makeReq('POST'), res, 'disconnect');

        expect(statusCode()).toBe(200);
        const parsed = JSON.parse(body());
        expect(parsed.success).toBe(true);
      });
    });

    describe('unknown endpoint', () => {
      it('returns 404 for unknown tunnel sub-path', async () => {
        const { res, body, statusCode } = makeRes();
        await handleTunnelEndpoint(makeReq('GET'), res, 'unknown');

        expect(statusCode()).toBe(404);
        const parsed = JSON.parse(body());
        expect(parsed.error).toBe('Not found');
      });

      it('returns 404 for wrong method on connect', async () => {
        const { res, statusCode } = makeRes();
        await handleTunnelEndpoint(makeReq('GET'), res, 'connect');
        expect(statusCode()).toBe(404);
      });
    });
  });

  // =========================================================================
  // initTunnel / shutdownTunnel lifecycle
  // =========================================================================

  describe('initTunnel', () => {
    it('operates in local-only mode when no cloud config exists', async () => {
      const deps = makeDeps();
      await initTunnel(deps, { getInstances: async () => [] });

      expect(deps.log).toHaveBeenCalledWith('INFO', 'No cloud config found, operating in local-only mode');
      // No tunnel client should be created
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('connects tunnel when cloud config exists', async () => {
      mockReadCloudConfig.mockReturnValue(FAKE_CONFIG);
      const deps = makeDeps();
      await initTunnel(deps, { getInstances: async () => [] });

      expect(mockConnect).toHaveBeenCalled();
      expect(mockSendMetadata).toHaveBeenCalled();
    });

    it('handles cloud config read failure gracefully', async () => {
      mockReadCloudConfig.mockImplementation(() => { throw new Error('ENOENT'); });
      const deps = makeDeps();
      await initTunnel(deps, { getInstances: async () => [] });

      expect(deps.log).toHaveBeenCalledWith(
        'WARN',
        expect.stringContaining('Failed to read cloud config'),
      );
    });
  });

  describe('shutdownTunnel', () => {
    it('is safe to call without prior init', () => {
      expect(() => shutdownTunnel()).not.toThrow();
    });

    it('disconnects tunnel client after init+connect', async () => {
      mockReadCloudConfig.mockReturnValue(FAKE_CONFIG);
      const deps = makeDeps();
      await initTunnel(deps, { getInstances: async () => [] });

      shutdownTunnel();

      expect(mockDisconnect).toHaveBeenCalled();
      expect(deps.log).toHaveBeenCalledWith('INFO', 'Disconnecting tunnel...');
    });

    it('clears module state so subsequent init works', async () => {
      const deps1 = makeDeps();
      await initTunnel(deps1, { getInstances: async () => [] });
      shutdownTunnel();

      // Second init should work cleanly
      const deps2 = makeDeps();
      await initTunnel(deps2, { getInstances: async () => [] });
      expect(deps2.log).toHaveBeenCalledWith('INFO', 'No cloud config found, operating in local-only mode');
    });
  });

  // =========================================================================
  // Config watcher debouncing
  // =========================================================================

  describe('config watcher debouncing', () => {
    it('starts watching config directory on initTunnel', async () => {
      const deps = makeDeps();
      await initTunnel(deps, { getInstances: async () => [] });

      // initTunnel calls startConfigWatcher which calls fs.watch
      expect(mockFsWatch).toHaveBeenCalled();
    });

    it('stops watcher on shutdownTunnel', async () => {
      const deps = makeDeps();
      await initTunnel(deps, { getInstances: async () => [] });

      shutdownTunnel();

      // shutdownTunnel calls stopConfigWatcher which closes the watcher
      expect(mockFsWatcherClose).toHaveBeenCalled();
    });

    it('debounces rapid config changes via setTimeout', async () => {
      vi.useFakeTimers();
      try {
        const deps = makeDeps();
        await initTunnel(deps, { getInstances: async () => [] });

        // Grab the watcher callback from the fs.watch mock call
        const watchCall = mockFsWatch.mock.calls[0];
        expect(watchCall).toBeDefined();
        const watchCallback = watchCall[1] as (eventType: string, filename: string) => void;
        const configFileName = 'cloud-config.json';

        // Fire multiple rapid events (simulating rapid file writes)
        mockReadCloudConfig.mockReturnValue(FAKE_CONFIG);
        watchCallback('change', configFileName);
        watchCallback('change', configFileName);
        watchCallback('change', configFileName);

        // Before debounce timeout fires, no reconnection should have happened
        // (clear previous call count from initTunnel itself)
        const connectCallsBefore = mockConnect.mock.calls.length;

        // Advance past the 500ms debounce window
        await vi.advanceTimersByTimeAsync(600);

        // Only ONE reconnection should have occurred despite 3 events
        const connectCallsAfter = mockConnect.mock.calls.length;
        expect(connectCallsAfter - connectCallsBefore).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('ignores events for non-config files', async () => {
      const deps = makeDeps();
      await initTunnel(deps, { getInstances: async () => [] });

      const watchCall = mockFsWatch.mock.calls[0];
      const watchCallback = watchCall[1] as (eventType: string, filename: string) => void;

      // Fire event for a different file
      const connectCallsBefore = mockConnect.mock.calls.length;
      watchCallback('change', 'other-file.json');

      // No reconnection should happen
      expect(mockConnect.mock.calls.length).toBe(connectCallsBefore);
    });
  });
});

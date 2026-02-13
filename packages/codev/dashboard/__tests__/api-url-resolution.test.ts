import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Regression test for GitHub issue #222:
// Dashboard API calls must use relative URLs so they work behind reverse proxies.

describe('getApiBase (constants.ts)', () => {
  it('returns relative base "./" regardless of pathname', async () => {
    // Simulate proxy path: /t/abc123/project/my-project/
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/t/abc123/project/my-project/' },
      writable: true,
    });

    // Re-import to pick up the mocked location
    const { getApiBase } = await import('../src/lib/constants.js');
    expect(getApiBase()).toBe('./');
  });

  it('returns relative base "./" when at root', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/' },
      writable: true,
    });

    const { getApiBase } = await import('../src/lib/constants.js');
    expect(getApiBase()).toBe('./');
  });
});

describe('getTerminalWsPath (api.ts)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes full pathname prefix for WebSocket path', async () => {
    // Simulate proxy path
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/t/abc123/project/my-project/' },
      writable: true,
    });

    const { getTerminalWsPath } = await import('../src/lib/api.js');

    const result = getTerminalWsPath({ type: 'builder', terminalId: 'term-1' });
    expect(result).toBe('/t/abc123/project/my-project/ws/terminal/term-1');
  });

  it('works when accessed directly at root', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/' },
      writable: true,
    });

    const { getTerminalWsPath } = await import('../src/lib/api.js');

    const result = getTerminalWsPath({ type: 'builder', terminalId: 'term-1' });
    expect(result).toBe('/ws/terminal/term-1');
  });

  it('adds trailing slash to pathname without one', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/t/abc123/project/my-project' },
      writable: true,
    });

    const { getTerminalWsPath } = await import('../src/lib/api.js');

    const result = getTerminalWsPath({ type: 'builder', terminalId: 'term-1' });
    expect(result).toBe('/t/abc123/project/my-project/ws/terminal/term-1');
  });

  it('returns null when no terminalId', async () => {
    const { getTerminalWsPath } = await import('../src/lib/api.js');
    expect(getTerminalWsPath({ type: 'builder' })).toBeNull();
  });
});

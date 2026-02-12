import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { GateBanner } from '../src/components/GateBanner.js';
import type { GateStatus } from '../src/lib/api.js';

afterEach(cleanup);

describe('GateBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders banner when gateStatus.hasGate is true', () => {
    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0100',
      requestedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    };

    render(<GateBanner gateStatus={gateStatus} />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Builder 0100 blocked on/)).toBeTruthy();
    expect(screen.getByText('spec-approval')).toBeTruthy();
    expect(screen.getByText('porch approve 0100 spec-approval')).toBeTruthy();
  });

  it('returns null when hasGate is false', () => {
    const gateStatus: GateStatus = { hasGate: false };

    const { container } = render(<GateBanner gateStatus={gateStatus} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when gateStatus is undefined', () => {
    const { container } = render(<GateBanner gateStatus={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('displays wait time when requestedAt is provided', () => {
    // 3 minutes ago
    const now = new Date('2026-02-12T20:00:00.000Z').getTime();
    vi.setSystemTime(now);

    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: 'plan-approval',
      builderId: '0042',
      requestedAt: '2026-02-12T19:57:00.000Z',
    };

    render(<GateBanner gateStatus={gateStatus} />);
    expect(screen.getByText('waiting 3m')).toBeTruthy();
  });

  it('displays hours and minutes for longer wait times', () => {
    const now = new Date('2026-02-12T21:12:00.000Z').getTime();
    vi.setSystemTime(now);

    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0077',
      requestedAt: '2026-02-12T20:00:00.000Z',
    };

    render(<GateBanner gateStatus={gateStatus} />);
    expect(screen.getByText('waiting 1h 12m')).toBeTruthy();
  });

  it('omits wait time when requestedAt is undefined', () => {
    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0100',
    };

    render(<GateBanner gateStatus={gateStatus} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/waiting/)).toBeNull();
  });

  it('updates wait time on interval', () => {
    const now = new Date('2026-02-12T20:00:00.000Z').getTime();
    vi.setSystemTime(now);

    const gateStatus: GateStatus = {
      hasGate: true,
      gateName: 'spec-approval',
      builderId: '0100',
      requestedAt: '2026-02-12T19:58:00.000Z',
    };

    render(<GateBanner gateStatus={gateStatus} />);
    expect(screen.getByText('waiting 2m')).toBeTruthy();

    // Advance 30 seconds (the interval) + bump system time by 1 minute
    act(() => {
      vi.setSystemTime(now + 60_000);
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByText('waiting 3m')).toBeTruthy();
  });
});

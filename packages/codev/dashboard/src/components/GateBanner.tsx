import { useState, useEffect } from 'react';
import type { GateStatus } from '../lib/api.js';

interface GateBannerProps {
  gateStatus: GateStatus | undefined;
}

/**
 * Format elapsed milliseconds into a human-readable string like "3m" or "1h 12m".
 */
function formatWaitTime(ms: number): string {
  if (ms < 0) return '0m';
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * Spec 0100: Gate notification banner.
 * Renders a full-width amber bar above the terminal split when a builder
 * has a pending porch gate requiring human approval.
 */
export function GateBanner({ gateStatus }: GateBannerProps) {
  const [now, setNow] = useState(Date.now());

  // Update relative time every 30 seconds
  useEffect(() => {
    if (!gateStatus?.hasGate || !gateStatus.requestedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [gateStatus?.hasGate, gateStatus?.requestedAt]);

  if (!gateStatus?.hasGate) return null;

  const { gateName, builderId, requestedAt } = gateStatus;
  const approveCmd = `porch approve ${builderId} ${gateName}`;

  let waitTimeText: string | null = null;
  if (requestedAt) {
    const elapsed = now - Date.parse(requestedAt);
    waitTimeText = formatWaitTime(elapsed);
  }

  return (
    <div className="gate-banner" role="alert">
      <span className="gate-banner-message">
        <span className="gate-banner-icon" aria-hidden="true">&#9888;</span>
        {' '}Builder {builderId} blocked on <strong>{gateName}</strong>
      </span>
      {waitTimeText !== null && (
        <span className="gate-banner-wait">waiting {waitTimeText}</span>
      )}
      <code className="gate-banner-cmd">{approveCmd}</code>
    </div>
  );
}

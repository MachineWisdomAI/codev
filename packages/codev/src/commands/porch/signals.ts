/**
 * Signal detection for Porch
 *
 * Watches Claude's output file for signal markers:
 *   PHASE_COMPLETE - Phase work is done
 *   GATE_NEEDED - Human approval required
 *   BLOCKED: <reason> - Claude is stuck
 */

import * as fs from 'node:fs';

export type Signal =
  | { type: 'PHASE_COMPLETE' }
  | { type: 'GATE_NEEDED' }
  | { type: 'BLOCKED'; reason: string };

export interface SignalWatcher {
  /**
   * Check for new signals since last check.
   */
  check(): Promise<Signal | null>;

  /**
   * Stop watching.
   */
  stop(): void;
}

/**
 * Create a signal watcher for the given output file.
 */
export function watchForSignal(outputPath: string): SignalWatcher {
  let lastPosition = 0;
  let stopped = false;

  return {
    async check(): Promise<Signal | null> {
      if (stopped) return null;

      try {
        if (!fs.existsSync(outputPath)) {
          return null;
        }

        const content = fs.readFileSync(outputPath, 'utf-8');

        // Only check new content since last position
        const newContent = content.slice(lastPosition);
        lastPosition = content.length;

        // Look for signal markers
        // These should be on their own line, possibly in output blocks
        const lines = newContent.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed === 'PHASE_COMPLETE' || trimmed.includes('PHASE_COMPLETE')) {
            return { type: 'PHASE_COMPLETE' };
          }

          if (trimmed === 'GATE_NEEDED' || trimmed.includes('GATE_NEEDED')) {
            return { type: 'GATE_NEEDED' };
          }

          const blockedMatch = trimmed.match(/BLOCKED:\s*(.+)/);
          if (blockedMatch) {
            return { type: 'BLOCKED', reason: blockedMatch[1] };
          }
        }

        return null;
      } catch (err) {
        // File might not exist yet or be locked
        return null;
      }
    },

    stop() {
      stopped = true;
    },
  };
}

/**
 * Parse a signal from text content (one-shot check).
 */
export function parseSignal(content: string): Signal | null {
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'PHASE_COMPLETE') {
      return { type: 'PHASE_COMPLETE' };
    }

    if (trimmed === 'GATE_NEEDED') {
      return { type: 'GATE_NEEDED' };
    }

    const blockedMatch = trimmed.match(/BLOCKED:\s*(.+)/);
    if (blockedMatch) {
      return { type: 'BLOCKED', reason: blockedMatch[1] };
    }
  }

  return null;
}

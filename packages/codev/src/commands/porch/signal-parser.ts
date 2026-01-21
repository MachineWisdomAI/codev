/**
 * Signal Parser
 *
 * Extracts signals from Claude output and validates them against protocol definitions.
 * Signals use XML-style tags: <signal>SIGNAL_NAME</signal>
 */

import type { Protocol, Phase } from './types.js';

/**
 * Signal extraction result
 */
export interface SignalResult {
  signal: string | null;
  content: string | null;  // Content inside the signal tag (for AWAITING_INPUT, etc.)
  allSignals: string[];
  isValid: boolean;
  error?: string;
}

/**
 * Extracted signal with optional content
 */
interface ExtractedSignal {
  type: string;
  content: string | null;
}

/**
 * Extract signal from Claude output
 *
 * Supports two formats:
 * - Simple: <signal>SIGNAL_NAME</signal>
 * - With content: <signal type=SIGNAL_NAME>content here</signal>
 *
 * Rules:
 * - Scan for both patterns
 * - Return the LAST signal found (multiple signals → last wins)
 * - Return null if no signal found
 */
export function extractSignal(output: string): ExtractedSignal | null {
  // Try new format first: <signal type=NAME>content</signal>
  const typedMatches = output.match(/<signal\s+type=([A-Z_]+)>([\s\S]*?)<\/signal>/gi);

  // Also try simple format: <signal>NAME</signal>
  const simpleMatches = output.match(/<signal>([^<]+)<\/signal>/gi);

  // Collect all matches with their positions
  const allMatches: { index: number; type: string; content: string | null }[] = [];

  if (typedMatches) {
    for (const match of typedMatches) {
      const parsed = match.match(/<signal\s+type=([A-Z_]+)>([\s\S]*?)<\/signal>/i);
      if (parsed) {
        const index = output.indexOf(match);
        allMatches.push({
          index,
          type: parsed[1].trim(),
          content: parsed[2].trim() || null
        });
      }
    }
  }

  if (simpleMatches) {
    for (const match of simpleMatches) {
      const parsed = match.match(/<signal>([^<]+)<\/signal>/i);
      if (parsed) {
        const index = output.indexOf(match);
        allMatches.push({
          index,
          type: parsed[1].trim(),
          content: null
        });
      }
    }
  }

  if (allMatches.length === 0) return null;

  // Sort by position and return the last one
  allMatches.sort((a, b) => a.index - b.index);
  const last = allMatches[allMatches.length - 1];

  return { type: last.type, content: last.content };
}

/**
 * Extract all signals from output (returns just the type names)
 */
export function extractAllSignals(output: string): string[] {
  const results: string[] = [];

  // Match typed format: <signal type=NAME>...</signal>
  const typedMatches = output.match(/<signal\s+type=([A-Z_]+)>[\s\S]*?<\/signal>/gi);
  if (typedMatches) {
    for (const match of typedMatches) {
      const parsed = match.match(/<signal\s+type=([A-Z_]+)>/i);
      if (parsed) results.push(parsed[1].trim());
    }
  }

  // Match simple format: <signal>NAME</signal>
  const simpleMatches = output.match(/<signal>([^<]+)<\/signal>/gi);
  if (simpleMatches) {
    for (const match of simpleMatches) {
      const parsed = match.match(/<signal>([^<]+)<\/signal>/i);
      if (parsed) results.push(parsed[1].trim());
    }
  }

  return results;
}

/**
 * Validate a signal against the protocol definition
 *
 * Returns true if the signal is valid for the current phase.
 * Unknown signals are logged but considered valid (lenient mode).
 */
export function validateSignal(
  signal: string,
  protocol: Protocol,
  currentState: string
): { valid: boolean; nextState?: string; warning?: string } {
  const [phaseId, substate] = currentState.split(':');
  const phase = protocol.phases.find(p => p.id === phaseId);

  if (!phase) {
    return {
      valid: false,
      warning: `Unknown phase: ${phaseId}`,
    };
  }

  // Check if signal is defined for this phase
  if (phase.signals && phase.signals[signal]) {
    return {
      valid: true,
      nextState: phase.signals[signal],
    };
  }

  // Signal not defined - lenient mode: allow but warn
  return {
    valid: true, // Allow unknown signals to prevent blocking
    warning: `Signal "${signal}" not defined in protocol for phase ${phaseId}`,
  };
}

/**
 * Extract and validate signal from output
 */
export function parseSignal(
  output: string,
  protocol: Protocol,
  currentState: string
): SignalResult {
  const extracted = extractSignal(output);
  const allSignals = extractAllSignals(output);

  if (!extracted) {
    return {
      signal: null,
      content: null,
      allSignals: [],
      isValid: true, // No signal is valid (use default transition)
    };
  }

  const validation = validateSignal(extracted.type, protocol, currentState);

  return {
    signal: extracted.type,
    content: extracted.content,
    allSignals,
    isValid: validation.valid,
    error: validation.warning,
  };
}

/**
 * Get valid signals for a phase
 */
export function getValidSignals(protocol: Protocol, phaseId: string): string[] {
  const phase = protocol.phases.find(p => p.id === phaseId);
  if (!phase?.signals) return [];
  return Object.keys(phase.signals);
}

/**
 * Common signals used across protocols
 */
export const CommonSignals = {
  // Specify phase
  SPEC_DRAFTED: 'SPEC_DRAFTED',
  SPEC_READY: 'SPEC_READY',
  REVISION_COMPLETE: 'REVISION_COMPLETE',

  // Plan phase
  PLAN_DRAFTED: 'PLAN_DRAFTED',
  PLAN_READY: 'PLAN_READY',

  // Implement phase
  PHASE_IMPLEMENTED: 'PHASE_IMPLEMENTED',
  IMPLEMENTATION_COMPLETE: 'IMPLEMENTATION_COMPLETE',

  // Defend phase
  TESTS_WRITTEN: 'TESTS_WRITTEN',
  TESTS_PASSING: 'TESTS_PASSING',

  // Evaluate phase
  EVALUATION_COMPLETE: 'EVALUATION_COMPLETE',
  PHASE_COMPLETE: 'PHASE_COMPLETE',

  // Review phase
  REVIEW_COMPLETE: 'REVIEW_COMPLETE',

  // TICK protocol
  UNDERSTOOD: 'UNDERSTOOD',
  IMPLEMENTED: 'IMPLEMENTED',
  VERIFIED: 'VERIFIED',

  // BUGFIX protocol
  DIAGNOSED: 'DIAGNOSED',
  FIXED: 'FIXED',
  TESTED: 'TESTED',
  PR_CREATED: 'PR_CREATED',

  // General
  COMPLETE: 'COMPLETE',
  BLOCKED: 'BLOCKED',  // Can include reason: BLOCKED:reason text
  NEEDS_CLARIFICATION: 'NEEDS_CLARIFICATION',
  AWAITING_INPUT: 'AWAITING_INPUT',  // Claude needs user input. Can include question: AWAITING_INPUT:Your question here?
} as const;

/**
 * Format a signal for output
 */
export function formatSignal(signal: string): string {
  return `<signal>${signal}</signal>`;
}

/**
 * Check if output contains any signal
 */
export function hasSignal(output: string): boolean {
  return /<signal>[^<]+<\/signal>/i.test(output);
}

/**
 * Strip all signals from output (for clean display)
 */
export function stripSignals(output: string): string {
  return output.replace(/<signal>[^<]+<\/signal>/gi, '').trim();
}

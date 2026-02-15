/**
 * Agent naming utilities for standardized builder identification.
 * Spec 0110: Messaging Infrastructure — Phase 1
 *
 * Naming convention:
 *   Builder ID:    builder-{protocol}-{id}  (e.g., builder-spir-109)
 *   Worktree path: .builders/{protocol}-{id}[-{slug}]/
 *   Branch name:   builder/{protocol}-{id}[-{slug}]
 *
 * All names are stored and compared in lowercase per spec.
 */

import type { Builder, BuilderType } from '../types.js';

/**
 * Strip leading zeros from a numeric ID string.
 * Non-numeric IDs are returned unchanged.
 *
 * Examples:
 *   '0109' → '109'
 *   '0001' → '1'
 *   '0'    → '0'
 *   'AbCd' → 'AbCd'
 */
export function stripLeadingZeros(id: string): string {
  if (/^\d+$/.test(id)) {
    return String(Number(id));
  }
  return id;
}

/**
 * Build a canonical agent name from builder type and ID.
 * Returns lowercase with leading zeros stripped from numeric IDs.
 *
 * Examples:
 *   buildAgentName('spec', '0109')       → 'builder-spir-109'
 *   buildAgentName('bugfix', '42')       → 'builder-bugfix-42'
 *   buildAgentName('task', 'AbCd')       → 'builder-task-abcd'
 *   buildAgentName('protocol', 'AbCd')   → 'builder-experiment-abcd'
 *
 * Note: For 'spec' type, the protocol segment defaults to 'spir'.
 * Use buildAgentNameWithProtocol() when the actual protocol is known.
 */
export function buildAgentName(type: BuilderType, id: string, protocol?: string): string {
  const strippedId = stripLeadingZeros(id);

  // Determine the protocol segment
  let protocolSegment: string;
  switch (type) {
    case 'spec':
      protocolSegment = protocol ?? 'spir';
      break;
    case 'bugfix':
      protocolSegment = 'bugfix';
      break;
    case 'task':
      protocolSegment = 'task';
      break;
    case 'protocol':
      protocolSegment = protocol ?? 'protocol';
      break;
    default:
      // shell and worktree don't get builder- prefix names
      return `${type}-${strippedId}`.toLowerCase();
  }

  return `builder-${protocolSegment}-${strippedId}`.toLowerCase();
}

/**
 * Parse a canonical agent name into its components.
 * Returns null if the name doesn't match the expected pattern.
 *
 * Examples:
 *   parseAgentName('builder-spir-109')     → { protocol: 'spir', id: '109' }
 *   parseAgentName('builder-bugfix-42')    → { protocol: 'bugfix', id: '42' }
 *   parseAgentName('architect')            → null
 *   parseAgentName('0109')                 → null
 */
export function parseAgentName(name: string): { protocol: string; id: string } | null {
  const lower = name.toLowerCase();
  const match = lower.match(/^builder-([a-z0-9]+)-(.+)$/);
  if (!match) return null;
  return { protocol: match[1], id: match[2] };
}

/**
 * Parse a target address into project and agent components.
 * Normalizes the agent portion to lowercase.
 *
 * Examples:
 *   parseAddress('architect')                  → { agent: 'architect' }
 *   parseAddress('builder-spir-109')           → { agent: 'builder-spir-109' }
 *   parseAddress('codev-public:architect')     → { project: 'codev-public', agent: 'architect' }
 *   parseAddress('codev-public:builder-spir-109') → { project: 'codev-public', agent: 'builder-spir-109' }
 */
export function parseAddress(target: string): { project?: string; agent: string } {
  const colonIndex = target.indexOf(':');
  if (colonIndex > 0) {
    return {
      project: target.substring(0, colonIndex).toLowerCase(),
      agent: target.substring(colonIndex + 1).toLowerCase(),
    };
  }
  return { agent: target.toLowerCase() };
}

/**
 * Resolve an agent name against a list of builders using case-insensitive
 * matching with tail-match fallback.
 *
 * Resolution order:
 * 1. Exact match (case-insensitive): 'builder-spir-109' matches 'builder-spir-109'
 * 2. Tail match: bare ID matches the trailing segment of builder-{protocol}-{id}.
 *    E.g., '109' matches 'builder-spir-109' because the name ends with '-109'.
 *    Leading zeros are stripped before comparison: '0109' → '109'.
 *    Also handles partial names: 'bugfix-42' matches 'builder-bugfix-42'.
 * 3. Returns null if no match found or multiple ambiguous tail matches.
 *
 * @returns { builder, ambiguous? } — builder is the matched Builder or null.
 *   If ambiguous, candidates are provided for error messaging.
 */
export function resolveAgentName(
  target: string,
  builders: Builder[],
): { builder: Builder | null; ambiguous?: Builder[] } {
  const originalTarget = target.toLowerCase();
  const strippedTarget = stripLeadingZeros(target).toLowerCase();

  // 1. Exact match (case-insensitive) — try original first, then stripped
  const exact = builders.find(b => {
    const id = b.id.toLowerCase();
    return id === originalTarget || id === strippedTarget;
  });
  if (exact) return { builder: exact };

  // 2. Tail match: check if any builder ID ends with -{strippedTarget}
  const tailMatches = builders.filter(b => {
    const builderId = b.id.toLowerCase();
    // Check if the builder ID ends with the target as a tail segment
    // e.g., builder-spir-109 ends with -109, -spir-109
    return builderId.endsWith(`-${strippedTarget}`);
  });

  if (tailMatches.length === 1) return { builder: tailMatches[0] };
  if (tailMatches.length > 1) return { builder: null, ambiguous: tailMatches };

  // 3. No match
  return { builder: null };
}

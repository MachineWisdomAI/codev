/**
 * Phase prompts for Porch
 *
 * Loads phase-specific prompts from the protocol's prompts/ directory.
 * Prompts are markdown files with {{variable}} placeholders.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectState, Protocol, ProtocolPhase, PlanPhase } from './types.js';
import { getPhaseConfig, isPhased } from './protocol.js';
import { findPlanFile, getCurrentPlanPhase, getPhaseContent } from './plan.js';

/** Locations to search for protocol prompts */
const PROTOCOL_PATHS = [
  'codev/protocols',
  'codev-skeleton/protocols',
  'skeleton/protocols',  // Used in packages/codev
];

/**
 * Find the prompts directory for a protocol.
 */
function findPromptsDir(projectRoot: string, protocolName: string): string | null {
  for (const basePath of PROTOCOL_PATHS) {
    const promptsDir = path.join(projectRoot, basePath, protocolName, 'prompts');
    if (fs.existsSync(promptsDir)) {
      return promptsDir;
    }
  }
  return null;
}

/**
 * Load a prompt file from the protocol's prompts directory.
 */
function loadPromptFile(promptsDir: string, promptFile: string): string | null {
  const promptPath = path.join(promptsDir, promptFile);
  if (fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, 'utf-8');
  }
  return null;
}

/**
 * Substitute template variables in a prompt.
 */
function substituteVariables(
  prompt: string,
  state: ProjectState,
  planPhase?: PlanPhase | null
): string {
  const variables: Record<string, string> = {
    project_id: state.id,
    title: state.title,
    current_state: state.phase,
    protocol: state.protocol,
  };

  if (planPhase) {
    variables.plan_phase_id = planPhase.id;
    variables.plan_phase_title = planPhase.title;
  }

  // Replace {{variable}} with values
  return prompt.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return variables[varName] || match;
  });
}

/**
 * Build a prompt for the current phase.
 * Loads from protocol's prompts/ directory if available, otherwise uses fallback.
 */
export function buildPhasePrompt(
  projectRoot: string,
  state: ProjectState,
  protocol: Protocol
): string {
  const phaseConfig = getPhaseConfig(protocol, state.phase);
  if (!phaseConfig) {
    return buildFallbackPrompt(state, 'unknown');
  }

  // Get current plan phase for phased protocols
  let currentPlanPhase: PlanPhase | null = null;

  if (isPhased(protocol, state.phase) && state.plan_phases.length > 0) {
    currentPlanPhase = getCurrentPlanPhase(state.plan_phases);
  }

  // Try to load prompt from protocol directory
  const promptsDir = findPromptsDir(projectRoot, state.protocol);
  if (promptsDir) {
    const promptFileName = `${state.phase}.md`;

    const promptContent = loadPromptFile(promptsDir, promptFileName);
    if (promptContent) {
      let result = substituteVariables(promptContent, state, currentPlanPhase);

      // Add plan phase context if applicable
      if (currentPlanPhase) {
        result = addPlanPhaseContext(projectRoot, state, currentPlanPhase, result);
      }

      // Add signal instructions footer
      result += buildSignalFooter();

      return result;
    }
  }

  // Fallback to generic prompt if no protocol prompt found
  return buildFallbackPrompt(state, phaseConfig.name, currentPlanPhase);
}

/**
 * Add plan phase context from the plan file.
 */
function addPlanPhaseContext(
  projectRoot: string,
  state: ProjectState,
  planPhase: PlanPhase,
  prompt: string
): string {
  const planPath = findPlanFile(projectRoot, state.id, state.title);
  if (!planPath) {
    return prompt;
  }

  try {
    const planContent = fs.readFileSync(planPath, 'utf-8');
    const phaseContent = getPhaseContent(planContent, planPhase.id);
    if (phaseContent) {
      return prompt + `\n\n## Current Plan Phase Details\n\n**${planPhase.id}: ${planPhase.title}**\n\n${phaseContent}\n`;
    }
  } catch {
    // Ignore errors reading plan
  }

  return prompt;
}

/**
 * Build signal instructions footer.
 */
function buildSignalFooter(): string {
  return `

## Completion Signals

When you complete your work, output one of these signals:

- **Phase complete**: \`PHASE_COMPLETE\`
- **Need human approval**: \`GATE_NEEDED\`
- **Blocked on something**: \`BLOCKED: <reason>\`

Output the signal on its own line when appropriate.
`;
}

/**
 * Build a fallback prompt when no protocol prompt is found.
 */
function buildFallbackPrompt(
  state: ProjectState,
  phaseName: string,
  planPhase?: PlanPhase | null
): string {
  let prompt = `# Phase: ${phaseName}

You are executing the ${phaseName} phase of the ${state.protocol.toUpperCase()} protocol.

## Context

- **Project ID**: ${state.id}
- **Project Title**: ${state.title}
- **Protocol**: ${state.protocol}
`;

  if (planPhase) {
    prompt += `- **Plan Phase**: ${planPhase.id} - ${planPhase.title}\n`;
  }

  prompt += `
## Task

Complete the work for this phase according to the protocol.

`;

  prompt += buildSignalFooter();

  return prompt;
}

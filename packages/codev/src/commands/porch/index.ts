/**
 * Porch - Protocol Orchestrator
 *
 * Generic loop orchestrator that reads protocol definitions from JSON
 * and executes them with Claude.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import chalk from 'chalk';
import { resolveCodevFile, readCodevFile, findProjectRoot, getSkeletonDir } from '../../lib/skeleton.js';
import type {
  Protocol,
  Phase,
  ProjectState,
  PorchRunOptions,
  PorchInitOptions,
} from './types.js';

// Status directory relative to project root
const STATUS_DIR = 'codev/status';

// ============================================================================
// Protocol Loading
// ============================================================================

/**
 * Get the protocols directory (checks local first, then skeleton)
 */
function getProtocolsDir(projectRoot: string): string {
  const localDir = path.join(projectRoot, 'codev', 'porch', 'protocols');
  if (fs.existsSync(localDir)) {
    return localDir;
  }
  return path.join(getSkeletonDir(), 'porch', 'protocols');
}

/**
 * List available protocols
 */
export function listProtocols(projectRoot?: string): string[] {
  const root = projectRoot || findProjectRoot();
  const protocolsDir = getProtocolsDir(root);

  if (!fs.existsSync(protocolsDir)) {
    return [];
  }

  return fs.readdirSync(protocolsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

/**
 * Load a protocol definition
 */
export function loadProtocol(name: string, projectRoot?: string): Protocol {
  const root = projectRoot || findProjectRoot();

  // Check local first
  const localPath = path.join(root, 'codev', 'porch', 'protocols', `${name}.json`);
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  }

  // Check skeleton
  const skeletonPath = path.join(getSkeletonDir(), 'porch', 'protocols', `${name}.json`);
  if (fs.existsSync(skeletonPath)) {
    return JSON.parse(fs.readFileSync(skeletonPath, 'utf-8'));
  }

  throw new Error(`Protocol not found: ${name}\nAvailable protocols: ${listProtocols(root).join(', ')}`);
}

/**
 * Load a prompt file for a phase
 */
function loadPrompt(protocol: Protocol, phaseId: string, projectRoot: string): string | null {
  const phase = protocol.phases.find(p => p.id === phaseId);
  if (!phase?.prompt) {
    return null;
  }

  const promptPath = `porch/prompts/${phase.prompt}`;

  // Check local first, then skeleton
  const content = readCodevFile(promptPath, projectRoot);
  if (content) {
    return content;
  }

  // Check protocol-specific prompts directory (legacy support)
  const protocolPromptPath = `porch/prompts/${protocol.name}/${phase.prompt}`;
  return readCodevFile(protocolPromptPath, projectRoot);
}

// ============================================================================
// State Management
// ============================================================================

/**
 * Find status file for a project
 */
function findStatusFile(projectId: string, projectRoot: string): string | null {
  const statusDir = path.join(projectRoot, STATUS_DIR);
  if (!fs.existsSync(statusDir)) {
    return null;
  }

  const files = fs.readdirSync(statusDir);
  const match = files.find(f => f.startsWith(`${projectId}-`) && f.endsWith('.md'));
  return match ? path.join(statusDir, match) : null;
}

/**
 * Parse YAML-like frontmatter from status file
 * Simple parser - handles basic key: value pairs
 */
function parseStatusFile(content: string): ProjectState {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error('Invalid status file: no frontmatter found');
  }

  const yaml = frontmatterMatch[1];
  const state: Record<string, unknown> = {};

  // Very simple YAML parser for our specific format
  let currentKey = '';
  let currentIndent = 0;
  let currentObject: Record<string, unknown> = state;
  const objectStack: Record<string, unknown>[] = [state];

  for (const line of yaml.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;

    const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
    if (!match) continue;

    const [, indent, key, value] = match;
    const indentLevel = indent.length;

    // Handle nesting
    if (indentLevel > currentIndent) {
      objectStack.push(currentObject);
      currentObject = (currentObject[currentKey] || {}) as Record<string, unknown>;
    } else if (indentLevel < currentIndent) {
      const levels = (currentIndent - indentLevel) / 2;
      for (let i = 0; i < levels; i++) {
        currentObject = objectStack.pop() || state;
      }
    }

    currentIndent = indentLevel;
    currentKey = key.trim();

    // Parse value
    let parsedValue: unknown = value.trim();
    if (parsedValue === '{}' || parsedValue === '') {
      parsedValue = {};
    } else if (parsedValue.startsWith('"') && parsedValue.endsWith('"')) {
      parsedValue = parsedValue.slice(1, -1);
    } else if (parsedValue.startsWith('{ ') && parsedValue.endsWith(' }')) {
      // Inline object like { status: pending }
      const inlineMatch = parsedValue.match(/\{ status: (\w+) \}/);
      if (inlineMatch) {
        parsedValue = { status: inlineMatch[1] };
      }
    }

    currentObject[currentKey] = parsedValue;
  }

  return state as unknown as ProjectState;
}

/**
 * Get current state from status file
 */
function getState(statusFile: string): string {
  const content = fs.readFileSync(statusFile, 'utf-8');
  const match = content.match(/^current_state:\s*"?([^"\n]+)"?$/m);
  return match ? match[1] : 'not_initialized';
}

/**
 * Update state in status file
 */
function setState(statusFile: string, newState: string): void {
  let content = fs.readFileSync(statusFile, 'utf-8');

  // Update current_state
  content = content.replace(
    /^current_state:\s*"?[^"\n]+"?$/m,
    `current_state: "${newState}"`
  );

  // Append to log
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  content = content.trimEnd() + `\n- ${timestamp}: State changed to ${newState}\n`;

  fs.writeFileSync(statusFile, content);
  console.log(chalk.green(`[porch] State → ${newState}`));
}

/**
 * Check if a gate is approved
 */
function checkGate(statusFile: string, gateId: string): boolean {
  const content = fs.readFileSync(statusFile, 'utf-8');

  // Look for gate approval in YAML format
  const pattern = new RegExp(`${gateId}:[\\s\\S]*?status:\\s*(\\w+)`, 'm');
  const match = content.match(pattern);

  return match ? match[1] === 'passed' : false;
}

/**
 * Approve a gate in status file
 */
function approveGateInFile(statusFile: string, gateId: string): void {
  let content = fs.readFileSync(statusFile, 'utf-8');

  // Replace status: pending with status: passed for this gate
  const pattern = new RegExp(
    `(${gateId}:[\\s\\S]*?human:\\s*\\{\\s*status:\\s*)pending(\\s*\\})`,
    'm'
  );
  content = content.replace(pattern, '$1passed$2');

  // Append to log
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  content = content.trimEnd() + `\n- ${timestamp}: Gate ${gateId} approved\n`;

  fs.writeFileSync(statusFile, content);
}

// ============================================================================
// Protocol Helpers
// ============================================================================

/**
 * Check if a phase is terminal
 */
function isTerminalPhase(protocol: Protocol, phaseId: string): boolean {
  const phase = protocol.phases.find(p => p.id === phaseId);
  return phase?.terminal === true;
}

/**
 * Get gate that blocks a given state
 */
function getGateForState(protocol: Protocol, state: string): string | null {
  const gate = protocol.gates.find(g => g.after_state === state);
  return gate?.id || null;
}

/**
 * Get next state after gate passes
 */
function getGateNextState(protocol: Protocol, gateId: string): string | null {
  const gate = protocol.gates.find(g => g.id === gateId);
  return gate?.next_state || null;
}

/**
 * Get signal-based next state
 */
function getSignalNextState(protocol: Protocol, phaseId: string, signal: string): string | null {
  const phase = protocol.phases.find(p => p.id === phaseId);
  return phase?.signals?.[signal] || null;
}

/**
 * Get default transition for a state
 */
function getDefaultTransition(protocol: Protocol, state: string): string | null {
  return protocol.transitions[state]?.default || null;
}

// ============================================================================
// Claude Invocation
// ============================================================================

/**
 * Extract signal from Claude output
 */
function extractSignal(output: string): string | null {
  const match = output.match(/<signal>([^<]+)<\/signal>/);
  return match ? match[1] : null;
}

/**
 * Invoke Claude for a phase
 */
async function invokeClaude(
  protocol: Protocol,
  phaseId: string,
  statusFile: string,
  projectId: string,
  projectRoot: string,
  options: PorchRunOptions
): Promise<string> {
  const promptContent = loadPrompt(protocol, phaseId, projectRoot);

  if (!promptContent) {
    console.log(chalk.yellow(`[porch] No prompt file for phase: ${phaseId}`));
    return '';
  }

  if (options.dryRun) {
    console.log(chalk.yellow(`[porch] [DRY RUN] Would invoke Claude for phase: ${phaseId}`));
    return '';
  }

  if (options.noClaude) {
    console.log(chalk.blue(`[porch] [NO_CLAUDE] Simulating phase: ${phaseId}`));
    await new Promise(r => setTimeout(r, 1000));
    console.log(chalk.green(`[porch] Simulated completion of phase: ${phaseId}`));
    return '';
  }

  console.log(chalk.cyan(`[phase] Invoking Claude for phase: ${phaseId}`));

  const statusContent = fs.readFileSync(statusFile, 'utf-8');

  const fullPrompt = `## Protocol: ${protocol.name}
## Phase: ${phaseId}

## Current Status
\`\`\`yaml
${statusContent}
\`\`\`

## Task
Execute the ${phaseId} phase for project ${projectId}

## Phase Instructions
${promptContent}

## Important
- Project ID: ${projectId}
- Protocol: ${protocol.name}
- Follow the instructions above precisely
- Output <signal>...</signal> tags when you reach completion points
`;

  return new Promise((resolve, reject) => {
    const args = ['--print', '-p', fullPrompt, '--dangerously-skip-permissions'];
    const proc = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let output = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude exited with code ${code}\n${stderr}`));
      } else {
        resolve(output);
      }
    });

    proc.on('error', reject);
  });
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Initialize a new project with a protocol
 */
export async function init(
  protocolName: string,
  projectId: string,
  projectName: string,
  options: PorchInitOptions = {}
): Promise<void> {
  const projectRoot = findProjectRoot();
  const protocol = loadProtocol(protocolName, projectRoot);

  const statusDir = path.join(projectRoot, STATUS_DIR);
  fs.mkdirSync(statusDir, { recursive: true });

  const statusFile = path.join(statusDir, `${projectId}-${projectName}.md`);

  // Build gates YAML
  let gatesYaml = 'gates:';
  if (protocol.gates.length > 0) {
    for (const gate of protocol.gates) {
      gatesYaml += `\n  ${gate.id}:\n    human: { status: pending }`;
    }
  } else {
    gatesYaml = 'gates: {}';
  }

  const timestamp = new Date().toISOString();
  const logTimestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

  const content = `---
# Protocol Orchestrator Status File
# Protocol: ${protocolName}
# Project: ${projectId} - ${projectName}
# Created: ${timestamp}

id: "${projectId}"
title: "${projectName}"
protocol: "${protocolName}"
current_state: "${protocol.initial_state}"
current_phase: ""

# Human approval gates
${gatesYaml}

# Backpressure gates
backpressure:
  tests_pass: { status: pending }
  build_pass: { status: pending }

# Implementation phase tracking
phases: {}
---

## Project Description

${options.description || '<!-- Add a brief description of what this project will build -->'}

## Log

- ${logTimestamp}: Initialized ${protocolName} protocol
`;

  fs.writeFileSync(statusFile, content);

  console.log(chalk.green(`[porch] Initialized project ${projectId} with protocol ${protocolName}`));
  console.log(chalk.blue(`[porch] Status file: ${statusFile}`));
  console.log(chalk.blue(`[porch] Initial state: ${protocol.initial_state}`));
}

/**
 * Run the protocol loop for a project
 */
export async function run(
  protocolName: string,
  projectId: string,
  options: PorchRunOptions = {}
): Promise<void> {
  const projectRoot = findProjectRoot();
  const protocol = loadProtocol(protocolName, projectRoot);

  const statusFile = findStatusFile(projectId, projectRoot);
  if (!statusFile) {
    throw new Error(
      `Status file not found for project: ${projectId}\n` +
      `Run: codev porch init ${protocolName} ${projectId} <project-name>`
    );
  }

  const pollInterval = options.pollInterval || protocol.config.poll_interval;
  const maxIterations = protocol.config.max_iterations;

  console.log(chalk.blue(`[porch] Starting ${protocolName} loop for project ${projectId}`));
  console.log(chalk.blue(`[porch] Status file: ${statusFile}`));
  console.log(chalk.blue(`[porch] Poll interval: ${pollInterval}s`));

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(chalk.blue('━'.repeat(40)));
    console.log(chalk.blue(`[porch] Iteration ${iteration}`));
    console.log(chalk.blue('━'.repeat(40)));

    // Fresh read of state each iteration
    const state = getState(statusFile);
    console.log(chalk.blue(`[porch] Current state: ${state}`));

    // Parse state into phase and substate
    const phaseId = state.split(':')[0];

    // Check if terminal phase
    if (isTerminalPhase(protocol, phaseId)) {
      console.log(chalk.green('━'.repeat(40)));
      console.log(chalk.green(`[porch] ${protocolName} loop COMPLETE`));
      console.log(chalk.green(`[porch] Project ${projectId} finished all phases`));
      console.log(chalk.green('━'.repeat(40)));
      return;
    }

    // Check for gate blocking
    const gateId = getGateForState(protocol, state);

    if (gateId) {
      console.log(chalk.cyan(`[phase] Phase: ${phaseId} (waiting for gate: ${gateId})`));

      if (checkGate(statusFile, gateId)) {
        const nextState = getGateNextState(protocol, gateId);
        if (nextState) {
          console.log(chalk.green(`[porch] Gate ${gateId} passed! Proceeding to ${nextState}`));
          setState(statusFile, nextState);
        }
      } else {
        console.log(chalk.yellow(`[porch] BLOCKED - Waiting for gate: ${gateId}`));
        console.log(chalk.yellow(`[porch] To approve: codev porch approve ${projectId} ${gateId}`));
        await new Promise(r => setTimeout(r, pollInterval * 1000));
      }
      continue;
    }

    // Execute phase
    console.log(chalk.cyan(`[phase] Phase: ${phaseId}`));
    const output = await invokeClaude(protocol, phaseId, statusFile, projectId, projectRoot, options);
    const signal = extractSignal(output);

    if (signal) {
      console.log(chalk.green(`[porch] Signal received: ${signal}`));

      // Get next state from signal
      const nextState = getSignalNextState(protocol, phaseId, signal);

      if (nextState) {
        setState(statusFile, nextState);
      } else {
        // Use default transition
        const defaultNext = getDefaultTransition(protocol, state);
        if (defaultNext) {
          setState(statusFile, defaultNext);
        } else {
          console.log(chalk.yellow(`[porch] No transition defined for signal: ${signal}`));
        }
      }
    } else {
      // No signal - use default transition
      const defaultNext = getDefaultTransition(protocol, state);
      if (defaultNext) {
        setState(statusFile, defaultNext);
      }
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  throw new Error(`Max iterations (${maxIterations}) reached!`);
}

/**
 * Approve a gate
 */
export async function approve(projectId: string, gateId: string): Promise<void> {
  const projectRoot = findProjectRoot();
  const statusFile = findStatusFile(projectId, projectRoot);

  if (!statusFile) {
    throw new Error(`Status file not found for project: ${projectId}`);
  }

  approveGateInFile(statusFile, gateId);
  console.log(chalk.green(`[porch] Approved: ${gateId}`));
}

/**
 * Show project status
 */
export async function status(projectId: string): Promise<void> {
  const projectRoot = findProjectRoot();
  const statusFile = findStatusFile(projectId, projectRoot);

  if (!statusFile) {
    throw new Error(`Status file not found for project: ${projectId}`);
  }

  console.log(chalk.blue(`[porch] Status for project ${projectId}:`));
  console.log('');
  console.log(fs.readFileSync(statusFile, 'utf-8'));
}

/**
 * List available protocols
 */
export async function list(): Promise<void> {
  const projectRoot = findProjectRoot();
  const protocols = listProtocols(projectRoot);

  console.log(chalk.blue('[porch] Available protocols:'));
  for (const name of protocols) {
    try {
      const protocol = loadProtocol(name, projectRoot);
      console.log(`  - ${name}: ${protocol.description}`);
    } catch {
      console.log(`  - ${name}: (error loading)`);
    }
  }
}

/**
 * Show protocol definition
 */
export async function show(protocolName: string): Promise<void> {
  const projectRoot = findProjectRoot();
  const protocol = loadProtocol(protocolName, projectRoot);

  console.log(chalk.blue(`[porch] Protocol: ${protocolName}`));
  console.log('');
  console.log(JSON.stringify(protocol, null, 2));
}

/**
 * Main porch entry point - handles subcommands
 */
export interface PorchOptions {
  subcommand: string;
  args: string[];
  dryRun?: boolean;
  noClaude?: boolean;
  pollInterval?: number;
  description?: string;
}

export async function porch(options: PorchOptions): Promise<void> {
  const { subcommand, args, dryRun, noClaude, pollInterval, description } = options;

  switch (subcommand.toLowerCase()) {
    case 'run': {
      if (args.length < 2) {
        throw new Error('Usage: codev porch run <protocol> <project-id>');
      }
      await run(args[0], args[1], { dryRun, noClaude, pollInterval });
      break;
    }

    case 'init': {
      if (args.length < 3) {
        throw new Error('Usage: codev porch init <protocol> <project-id> <project-name>');
      }
      await init(args[0], args[1], args[2], { description });
      break;
    }

    case 'approve': {
      if (args.length < 2) {
        throw new Error('Usage: codev porch approve <project-id> <gate-id>');
      }
      await approve(args[0], args[1]);
      break;
    }

    case 'status': {
      if (args.length < 1) {
        throw new Error('Usage: codev porch status <project-id>');
      }
      await status(args[0]);
      break;
    }

    case 'list':
    case 'list-protocols': {
      await list();
      break;
    }

    case 'show':
    case 'show-protocol': {
      if (args.length < 1) {
        throw new Error('Usage: codev porch show <protocol>');
      }
      await show(args[0]);
      break;
    }

    default:
      throw new Error(
        `Unknown subcommand: ${subcommand}\n` +
        'Valid subcommands: run, init, approve, status, list, show'
      );
  }
}

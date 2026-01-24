/**
 * Porch REPL - Interactive command loop while Claude runs
 *
 * Commands:
 *   t / tail     - Tail Claude's output file
 *   c / claude   - Kill current Claude and invoke manually (interactive)
 *   a / approve  - Approve current gate
 *   s / status   - Show current status
 *   q / quit     - Kill Claude and exit
 *   Enter        - Refresh status display
 */

import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { spawn, type ChildProcess } from 'node:child_process';
import chalk from 'chalk';
import { readState, writeState } from './state.js';
import { getPhaseConfig, isPhased, getPhaseGate } from './protocol.js';
import { getCurrentPlanPhase } from './plan.js';
import { watchForSignal, type Signal } from './signals.js';
import type { ClaudeProcess } from './claude.js';
import type { ProjectState, Protocol } from './types.js';

export type ReplAction =
  | { type: 'quit' }
  | { type: 'signal'; signal: Signal }
  | { type: 'claude_exit'; exitCode: number }
  | { type: 'approved' }
  | { type: 'manual_claude' };

/**
 * Run the REPL while Claude is working.
 * Returns when Claude exits, a signal is detected, or user quits.
 */
export async function runRepl(
  state: ProjectState,
  claude: ClaudeProcess,
  outputPath: string,
  statusPath: string,
  projectRoot: string,
  protocol: Protocol
): Promise<ReplAction> {
  const startTime = Date.now();

  // Start watching for signals
  const signalWatcher = watchForSignal(outputPath);

  // Set up readline for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Track tail process if running
  let tailProcess: ChildProcess | null = null;

  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      signalWatcher.stop();
      rl.close();
      if (tailProcess) {
        tailProcess.kill();
        tailProcess = null;
      }
    };

    // Check for signals periodically
    const signalInterval = setInterval(async () => {
      const signal = await signalWatcher.check();
      if (signal) {
        cleanup();
        resolve({ type: 'signal', signal });
      }
    }, 1000);

    // Handle Claude exit
    claude.onExit((code) => {
      clearInterval(signalInterval);
      cleanup();
      resolve({ type: 'claude_exit', exitCode: code });
    });

    // Show initial prompt
    showPrompt(state, startTime, claude);

    // Handle user input
    rl.on('line', async (input) => {
      const cmd = input.trim().toLowerCase();

      // Stop tail if running
      if (tailProcess) {
        tailProcess.kill();
        tailProcess = null;
      }

      switch (cmd) {
        case '':
          // Refresh status
          showStatus(state, protocol, startTime, claude);
          showPrompt(state, startTime, claude);
          break;

        case 't':
        case 'tail':
          console.log(chalk.dim('\nTailing Claude output (Ctrl+C to stop)...\n'));
          tailProcess = spawn('tail', ['-f', outputPath], {
            stdio: 'inherit',
          });
          tailProcess.on('close', () => {
            tailProcess = null;
            showPrompt(state, startTime, claude);
          });
          break;

        case 'c':
        case 'claude':
          // Kill current Claude and return to spawn manually
          console.log(chalk.yellow('\nKilling current Claude session...'));
          claude.kill();
          console.log(chalk.cyan('Returning to porch. Claude will be respawned.'));
          console.log(chalk.dim('Use this to intervene manually or adjust approach.'));
          clearInterval(signalInterval);
          cleanup();
          resolve({ type: 'manual_claude' });
          break;

        case 'a':
        case 'approve':
          const gateName = getPhaseGate(protocol, state.phase);
          if (gateName && state.gates[gateName]?.status === 'pending') {
            state.gates[gateName].status = 'approved';
            state.gates[gateName].approved_at = new Date().toISOString();
            writeState(statusPath, state);
            console.log(chalk.green(`\nGate ${gateName} approved.`));
            clearInterval(signalInterval);
            cleanup();
            resolve({ type: 'approved' });
          } else {
            console.log(chalk.dim('\nNo gate pending approval.'));
            showPrompt(state, startTime, claude);
          }
          break;

        case 's':
        case 'status':
          showStatus(state, protocol, startTime, claude);
          showPrompt(state, startTime, claude);
          break;

        case 'q':
        case 'quit':
          clearInterval(signalInterval);
          cleanup();
          resolve({ type: 'quit' });
          break;

        case 'help':
        case '?':
          showHelp();
          showPrompt(state, startTime, claude);
          break;

        default:
          console.log(chalk.dim(`Unknown command: ${cmd}. Type 'help' for commands.`));
          showPrompt(state, startTime, claude);
      }
    });
  });
}

/**
 * Show the REPL prompt with status.
 */
function showPrompt(state: ProjectState, startTime: number, claude: ClaudeProcess): void {
  const elapsed = formatElapsed(Date.now() - startTime);
  const status = claude.isRunning() ? chalk.green('running') : chalk.red('exited');

  process.stdout.write(
    chalk.cyan(`[${state.id}] claude: ${status} (${elapsed}) > `)
  );
}

/**
 * Show detailed status.
 */
function showStatus(state: ProjectState, protocol: Protocol, startTime: number, claude: ClaudeProcess): void {
  const phaseConfig = getPhaseConfig(protocol, state.phase);
  const elapsed = formatElapsed(Date.now() - startTime);

  console.log('');
  console.log(chalk.bold('─'.repeat(50)));
  console.log(`  Project: ${state.id} - ${state.title}`);
  console.log(`  Protocol: ${state.protocol}`);
  console.log(`  Phase: ${state.phase} (${phaseConfig?.name || 'unknown'})`);

  if (isPhased(protocol, state.phase) && state.plan_phases.length > 0) {
    const currentPlanPhase = getCurrentPlanPhase(state.plan_phases);
    if (currentPlanPhase) {
      console.log(`  Plan Phase: ${currentPlanPhase.id} - ${currentPlanPhase.title}`);
    }
  }

  const gateName = getPhaseGate(protocol, state.phase);
  if (gateName) {
    const gateStatus = state.gates[gateName]?.status || 'pending';
    const icon = gateStatus === 'approved' ? chalk.green('✓') : chalk.yellow('○');
    console.log(`  Gate: ${gateName} ${icon}`);
  }

  console.log(`  Claude: ${claude.isRunning() ? 'running' : 'exited'} (${elapsed})`);
  console.log(chalk.bold('─'.repeat(50)));
  console.log('');
}

/**
 * Show help text.
 */
function showHelp(): void {
  console.log('');
  console.log(chalk.bold('Commands:'));
  console.log('  t / tail     - Tail Claude output');
  console.log('  c / claude   - Kill Claude and respawn (for manual intervention)');
  console.log('  a / approve  - Approve pending gate');
  console.log('  s / status   - Show detailed status');
  console.log('  q / quit     - Kill Claude and exit porch');
  console.log('  Enter        - Refresh prompt');
  console.log('  help / ?     - Show this help');
  console.log('');
}

/**
 * Format elapsed time.
 */
function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

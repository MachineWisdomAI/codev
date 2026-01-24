/**
 * Claude process management for Porch
 *
 * Spawns Claude with output to a file for monitoring.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';

export interface ClaudeProcess {
  /**
   * Kill the Claude process.
   */
  kill(): void;

  /**
   * Check if Claude is still running.
   */
  isRunning(): boolean;

  /**
   * Get the exit code (null if still running).
   */
  getExitCode(): number | null;

  /**
   * Register a callback for when Claude exits.
   */
  onExit(callback: (code: number) => void): void;
}

/**
 * Spawn Claude with the given prompt.
 * Output goes to the specified file.
 */
export function spawnClaude(
  prompt: string,
  outputPath: string,
  cwd: string
): ClaudeProcess {
  // Open file for writing
  const outputFd = fs.openSync(outputPath, 'w');

  // Spawn Claude with the prompt
  // Using --print mode so output goes to stdout/stderr which we capture
  const proc = spawn('claude', ['--print', '-p', prompt], {
    cwd,
    stdio: ['ignore', outputFd, outputFd],
    env: {
      ...process.env,
      // Ensure Claude doesn't try to use interactive features
      CI: '1',
    },
  });

  let exitCode: number | null = null;
  let running = true;
  const exitCallbacks: Array<(code: number) => void> = [];

  proc.on('close', (code) => {
    exitCode = code ?? 1;
    running = false;
    fs.closeSync(outputFd);

    for (const callback of exitCallbacks) {
      callback(exitCode);
    }
  });

  proc.on('error', (err) => {
    console.error('Claude spawn error:', err.message);
    running = false;
    fs.closeSync(outputFd);
  });

  return {
    kill() {
      if (running) {
        proc.kill('SIGTERM');
        // Give it a moment, then force kill if needed
        setTimeout(() => {
          if (running) {
            proc.kill('SIGKILL');
          }
        }, 3000);
      }
    },

    isRunning() {
      return running;
    },

    getExitCode() {
      return exitCode;
    },

    onExit(callback) {
      if (!running && exitCode !== null) {
        // Already exited, call immediately
        callback(exitCode);
      } else {
        exitCallbacks.push(callback);
      }
    },
  };
}

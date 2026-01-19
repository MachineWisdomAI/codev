#!/usr/bin/env node

/**
 * Porch CLI - Protocol Orchestrator (standalone entry point)
 */

import { Command } from 'commander';
import { porch } from '../dist/commands/porch/index.js';
import { version } from '../dist/version.js';

const program = new Command();

program
  .name('porch')
  .description('Protocol orchestrator - run development protocols')
  .version(version)
  .argument('<subcommand>', 'Subcommand: run, init, approve, status, pending, list, show')
  .argument('[args...]', 'Arguments for the subcommand')
  .option('-n, --dry-run', 'Show what would execute without running')
  .option('--no-claude', 'Skip Claude invocations (for testing)')
  .option('-p, --poll-interval <seconds>', 'Override poll interval for gate checks')
  .option('-d, --description <text>', 'Project description (for init)')
  .option('-w, --worktree <path>', 'Worktree path (for init)')
  .action(async (subcommand, args, options) => {
    try {
      await porch({
        subcommand,
        args,
        dryRun: options.dryRun,
        noClaude: !options.claude,
        pollInterval: options.pollInterval ? parseInt(options.pollInterval, 10) : undefined,
        description: options.description,
        worktree: options.worktree,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();

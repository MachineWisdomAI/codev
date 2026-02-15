/**
 * Regression test for bugfix #280:
 * Consult: Codex still reviewing git diff instead of reading files directly
 *
 * The bug: buildImplQuery used `git diff ${mergeBase}..HEAD` (commit-to-commit)
 * which missed uncommitted changes in builder worktrees. Models would get an
 * incomplete file list and fall back to git diffs, producing false positives.
 *
 * The fix: Use `git diff ${mergeBase}` (working tree diff) to include both
 * committed and uncommitted changes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// _getDiffStat is exported for testing from the consult module
import { _getDiffStat as getDiffStat } from '../commands/consult/index.js';

describe('bugfix #280: getDiffStat includes uncommitted changes', () => {
  let tmpDir: string;
  let mergeBase: string;

  beforeEach(() => {
    // Create a temporary git repo
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugfix-280-'));

    // Initialize repo with a main branch
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });

    // Create initial commit on main
    fs.writeFileSync(path.join(tmpDir, 'base.txt'), 'base content');
    execSync('git add base.txt', { cwd: tmpDir });
    execSync('git commit -m "initial"', { cwd: tmpDir });

    // Create a feature branch
    execSync('git checkout -b feature', { cwd: tmpDir });

    // Add a committed change on feature branch
    fs.writeFileSync(path.join(tmpDir, 'committed.txt'), 'committed content');
    execSync('git add committed.txt', { cwd: tmpDir });
    execSync('git commit -m "add committed file"', { cwd: tmpDir });

    // Add an uncommitted modification to a tracked file (the scenario that caused the bug).
    // Note: git diff only shows changes to tracked files, not untracked files.
    // In builder worktrees, the common case is modifying existing files without committing.
    fs.writeFileSync(path.join(tmpDir, 'base.txt'), 'modified base content');

    // Get merge base for diffing
    mergeBase = execSync('git merge-base HEAD main', { cwd: tmpDir, encoding: 'utf-8' }).trim();
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getDiffStat with mergeBase (fixed) includes uncommitted modifications', () => {
    // This is the FIXED behavior: git diff <mergeBase> compares merge-base to working tree,
    // so it includes both committed changes AND uncommitted modifications to tracked files.
    const result = getDiffStat(tmpDir, mergeBase);

    expect(result.files).toContain('committed.txt');
    // base.txt was modified but not committed — working tree diff catches it
    expect(result.files).toContain('base.txt');
  });

  it('getDiffStat with mergeBase..HEAD (old bug) misses uncommitted modifications', () => {
    // This demonstrates the BUG: git diff <mergeBase>..HEAD is commit-to-commit only,
    // so uncommitted working tree changes are invisible.
    const result = getDiffStat(tmpDir, `${mergeBase}..HEAD`);

    expect(result.files).toContain('committed.txt');
    // base.txt was modified but not committed — commit-to-commit diff misses it
    expect(result.files).not.toContain('base.txt');
  });
});

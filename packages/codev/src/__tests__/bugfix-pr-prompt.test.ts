/**
 * Regression test for GitHub Issue #335
 *
 * Bugfix builders were notifying the architect before CMAP review results
 * came back. This test verifies the PR prompt contains explicit blocking
 * instructions that prevent notification before all three consultations
 * have returned results.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('bugfix PR prompt (#335)', () => {
  const promptPath = path.resolve(
    import.meta.dirname,
    '../../../../codev-skeleton/protocols/bugfix/prompts/pr.md'
  );

  it('should contain explicit wait instruction before notify step', () => {
    const content = fs.readFileSync(promptPath, 'utf-8');

    // Must tell builders to wait for ALL THREE results
    expect(content).toMatch(/ALL THREE consultations have returned results/i);
  });

  it('should require CMAP verdicts before notification', () => {
    const content = fs.readFileSync(promptPath, 'utf-8');

    // Must tell builders NOT to notify before having verdicts
    expect(content).toMatch(/DO NOT.*notify.*until.*CMAP verdicts/is);
  });

  it('should require per-model verdicts in the notification message', () => {
    const content = fs.readFileSync(promptPath, 'utf-8');

    // The notification template must reference individual model verdicts
    // so the builder can't send a generic "CMAP in progress" message
    expect(content).toContain('gemini=');
    expect(content).toContain('codex=');
    expect(content).toContain('claude=');
  });
});

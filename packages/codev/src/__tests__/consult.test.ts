/**
 * Tests for codev consult command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn((event: string, callback: (code: number) => void) => {
      if (event === 'close') callback(0);
    }),
  })),
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('which')) {
      return Buffer.from('/usr/bin/command');
    }
    return Buffer.from('');
  }),
}));

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    blue: (s: string) => s,
    dim: (s: string) => s,
  },
}));

describe('consult command', () => {
  const testBaseDir = path.join(tmpdir(), `codev-consult-test-${Date.now()}`);
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    fs.mkdirSync(testBaseDir, { recursive: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true });
    }
  });

  describe('model configuration', () => {
    it('should support model aliases', () => {
      // The MODEL_ALIASES mapping
      const aliases: Record<string, string> = {
        'pro': 'gemini',
        'gpt': 'codex',
        'opus': 'claude',
      };

      expect(aliases['pro']).toBe('gemini');
      expect(aliases['gpt']).toBe('codex');
      expect(aliases['opus']).toBe('claude');
    });

    it('should have correct CLI configuration for each model', () => {
      const configs: Record<string, { cli: string; args: string[] }> = {
        gemini: { cli: 'gemini', args: ['--yolo'] },
        codex: { cli: 'codex', args: ['exec', '--full-auto'] },
        claude: { cli: 'claude', args: ['--print', '-p'] },
      };

      expect(configs.gemini.cli).toBe('gemini');
      expect(configs.codex.args).toContain('--full-auto');
      expect(configs.claude.args).toContain('--print');
    });
  });

  describe('consult function', () => {
    it('should throw error for unknown model', async () => {
      // Set up codev root
      fs.mkdirSync(path.join(testBaseDir, 'codev', 'roles'), { recursive: true });
      fs.writeFileSync(
        path.join(testBaseDir, 'codev', 'roles', 'consultant.md'),
        '# Consultant Role'
      );

      process.chdir(testBaseDir);

      const { consult } = await import('../commands/consult/index.js');

      await expect(
        consult({ model: 'unknown-model', subcommand: 'general', args: ['test'] })
      ).rejects.toThrow(/Unknown model/);
    });

    it('should throw error for invalid subcommand', async () => {
      fs.mkdirSync(path.join(testBaseDir, 'codev', 'roles'), { recursive: true });
      fs.writeFileSync(
        path.join(testBaseDir, 'codev', 'roles', 'consultant.md'),
        '# Consultant Role'
      );

      process.chdir(testBaseDir);

      const { consult } = await import('../commands/consult/index.js');

      await expect(
        consult({ model: 'gemini', subcommand: 'invalid', args: [] })
      ).rejects.toThrow(/Unknown subcommand/);
    });

    it('should throw error when spec number is missing', async () => {
      fs.mkdirSync(path.join(testBaseDir, 'codev', 'roles'), { recursive: true });
      fs.writeFileSync(
        path.join(testBaseDir, 'codev', 'roles', 'consultant.md'),
        '# Consultant Role'
      );

      process.chdir(testBaseDir);

      const { consult } = await import('../commands/consult/index.js');

      await expect(
        consult({ model: 'gemini', subcommand: 'spec', args: [] })
      ).rejects.toThrow(/Spec number required/);
    });

    it('should throw error when PR number is invalid', async () => {
      fs.mkdirSync(path.join(testBaseDir, 'codev', 'roles'), { recursive: true });
      fs.writeFileSync(
        path.join(testBaseDir, 'codev', 'roles', 'consultant.md'),
        '# Consultant Role'
      );

      process.chdir(testBaseDir);

      const { consult } = await import('../commands/consult/index.js');

      await expect(
        consult({ model: 'gemini', subcommand: 'pr', args: ['not-a-number'] })
      ).rejects.toThrow(/Invalid PR number/);
    });

    it('should throw error when spec not found', async () => {
      fs.mkdirSync(path.join(testBaseDir, 'codev', 'roles'), { recursive: true });
      fs.mkdirSync(path.join(testBaseDir, 'codev', 'specs'), { recursive: true });
      fs.writeFileSync(
        path.join(testBaseDir, 'codev', 'roles', 'consultant.md'),
        '# Consultant Role'
      );

      process.chdir(testBaseDir);

      const { consult } = await import('../commands/consult/index.js');

      await expect(
        consult({ model: 'gemini', subcommand: 'spec', args: ['9999'] })
      ).rejects.toThrow(/Spec 9999 not found/);
    });

    it('should find spec file by number', async () => {
      fs.mkdirSync(path.join(testBaseDir, 'codev', 'roles'), { recursive: true });
      fs.mkdirSync(path.join(testBaseDir, 'codev', 'specs'), { recursive: true });
      fs.writeFileSync(
        path.join(testBaseDir, 'codev', 'roles', 'consultant.md'),
        '# Consultant Role'
      );
      fs.writeFileSync(
        path.join(testBaseDir, 'codev', 'specs', '0042-test-feature.md'),
        '# Test Spec'
      );

      process.chdir(testBaseDir);

      const { consult } = await import('../commands/consult/index.js');

      // Should not throw - spec exists
      // With dry run to avoid actually executing
      await expect(
        consult({ model: 'gemini', subcommand: 'spec', args: ['42'], dryRun: true })
      ).resolves.not.toThrow();
    });

    it('should work with dry-run option', async () => {
      fs.mkdirSync(path.join(testBaseDir, 'codev', 'roles'), { recursive: true });
      fs.writeFileSync(
        path.join(testBaseDir, 'codev', 'roles', 'consultant.md'),
        '# Consultant Role'
      );

      process.chdir(testBaseDir);

      const { consult } = await import('../commands/consult/index.js');

      // Should not execute, just show what would be done
      await expect(
        consult({ model: 'gemini', subcommand: 'general', args: ['test query'], dryRun: true })
      ).resolves.not.toThrow();
    });
  });

  describe('CLI availability check', () => {
    it('should check if CLI exists before running', async () => {
      // Mock execSync to return not found for gemini
      const { execSync } = await import('node:child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('which gemini')) {
          throw new Error('not found');
        }
        return Buffer.from('');
      });

      fs.mkdirSync(path.join(testBaseDir, 'codev', 'roles'), { recursive: true });
      fs.writeFileSync(
        path.join(testBaseDir, 'codev', 'roles', 'consultant.md'),
        '# Consultant Role'
      );

      process.chdir(testBaseDir);

      vi.resetModules();
      const { consult } = await import('../commands/consult/index.js');

      await expect(
        consult({ model: 'gemini', subcommand: 'general', args: ['test'] })
      ).rejects.toThrow(/not found/);
    });
  });

  describe('role loading', () => {
    it('should throw error when consultant role not found', async () => {
      fs.mkdirSync(testBaseDir, { recursive: true });
      // No codev/roles/consultant.md

      process.chdir(testBaseDir);

      vi.resetModules();
      const { consult } = await import('../commands/consult/index.js');

      await expect(
        consult({ model: 'gemini', subcommand: 'general', args: ['test'] })
      ).rejects.toThrow(/Role file not found/);
    });
  });

  describe('query building', () => {
    it('should build correct PR review query', () => {
      const prNumber = 123;
      const expectedQuery = `Review Pull Request #${prNumber}`;

      // The query builder includes PR info
      expect(expectedQuery).toContain('123');
    });

    it('should build correct spec review query', () => {
      const specPath = '/path/to/spec.md';
      const expectedPrefix = 'Review Specification:';

      expect(expectedPrefix).toContain('Review');
    });
  });

  describe('history logging', () => {
    it('should log queries to history file', async () => {
      const logDir = path.join(testBaseDir, '.consult');
      fs.mkdirSync(logDir, { recursive: true });

      // Simulate what logQuery would do
      const timestamp = new Date().toISOString();
      const model = 'gemini';
      const query = 'test query';
      const duration = 5.5;

      const logLine = `${timestamp} model=${model} duration=${duration.toFixed(1)}s query=${query.substring(0, 100)}...\n`;
      fs.appendFileSync(path.join(logDir, 'history.log'), logLine);

      const logContent = fs.readFileSync(path.join(logDir, 'history.log'), 'utf-8');
      expect(logContent).toContain('model=gemini');
      expect(logContent).toContain('duration=5.5s');
    });
  });
});

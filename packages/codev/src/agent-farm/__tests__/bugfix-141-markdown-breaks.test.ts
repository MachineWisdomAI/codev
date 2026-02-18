/**
 * Regression test for bugfix #141: Markdown preview doesn't show separate lines
 *
 * The bug: In the markdown preview mode of open.html, lines separated by single
 * newlines (without blank lines between them) were merged into a single paragraph.
 * For example:
 *   **Status**: Draft
 *   **Protocol**: SPIDER
 *   **Created**: 2026-01-06
 *
 * Rendered as: **Status**: Draft **Protocol**: SPIDER **Created**: 2026-01-06
 *
 * This is standard Markdown behavior (soft wraps → single paragraph), but differs
 * from GitHub Flavored Markdown where single newlines become <br> tags.
 *
 * The fix: Set `breaks: true` in the marked.js configuration via `marked.use()`.
 * This makes single newlines produce <br> tags, matching GitHub's behavior.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

describe('Bugfix #141: Markdown preview line breaks', () => {
  const templatePath = resolve(
    import.meta.dirname,
    '../../../templates/open.html',
  );

  describe('source file contains the fix', () => {
    it('should configure marked.js with breaks: true', () => {
      const html = readFileSync(templatePath, 'utf-8');

      // The fix: marked.use() must include breaks: true
      expect(html).toContain('breaks: true');
    });

    it('should call configureMarked() before marked.parse() in renderPreview', () => {
      const html = readFileSync(templatePath, 'utf-8');

      // configureMarked() must appear before marked.parse() in renderPreview
      const configureIdx = html.indexOf('configureMarked()');
      const parseIdx = html.indexOf('marked.parse(currentContent)');

      expect(configureIdx).toBeGreaterThan(-1);
      expect(parseIdx).toBeGreaterThan(-1);
      expect(configureIdx).toBeLessThan(parseIdx);
    });
  });

  describe('marked.js breaks option produces correct output', () => {
    // Load the bundled marked.min.js in a VM sandbox
    function loadMarked() {
      const markedPath = resolve(
        import.meta.dirname,
        '../../../templates/vendor/marked.min.js',
      );
      const code = readFileSync(markedPath, 'utf-8');
      const sandbox = {
        window: {} as Record<string, unknown>,
        exports: {} as Record<string, unknown>,
        module: { exports: {} as Record<string, unknown> },
        self: {} as Record<string, unknown>,
        globalThis: {} as Record<string, unknown>,
      };
      const ctx = createContext(sandbox);
      runInContext(code, ctx);
      return (sandbox.marked ||
        sandbox.module.exports.marked ||
        sandbox.exports.marked) as {
        parse: (input: string) => string;
        use: (opts: Record<string, unknown>) => void;
      };
    }

    it('should merge lines into single paragraph WITHOUT breaks (confirms bug)', () => {
      const marked = loadMarked();
      const input =
        '**Status**: Draft\n**Protocol**: SPIDER\n**Created**: 2026-01-06';
      const result = marked.parse(input);

      // Without breaks: true, single newlines do NOT produce <br> tags
      expect(result).not.toContain('<br>');
      // All content is in one paragraph
      expect(result).toContain('<strong>Status</strong>');
      expect(result).toContain('<strong>Protocol</strong>');
    });

    it('should add <br> tags for single newlines WITH breaks: true (confirms fix)', () => {
      const marked = loadMarked();
      marked.use({ breaks: true });

      const input =
        '**Status**: Draft\n**Protocol**: SPIDER\n**Created**: 2026-01-06';
      const result = marked.parse(input);

      // With breaks: true, single newlines become <br> tags
      expect(result).toContain('<br>');
      // Each line should be separated by <br>
      expect(result).toMatch(
        /Draft\s*<br>\s*<strong>Protocol<\/strong>/,
      );
      expect(result).toMatch(
        /SPIDER\s*<br>\s*<strong>Created<\/strong>/,
      );
    });

    it('should not affect double-newline paragraph breaks', () => {
      const marked = loadMarked();
      marked.use({ breaks: true });

      const input = 'Paragraph one.\n\nParagraph two.';
      const result = marked.parse(input);

      // Double newlines still create separate paragraphs
      expect(result).toContain('<p>Paragraph one.</p>');
      expect(result).toContain('<p>Paragraph two.</p>');
    });
  });
});

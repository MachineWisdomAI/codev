/**
 * Regression test for bugfix #286: Annotator popup renders half off-screen on mobile
 *
 * The bug: openDialog() in open.html used a hardcoded dialogWidth of 700px for
 * positioning calculations, but CSS max-width: 90vw constrained the actual width
 * on mobile. On a 375px viewport, the repositioning math produced negative left
 * values (375 - 700 - 20 = -345), pushing the dialog off-screen.
 *
 * The fix: Use Math.min(700, window.innerWidth * 0.9) for dialogWidth and clamp
 * left to a minimum margin.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Extract the positioning logic from open.html and replicate it here
 * to verify the math works for various viewport sizes.
 */
function calculateDialogPosition(
  viewportWidth: number,
  viewportHeight: number,
  clickRight: number,
  clickTop: number,
): { left: number; top: number; dialogWidth: number } {
  // This mirrors the logic in open.html openDialog()
  const dialogWidth = Math.min(700, viewportWidth * 0.9);
  const dialogHeight = 350;
  const margin = 10;

  let left = clickRight + 10;
  let top = clickTop;

  // Keep dialog in viewport
  if (left + dialogWidth > viewportWidth - margin) {
    left = (viewportWidth - dialogWidth) / 2;
  }
  if (left < margin) left = margin;
  if (top + dialogHeight > viewportHeight) {
    top = viewportHeight - dialogHeight - 20;
  }
  if (top < 60) top = 60;

  return { left, top, dialogWidth };
}

describe('Bugfix #286: Annotator dialog positioning', () => {
  describe('mobile viewports', () => {
    it('should keep dialog on-screen for iPhone SE (375px)', () => {
      const result = calculateDialogPosition(375, 667, 40, 200);
      expect(result.left).toBeGreaterThanOrEqual(0);
      expect(result.left + result.dialogWidth).toBeLessThanOrEqual(375);
    });

    it('should keep dialog on-screen for small Android (360px)', () => {
      const result = calculateDialogPosition(360, 640, 30, 150);
      expect(result.left).toBeGreaterThanOrEqual(0);
      expect(result.left + result.dialogWidth).toBeLessThanOrEqual(360);
    });

    it('should keep dialog on-screen for iPhone 14 Pro Max (430px)', () => {
      const result = calculateDialogPosition(430, 932, 50, 300);
      expect(result.left).toBeGreaterThanOrEqual(0);
      expect(result.left + result.dialogWidth).toBeLessThanOrEqual(430);
    });

    it('should center dialog on narrow viewport when it cannot fit to the right', () => {
      const result = calculateDialogPosition(375, 667, 40, 200);
      const dialogWidth = Math.min(700, 375 * 0.9); // 337.5
      // Centered: (375 - 337.5) / 2 = 18.75
      expect(result.left).toBeCloseTo(18.75, 1);
    });
  });

  describe('tablet viewports', () => {
    it('should keep dialog on-screen for iPad (768px)', () => {
      const result = calculateDialogPosition(768, 1024, 60, 200);
      expect(result.left).toBeGreaterThanOrEqual(0);
      expect(result.left + result.dialogWidth).toBeLessThanOrEqual(768);
    });
  });

  describe('desktop viewports', () => {
    it('should position dialog next to click on wide viewport', () => {
      const result = calculateDialogPosition(1920, 1080, 100, 200);
      // Should be positioned right of click point
      expect(result.left).toBe(110); // clickRight + 10
      expect(result.dialogWidth).toBe(700);
    });

    it('should reposition when dialog would overflow right edge', () => {
      const result = calculateDialogPosition(1920, 1080, 1850, 200);
      // 1860 + 700 > 1910, so should center
      expect(result.left).toBeGreaterThanOrEqual(0);
      expect(result.left + result.dialogWidth).toBeLessThanOrEqual(1920);
    });
  });

  describe('vertical positioning', () => {
    it('should not position above header (min top = 60)', () => {
      const result = calculateDialogPosition(1920, 1080, 100, 20);
      expect(result.top).toBe(60);
    });

    it('should adjust when dialog would overflow bottom', () => {
      const result = calculateDialogPosition(1920, 800, 100, 700);
      expect(result.top + 350).toBeLessThanOrEqual(800);
    });
  });

  describe('source file contains the fix', () => {
    it('should use Math.min for dialogWidth instead of hardcoded 700', () => {
      const templatePath = resolve(
        import.meta.dirname,
        '../../../templates/open.html',
      );
      const html = readFileSync(templatePath, 'utf-8');

      // The fix: dialogWidth should use Math.min, not be hardcoded
      expect(html).toContain('Math.min(700, window.innerWidth');

      // Should have a minimum left margin check
      expect(html).toMatch(/if\s*\(\s*left\s*<\s*margin\s*\)/);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { defaultSessionOptions, DEFAULT_COLS, DEFAULT_ROWS } from '../index.js';

describe('defaultSessionOptions', () => {
  it('returns correct defaults with no overrides', () => {
    const result = defaultSessionOptions();
    expect(result).toEqual({
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      restartOnExit: false,
    });
  });

  it('returns correct default values (80x24, no restart)', () => {
    const result = defaultSessionOptions();
    expect(result.cols).toBe(80);
    expect(result.rows).toBe(24);
    expect(result.restartOnExit).toBe(false);
  });

  it('applies partial overrides', () => {
    const result = defaultSessionOptions({ restartOnExit: true });
    expect(result.cols).toBe(80);
    expect(result.rows).toBe(24);
    expect(result.restartOnExit).toBe(true);
  });

  it('applies cols/rows overrides', () => {
    const result = defaultSessionOptions({ cols: 120, rows: 40 });
    expect(result.cols).toBe(120);
    expect(result.rows).toBe(40);
    expect(result.restartOnExit).toBe(false);
  });

  it('applies restart config overrides', () => {
    const result = defaultSessionOptions({
      restartOnExit: true,
      restartDelay: 2000,
      maxRestarts: 50,
      restartResetAfter: 60000,
    });
    expect(result).toEqual({
      cols: 80,
      rows: 24,
      restartOnExit: true,
      restartDelay: 2000,
      maxRestarts: 50,
      restartResetAfter: 60000,
    });
  });

  it('returns a new object each call', () => {
    const a = defaultSessionOptions();
    const b = defaultSessionOptions();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

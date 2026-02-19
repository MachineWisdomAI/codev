/**
 * Tests for af bench command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeStats, formatTime } from '../commands/bench.js';
import type { EngineResult, IterationResult } from '../commands/bench.js';

describe('af bench', () => {
  describe('computeStats', () => {
    it('should compute avg/min/max/stddev for multiple values', () => {
      const stats = computeStats([10, 20, 30]);
      expect(stats).not.toBeNull();
      expect(stats!.avg).toBe(20);
      expect(stats!.min).toBe(10);
      expect(stats!.max).toBe(30);
      expect(stats!.stddev).toBeCloseTo(10, 5);
    });

    it('should return null for empty array', () => {
      const stats = computeStats([]);
      expect(stats).toBeNull();
    });

    it('should handle single value (stddev = 0)', () => {
      const stats = computeStats([42]);
      expect(stats).not.toBeNull();
      expect(stats!.avg).toBe(42);
      expect(stats!.min).toBe(42);
      expect(stats!.max).toBe(42);
      expect(stats!.stddev).toBe(0);
    });

    it('should use sample stddev (N-1 denominator)', () => {
      // For [2, 4, 4, 4, 5, 5, 7, 9]:
      // mean = 5, sum of squared diffs = 32, sample variance = 32/7 ≈ 4.571, stddev ≈ 2.138
      const stats = computeStats([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(stats).not.toBeNull();
      expect(stats!.avg).toBe(5);
      expect(stats!.stddev).toBeCloseTo(2.138, 2);
    });

    it('should handle two identical values (stddev = 0)', () => {
      const stats = computeStats([5, 5]);
      expect(stats).not.toBeNull();
      expect(stats!.avg).toBe(5);
      expect(stats!.stddev).toBe(0);
    });
  });

  describe('formatTime', () => {
    it('should format to 1 decimal place', () => {
      expect(formatTime(12.34)).toBe('12.3s');
    });

    it('should round up correctly', () => {
      expect(formatTime(12.36)).toBe('12.4s');
    });

    it('should handle zero', () => {
      expect(formatTime(0)).toBe('0.0s');
    });

    it('should handle large values', () => {
      expect(formatTime(300.123)).toBe('300.1s');
    });

    it('should handle small values', () => {
      expect(formatTime(0.05)).toBe('0.1s');
    });
  });
});

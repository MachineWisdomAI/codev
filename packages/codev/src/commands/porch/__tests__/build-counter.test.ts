import { describe, it, expect } from 'vitest';
import { PORCH_BUILD_COUNTER_KEY } from '../build-counter.js';

describe('PORCH_BUILD_COUNTER_KEY', () => {
  it('should equal the expected key name', () => {
    expect(PORCH_BUILD_COUNTER_KEY).toBe('porch.total_builds');
  });

  it('should be a string', () => {
    expect(typeof PORCH_BUILD_COUNTER_KEY).toBe('string');
  });
});

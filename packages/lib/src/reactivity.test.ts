import { describe, it, expect } from 'vitest';
import type { Cleanup } from './reactivity';

describe('reactivity', () => {
  describe('type exports', () => {
    it('should export Cleanup type', () => {
      const cleanup: Cleanup = () => {};
      expect(typeof cleanup).toBe('function');
    });

    it('should accept Cleanup as a function that returns void', () => {
      const cleanup: Cleanup = () => {
        return undefined;
      };
      cleanup();
      expect(cleanup).toBeDefined();
    });
  });
});

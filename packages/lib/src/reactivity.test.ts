/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createState, autorun, runWithMemo, type Cleanup } from './reactivity';
import { h, render } from './jsx';

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

  describe('autorun', () => {
    it('should run effect immediately', () => {
      const state = createState({ count: 0 });
      let runCount = 0;

      autorun(() => {
        state.count;
        runCount++;
      });

      expect(runCount).toBe(1);
    });

    it('should re-run effect when dependency changes', () => {
      const state = createState({ count: 0 });
      let runCount = 0;

      autorun(() => {
        state.count;
        runCount++;
      });

      expect(runCount).toBe(1);
      state.count++;
      expect(runCount).toBe(2);
    });

    it('should return dispose function', () => {
      const state = createState({ count: 0 });
      let runCount = 0;

      const dispose = autorun(() => {
        state.count;
        runCount++;
      });

      expect(runCount).toBe(1);
      state.count++;
      expect(runCount).toBe(2);

      dispose();
      state.count++;
      expect(runCount).toBe(2); // Should not run again
    });

    it('should support onCleanup callback', () => {
      const state = createState({ count: 0 });
      let cleanupCount = 0;

      autorun((onCleanup) => {
        state.count;
        onCleanup(() => {
          cleanupCount++;
        });
      });

      expect(cleanupCount).toBe(0);
      state.count++; // Triggers cleanup before re-run
      expect(cleanupCount).toBe(1);
      state.count++; // Triggers cleanup again
      expect(cleanupCount).toBe(2);
    });
  });

  describe('runWithMemo', () => {
    it('should cache function result within same reactive cycle', () => {
      const state = createState({ count: 0 });
      let computeCount = 0;

      const double = () => {
        computeCount++;
        return state.count * 2;
      };

      // First call should compute
      const result1 = runWithMemo(double);
      expect(result1).toBe(0);
      expect(computeCount).toBe(1);

      // Second call in same cycle should use cache
      const result2 = runWithMemo(double);
      expect(result2).toBe(0);
      expect(computeCount).toBe(1); // Should not increment

      // Third call should also use cache
      const result3 = runWithMemo(double);
      expect(result3).toBe(0);
      expect(computeCount).toBe(1); // Should not increment
    });

    it('should invalidate cache on reactive cycle change', () => {
      const state = createState({ count: 0 });
      let computeCount = 0;
      let lastResult = 0;

      const double = () => {
        computeCount++;
        return state.count * 2;
      };

      // First reactive cycle
      autorun(() => {
        lastResult = runWithMemo(double);
      });
      expect(lastResult).toBe(0);
      expect(computeCount).toBe(1);

      // Trigger new reactive cycle
      state.count = 5;

      // Should compute again in new cycle and update lastResult via autorun
      expect(lastResult).toBe(10);
      expect(computeCount).toBe(2);
    });

    it('should cache separately for different functions', () => {
      let doubleCount = 0;
      let tripleCount = 0;

      const double = () => {
        doubleCount++;
        return 2;
      };

      const triple = () => {
        tripleCount++;
        return 3;
      };

      runWithMemo(double);
      runWithMemo(triple);
      runWithMemo(double); // Should use cache
      runWithMemo(triple); // Should use cache

      expect(doubleCount).toBe(1);
      expect(tripleCount).toBe(1);
    });
  });
});

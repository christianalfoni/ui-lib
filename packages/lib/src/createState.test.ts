import { describe, it, expect, vi } from 'vitest';
import { createState, autorun } from './createState';

describe('createState', () => {
  describe('basic reactivity', () => {
    it('should create a reactive state object', () => {
      const state = createState({ count: 0 });
      expect(state.count).toBe(0);
    });

    it('should allow property mutations', () => {
      const state = createState({ count: 0 });
      state.count = 5;
      expect(state.count).toBe(5);
    });

    it('should track property access in autorun', () => {
      const state = createState({ count: 0 });
      const fn = vi.fn();

      autorun(() => {
        fn(state.count);
      });

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(0);

      state.count = 5;
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith(5);
    });

    it('should not trigger on untracked properties', () => {
      const state = createState({ a: 1, b: 2 });
      const fn = vi.fn();

      autorun(() => {
        fn(state.a);
      });

      expect(fn).toHaveBeenCalledTimes(1);
      state.b = 10;
      expect(fn).toHaveBeenCalledTimes(1); // Should not trigger
    });

    it('should only trigger when value actually changes', () => {
      const state = createState({ count: 0 });
      const fn = vi.fn();

      autorun(() => {
        fn(state.count);
      });

      expect(fn).toHaveBeenCalledTimes(1);
      state.count = 0; // Same value
      expect(fn).toHaveBeenCalledTimes(1); // Should not trigger
      state.count = 5; // Different value
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('nested objects', () => {
    it('should make nested objects reactive', () => {
      const state = createState({ user: { name: 'Alice', age: 30 } });
      const fn = vi.fn();

      autorun(() => {
        fn(state.user.name);
      });

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('Alice');

      state.user.name = 'Bob';
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith('Bob');
    });

    it('should track deeply nested properties', () => {
      const state = createState({
        level1: { level2: { level3: { value: 'deep' } } }
      });
      const fn = vi.fn();

      autorun(() => {
        fn(state.level1.level2.level3.value);
      });

      expect(fn).toHaveBeenCalledWith('deep');
      state.level1.level2.level3.value = 'updated';
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith('updated');
    });

    it('should handle object replacement', () => {
      const state = createState({ user: { name: 'Alice' } });
      const fn = vi.fn();

      autorun(() => {
        fn(state.user);
      });

      expect(fn).toHaveBeenCalledTimes(1);
      state.user = { name: 'Bob' };
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('arrays', () => {
    it('should track array mutations with push', () => {
      const state = createState({ items: [1, 2, 3] });
      const fn = vi.fn();

      autorun(() => {
        fn(state.items.length);
      });

      expect(fn).toHaveBeenCalledWith(3);
      state.items.push(4);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith(4);
    });

    it('should track array mutations with pop', () => {
      const state = createState({ items: [1, 2, 3] });
      const fn = vi.fn();

      autorun(() => {
        fn(state.items.length);
      });

      expect(fn).toHaveBeenCalledWith(3);
      state.items.pop();
      // Pop triggers both the method listener and length listener, may call multiple times
      expect(fn).toHaveBeenCalledWith(2);
    });

    it('should track array mutations with shift', () => {
      const state = createState({ items: [1, 2, 3] });
      const fn = vi.fn();

      autorun(() => {
        fn([...state.items]);
      });

      expect(fn).toHaveBeenCalledWith([1, 2, 3]);
      state.items.shift();
      // Shift triggers reactivity, final state should be correct
      expect(fn).toHaveBeenLastCalledWith([2, 3]);
    });

    it('should track array mutations with unshift', () => {
      const state = createState({ items: [2, 3] });
      const fn = vi.fn();

      autorun(() => {
        fn([...state.items]);
      });

      state.items.unshift(1);
      expect(fn).toHaveBeenCalledWith([1, 2, 3]);
    });

    it('should track array mutations with splice', () => {
      const state = createState({ items: [1, 2, 3, 4] });
      const fn = vi.fn();

      autorun(() => {
        fn([...state.items]);
      });

      state.items.splice(1, 2, 5, 6);
      expect(fn).toHaveBeenCalledWith([1, 5, 6, 4]);
    });

    it('should track array index access', () => {
      const state = createState({ items: [1, 2, 3] });
      const fn = vi.fn();

      autorun(() => {
        fn(state.items[0]);
      });

      expect(fn).toHaveBeenCalledWith(1);
      state.items[0] = 10;
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith(10);
    });

    it('should make array elements reactive if they are objects', () => {
      const state = createState({ items: [{ id: 1, name: 'A' }] });
      const fn = vi.fn();

      autorun(() => {
        fn(state.items[0].name);
      });

      expect(fn).toHaveBeenCalledWith('A');
      state.items[0].name = 'B';
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith('B');
    });
  });

  describe('autorun', () => {
    it('should run effect immediately', () => {
      const fn = vi.fn();
      autorun(() => fn());
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should support cleanup function', () => {
      const state = createState({ count: 0 });
      const cleanup = vi.fn();
      const effect = vi.fn();

      autorun((onCleanup) => {
        onCleanup(cleanup);
        effect(state.count);
      });

      expect(effect).toHaveBeenCalledTimes(1);
      expect(cleanup).toHaveBeenCalledTimes(0);

      state.count = 1;
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(effect).toHaveBeenCalledTimes(2);

      state.count = 2;
      expect(cleanup).toHaveBeenCalledTimes(2);
      expect(effect).toHaveBeenCalledTimes(3);
    });

    it('should return a dispose function that calls cleanup', () => {
      const state = createState({ count: 0 });
      const cleanup = vi.fn();
      const fn = vi.fn();

      const dispose = autorun((onCleanup) => {
        onCleanup(cleanup);
        fn(state.count);
      });

      expect(cleanup).toHaveBeenCalledTimes(0);

      state.count = 1;
      expect(cleanup).toHaveBeenCalledTimes(1);

      dispose();
      // Dispose should call the cleanup function
      expect(cleanup).toHaveBeenCalledTimes(2);
    });

    it('should call cleanup on dispose', () => {
      const cleanup = vi.fn();

      const dispose = autorun((onCleanup) => {
        onCleanup(cleanup);
      });

      expect(cleanup).toHaveBeenCalledTimes(0);
      dispose();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should track multiple properties', () => {
      const state = createState({ a: 1, b: 2 });
      const fn = vi.fn();

      autorun(() => {
        fn(state.a + state.b);
      });

      expect(fn).toHaveBeenCalledWith(3);
      state.a = 10;
      expect(fn).toHaveBeenCalledWith(12);
      state.b = 20;
      expect(fn).toHaveBeenCalledWith(30);
    });

    it('should handle conditional tracking', () => {
      const state = createState({ condition: true, a: 1, b: 2 });
      const fn = vi.fn();

      autorun(() => {
        fn(state.condition ? state.a : state.b);
      });

      expect(fn).toHaveBeenCalledWith(1);
      state.a = 10;
      expect(fn).toHaveBeenCalledWith(10);
      state.b = 20; // Should not trigger (b is not tracked)
      expect(fn).toHaveBeenCalledTimes(2);

      state.condition = false;
      expect(fn).toHaveBeenCalledWith(20); // Now tracking b
      state.b = 30;
      expect(fn).toHaveBeenCalledWith(30);
      state.a = 100; // Should not trigger (a is no longer tracked)
      expect(fn).toHaveBeenCalledTimes(5);
    });
  });

  describe('proxy caching', () => {
    it('should return the same proxy for the same object', () => {
      const obj = { count: 0 };
      const proxy1 = createState(obj);
      const proxy2 = createState(obj);
      expect(proxy1).toBe(proxy2);
    });

    it('should maintain proxy identity for nested objects', () => {
      const state = createState({ nested: { value: 1 } });
      const nested1 = state.nested;
      const nested2 = state.nested;
      expect(nested1).toBe(nested2);
    });
  });

  describe('property deletion', () => {
    it('should trigger on property deletion', () => {
      const state = createState({ a: 1, b: 2 } as any);
      const fn = vi.fn();

      autorun(() => {
        fn(state.a);
      });

      expect(fn).toHaveBeenCalledWith(1);
      delete state.a;
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith(undefined);
    });
  });
});

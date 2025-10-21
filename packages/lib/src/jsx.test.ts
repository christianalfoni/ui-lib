/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, h } from './jsx';
import { createState } from './reactivity';

describe('JSX Array Rendering', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('Mixed keyed and non-keyed validation', () => {
    it('should throw error when mixing keyed and non-keyed children', () => {
      // The error should be thrown during the initial render
      expect(() => {
        const state = createState({
          items: [
            h('div', { key: 'a' }, 'Item A'),
            h('div', null, 'Item without key'),
          ],
        });

        function TestComponent() {
          return h('div', null, () => state.items);
        }

        render(h(TestComponent, null), container);
      }).toThrow('Cannot mix keyed and non-keyed children in the same array');
    });

    it('should allow all keyed children', async () => {
      const state = createState({
        items: [
          { key: 'a', text: 'Item A' },
          { key: 'b', text: 'Item B' },
        ],
      });

      function TestComponent() {
        return h('div', null, () =>
          state.items.map(item => h('div', { key: item.key }, item.text))
        );
      }

      render(h(TestComponent, null), container);

      // Wait for reactive update
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.textContent).toBe('Item AItem B');

      // Should work fine - all keyed
      state.items = [
        { key: 'b', text: 'Item B' },
        { key: 'c', text: 'Item C' },
      ];

      // Wait for reactive update
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.textContent).toBe('Item BItem C');
    });

    it('should allow all non-keyed children', async () => {
      const state = createState({
        items: ['Item 1', 'Item 2'],
      });

      function TestComponent() {
        return h('div', null, () => state.items.map(item => h('div', null, item)));
      }

      render(h(TestComponent, null), container);

      // Wait for reactive update
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.textContent).toBe('Item 1Item 2');

      // Should work fine - all non-keyed
      state.items = ['Item 3', 'Item 4', 'Item 5'];

      // Wait for reactive update
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.textContent).toBe('Item 3Item 4Item 5');
    });
  });

  describe('Keyed array diffing', () => {
    it('should reorder keyed elements efficiently', async () => {
      const state = createState({
        items: ['a', 'b', 'c'],
      });

      function TestComponent() {
        return h('div', { className: 'wrapper' }, () =>
          state.items.map((item) => h('div', { key: item, className: 'item' }, item))
        );
      }

      render(h(TestComponent, null), container);

      // Wait for reactive update
      await new Promise(resolve => setTimeout(resolve, 10));

      const initialDivs = Array.from(container.querySelectorAll('.item'));
      expect(initialDivs.map(d => d.textContent)).toEqual(['a', 'b', 'c']);

      // Store references to verify reuse
      const divA = initialDivs[0];
      const divB = initialDivs[1];
      const divC = initialDivs[2];

      // Reorder
      state.items = ['c', 'a', 'b'];

      // Wait for reactive update
      await new Promise(resolve => setTimeout(resolve, 10));

      const reorderedDivs = Array.from(container.querySelectorAll('.item'));
      expect(reorderedDivs.map(d => d.textContent)).toEqual(['c', 'a', 'b']);

      // Verify nodes were reused, not recreated
      expect(reorderedDivs[0]).toBe(divC);
      expect(reorderedDivs[1]).toBe(divA);
      expect(reorderedDivs[2]).toBe(divB);
    });

    it('should add and remove keyed elements', async () => {
      const state = createState({
        items: ['a', 'b', 'c'],
      });

      function TestComponent() {
        return h('div', { className: 'wrapper' }, () =>
          state.items.map((item) => h('div', { key: item, className: 'item' }, item))
        );
      }

      render(h(TestComponent, null), container);

      // Wait for reactive update
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.textContent).toBe('abc');

      // Remove 'b', add 'd'
      state.items = ['a', 'c', 'd'];

      // Wait for reactive update
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.textContent).toBe('acd');

      const divs = Array.from(container.querySelectorAll('.item'));
      expect(divs).toHaveLength(3);
    });

    it('should handle complete replacement of keyed array', async () => {
      const state = createState({
        items: ['a', 'b', 'c'],
      });

      function TestComponent() {
        return h('div', { className: 'wrapper' }, () =>
          state.items.map((item) => h('div', { key: item, className: 'item' }, item))
        );
      }

      render(h(TestComponent, null), container);

      // Wait for reactive update
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.textContent).toBe('abc');

      // Replace all items
      state.items = ['x', 'y', 'z'];

      // Wait for reactive update
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.textContent).toBe('xyz');

      const divs = Array.from(container.querySelectorAll('.item'));
      expect(divs).toHaveLength(3);
    });
  });

  describe('Non-keyed array handling', () => {
    it('should replace all elements when array changes', async () => {
      const state = createState({
        items: ['a', 'b', 'c'],
      });

      function TestComponent() {
        return h('div', { className: 'wrapper' }, () =>
          state.items.map((item) => h('div', { className: 'item' }, item))
        );
      }

      render(h(TestComponent, null), container);

      // Wait for reactive update
      await new Promise(resolve => setTimeout(resolve, 10));

      const initialDivs = Array.from(container.querySelectorAll('.item'));
      expect(initialDivs.map(d => d.textContent)).toEqual(['a', 'b', 'c']);

      // Store references
      const divA = initialDivs[0];

      // Change array
      state.items = ['a', 'b', 'c', 'd'];

      // Wait for reactive update
      await new Promise(resolve => setTimeout(resolve, 10));

      const newDivs = Array.from(container.querySelectorAll('.item'));
      expect(newDivs.map(d => d.textContent)).toEqual(['a', 'b', 'c', 'd']);

      // Verify nodes were NOT reused (replaced)
      expect(newDivs[0]).not.toBe(divA);
    });
  });
});

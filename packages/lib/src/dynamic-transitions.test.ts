/**
 * Comprehensive tests for dynamic UI transitions in reactive scopes
 *
 * Tests all possible content transitions:
 * - null → element
 * - element → null
 * - element → element
 * - element → component
 * - component → component
 * - component → element
 * - keyed lists (additions, removals, reordering)
 * - non-keyed lists
 * - nested reactive scopes
 * - components nested in elements
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, h } from './jsx';
import { createState, onCleanup, onMount } from './index';

describe('Dynamic UI Transitions', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('null → element', () => {
    it('should transition from null to element', async () => {
      const state = createState({ show: false });

      function Test() {
        return h('div', null, () => state.show ? h('span', null, 'Hello') : null);
      }

      render(h(Test, null), container);
      expect(container.querySelector('span')).toBeNull();

      state.show = true;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('span')).not.toBeNull();
      expect(container.textContent).toContain('Hello');
    });
  });

  describe('element → null', () => {
    it('should transition from element to null', async () => {
      const state = createState({ show: true });

      function Test() {
        return h('div', null, () => state.show ? h('span', null, 'Hello') : null);
      }

      render(h(Test, null), container);
      expect(container.querySelector('span')).not.toBeNull();

      state.show = false;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('span')).toBeNull();
    });

    it('should clean up event listeners when transitioning to null', async () => {
      const state = createState({ show: true });
      const handler = vi.fn();

      function Test() {
        return h('div', null, () =>
          state.show ? h('button', { onClick: handler }, 'Click') : null
        );
      }

      render(h(Test, null), container);
      const button = container.querySelector('button')!;
      button.click();
      expect(handler).toHaveBeenCalledOnce();

      state.show = false;
      await new Promise(resolve => setTimeout(resolve, 10));

      // After removal, the button should not exist
      expect(container.querySelector('button')).toBeNull();
    });
  });

  describe('element → element', () => {
    it('should transition from one element to another', async () => {
      const state = createState({ active: true });

      function Test() {
        return h('div', null, () =>
          state.active
            ? h('span', { className: 'active' }, 'Active')
            : h('span', { className: 'inactive' }, 'Inactive')
        );
      }

      render(h(Test, null), container);
      expect(container.querySelector('.active')).not.toBeNull();
      expect(container.textContent).toContain('Active');

      state.active = false;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('.active')).toBeNull();
      expect(container.querySelector('.inactive')).not.toBeNull();
      expect(container.textContent).toContain('Inactive');
    });

    it('should replace different element types', async () => {
      const state = createState({ type: 'div' as 'div' | 'span' });

      function Test() {
        return h('section', null, () =>
          state.type === 'div'
            ? h('div', null, 'I am a div')
            : h('span', null, 'I am a span')
        );
      }

      render(h(Test, null), container);
      expect(container.querySelector('div')).not.toBeNull();
      expect(container.querySelector('span')).toBeNull();

      state.type = 'span';
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('div')).toBeNull();
      expect(container.querySelector('span')).not.toBeNull();
    });
  });

  describe('element → component', () => {
    it('should transition from element to component', async () => {
      const state = createState({ complex: false });

      function ComplexComponent() {
        return h('div', { className: 'complex' }, 'Complex');
      }

      function Test() {
        return h('div', null, () =>
          state.complex
            ? h(ComplexComponent, null)
            : h('div', { className: 'simple' }, 'Simple')
        );
      }

      render(h(Test, null), container);
      expect(container.querySelector('.simple')).not.toBeNull();
      expect(container.querySelector('.complex')).toBeNull();

      state.complex = true;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('.simple')).toBeNull();
      expect(container.querySelector('.complex')).not.toBeNull();
    });

    it('should call onMount when component is created', async () => {
      const state = createState({ show: false });
      const mountCallback = vi.fn();

      function MountableComponent() {
        onMount(mountCallback);
        return h('div', null, 'Mounted');
      }

      function Test() {
        return h('div', null, () =>
          state.show ? h(MountableComponent, null) : h('div', null, 'Simple')
        );
      }

      render(h(Test, null), container);
      expect(mountCallback).not.toHaveBeenCalled();

      state.show = true;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mountCallback).toHaveBeenCalledOnce();
    });
  });

  describe('component → component', () => {
    it('should transition from one component to another', async () => {
      const state = createState({ type: 'A' as 'A' | 'B' });

      function ComponentA() {
        return h('div', { className: 'component-a' }, 'Component A');
      }

      function ComponentB() {
        return h('div', { className: 'component-b' }, 'Component B');
      }

      function Test() {
        return h('div', null, () =>
          state.type === 'A' ? h(ComponentA, null) : h(ComponentB, null)
        );
      }

      render(h(Test, null), container);
      expect(container.querySelector('.component-a')).not.toBeNull();
      expect(container.querySelector('.component-b')).toBeNull();

      state.type = 'B';
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('.component-a')).toBeNull();
      expect(container.querySelector('.component-b')).not.toBeNull();
    });

    it('should call cleanup of old component and mount of new component', async () => {
      const state = createState({ type: 'A' as 'A' | 'B' });
      const cleanupA = vi.fn();
      const mountA = vi.fn();
      const cleanupB = vi.fn();
      const mountB = vi.fn();

      function ComponentA() {
        onMount(mountA);
        onCleanup(cleanupA);
        return h('div', null, 'A');
      }

      function ComponentB() {
        onMount(mountB);
        onCleanup(cleanupB);
        return h('div', null, 'B');
      }

      function Test() {
        return h('div', null, () =>
          state.type === 'A' ? h(ComponentA, null) : h(ComponentB, null)
        );
      }

      render(h(Test, null), container);
      expect(mountA).toHaveBeenCalledOnce();
      expect(cleanupA).not.toHaveBeenCalled();

      state.type = 'B';
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(cleanupA).toHaveBeenCalledOnce();
      expect(mountB).toHaveBeenCalledOnce();
      expect(cleanupB).not.toHaveBeenCalled();
    });
  });

  describe('component → element', () => {
    it('should transition from component to element', async () => {
      const state = createState({ complex: true });

      function ComplexComponent() {
        return h('div', { className: 'complex' }, 'Complex');
      }

      function Test() {
        return h('div', null, () =>
          state.complex
            ? h(ComplexComponent, null)
            : h('div', { className: 'simple' }, 'Simple')
        );
      }

      render(h(Test, null), container);
      expect(container.querySelector('.complex')).not.toBeNull();

      state.complex = false;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('.complex')).toBeNull();
      expect(container.querySelector('.simple')).not.toBeNull();
    });

    it('should call cleanup when component is replaced with element', async () => {
      const state = createState({ show: true });
      const cleanupCallback = vi.fn();

      function ComponentWithCleanup() {
        onCleanup(cleanupCallback);
        return h('div', null, 'Component');
      }

      function Test() {
        return h('div', null, () =>
          state.show ? h(ComponentWithCleanup, null) : h('div', null, 'Element')
        );
      }

      render(h(Test, null), container);
      expect(cleanupCallback).not.toHaveBeenCalled();

      state.show = false;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(cleanupCallback).toHaveBeenCalledOnce();
    });
  });

  describe('component → null', () => {
    it('should transition from component to null', async () => {
      const state = createState({ show: true });
      const cleanupCallback = vi.fn();

      function Component() {
        onCleanup(cleanupCallback);
        return h('div', { className: 'component' }, 'Component');
      }

      function Test() {
        return h('div', null, () =>
          state.show ? h(Component, null) : null
        );
      }

      render(h(Test, null), container);
      expect(container.querySelector('.component')).not.toBeNull();
      expect(cleanupCallback).not.toHaveBeenCalled();

      state.show = false;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('.component')).toBeNull();
      expect(cleanupCallback).toHaveBeenCalledOnce();
    });
  });

  describe('null → component', () => {
    it('should transition from null to component', async () => {
      const state = createState({ show: false });
      const mountCallback = vi.fn();

      function Component() {
        onMount(mountCallback);
        return h('div', { className: 'component' }, 'Component');
      }

      function Test() {
        return h('div', null, () =>
          state.show ? h(Component, null) : null
        );
      }

      render(h(Test, null), container);
      expect(container.querySelector('.component')).toBeNull();
      expect(mountCallback).not.toHaveBeenCalled();

      state.show = true;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('.component')).not.toBeNull();
      expect(mountCallback).toHaveBeenCalledOnce();
    });
  });

  describe('keyed lists', () => {
    it('should add new items to keyed list', async () => {
      const state = createState({
        items: [
          { id: 1, text: 'Item 1' },
          { id: 2, text: 'Item 2' }
        ]
      });

      function Test() {
        return h('ul', null, () =>
          state.items.map(item =>
            h('li', { key: item.id }, item.text)
          )
        );
      }

      render(h(Test, null), container);
      expect(container.querySelectorAll('li').length).toBe(2);

      // Replace the entire array to trigger reactive update
      state.items = [...state.items, { id: 3, text: 'Item 3' }];
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelectorAll('li').length).toBe(3);
      expect(container.textContent).toContain('Item 3');
    });

    it('should remove items from keyed list', async () => {
      const state = createState({
        items: [
          { id: 1, text: 'Item 1' },
          { id: 2, text: 'Item 2' },
          { id: 3, text: 'Item 3' }
        ]
      });

      function Test() {
        return h('ul', null, () =>
          state.items.map(item =>
            h('li', { key: item.id }, item.text)
          )
        );
      }

      render(h(Test, null), container);
      expect(container.querySelectorAll('li').length).toBe(3);

      // Replace the array to trigger reactive update
      state.items = state.items.filter(item => item.id !== 2);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelectorAll('li').length).toBe(2);
      expect(container.textContent).not.toContain('Item 2');
    });

    it('should reorder items in keyed list', async () => {
      const state = createState({
        items: [
          { id: 1, text: 'Item 1' },
          { id: 2, text: 'Item 2' },
          { id: 3, text: 'Item 3' }
        ]
      });

      function Test() {
        return h('ul', null, () =>
          state.items.map(item =>
            h('li', { key: item.id }, item.text)
          )
        );
      }

      render(h(Test, null), container);
      const getTexts = () => Array.from(container.querySelectorAll('li')).map(li => li.textContent);
      expect(getTexts()).toEqual(['Item 1', 'Item 2', 'Item 3']);

      // Replace with reversed array
      state.items = [...state.items].reverse();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(getTexts()).toEqual(['Item 3', 'Item 2', 'Item 1']);
    });

    it('should clean up removed keyed components', async () => {
      const state = createState({
        items: [
          { id: 1, text: 'Item 1' },
          { id: 2, text: 'Item 2' }
        ]
      });
      const mountCalls: number[] = [];
      const cleanups: number[] = [];

      function KeyedItem({ item }: { item: { id: number; text: string } }) {
        onMount(() => mountCalls.push(item.id));
        onCleanup(() => cleanups.push(item.id));
        return h('li', null, item.text);
      }

      function Test() {
        return h('ul', null, () =>
          state.items.map(item =>
            h(KeyedItem, { key: item.id, item })
          )
        );
      }

      render(h(Test, null), container);
      expect(mountCalls).toContain(1);
      expect(mountCalls).toContain(2);
      expect(cleanups).toEqual([]);

      // Replace array without first item
      state.items = state.items.filter(item => item.id !== 1);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Item 1 should be disposed (order may vary due to keyed diffing)
      expect(cleanups).toContain(1);
      expect(container.querySelectorAll('li').length).toBe(1);
      expect(container.textContent).toContain('Item 2');
      expect(container.textContent).not.toContain('Item 1');
    });

    it('should handle keyed intrinsic elements', async () => {
      const state = createState({
        items: [
          { id: 1, text: 'Item 1' },
          { id: 2, text: 'Item 2' }
        ]
      });

      function Test() {
        return h('ul', null, () =>
          state.items.map(item =>
            h('li', { key: item.id }, item.text)
          )
        );
      }

      render(h(Test, null), container);
      expect(container.querySelectorAll('li').length).toBe(2);

      // Replace array without first item
      state.items = state.items.filter(item => item.id !== 1);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelectorAll('li').length).toBe(1);
      expect(container.textContent).toContain('Item 2');
    });
  });

  describe('non-keyed lists', () => {
    it('should replace all items in non-keyed list', async () => {
      const state = createState({
        items: ['A', 'B', 'C']
      });

      function Test() {
        return h('ul', null, () =>
          state.items.map(item => h('li', null, item))
        );
      }

      render(h(Test, null), container);
      expect(container.querySelectorAll('li').length).toBe(3);

      state.items = ['X', 'Y'];
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelectorAll('li').length).toBe(2);
      expect(container.textContent).toContain('X');
      expect(container.textContent).toContain('Y');
    });

    it('should clean up components in non-keyed list', async () => {
      const state = createState({
        items: [1, 2, 3]
      });
      const cleanups: number[] = [];

      function Item({ value }: { value: number }) {
        onCleanup(() => cleanups.push(value));
        return h('li', null, String(value));
      }

      function Test() {
        return h('ul', null, () =>
          state.items.map(item => h(Item, { value: item }))
        );
      }

      render(h(Test, null), container);
      expect(cleanups).toEqual([]);

      state.items = [4, 5];
      await new Promise(resolve => setTimeout(resolve, 10));

      // All old items should be cleaned up
      expect(cleanups).toEqual([1, 2, 3]);
    });
  });

  describe('nested reactive scopes', () => {
    it('should handle reactive children in reactive children', async () => {
      const state = createState({
        outer: true,
        inner: 'Inner'
      });

      function Inner() {
        return h('span', { className: 'inner' }, () => state.inner);
      }

      function Test() {
        return h('div', null, () =>
          state.outer ? h('div', { className: 'outer' },
            h(Inner, null)
          ) : null
        );
      }

      render(h(Test, null), container);
      expect(container.querySelector('.outer')).not.toBeNull();
      expect(container.querySelector('.inner')).not.toBeNull();
      expect(container.textContent).toContain('Inner');

      state.inner = 'Updated';
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('.outer')).not.toBeNull();
      expect(container.querySelector('.inner')).not.toBeNull();
      expect(container.textContent).toContain('Updated');

      state.outer = false;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('.outer')).toBeNull();
    });

    it('should clean up nested reactive scopes', async () => {
      const state = createState({ show: true });
      const outerHandler = vi.fn();
      const innerHandler = vi.fn();

      function Inner() {
        return h('button', { onClick: innerHandler }, 'Click');
      }

      function Test() {
        return h('div', null, () =>
          state.show ? h('div', { onClick: outerHandler },
            h(Inner, null)
          ) : null
        );
      }

      render(h(Test, null), container);
      const button = container.querySelector('button')!;
      button.click();
      expect(innerHandler).toHaveBeenCalledOnce();

      state.show = false;
      await new Promise(resolve => setTimeout(resolve, 10));

      // After disposal, elements should not exist
      expect(container.querySelector('button')).toBeNull();
    });
  });

  describe('components nested in elements', () => {
    it('should handle components inside reactive elements', async () => {
      const state = createState({ show: true });
      const mountCallback = vi.fn();
      const cleanupCallback = vi.fn();

      function NestedComponent() {
        onMount(mountCallback);
        onCleanup(cleanupCallback);
        return h('span', null, 'Nested');
      }

      function Wrapper() {
        return h('div', { className: 'wrapper' },
          h(NestedComponent, null)
        );
      }

      function Test() {
        return h('div', null, () =>
          state.show ? h(Wrapper, null) : null
        );
      }

      render(h(Test, null), container);
      expect(mountCallback).toHaveBeenCalledOnce();
      expect(container.querySelector('.wrapper')).not.toBeNull();

      state.show = false;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(cleanupCallback).toHaveBeenCalledOnce();
      expect(container.querySelector('.wrapper')).toBeNull();
    });

    it('should handle multiple components in reactive element', async () => {
      const state = createState({ show: true });
      const cleanups: string[] = [];

      function ComponentA() {
        onCleanup(() => cleanups.push('A'));
        return h('span', null, 'A');
      }

      function ComponentB() {
        onCleanup(() => cleanups.push('B'));
        return h('span', null, 'B');
      }

      function Wrapper() {
        return h('div', null,
          h(ComponentA, null),
          h(ComponentB, null)
        );
      }

      function Test() {
        return h('div', null, () =>
          state.show ? h(Wrapper, null) : null
        );
      }

      render(h(Test, null), container);
      expect(cleanups).toEqual([]);

      state.show = false;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(cleanups).toEqual(['A', 'B']);
    });
  });

  describe('complex transitions', () => {
    it('should handle array to single element transition', async () => {
      const state = createState({
        mode: 'list' as 'list' | 'single',
        items: ['A', 'B', 'C']
      });

      function Test() {
        return h('div', null, () =>
          state.mode === 'list'
            ? state.items.map(item => h('span', { key: item }, item))
            : h('span', null, 'Single')
        );
      }

      render(h(Test, null), container);
      expect(container.querySelectorAll('span').length).toBe(3);

      state.mode = 'single';
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelectorAll('span').length).toBe(1);
      expect(container.textContent).toContain('Single');
    });

    it('should handle single element to array transition', async () => {
      const state = createState({
        mode: 'single' as 'list' | 'single',
        items: ['A', 'B', 'C']
      });

      function Test() {
        return h('section', null, () =>
          state.mode === 'list'
            ? state.items.map(item => h('span', { key: item }, item))
            : h('p', null, 'Single')
        );
      }

      render(h(Test, null), container);
      expect(container.textContent).toContain('Single');
      expect(container.querySelector('p')).not.toBeNull();
      expect(container.querySelectorAll('span').length).toBe(0);

      state.mode = 'list';
      await new Promise(resolve => setTimeout(resolve, 10));

      const spans = container.querySelectorAll('span');
      expect(spans.length).toBe(3);
      const texts = Array.from(spans).map(s => s.textContent);
      expect(texts).toContain('A');
      expect(texts).toContain('B');
      expect(texts).toContain('C');
      // Verify old content is removed
      expect(container.querySelector('p')).toBeNull();
      expect(container.textContent).not.toContain('Single');
    });

    it('should remove non-keyed content when transitioning to keyed array', async () => {
      const state = createState({ showList: false });

      function Test() {
        return h('div', null, () =>
          state.showList
            ? ['A', 'B', 'C'].map(item => h('span', { key: item }, item))
            : h('p', null, 'Non-keyed paragraph')
        );
      }

      render(h(Test, null), container);
      expect(container.querySelector('p')).not.toBeNull();
      expect(container.textContent).toBe('Non-keyed paragraph');

      state.showList = true;
      await new Promise(resolve => setTimeout(resolve, 10));

      // Old non-keyed <p> should be removed
      expect(container.querySelector('p')).toBeNull();
      expect(container.textContent).not.toContain('paragraph');
      // New keyed spans should be present
      expect(container.querySelectorAll('span').length).toBe(3);
      expect(container.textContent).toBe('ABC');
    });

    it('should handle text to component transition', async () => {
      const state = createState({ mode: 'text' as 'text' | 'component' });

      function Component() {
        return h('div', null, 'Component');
      }

      function Test() {
        return h('div', null, () =>
          state.mode === 'text' ? 'Just text' : h(Component, null)
        );
      }

      render(h(Test, null), container);
      expect(container.textContent).toBe('Just text');

      state.mode = 'component';
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('div > div')).not.toBeNull();
      expect(container.textContent).toContain('Component');
    });
  });

  describe('edge cases', () => {
    it('should handle rapid toggles', async () => {
      const state = createState({ show: true });

      function Test() {
        return h('div', null, () =>
          state.show ? h('span', null, 'Visible') : null
        );
      }

      render(h(Test, null), container);

      // Rapid toggles
      state.show = false;
      state.show = true;
      state.show = false;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('span')).toBeNull();
    });

    it('should handle empty array', async () => {
      const state = createState({ items: ['A', 'B'] });

      function Test() {
        return h('ul', null, () =>
          state.items.map(item => h('li', { key: item }, item))
        );
      }

      render(h(Test, null), container);
      expect(container.querySelectorAll('li').length).toBe(2);

      state.items = [];
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelectorAll('li').length).toBe(0);
    });

    it('should handle false and null equivalently', async () => {
      const state = createState({ value: false as false | null | string });

      function Test() {
        return h('div', null, () =>
          state.value ? h('span', null, state.value) : state.value
        );
      }

      render(h(Test, null), container);
      expect(container.querySelector('span')).toBeNull();

      state.value = null;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('span')).toBeNull();

      state.value = 'text';
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(container.querySelector('span')).not.toBeNull();
    });
  });
});

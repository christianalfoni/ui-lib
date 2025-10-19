/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { h, render } from './jsx';
import { createState } from './createState';

describe('jsx', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('h (JSX factory)', () => {
    it('should create a simple element', () => {
      const el = h('div', null) as HTMLDivElement;
      expect(el.tagName).toBe('DIV');
    });

    it('should create element with text content', () => {
      const el = h('div', null, 'Hello') as HTMLDivElement;
      expect(el.textContent).toBe('Hello');
    });

    it('should create element with multiple text children', () => {
      const el = h('div', null, 'Hello', ' ', 'World') as HTMLDivElement;
      expect(el.textContent).toBe('Hello World');
    });

    it('should create element with props', () => {
      const el = h('div', { id: 'test', className: 'container' }) as HTMLDivElement;
      expect(el.id).toBe('test');
      expect(el.className).toBe('container');
    });

    it('should create element with nested children', () => {
      const child1 = h('span', null, 'Child 1');
      const child2 = h('span', null, 'Child 2');
      const parent = h('div', null, child1, child2) as HTMLDivElement;

      expect(parent.children.length).toBe(2);
      expect(parent.children[0].textContent).toBe('Child 1');
      expect(parent.children[1].textContent).toBe('Child 2');
    });

    it('should handle null and undefined children', () => {
      const el = h('div', null, null, 'text', undefined, false) as HTMLDivElement;
      expect(el.textContent).toBe('text');
    });

    it('should handle number children', () => {
      const el = h('div', null, 42, 0) as HTMLDivElement;
      expect(el.textContent).toBe('420');
    });

    it('should attach event handlers', () => {
      const onClick = vi.fn();
      const el = h('button', { onClick }) as HTMLButtonElement;
      el.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should handle array children', () => {
      const children = [
        h('span', null, '1'),
        h('span', null, '2'),
        h('span', null, '3')
      ];
      const el = h('div', null, children) as HTMLDivElement;
      expect(el.children.length).toBe(3);
    });

    it('should support key prop', () => {
      const el = h('div', { key: 'unique-key' }) as any;
      expect(el.__key).toBe('unique-key');
    });

    it('should call component functions', () => {
      const Component = (props: { name: string }) => {
        return h('div', null, `Hello ${props.name}`);
      };

      const el = h(Component, { name: 'World' }) as HTMLDivElement;
      expect(el.textContent).toBe('Hello World');
    });

    it('should pass children to component functions', () => {
      const Component = (props: { children: any[] }) => {
        return h('div', null, ...props.children);
      };

      const el = h(Component, null, 'Child 1', 'Child 2') as HTMLDivElement;
      expect(el.textContent).toBe('Child 1Child 2');
    });
  });

  describe('render', () => {
    it('should render element into container', () => {
      const el = h('div', { id: 'test' }, 'Hello');
      render(el, container);

      const rendered = container.querySelector('#test');
      expect(rendered).toBeTruthy();
      expect(rendered?.textContent).toBe('Hello');
    });

    it('should render multiple elements', () => {
      render(h('div', null, 'First'), container);
      render(h('div', null, 'Second'), container);

      expect(container.children.length).toBe(2);
      expect(container.children[0].textContent).toBe('First');
      expect(container.children[1].textContent).toBe('Second');
    });
  });

  describe('reactive children with functions', () => {
    it('should render reactive text content', () => {
      const state = createState({ text: 'Initial' });
      const el = h('div', null, () => state.text) as HTMLDivElement;
      render(el, container);

      expect(container.textContent).toContain('Initial');

      state.text = 'Updated';
      // Wait for autorun to trigger
      expect(container.textContent).toContain('Updated');
    });

    it('should render reactive numeric content', () => {
      const state = createState({ count: 0 });
      const el = h('div', null, () => state.count) as HTMLDivElement;
      render(el, container);

      expect(container.textContent).toContain('0');

      state.count = 42;
      expect(container.textContent).toContain('42');
    });

    it('should handle reactive null/false values', () => {
      const state = createState<{ value: string | null }>({ value: 'text' });
      const el = h('div', null, () => state.value) as HTMLDivElement;
      render(el, container);

      expect(container.textContent).toContain('text');

      state.value = null;
      // Should clear the content
      const scopeContent = container.textContent?.replace(/\s+/g, '');
      expect(scopeContent).toBe('');
    });

    it('should render reactive arrays', () => {
      const state = createState({ items: ['A', 'B', 'C'] });
      const el = h('div', null, () =>
        state.items.map((item, i) => h('span', { key: i }, item))
      ) as HTMLDivElement;
      render(el, container);

      expect(container.querySelectorAll('span').length).toBe(3);
      expect(container.textContent).toContain('ABC');

      state.items.push('D');
      expect(container.querySelectorAll('span').length).toBe(4);
      expect(container.textContent).toContain('ABCD');
    });

    it('should update keyed elements efficiently', () => {
      const state = createState({ items: [
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
        { id: 3, text: 'C' }
      ]});

      const el = h('div', null, () =>
        state.items.map(item => h('span', { key: item.id }, item.text))
      ) as HTMLDivElement;
      render(el, container);

      const initialSpans = Array.from(container.querySelectorAll('span'));
      expect(initialSpans.length).toBe(3);

      // Reverse the array
      state.items.reverse();
      const reversedSpans = Array.from(container.querySelectorAll('span'));
      expect(reversedSpans.map(s => s.textContent).join('')).toBe('CBA');
    });

    it('should handle adding items to keyed list', () => {
      const state = createState({ items: [
        { id: 1, text: 'A' },
        { id: 2, text: 'B' }
      ]});

      const el = h('div', null, () =>
        state.items.map(item => h('span', { key: item.id }, item.text))
      ) as HTMLDivElement;
      render(el, container);

      expect(container.querySelectorAll('span').length).toBe(2);

      state.items.push({ id: 3, text: 'C' });
      expect(container.querySelectorAll('span').length).toBe(3);
      expect(container.textContent).toContain('ABC');
    });

    it('should handle removing items from keyed list', () => {
      const state = createState({ items: [
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
        { id: 3, text: 'C' }
      ]});

      const el = h('div', null, () =>
        state.items.map(item => h('span', { key: item.id }, item.text))
      ) as HTMLDivElement;
      render(el, container);

      expect(container.querySelectorAll('span').length).toBe(3);

      // Create new array instead of splicing to avoid potential issues
      state.items = [
        { id: 1, text: 'A' },
        { id: 3, text: 'C' }
      ];
      expect(container.querySelectorAll('span').length).toBe(2);
      expect(container.textContent).toContain('AC');
    });

    it('should handle non-keyed array replacement', () => {
      const state = createState({ items: ['A', 'B', 'C'] });
      const el = h('div', null, () =>
        state.items.map(item => h('span', null, item))
      ) as HTMLDivElement;
      render(el, container);

      expect(container.querySelectorAll('span').length).toBe(3);

      state.items = ['X', 'Y'];
      expect(container.querySelectorAll('span').length).toBe(2);
      expect(container.textContent).toContain('XY');
    });

    it('should switch between single value and array', () => {
      const state = createState<{ value: string | string[] }>({ value: 'single' });
      const el = h('div', null, () => state.value) as HTMLDivElement;
      render(el, container);

      expect(container.textContent).toContain('single');

      state.value = ['A', 'B', 'C'];
      // Arrays are rendered without commas (direct text concatenation)
      expect(container.textContent).toContain('ABC');

      state.value = 'single again';
      expect(container.textContent).toContain('single again');
    });

    it('should handle nested reactive functions', () => {
      const state = createState({ show: true, text: 'Hello' });
      const el = h('div', null, () =>
        state.show ? h('span', null, () => state.text) : null
      ) as HTMLDivElement;
      render(el, container);

      expect(container.querySelector('span')?.textContent).toBe('Hello');

      state.text = 'World';
      expect(container.querySelector('span')?.textContent).toBe('World');

      state.show = false;
      expect(container.querySelector('span')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty props', () => {
      const el = h('div', {}) as HTMLDivElement;
      expect(el.tagName).toBe('DIV');
    });

    it('should handle children in props and rest params', () => {
      const el = h('div', { children: 'From props' }, 'From rest') as HTMLDivElement;
      expect(el.textContent).toContain('From props');
      expect(el.textContent).toContain('From rest');
    });

    it('should convert boolean children to text', () => {
      const el = h('div', null, true, false) as HTMLDivElement;
      // True is converted to string 'true', false is filtered out
      expect(el.textContent).toBe('true');
    });

    it('should handle deeply nested arrays', () => {
      const el = h('div', null, [[['deep']]]) as HTMLDivElement;
      expect(el.textContent).toBe('deep');
    });
  });
});

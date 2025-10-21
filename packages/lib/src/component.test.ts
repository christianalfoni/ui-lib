/**
 * Component lifecycle and cleanup tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, h } from './jsx';
import { createState, onCleanup, onMount } from './index';

describe('Component Lifecycle', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('should mount components and call onMount', () => {
    const mountCallback = vi.fn();

    function TestComponent() {
      onMount(mountCallback);
      return h('div', null, 'Test');
    }

    render(h(TestComponent, null), container);

    expect(mountCallback).toHaveBeenCalledOnce();
    expect(container.textContent).toBe('Test');
  });

  it('should dispose components and call onCleanup', () => {
    const cleanupCallback = vi.fn();

    function TestComponent() {
      onCleanup(cleanupCallback);
      return h('div', null, 'Test');
    }

    const app = render(h(TestComponent, null), container);
    expect(cleanupCallback).not.toHaveBeenCalled();

    app.dispose();
    expect(cleanupCallback).toHaveBeenCalledOnce();
  });

  it('should dispose nested components recursively', () => {
    const cleanups: string[] = [];

    function GrandChild() {
      onCleanup(() => cleanups.push('grandchild'));
      return h('div', null, 'grandchild');
    }

    function Child() {
      onCleanup(() => cleanups.push('child'));
      return h('div', null, h(GrandChild, null));
    }

    function Parent() {
      onCleanup(() => cleanups.push('parent'));
      return h('div', null, h(Child, null));
    }

    const app = render(h(Parent, null), container);
    app.dispose();

    expect(cleanups).toEqual(['grandchild', 'child', 'parent']);
  });

  it('should clean up event listeners', () => {
    const handler = vi.fn();

    function TestComponent() {
      return h('button', { onClick: handler }, 'Click me');
    }

    const app = render(h(TestComponent, null), container);
    const button = container.querySelector('button')!;

    button.click();
    expect(handler).toHaveBeenCalledOnce();

    app.dispose();

    // After disposal, handler should not be called
    button.click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it.skip('should dispose reactive scopes when toggling', async () => {
    // TODO: Fix nested component handling in reactive scopes
    const state = createState({ show: true });
    const childCleanup = vi.fn();

    function Child() {
      onCleanup(childCleanup);
      return h('div', null, 'child');
    }

    function Parent() {
      return h('div', null, () => (state.show ? h(Child, null) : h('div', null, 'hidden')));
    }

    render(h(Parent, null), container);
    expect(container.textContent).toBe('child');
    expect(childCleanup).not.toHaveBeenCalled();

    // Toggle to hidden
    state.show = false;

    // Wait for reactive update
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(container.textContent).toBe('hidden');
    expect(childCleanup).toHaveBeenCalledOnce();
  });

  it('should handle reactive props', async () => {
    const state = createState({ color: 'red' });

    function TestComponent() {
      return h('div', { style: () => ({ color: state.color }) }, 'Text');
    }

    render(h(TestComponent, null), container);
    const div = container.querySelector('div')!;

    expect(div.style.color).toBe('red');

    state.color = 'blue';

    // Wait for reactive update
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(div.style.color).toBe('blue');
  });

  it('should handle reactive children', async () => {
    const state = createState({ count: 0 });

    function Counter() {
      return h('div', null, () => `Count: ${state.count}`);
    }

    render(h(Counter, null), container);
    expect(container.textContent).toBe('Count: 0');

    state.count = 5;

    // Wait for reactive update
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(container.textContent).toBe('Count: 5');
  });
});

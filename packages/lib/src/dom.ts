/**
 * DOM manipulation utilities and helpers
 */

import { autorun, runWithMemo } from "./reactivity";
import { getCurrentInstance, getCurrentComponent, ReactiveComponent } from "./component";
import classNames from "classnames";

export type Props = Record<string, any> & { children?: any };

/**
 * Checks if a prop name is an event handler (e.g., onClick, onSubmit)
 */
export function isEventProp(k: string): boolean {
  return k.startsWith("on") && k.length > 2 && k[2] === k[2].toUpperCase();
}

/**
 * Creates a reactive prop - a function prop that automatically re-evaluates
 * when its dependencies change. Built on top of reactive scopes (autorun).
 *
 * Reactive props are registered with the current ReactiveComponent and
 * disposed when the component unmounts.
 *
 * @param el - The DOM element to apply the prop to
 * @param key - The prop name (e.g., "style", "className")
 * @param fn - The function that computes the prop value
 *
 * @example
 * // This reactive prop:
 * <h1 style={() => ({ color: state.color })}>Hello</h1>
 *
 * // Creates a reactive scope that:
 * // 1. Runs the function to get the prop value
 * // 2. Tracks that it accessed state.color
 * // 3. Re-runs automatically when state.color changes
 * // 4. Updates only this specific prop
 */
function createReactiveProp(el: HTMLElement, key: string, fn: () => any): void {
  const dispose = autorun(() => {
    const result = runWithMemo(fn);
    applyProp(el, key, result);
  });

  // Register disposal with current ReactiveComponent
  // Reactive props are always owned by components, not reactive children
  const instance = getCurrentInstance();
  if (instance instanceof ReactiveComponent) {
    instance.autorunDisposals.push(dispose);
  }
}

/**
 * Sets a property or attribute on a DOM element
 */
export function setProp(el: HTMLElement, key: string, value: any): void {
  if (value == null) return;

  // Check for event handlers first - they should NEVER be reactive
  if (isEventProp(key)) {
    // Event handlers should always be functions
    if (typeof value === "function") {
      const eventName = key.slice(2).toLowerCase();
      el.addEventListener(eventName, value);

      // Register cleanup with current instance (ReactiveComponent OR ReactiveChild)
      const instance = getCurrentInstance();
      instance?.cleanups.push(() => {
        el.removeEventListener(eventName, value);
      });
    }
    return;
  }

  // Handle reactive props - function props that create reactive scopes
  if (typeof value === "function") {
    createReactiveProp(el, key, value);
    return;
  }

  applyProp(el, key, value);
}

/**
 * Applies a property or attribute value to a DOM element
 */
function applyProp(el: HTMLElement, key: string, value: any): void {
  if (value == null) return;

  if (key === "className" || key === "class") {
    // Handle object notation: { 'class-name': boolean }
    if (typeof value === "object" && !Array.isArray(value)) {
      el.setAttribute("class", classNames(value));
    } else {
      el.setAttribute("class", String(value));
    }
    return;
  }

  // Handle style specially - support object notation
  if (key === "style") {
    if (typeof value === "string") {
      el.setAttribute("style", value);
    } else if (typeof value === "object") {
      // Clear existing styles first
      el.setAttribute("style", "");
      Object.assign(el.style, value);
    }
    return;
  }

  // Set property or attribute
  if (key in el) {
    (el as any)[key] = value;
  } else {
    el.setAttribute(key, String(value));
  }
}

/**
 * Creates a reactive region in the DOM with start/end anchors for dynamic content
 */
export function createRegion(parent: Node) {
  const start = document.createComment("reactive-scope");
  const end = document.createComment("/reactive-scope");
  parent.appendChild(start);
  parent.appendChild(end);

  // No more cleanup array! Component instance manages autoruns

  function clearContent() {
    // Just remove DOM nodes, no cleanup needed
    let n = start.nextSibling;
    while (n && n !== end) {
      const next = n.nextSibling;
      n.parentNode!.removeChild(n);
      n = next;
    }
  }

  function clearAll() {
    // Same as clearContent - component disposal handles autoruns
    clearContent();
  }

  function insertBeforeRef(n: Node, ref: Node | null) {
    end.parentNode!.insertBefore(n, ref ?? end);
  }

  return { start, end, clearAll, clearContent, insertBeforeRef };
}

/**
 * Registers a callback to run when the component is mounted (after DOM insertion).
 * Must be called within a component function.
 *
 * @example
 * function MyComponent() {
 *   const inputRef = { current: null }
 *
 *   onMount(() => {
 *     // Focus the input after it's been added to the DOM
 *     inputRef.current?.focus()
 *   })
 *
 *   return <input ref={(el) => inputRef.current = el} />
 * }
 */
export function onMount(callback: () => void) {
  const component = getCurrentComponent();
  if (!component) {
    console.warn("onMount called outside component scope");
    return;
  }
  component.mountCallbacks.push(callback);
}

/**
 * Registers a cleanup function to run when the component unmounts.
 * Must be called within a component function.
 *
 * @example
 * function MyComponent() {
 *   const state = createState({ count: 0 })
 *
 *   const interval = setInterval(() => {
 *     state.count++
 *   }, 1000)
 *
 *   onCleanup(() => {
 *     clearInterval(interval)
 *   })
 *
 *   return <div>{() => state.count}</div>
 * }
 */
export function onCleanup(cleanup: () => void) {
  const component = getCurrentComponent();
  if (!component) {
    console.warn("onCleanup called outside component scope");
    return;
  }
  component.cleanups.push(cleanup);
}

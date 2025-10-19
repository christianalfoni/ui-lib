/**
 * DOM manipulation utilities and helpers
 */

import { autorun } from "./createState";
import classNames from "classnames";

export type Props = Record<string, any> & { children?: any };

/**
 * Checks if a prop name is an event handler (e.g., onClick, onSubmit)
 */
export function isEventProp(k: string): boolean {
  return k.startsWith("on") && k.length > 2 && k[2] === k[2].toUpperCase();
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

      // Track listener for cleanup
      let listeners = (el as any).__listeners;
      if (!listeners) {
        listeners = [];
        (el as any).__listeners = listeners;
      }
      listeners.push({ eventName, handler: value });
    }
    return;
  }

  // Handle function props for native elements (reactive scope)
  if (typeof value === "function") {
    const dispose = autorun(() => {
      const result = value();
      applyProp(el, key, result);
    });

    // Track disposal function for cleanup
    let disposals = (el as any).__disposals;
    if (!disposals) {
      disposals = [];
      (el as any).__disposals = disposals;
    }
    disposals.push(dispose);
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

  // Avoid setting event handlers through applyProp (should go through setProp's event path)
  if (isEventProp(key)) {
    return;
  }

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

  const cleanups: (() => void)[] = [];

  function clearContent() {
    // Remove all DOM nodes WITHOUT running cleanup functions
    // This is used during reactive updates where we're replacing content
    // but the autorun should stay alive
    let n = start.nextSibling;
    while (n && n !== end) {
      const next = n.nextSibling;
      // Clean up any event listeners or metadata attached to the node
      cleanupNode(n);
      n.parentNode!.removeChild(n);
      n = next;
    }
  }

  function clearAll() {
    // Remove all DOM nodes AND run cleanup functions
    // This is used when the region itself is being unmounted
    clearContent();

    // Run all cleanup functions (including autorun disposal)
    for (const cleanup of cleanups) {
      cleanup();
    }
    cleanups.length = 0;
  }

  function insertBeforeRef(n: Node, ref: Node | null) {
    end.parentNode!.insertBefore(n, ref ?? end);
  }

  function addCleanup(fn: () => void) {
    cleanups.push(fn);
  }

  return { start, end, clearAll, clearContent, insertBeforeRef, addCleanup };
}

/**
 * Cleans up any metadata attached to a node (like event listeners or keys)
 */
function cleanupNode(node: Node) {
  if (node instanceof HTMLElement) {
    // Dispose of reactive property subscriptions
    const disposals = (node as any).__disposals;
    if (disposals) {
      for (const dispose of disposals) {
        dispose();
      }
    }

    // Remove tracked event listeners
    const listeners = (node as any).__listeners;
    if (listeners) {
      for (const { eventName, handler } of listeners) {
        node.removeEventListener(eventName, handler);
      }
    }

    // Recursively clean up child nodes
    for (let i = 0; i < node.childNodes.length; i++) {
      cleanupNode(node.childNodes[i]);
    }

    // Remove reference to any internal metadata
    delete (node as any).__key;
    delete (node as any).__listeners;
    delete (node as any).__disposals;
  }
}

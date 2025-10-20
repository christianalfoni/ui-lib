/**
 * JSX factory, render, and child handling
 */

import { autorun, runWithMemo } from "./reactivity";
import { setProp, createRegion, enterLifecycleScope, exitLifecycleScope, type Props } from "./dom";

export type Key = string | number;

/**
 * Internal type for keyed items before evaluation
 */
type KeyedItem = {
  key: Key;
  value: any;
};

export type Child = Node | string | number | boolean | null | undefined | Child[] | (() => any) | KeyedItem;

/**
 * Internal function that handles element creation
 * Used by both h() and jsx() runtimes
 */
export function createElement(type: any, props: Record<string, any>, children: Child[]): Node | KeyedItem {
  const { key, ...rest } = props;

  // If we have a key, delay evaluation by returning a KeyedItem
  if (key !== undefined) {
    return {
      key,
      value: { type, props: rest, children }
    };
  }

  if (typeof type === "function") {
    // Components run once, return a Node (or nodes via nested scopes)
    // Enter lifecycle scope to track onMount/onCleanup calls
    enterLifecycleScope();
    let result;
    try {
      result = type({ ...rest, children });
    } finally {
      // Exit lifecycle scope and collect all registered callbacks
      const { mounts, cleanups } = exitLifecycleScope();

      // Attach lifecycle callbacks to the returned node
      if (result instanceof Node) {
        if (cleanups.length > 0) {
          let cleanupFns = (result as any).__componentCleanups;
          if (!cleanupFns) {
            cleanupFns = [];
            (result as any).__componentCleanups = cleanupFns;
          }
          cleanupFns.push(...cleanups);
        }

        if (mounts.length > 0) {
          let mountFns = (result as any).__mountCallbacks;
          if (!mountFns) {
            mountFns = [];
            (result as any).__mountCallbacks = mountFns;
          }
          mountFns.push(...mounts);
        }
      }
    }

    // If component returns a function, treat it as a reactive component
    // The function will be handled by appendChild as a reactive child
    if (typeof result === "function") {
      return result as any;
    }

    return result;
  }

  // Intrinsic element
  const el = document.createElement(type);

  for (const [k, v] of Object.entries(rest)) setProp(el as HTMLElement, k, v);
  for (const c of children) appendChild(el, c);
  return el;
}

/**
 * JSX factory function (pragma)
 */
export function h(type: any, props: Props | null, ...restChildren: Child[]): Node | KeyedItem {
  props = props || {};
  const { children: propChildren, ...rest } = props as Props & { key?: Key };
  const children: Child[] = propChildren !== undefined ? [propChildren, ...restChildren] : restChildren;

  return createElement(type, rest, children);
}

/**
 * Helper to check if value is a KeyedItem
 */
function isKeyedItem(value: any): value is KeyedItem {
  return value && typeof value === 'object' && 'key' in value && 'value' in value;
}

/**
 * Evaluates a KeyedItem into an actual Node
 */
function evaluateKeyedItem(item: KeyedItem): Node {
  const { type, props, children } = item.value;

  if (typeof type === "function") {
    // Components run once, return a Node (or nodes via nested scopes)
    // Enter lifecycle scope to track onMount/onCleanup calls
    enterLifecycleScope();
    let result;
    try {
      result = type({ ...props, children });
    } finally {
      // Exit lifecycle scope and collect all registered callbacks
      const { mounts, cleanups } = exitLifecycleScope();

      // Attach lifecycle callbacks to the returned node
      if (result instanceof Node) {
        if (cleanups.length > 0) {
          let cleanupFns = (result as any).__componentCleanups;
          if (!cleanupFns) {
            cleanupFns = [];
            (result as any).__componentCleanups = cleanupFns;
          }
          cleanupFns.push(...cleanups);
        }

        if (mounts.length > 0) {
          let mountFns = (result as any).__mountCallbacks;
          if (!mountFns) {
            mountFns = [];
            (result as any).__mountCallbacks = mountFns;
          }
          mountFns.push(...mounts);
        }
      }
    }

    // If component returns a function, treat it as a reactive component
    // The function will be handled by appendChild as a reactive child
    if (typeof result === "function") {
      return result as any;
    }

    const node = result as Node;
    (node as any).__key = item.key;
    return node;
  }

  // Intrinsic element
  const el = document.createElement(type);
  (el as any).__key = item.key;

  for (const [k, v] of Object.entries(props)) setProp(el as HTMLElement, k, v);
  for (const c of children) appendChild(el, c);
  return el;
}

/**
 * Renders a node into a container element
 */
export function render(node: Node | KeyedItem | (() => any), container: Element): void {
  if (typeof node === 'function') {
    // Handle reactive component - use appendChild to set up reactive region
    appendChild(container, node);
  } else if (isKeyedItem(node)) {
    container.appendChild(evaluateKeyedItem(node));
  } else {
    container.appendChild(node);
  }
}

/**
 * Helper to normalize any value to a Node
 */
function normalizeToNode(item: any): Node {
  if (isKeyedItem(item)) return evaluateKeyedItem(item);
  if (item instanceof Node) return item;
  return document.createTextNode(String(item));
}

/**
 * Appends a child (with support for functions, arrays, and keyed elements)
 */
function appendChild(parent: Node, child: Child): void {
  if (child == null || child === false) return;

  // Function child => reactive region with array support
  if (typeof child === "function") {
    const region = createRegion(parent);
    let singleNode: Node | null = null;
    let arrayNodes: Node[] = []; // current nodes (keyed or not)

    const dispose = autorun((onCleanup) => {
      // IMPORTANT: Don't register the autorun's dispose with the region's cleanup
      // The autorun manages its own lifecycle independently
      // Only clean up DOM nodes and their associated listeners
      let out = runWithMemo(child as () => any);

      // Flatten nested arrays (produced by .map, nested expressions, etc.)
      // This recursively walks the tree structure and collects all leaf values
      // Example: [[node1, [node2]], node3] => [node1, node2, node3]
      const flatten = (x: any, acc: any[]) => {
        if (x == null || x === false) return;
        if (Array.isArray(x)) {
          for (const i of x) flatten(i, acc);
          return;
        }
        // Keep KeyedItems and Nodes as-is for processing later
        acc.push(x);
      };

      // null/false -> clear everything
      if (out == null || out === false) {
        if (singleNode !== null || arrayNodes.length > 0) {
          region.clearContent();
          singleNode = null;
          arrayNodes = [];
        }
        return;
      }

      // Single node/text
      if (!Array.isArray(out)) {
        const node = normalizeToNode(out);
        if (singleNode === node) return; // nothing changed
        region.clearContent();
        region.insertBeforeRef(node, null);
        callMountCallbacks(node);
        singleNode = node;
        arrayNodes = [];
        return;
      }

      // Array case - flatten nested structures first
      const flattened: any[] = [];
      flatten(out, flattened);

      // Check if we have KeyedItems (for efficient diffing) or regular nodes
      const allKeyed = flattened.length > 0 && flattened.every(isKeyedItem);

      if (!allKeyed) {
        // Non-keyed or mixed array: replace everything
        const nodes = flattened.map(normalizeToNode);
        region.clearContent();
        for (const n of nodes) {
          region.insertBeforeRef(n, null);
          callMountCallbacks(n);
        }
        arrayNodes = nodes;
        singleNode = null;
        return;
      }

      // Keyed diff - items are KeyedItems, evaluate only when needed
      const keyedItems = flattened as KeyedItem[];

      // Early exit: if keys haven't changed, do nothing
      if (arrayNodes.length === keyedItems.length) {
        const unchanged = keyedItems.every((item, i) =>
          (arrayNodes[i] as any).__key === item.key
        );
        if (unchanged) return;
      }

      const oldByKey = new Map<Key, Node>();
      for (const n of arrayNodes) oldByKey.set((n as any).__key, n);

      const newKeys = keyedItems.map(item => item.key);
      const newKeySet = new Set(newKeys);

      // First pass: remove nodes that are no longer needed
      for (const [k, node] of oldByKey) {
        if (!newKeySet.has(k)) {
          node.parentNode?.removeChild(node);
          oldByKey.delete(k);
        }
      }

      // Second pass: reorder/insert nodes from end to start
      // We iterate backwards so each node can be positioned relative to the previous one
      // This avoids having to recalculate positions as we insert/move nodes
      const parentNode = region.end.parentNode!;
      let insertBeforeRef: Node | null = region.end; // starts at tail, works backward

      for (let i = keyedItems.length - 1; i >= 0; i--) {
        const k = newKeys[i];
        const existing = oldByKey.get(k);
        if (existing) {
          // Reuse existing node - don't re-evaluate the component!
          // Move existing node before current reference if needed
          if (existing.nextSibling !== insertBeforeRef) {
            parentNode.insertBefore(existing, insertBeforeRef);
          }
          insertBeforeRef = existing;
        } else {
          // New key: evaluate the KeyedItem NOW to create the node
          const newNode = evaluateKeyedItem(keyedItems[i]);
          region.insertBeforeRef(newNode, insertBeforeRef);
          callMountCallbacks(newNode);
          insertBeforeRef = newNode;
        }
      }

      // Rebuild arrayNodes by scanning siblings between region markers
      const ordered: Node[] = [];
      let cur = region.start.nextSibling;
      while (cur && cur !== region.end) {
        ordered.push(cur);
        cur = cur.nextSibling;
      }
      arrayNodes = ordered;
      singleNode = null;
    });

    // Register the autorun disposal to run when the region is actually unmounted
    region.addCleanup(dispose);

    return;
  }

  // Arrays passed *directly* (outside scopes) – append flat
  if (Array.isArray(child)) {
    for (const c of child) appendChild(parent, c);
    return;
  }

  if (child instanceof Node) {
    parent.appendChild(child);
    // Call mount callbacks after insertion
    callMountCallbacks(child);
    return;
  }
  parent.appendChild(document.createTextNode(String(child)));
}

/**
 * Recursively calls mount callbacks on a node and its children after DOM insertion
 */
function callMountCallbacks(node: Node): void {
  if (node instanceof HTMLElement) {
    const mountCallbacks = (node as any).__mountCallbacks;
    if (mountCallbacks) {
      for (const callback of mountCallbacks) {
        callback();
      }
      // Clear the callbacks after calling them once
      delete (node as any).__mountCallbacks;
    }

    // Recursively call mount callbacks on child nodes
    for (let i = 0; i < node.childNodes.length; i++) {
      callMountCallbacks(node.childNodes[i]);
    }
  }
}

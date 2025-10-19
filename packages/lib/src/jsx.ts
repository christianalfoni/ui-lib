/**
 * JSX factory, render, and child handling
 */

import { autorun } from "./createState";
import { setProp, createRegion, type Props } from "./dom";

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
    const result = type({ ...rest, children });

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
    const result = type({ ...props, children });

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
 * Appends a child (with support for functions, arrays, and keyed elements)
 */
function appendChild(parent: Node, child: Child): void {
  if (child == null || child === false) return;

  // Function child => reactive region with array support
  if (typeof child === "function") {
    const region = createRegion(parent);
    // Track current mode
    let mode: "none" | "single" | "array" = "none";
    let singleNode: Node | null = null;
    let arrayNodes: Node[] = []; // current nodes (keyed or not)

    const dispose = autorun((onCleanup) => {
      // IMPORTANT: Don't register the autorun's dispose with the region's cleanup
      // The autorun manages its own lifecycle independently
      // Only clean up DOM nodes and their associated listeners
      let out = (child as () => any)();

      // Normalize arrays produced by nested maps, etc.
      const flatten = (x: any, acc: any[]) => {
        if (x == null || x === false) return;
        if (Array.isArray(x)) {
          for (const i of x) flatten(i, acc);
          return;
        }
        if (isKeyedItem(x)) {
          acc.push(x);
          return;
        }
        if (x instanceof Node) {
          acc.push(x);
          return;
        }
        acc.push(document.createTextNode(String(x)));
      };

      // null/false -> clear
      if (out == null || out === false) {
        if (mode !== "none") {
          region.clearContent();
          singleNode = null;
          arrayNodes = [];
          mode = "none";
        }
        return;
      }

      // Single node/text
      if (!Array.isArray(out)) {
        let node: Node;
        if (isKeyedItem(out)) {
          node = evaluateKeyedItem(out);
        } else if (out instanceof Node) {
          node = out;
        } else {
          node = document.createTextNode(String(out));
        }
        if (mode === "single" && singleNode === node) return; // nothing
        region.clearContent();
        region.insertBeforeRef(node, null);
        singleNode = node;
        arrayNodes = [];
        mode = "single";
        return;
      }

      // Array case
      const flattened: any[] = [];
      flatten(out, flattened);

      // Check if we have KeyedItems (delay evaluation) or regular nodes
      const allKeyed = flattened.length === 0 ? false : flattened.every(isKeyedItem);

      if (!allKeyed) {
        // Replace everything - either non-keyed or mixed
        // Evaluate any KeyedItems that slipped through
        const nodes: Node[] = [];
        for (const item of flattened) {
          if (isKeyedItem(item)) {
            nodes.push(evaluateKeyedItem(item));
          } else if (item instanceof Node) {
            nodes.push(item);
          } else {
            nodes.push(document.createTextNode(String(item)));
          }
        }
        region.clearContent();
        for (const n of nodes) region.insertBeforeRef(n, null);
        arrayNodes = nodes;
        singleNode = null;
        mode = "array";
        return;
      }

      // Keyed diff - items are KeyedItems, evaluate only when needed
      const keyedItems = flattened as KeyedItem[];
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
      let ref: Node | null = region.end; // insert before this; starts at tail
      for (let i = keyedItems.length - 1; i >= 0; i--) {
        const k = newKeys[i];
        const existing = oldByKey.get(k);
        if (existing) {
          // Reuse existing node - don't evaluate the component!
          // Move existing before current ref if needed
          if (existing.nextSibling !== ref) {
            // Use parent's insertBefore directly to move the node
            region.end.parentNode!.insertBefore(existing, ref);
          }
          ref = existing;
        } else {
          // New key: evaluate the KeyedItem NOW to create the node
          const newNode = evaluateKeyedItem(keyedItems[i]);
          region.insertBeforeRef(newNode, ref);
          ref = newNode;
        }
      }

      // Recompute by scanning siblings between start/end
      const ordered: Node[] = [];
      let cur = region.start.nextSibling;
      while (cur && cur !== region.end) {
        ordered.push(cur);
        cur = cur.nextSibling;
      }
      arrayNodes = ordered;
      singleNode = null;
      mode = "array";
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
    return;
  }
  parent.appendChild(document.createTextNode(String(child)));
}

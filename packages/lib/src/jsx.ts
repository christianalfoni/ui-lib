/**
 * JSX factory, render, and child handling
 */

import { autorun } from "./createState";
import { setProp, createRegion, type Props } from "./dom";

export type Child = Node | string | number | boolean | null | undefined | Child[] | (() => any);
export type Key = string | number;

/**
 * JSX factory function (pragma)
 */
export function h(type: any, props: Props | null, ...restChildren: Child[]): Node {
  props = props || {};
  const { key, children: propChildren, ...rest } = props as Props & { key?: Key };
  const children: Child[] = propChildren !== undefined ? [propChildren, ...restChildren] : restChildren;

  if (typeof type === "function") {
    // Components run once, return a Node (or nodes via nested scopes)
    return type({ ...rest, children });
  }

  // Intrinsic element
  const el = document.createElement(type);
  if (key !== undefined) (el as any).__key = key; // stash key on node

  for (const [k, v] of Object.entries(rest)) setProp(el as HTMLElement, k, v);
  for (const c of children) appendChild(el, c);
  return el;
}

/**
 * Renders a node into a container element
 */
export function render(node: Node, container: Element): void {
  container.appendChild(node);
}

/**
 * Appends a child (with support for functions, arrays, and keyed elements)
 */
function appendChild(parent: Node, child: Child): void {
  if (child == null || child === false) return;

  // Function child => observation scope with array support
  if (typeof child === "function") {
    const region = createRegion(parent);
    // Track current mode
    let mode: "none" | "single" | "array" = "none";
    let singleNode: Node | null = null;
    let arrayNodes: Node[] = []; // current nodes (keyed or not)

    const dispose = autorun(() => {
      let out = (child as () => any)();

      // Normalize arrays produced by nested maps, etc.
      const flatten = (x: any, acc: any[]) => {
        if (x == null || x === false) return;
        if (Array.isArray(x)) {
          for (const i of x) flatten(i, acc);
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
          region.clearAll();
          singleNode = null;
          arrayNodes = [];
          mode = "none";
        }
        return;
      }

      // Single node/text
      if (!Array.isArray(out)) {
        const node = out instanceof Node ? out : document.createTextNode(String(out));
        if (mode === "single" && singleNode === node) return; // nothing
        region.clearAll();
        region.insertBeforeRef(node, null);
        singleNode = node;
        arrayNodes = [];
        mode = "single";
        return;
      }

      // Array case
      const next: Node[] = [];
      flatten(out, next);

      // If any item lacks a key => replace-all (simple mode)
      const allKeyed =
        next.length === 0 ? true : next.every(n => (n as any).__key !== undefined);

      if (!allKeyed) {
        // replace everything
        region.clearAll();
        for (const n of next) region.insertBeforeRef(n, null);
        arrayNodes = next;
        singleNode = null;
        mode = "array";
        return;
      }

      // Keyed diff (single-node granularity)
      const oldByKey = new Map<Key, Node>();
      for (const n of arrayNodes) oldByKey.set((n as any).__key, n);

      const newKeys = next.map(n => (n as any).__key as Key);
      const kept = new Set<Key>();

      // Walk from end so we can use a moving "ref"
      let ref: Node | null = region.end; // insert before this; starts at tail
      for (let i = next.length - 1; i >= 0; i--) {
        const k = newKeys[i];
        const want = next[i];
        const existing = oldByKey.get(k);
        if (existing) {
          kept.add(k);
          // Move existing before current ref if needed
          if (existing.nextSibling !== ref) {
            const range = document.createRange();
            range.selectNode(existing);
            const frag = range.extractContents();
            region.insertBeforeRef(frag, ref);
          }
          ref = existing;
        } else {
          // New node: just insert
          region.insertBeforeRef(want, ref);
          ref = want;
        }
      }

      // Remove old nodes that weren't kept
      for (const [k, node] of oldByKey) {
        if (!kept.has(k)) node.parentNode?.removeChild(node);
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

    // Register the autorun disposal with the region
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

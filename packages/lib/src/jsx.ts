/**
 * JSX factory, render, and child handling
 */

import { autorun, runWithMemo } from "./reactivity";
import { setProp, createRegion, type Props } from "./dom";
import {
  ReactiveComponent,
  ReactiveChild,
  getCurrentInstance,
  enterComponentScope,
  exitComponentScope,
  enterReactiveScope,
  exitReactiveScope,
} from "./component";

export type Key = string | number;

/**
 * Internal type for keyed items before evaluation
 */
type KeyedItem = {
  key: Key;
  value: any;
};

export type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | Child[]
  | (() => any)
  | KeyedItem
  | ReactiveComponent;

/**
 * Internal function that evaluates a component function
 * Shared logic for both createElement and evaluateKeyedItem
 */
function evaluateComponentFunction(
  type: Function,
  props: Record<string, any>,
  children: Child[],
  parentInstance: ReactiveComponent | ReactiveChild | null
): ReactiveComponent {
  const component = enterComponentScope(parentInstance);

  let result;
  try {
    result = type({ ...props, children });
    // Set domRoot based on what the component returns
    if (result instanceof Node) {
      component.domRoot = result;
    } else if (result instanceof ReactiveComponent) {
      component.domRoot = result.domRoot;
    } else {
      component.domRoot = null;
    }
  } finally {
    exitComponentScope();
  }

  // If component returns a function (reactive component), handle it
  if (typeof result === "function") {
    return result as any;
  }

  return component;
}

/**
 * Internal function that handles element creation
 * Used by both h() and jsx() runtimes
 */
export function createElement(
  type: any,
  props: Record<string, any>,
  children: Child[]
): Node | KeyedItem | ReactiveComponent {
  const { key, ...rest } = props;

  // If we have a key, delay evaluation by returning a KeyedItem
  if (key !== undefined) {
    return {
      key,
      value: { type, props: rest, children },
    };
  }

  if (typeof type === "function") {
    const parentInstance = getCurrentInstance();
    return evaluateComponentFunction(type, rest, children, parentInstance);
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
export function h(
  type: any,
  props: Props | null,
  ...restChildren: Child[]
): Node | KeyedItem | ReactiveComponent {
  props = props || {};
  const { children: propChildren, ...rest } = props as Props & { key?: Key };
  const children: Child[] =
    propChildren !== undefined ? [propChildren, ...restChildren] : restChildren;

  return createElement(type, rest, children);
}

/**
 * Helper to check if value is a KeyedItem
 */
function isKeyedItem(value: any): value is KeyedItem {
  return (
    value && typeof value === "object" && "key" in value && "value" in value
  );
}

/**
 * Evaluates a KeyedItem into an actual Node
 */
function evaluateKeyedItem(item: KeyedItem): {
  instance: ReactiveComponent | null;
  node: Node;
} {
  const { type, props, children } = item.value;

  if (typeof type === "function") {
    const parentInstance = getCurrentInstance();
    const component = evaluateComponentFunction(type, props, children, parentInstance);

    if (!component.domRoot) {
      throw new Error("Keyed component did not return a valid DOM node");
    }

    const node = component.domRoot;
    (node as any).__key = item.key;
    return { instance: component, node };
  }

  // Intrinsic element - no instance needed, just DOM
  const el = document.createElement(type);
  (el as any).__key = item.key;

  for (const [k, v] of Object.entries(props)) setProp(el as HTMLElement, k, v);
  for (const c of children) appendChild(el, c);

  return { instance: null, node: el };
}

/**
 * Renders a node into a container element
 */
export function render(
  node: Node | KeyedItem | (() => any) | ReactiveComponent,
  container: Element
): { dispose: () => void } {
  let rootComponent: ReactiveComponent | null = null;

  if (node instanceof ReactiveComponent) {
    rootComponent = node;
    if (node.domRoot) {
      container.appendChild(node.domRoot);
      node.callMountCallbacks();
    }
  } else if (typeof node === "function") {
    // Handle reactive component - use appendChild to set up reactive region
    appendChild(container, node);
  } else if (isKeyedItem(node)) {
    const { instance, node: domNode } = evaluateKeyedItem(node);
    container.appendChild(domNode);
    rootComponent = instance;
    if (instance) {
      instance.callMountCallbacks();
    }
  } else {
    container.appendChild(node);
  }

  return {
    dispose: () => rootComponent?.dispose(),
  };
}

/**
 * Helper to normalize any value to a Node and instance
 */
function normalizeToInstanceAndNode(item: any): {
  instance: ReactiveComponent | null;
  node: Node;
} {
  if (item instanceof ReactiveComponent) {
    // domRoot should always be set for components that return DOM nodes
    if (!item.domRoot) {
      throw new Error("Component did not return a valid DOM node");
    }
    return { instance: item, node: item.domRoot };
  }
  if (isKeyedItem(item)) {
    return evaluateKeyedItem(item);
  }
  if (item instanceof Node) {
    return { instance: null, node: item };
  }
  return { instance: null, node: document.createTextNode(String(item)) };
}

/**
 * Appends a child (with support for functions, arrays, and keyed elements)
 */
function appendChild(parent: Node, child: Child): void {
  if (child == null || child === false) return;

  // Handle ReactiveComponent
  if (child instanceof ReactiveComponent) {
    if (child.domRoot) {
      parent.appendChild(child.domRoot);
      child.callMountCallbacks();
    }
    return;
  }

  // Function child => create ReactiveChild for reactive JSX child
  // This is ONLY for {() => ...} in JSX children, not for reactive props
  if (typeof child === "function") {
    // Create a bounded region in the DOM for this reactive content
    const region = createRegion(parent);
    const parentInstance = getCurrentInstance();
    const reactiveChild = enterReactiveScope(parentInstance, region);

    // Set up an autorun that re-evaluates whenever dependencies change
    const dispose = autorun(() => {
      // Run the function with memoization to avoid redundant re-renders
      const out = runWithMemo(child as () => any);

      // Helper to flatten nested arrays
      const flatten = (x: any, acc: any[]) => {
        if (x == null || x === false) return;
        if (Array.isArray(x)) {
          for (const i of x) flatten(i, acc);
          return;
        }
        acc.push(x);
      };

      // CLEANUP PHASE: Dispose all children from the previous evaluation cycle
      // This is safe because ReactiveComponents with ReactiveChild parents
      // do NOT auto-register during construction (see component.ts constructor).
      // Only children from the previous evaluation cycle are in this set.
      for (const childInstance of reactiveChild.children) {
        childInstance.dispose();
      }
      reactiveChild.children.clear();

      // RENDER PHASE: Determine what to render

      // Case 1: null/false -> clear all content
      if (out == null || out === false) {
        region.clearContent();
        return;
      }

      // Case 2: Single item (not an array)
      if (!Array.isArray(out)) {
        const { instance, node } = normalizeToInstanceAndNode(out);
        region.clearContent();
        region.insertBeforeRef(node, null);
        if (instance) {
          // Manually register the component with the ReactiveChild parent
          // (see component.ts for why we don't auto-register)
          reactiveChild.children.add(instance);
          instance.callMountCallbacks();
        }
        return;
      }

      // Case 3: Array - flatten nested arrays first
      const flattened: any[] = [];
      flatten(out, flattened);

      const hasKeyed = flattened.some(isKeyedItem);
      const allKeyed = flattened.every(isKeyedItem);

      // Validate: either all keyed or all non-keyed (no mixing)
      if (hasKeyed && !allKeyed) {
        throw new Error('Cannot mix keyed and non-keyed children in the same array');
      }

      // Case 3a: Non-keyed array -> replace all content
      // This is the simple case: just clear everything and insert new items
      if (!allKeyed) {
        region.clearContent();
        for (const item of flattened) {
          const { instance, node } = normalizeToInstanceAndNode(item);
          region.insertBeforeRef(node, null);
          if (instance) {
            // Manually register the component with the ReactiveChild parent
            reactiveChild.children.add(instance);
            instance.callMountCallbacks();
          }
        }
        return;
      }

      // Case 3b: Keyed array -> efficient diffing algorithm
      // This preserves existing DOM nodes and only updates what changed
      const keyedItems = flattened as KeyedItem[];

      // STEP 0: Remove any non-keyed DOM content from previous renders
      // This handles the case where we're transitioning from non-keyed to keyed
      let n = region.start.nextSibling;
      while (n && n !== region.end) {
        const next = n.nextSibling;
        const key = (n as any).__key;
        // If this node doesn't have a key, it's from a previous non-keyed render
        if (key === undefined) {
          n.parentNode?.removeChild(n);
        }
        n = next;
      }

      // STEP 1: Build a map of old (existing) keyed items
      // We need to track BOTH ReactiveComponents AND intrinsic DOM nodes
      const oldByKey = new Map<Key, { instance: ReactiveComponent | null; node: Node }>();

      // 1a. Add ReactiveComponents from the children set
      for (const childInstance of reactiveChild.children) {
        if (
          childInstance instanceof ReactiveComponent &&
          childInstance.domRoot
        ) {
          const key = (childInstance.domRoot as any).__key;
          if (key !== undefined) {
            oldByKey.set(key, { instance: childInstance, node: childInstance.domRoot });
          }
        }
      }

      // 1b. Scan DOM nodes in the region for keyed intrinsic elements
      // (Intrinsic elements don't have component instances, only DOM nodes)
      n = region.start.nextSibling;
      while (n && n !== region.end) {
        const key = (n as any).__key;
        if (key !== undefined && !oldByKey.has(key)) {
          // This is a keyed intrinsic element (no instance)
          oldByKey.set(key, { instance: null, node: n });
        }
        n = n.nextSibling;
      }

      // STEP 2: Determine which keys are in the new array
      const newKeys = keyedItems.map((item) => item.key);
      const newKeySet = new Set(newKeys);

      // STEP 3: Remove items that are no longer in the new array
      for (const [k, entry] of oldByKey) {
        if (!newKeySet.has(k)) {
          // This key is gone - clean it up
          if (entry.instance) {
            // Dispose ReactiveComponent (handles cleanup, event listeners, etc.)
            entry.instance.dispose();
          } else {
            // For intrinsic elements, just remove from DOM
            // Event listener cleanup is handled by the parent instance's cleanups
            // which were registered when setProp was called during element creation
            entry.node.parentNode?.removeChild(entry.node);
          }
          oldByKey.delete(k);
        }
      }

      // STEP 4: Reorder/insert items to match the new array order
      // We iterate backwards to maintain correct positioning relative to the end marker
      const parentNode = region.end.parentNode!;
      let insertBeforeRef: Node | null = region.end;
      const newChildren = new Set<ReactiveComponent>();

      for (let i = keyedItems.length - 1; i >= 0; i--) {
        const k = newKeys[i];
        const existing = oldByKey.get(k);

        if (existing) {
          // Reuse existing node - just reposition if needed
          if (existing.node.nextSibling !== insertBeforeRef) {
            parentNode.insertBefore(existing.node, insertBeforeRef);
          }
          insertBeforeRef = existing.node;
          if (existing.instance) {
            newChildren.add(existing.instance);
          }
        } else {
          // New item - evaluate and insert
          const { instance, node } = evaluateKeyedItem(keyedItems[i]);
          region.insertBeforeRef(node, insertBeforeRef);
          insertBeforeRef = node;
          if (instance) {
            // Manually register the component with the ReactiveChild parent
            newChildren.add(instance);
            instance.callMountCallbacks();
          }
        }
      }

      // STEP 5: Replace the children set with the new one
      // Old children that weren't in newChildren were already disposed in step 3
      reactiveChild.children = newChildren;
    });

    reactiveChild.autorunDisposal = dispose;
    exitReactiveScope();

    return;
  }

  // Arrays passed directly
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

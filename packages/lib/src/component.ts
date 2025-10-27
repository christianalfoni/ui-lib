/**
 * Component Instance Infrastructure
 *
 * This module implements the logical component tree that runs parallel to the DOM tree.
 * It provides two instance types:
 * - Component: Represents user-defined function components
 * - ReactiveContent: Represents reactive scopes created by function children in JSX
 *
 * Both types are internal implementation details and not exposed in the public API.
 */

import { autorun } from './reactivity';

/**
 *
 * ## Parent-Child Registration Flow
 *
 * ### Component as Parent
 * When a Component is created with another Component as parent,
 * it automatically registers itself with the parent during construction. This is safe
 * because component render is deterministic - once a component returns JSX, those
 * child components are permanent for that component's lifetime.
 *
 * Example:
 * ```tsx
 * function Parent() {
 *   return <Child />  // Child auto-registers with Parent
 * }
 * ```
 *
 * ### ReactiveContent as Parent
 * When a Component is created with a ReactiveContent as parent (i.e., inside
 * a reactive function like {() => <Component />}), it does NOT auto-register.
 *
 * Why? ReactiveContent runs an autorun that:
 * 1. Disposes all current children at the start of each evaluation
 * 2. Re-evaluates the function
 * 3. Adds the new children to the set
 *
 * If components auto-registered during step 2, they would be in the children set
 * and immediately disposed in step 1 of the NEXT cycle, even if they should be kept.
 *
 * Instead, ReactiveContent explicitly adds children after successful evaluation,
 * ensuring only the final, rendered components are tracked.
 *
 * Example of problematic auto-registration:
 * ```tsx
 * {() => <MemoTest />}  // Reactive function
 *
 * // Cycle 1:
 * // - autorun runs, creates MemoTest instance A
 * // - A auto-registers with ReactiveContent
 * // - A is added to children set
 *
 * // Cycle 2 (when state changes):
 * // - autorun starts, disposes all children (including A) ❌
 * // - autorun creates new MemoTest instance B
 * // - normalizeToInstanceAndNode receives A (which is now disposed!)
 * // - Error: component.domRoot is null
 * ```
 *
 * With manual registration:
 * ```tsx
 * {() => <MemoTest />}  // Reactive function
 *
 * // Cycle 1:
 * // - autorun runs, creates MemoTest instance A
 * // - A does NOT auto-register
 * // - After successful evaluation, explicitly add A to children
 *
 * // Cycle 2 (when state changes):
 * // - autorun starts, disposes all children (A from previous cycle) ✅
 * // - autorun creates new MemoTest instance B
 * // - After successful evaluation, explicitly add B to children
 * // - Old A is disposed, new B is rendered
 * ```
 */

// Shared parent type for both instance types
export type ReactiveInstance = Component | ReactiveContent;

/**
 * ReactiveAttribute - A tiny abstraction over autorun for reactive props
 *
 * - Created for function props like style={() => expr}
 * - Manages a single reactive autorun scope
 * - Provides simple disposal
 */
export class ReactiveAttribute {
  private disposal: (() => void) | null = null;

  constructor(effect: () => void) {
    this.disposal = autorun(effect);
  }

  dispose() {
    this.disposal?.();
    this.disposal = null;
  }
}

/**
 * Component - Represents user-defined components (function components)
 *
 * - Exists independently from DOM nodes
 * - Tracks children (both Component and ReactiveContent)
 * - Owns cleanup responsibilities (event listeners, autoruns, user cleanups)
 * - Disposes entire subtree recursively
 */
export class Component {
  parent: ReactiveInstance | null = null;
  children: Set<ReactiveInstance> = new Set();
  cleanups: Array<() => void> = [];
  autorunDisposals: Array<() => void> = [];
  mountCallbacks: Array<() => void> = [];
  domRoot: Node | null = null;
  isDisposed: boolean = false;

  constructor(parent: ReactiveInstance | null) {
    this.parent = parent;
    // Only auto-register with Component parents
    // ReactiveContent parents will manually add children after evaluation
    //
    // WHY: ReactiveContent runs autoruns that re-evaluate and dispose old children
    // at the start of each cycle. If we auto-register during construction, the
    // newly created component would be in the children set and immediately disposed
    // before we determine it should be kept. Instead, ReactiveContent explicitly
    // adds children after successful evaluation (see appendChild in jsx.ts).
    if (parent instanceof Component) {
      parent.children.add(this);
    }
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // Dispose all children first (depth-first)
    for (const child of this.children) {
      child.dispose();
    }
    this.children.clear();

    // Run user cleanups (from onCleanup)
    for (const cleanup of this.cleanups) {
      cleanup();
    }

    // Dispose reactive autoruns (from reactive props)
    for (const disposal of this.autorunDisposals) {
      disposal();
    }

    // Unregister from parent
    this.parent?.children.delete(this);

    // Clear DOM reference
    if (this.domRoot && this.domRoot.parentNode) {
      this.domRoot.parentNode.removeChild(this.domRoot);
    }

    // Clear all references
    this.cleanups = [];
    this.autorunDisposals = [];
    this.mountCallbacks = [];
    this.domRoot = null;
    this.parent = null;
  }

  callMountCallbacks() {
    for (const callback of this.mountCallbacks) {
      callback();
    }
    // Clear after calling once
    this.mountCallbacks = [];
  }
}

/**
 * ReactiveContent - Represents reactive scopes created by function children in JSX
 *
 * - Only created for reactive JSX children ({() => ...}), not for reactive props
 * - Manages a region of dynamic DOM content bounded by comment markers
 * - Owns its autorun disposal
 * - Provides cleanup context for intrinsic elements created inside the reactive scope
 * - Tracks child Components (from keyed arrays within the reactive scope)
 * - Smart diffing for content updates
 */
export class ReactiveContent {
  parent: ReactiveInstance | null;
  children: Set<ReactiveInstance> = new Set();
  cleanups: Array<() => void> = [];
  autorunDisposal: (() => void) | null = null;
  region: any; // ReturnType<typeof createRegion> - will be typed after dom.ts refactor
  isDisposed: boolean = false;

  constructor(parent: ReactiveInstance | null, region: any) {
    this.parent = parent;
    this.region = region;
    parent?.children.add(this);
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // Dispose all children (ComponentInstances from arrays)
    for (const child of this.children) {
      child.dispose();
    }
    this.children.clear();

    // Run cleanups (event listeners from intrinsic elements)
    for (const cleanup of this.cleanups) {
      cleanup();
    }

    // Dispose the reactive autorun
    this.autorunDisposal?.();

    // Clear DOM content
    this.region.clearContent();

    // Unregister from parent
    this.parent?.children.delete(this);

    // Clear references
    this.cleanups = [];
    this.autorunDisposal = null;
    this.parent = null;
  }
}

// Global context stack (supports both types)
let CURRENT_INSTANCE: ReactiveInstance | null = null;

/**
 * Get the current instance (ReactiveComponent or ReactiveChild)
 * Used internally for registering cleanups and autoruns
 */
export function getCurrentInstance(): ReactiveInstance | null {
  return CURRENT_INSTANCE;
}

/**
 * Convenience accessor for users (only exposes Component)
 * Used by public APIs like onMount and onCleanup
 */
export function getCurrentComponent(): Component | null {
  const instance = CURRENT_INSTANCE;
  return instance instanceof Component ? instance : null;
}

/**
 * Enter a component scope, creating a new Component instance
 */
export function enterComponentScope(
  parent: ReactiveInstance | null
): Component {
  const component = new Component(parent);
  CURRENT_INSTANCE = component;
  return component;
}

/**
 * Exit the current component scope, returning to the parent
 */
export function exitComponentScope(): Component | null {
  const component = CURRENT_INSTANCE;
  CURRENT_INSTANCE = component?.parent ?? null;
  return component as Component;
}

/**
 * Enter a reactive scope, creating a new ReactiveContent instance
 */
export function enterReactiveScope(
  parent: ReactiveInstance | null,
  region: any
): ReactiveContent {
  const reactiveContent = new ReactiveContent(parent, region);
  CURRENT_INSTANCE = reactiveContent;
  return reactiveContent;
}

/**
 * Exit the current reactive scope, returning to the parent
 */
export function exitReactiveScope(): ReactiveContent | null {
  const reactiveContent = CURRENT_INSTANCE;
  CURRENT_INSTANCE = reactiveContent?.parent ?? null;
  return reactiveContent as ReactiveContent;
}

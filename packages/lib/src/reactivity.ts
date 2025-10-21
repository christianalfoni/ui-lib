/**
 * MobX-like reactive state management with proxy-based tracking
 *
 * ARCHITECTURE:
 *
 * This module uses two complementary global scope trackers:
 *
 * 1. OBSERVATION SCOPE (CURRENT_OBSERVATION)
 *    - Tracks which reactive state properties are accessed during effect execution
 *    - Set by autorun() when running an effect function
 *    - Used by reactive proxies to subscribe the current reactive scope to properties
 *    - Analogous to React's dependency tracking in useEffect
 *
 * 2. COMPONENT SCOPE (CURRENT_COMPONENT)
 *    - Tracks cleanup functions registered during component instantiation
 *    - Set by enterComponentScope() when a component function runs
 *    - Used by onCleanup() to register cleanup with the component
 *    - Cleanups are run when the component is unmounted
 */

export type Cleanup = () => void;
export type ReactiveScope = { run: () => void; cleanup?: Cleanup };

// ============================================================================
// GLOBAL SCOPE TRACKING
// ============================================================================

/**
 * Current observation scope - tracks reactive state accesses during effect execution
 * When set, any property accesses on reactive state will subscribe this reactive scope
 */
let CURRENT_OBSERVATION: ReactiveScope | null = null;

// ============================================================================
// REACTIVITY INTERNALS
// ============================================================================

let BATCHING = false;
const PENDING_NOTIFICATIONS = new Set<() => void>();

/**
 * Global change counter for memoization
 * Incremented each time notifications are dispatched
 * Used to determine if cached function results are still valid
 */
let CHANGE_COUNTER = 0;

// Track which properties are accessed for each reactive scope
const propertyListeners = new WeakMap<object, Map<string | symbol, Set<ReactiveScope>>>();

// Track all subscriptions for each reactive scope (for cleanup)
const reactiveScopeSubscriptions = new WeakMap<ReactiveScope, Set<{ obj: object; prop: string | symbol }>>();

// Track proxies to avoid creating duplicates
const proxyCache = new WeakMap<object, any>();

/**
 * Array methods that mutate the array
 */
const ARRAY_MUTATORS = new Set([
  'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'
]);

/**
 * Flushes all pending notifications - used internally by batch() and array mutators
 * Increments the change counter and runs all queued reactive scopes
 */
function flushNotifications() {
  CHANGE_COUNTER++;
  const pending = Array.from(PENDING_NOTIFICATIONS);
  PENDING_NOTIFICATIONS.clear();
  pending.forEach(fn => fn());
}

/**
 * Batches multiple state updates to trigger only one reaction
 */
export function batch<T>(fn: () => T): T {
  const wasBatching = BATCHING;
  BATCHING = true;

  try {
    return fn();
  } finally {
    BATCHING = wasBatching;

    // If we're not nested in another batch, flush pending notifications
    if (!wasBatching) {
      flushNotifications();
    }
  }
}

/**
 * Creates a reactive proxy that tracks property access and mutations
 */
function createReactiveProxy<T extends object>(target: T): T {
  // Return cached proxy if it exists
  if (proxyCache.has(target)) {
    return proxyCache.get(target);
  }

  const proxy = new Proxy(target, {
    get(obj, prop) {
      // DEPENDENCY TRACKING: When a property is accessed during an autorun,
      // subscribe the reactive scope to that property so it re-runs on changes
      if (CURRENT_OBSERVATION && typeof prop !== 'symbol' && prop !== 'constructor') {
        // Get or create the property listeners map for this object
        let propsMap = propertyListeners.get(obj);
        if (!propsMap) {
          propsMap = new Map();
          propertyListeners.set(obj, propsMap);
        }

        // Get or create the set of listeners for this property
        let listeners = propsMap.get(prop);
        if (!listeners) {
          listeners = new Set();
          propsMap.set(prop, listeners);
        }
        listeners.add(CURRENT_OBSERVATION);

        // SUBSCRIPTION TRACKING: Track this subscription on the reactive scope
        // for cleanup when the scope is disposed (prevents memory leaks)
        let subs = reactiveScopeSubscriptions.get(CURRENT_OBSERVATION);
        if (!subs) {
          subs = new Set();
          reactiveScopeSubscriptions.set(CURRENT_OBSERVATION, subs);
        }
        // Check if we already have this subscription to avoid duplicates
        let found = false;
        for (const sub of subs) {
          if (sub.obj === obj && sub.prop === prop) {
            found = true;
            break;
          }
        }
        if (!found) {
          subs.add({ obj, prop });
        }
      }

      const value = Reflect.get(obj, prop);

      // For arrays, wrap mutating methods to trigger reactivity
      if (Array.isArray(obj) && typeof value === 'function' && ARRAY_MUTATORS.has(prop as string)) {
        return function(this: any, ...args: any[]) {
          // Batch notifications during the array mutation
          const wasBatching = BATCHING;
          BATCHING = true;

          const result = (value as Function).apply(this, args);

          // Restore batching state
          BATCHING = wasBatching;

          // Trigger all listeners for this array and its length property
          notifyListeners(obj, prop);
          notifyListeners(obj, 'length');

          // If we're not nested in another batch, flush pending notifications
          if (!wasBatching) {
            flushNotifications();
          }

          return result;
        };
      }

      // Recursively wrap nested objects and arrays
      if (value !== null && typeof value === 'object') {
        return createReactiveProxy(value);
      }

      return value;
    },

    set(obj, prop, value) {
      const oldValue = Reflect.get(obj, prop);
      const result = Reflect.set(obj, prop, value);

      // Only notify if value actually changed
      if (oldValue !== value) {
        // If we're batching, defer the notification
        if (BATCHING) {
          PENDING_NOTIFICATIONS.add(() => notifyListeners(obj, prop));
        } else {
          // Increment change counter for new reactive cycle
          CHANGE_COUNTER++;
          notifyListeners(obj, prop);
        }
      }

      return result;
    },

    deleteProperty(obj, prop) {
      const result = Reflect.deleteProperty(obj, prop);
      notifyListeners(obj, prop);
      return result;
    }
  });

  proxyCache.set(target, proxy);
  return proxy;
}

/**
 * Notifies all listeners of a property change
 */
function notifyListeners(obj: object, prop: string | symbol) {
  const propsMap = propertyListeners.get(obj);
  if (!propsMap) return;

  const listeners = propsMap.get(prop);
  if (!listeners) return;

  // Copy listeners to avoid issues if set is modified during iteration
  const listenersArray = [...listeners];

  // Run all reactive scopes that depend on this property
  for (const scope of listenersArray) {
    scope.cleanup?.();
    scope.cleanup = undefined;
    scope.run();
  }
}

/**
 * Creates a reactive state object that tracks property access and mutations
 * @param initial - Initial state object
 * @returns Reactive proxy of the state object
 */
export function createState<T extends object>(initial: T): T {
  return createReactiveProxy(initial);
}

/**
 * Runs an effect function reactively, re-executing when dependencies change
 * Returns a dispose function that cleans up the reactive scope and removes all subscriptions
 *
 * Supports memoization: if the effect returns a value and has been called in the current
 * change cycle, subsequent calls will use the cached value instead of re-running
 */
export function autorun(effect: (onCleanup: (fn: () => void) => void) => void) {
  const scope: ReactiveScope = {
    run() {
      // Enter observation scope - track all reactive state accesses
      const prevObservation = CURRENT_OBSERVATION;
      CURRENT_OBSERVATION = scope;
      try {
        effect(fn => { scope.cleanup = fn; });
      } finally {
        CURRENT_OBSERVATION = prevObservation;
      }
    }
  };
  scope.run();

  // Return disposal function that both cleans up and unsubscribes
  return () => {
    scope.cleanup?.();
    // Remove this reactive scope from all property listeners
    clearReactiveScopeSubscriptions(scope);
  };
}

/**
 * Runs a function with memoization based on the current change cycle
 * If the function has been called in the current change cycle, returns cached value
 * Otherwise, runs the function and caches the result
 *
 * @internal Used by JSX rendering to avoid redundant computation
 */
export function runWithMemo<T>(fn: () => T): T {
  // Check if we have a cached value for the current change cycle
  const cached = (fn as any).__memoCache;
  if (cached && cached.changeId === CHANGE_COUNTER) {
    return cached.value;
  }

  // Run the function and cache the result
  const value = fn();
  (fn as any).__memoCache = {
    value,
    changeId: CHANGE_COUNTER
  };

  return value;
}

/**
 * Clears a reactive scope's subscriptions from property listeners
 */
function clearReactiveScopeSubscriptions(scope: ReactiveScope) {
  const subs = reactiveScopeSubscriptions.get(scope);
  if (!subs) return;

  // Remove this reactive scope from each subscribed property
  for (const { obj, prop } of subs) {
    const propsMap = propertyListeners.get(obj);
    if (!propsMap) continue;

    const listeners = propsMap.get(prop);
    if (!listeners) continue;

    listeners.delete(scope);
  }

  // Clear the subscriptions for this reactive scope
  reactiveScopeSubscriptions.delete(scope);
}

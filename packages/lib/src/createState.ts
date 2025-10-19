/**
 * MobX-like reactive state management with proxy-based tracking
 */

export type Cleanup = () => void;
export type Computation = { run: () => void; cleanup?: Cleanup };

let CURRENT: Computation | null = null;
let BATCHING = false;
const PENDING_NOTIFICATIONS = new Set<() => void>();

// Track which properties are accessed for each computation
const propertyListeners = new WeakMap<object, Map<string | symbol, Set<Computation>>>();

// Track all subscriptions for each computation (for cleanup)
const computationSubscriptions = new WeakMap<Computation, Set<{ obj: object; prop: string | symbol }>>();

// Track proxies to avoid creating duplicates
const proxyCache = new WeakMap<object, any>();

/**
 * Array methods that mutate the array
 */
const ARRAY_MUTATORS = new Set([
  'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'
]);

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
      const pending = Array.from(PENDING_NOTIFICATIONS);
      PENDING_NOTIFICATIONS.clear();
      pending.forEach(fn => fn());
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
      // Track property access
      if (CURRENT && typeof prop !== 'symbol' && prop !== 'constructor') {
        let propsMap = propertyListeners.get(obj);
        if (!propsMap) {
          propsMap = new Map();
          propertyListeners.set(obj, propsMap);
        }

        let listeners = propsMap.get(prop);
        if (!listeners) {
          listeners = new Set();
          propsMap.set(prop, listeners);
        }
        listeners.add(CURRENT);

        // Track this subscription for the computation
        let subs = computationSubscriptions.get(CURRENT);
        if (!subs) {
          subs = new Set();
          computationSubscriptions.set(CURRENT, subs);
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

          // Trigger all listeners for this array
          notifyListeners(obj, prop);
          // Also trigger length listeners since array mutations change length
          notifyListeners(obj, 'length');

          // If we're not nested in another batch, flush pending notifications
          if (!wasBatching) {
            const pending = Array.from(PENDING_NOTIFICATIONS);
            PENDING_NOTIFICATIONS.clear();
            pending.forEach(fn => fn());
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

  // Run all computations that depend on this property
  for (const computation of listenersArray) {
    computation.cleanup?.();
    computation.cleanup = undefined;
    computation.run();
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
 * Returns a dispose function that cleans up the computation and removes all subscriptions
 */
export function autorun(effect: (onCleanup: (fn: () => void) => void) => void) {
  const comp: Computation = {
    run() {
      const prev = CURRENT;
      CURRENT = comp;
      try {
        effect(fn => { comp.cleanup = fn; });
      } finally {
        CURRENT = prev;
      }
    }
  };
  comp.run();

  // Return disposal function that both cleans up and unsubscribes
  return () => {
    comp.cleanup?.();
    // Remove this computation from all property listeners
    clearComputationSubscriptions(comp);
  };
}

/**
 * Clears a computation's subscriptions from property listeners
 */
function clearComputationSubscriptions(comp: Computation) {
  const subs = computationSubscriptions.get(comp);
  if (!subs) return;

  // Remove this computation from each subscribed property
  for (const { obj, prop } of subs) {
    const propsMap = propertyListeners.get(obj);
    if (!propsMap) continue;

    const listeners = propsMap.get(prop);
    if (!listeners) continue;

    listeners.delete(comp);
  }

  // Clear the subscriptions for this computation
  computationSubscriptions.delete(comp);
}

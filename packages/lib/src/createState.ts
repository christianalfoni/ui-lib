/**
 * MobX-like reactive state management with proxy-based tracking
 */

export type Cleanup = () => void;
export type Computation = { run: () => void; cleanup?: Cleanup };

let CURRENT: Computation | null = null;

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
        subs.add({ obj, prop });
      }

      const value = Reflect.get(obj, prop);

      // For arrays, wrap mutating methods to trigger reactivity
      if (Array.isArray(obj) && typeof value === 'function' && ARRAY_MUTATORS.has(prop as string)) {
        return function(this: any, ...args: any[]) {
          const result = (value as Function).apply(this, args);
          // Trigger all listeners for this array
          notifyListeners(obj, prop);
          // Also trigger length listeners since array mutations change length
          notifyListeners(obj, 'length');
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
        notifyListeners(obj, prop);
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

  // Run all computations that depend on this property
  for (const computation of [...listeners]) {
    try {
      computation.cleanup?.();
    } finally {
      computation.cleanup = undefined;
      computation.run();
    }
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
      // Clear previous subscriptions before re-running
      const subs = computationSubscriptions.get(comp);
      if (subs) {
        for (const { obj, prop } of subs) {
          const propsMap = propertyListeners.get(obj);
          if (propsMap) {
            const listeners = propsMap.get(prop);
            if (listeners) {
              listeners.delete(comp);
            }
          }
        }
        subs.clear();
      }

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
    removeComputationFromAllListeners(comp);
  };
}

/**
 * Removes a computation from all property listener maps
 */
function removeComputationFromAllListeners(comp: Computation) {
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

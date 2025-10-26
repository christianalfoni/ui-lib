# Suspense Implementation Plan

## Overview

This document outlines the design and implementation plan for adding async ReactiveChild support with Suspense boundaries to the UI library.

## Core Principles

1. **Strict boundaries**: Async ReactiveChild MUST have a Suspense ancestor or throws error
2. **Always suspend**: Suspense mounts pending state whenever `pendingChildren.size > 0`, regardless of initial vs re-render
3. **Independent rendering**: Each ReactiveChild renders its resolved value directly in the promise's `.then()` callback - no coordination needed
4. **Bubble-up notification**: ReactiveChild notifies Suspense via parent chain traversal when promises start and complete
5. **Suspense controls mounting**: Suspense switches what's mounted (pending vs children) - the children render themselves to the DOM independently

---

## API Design

```tsx
<Suspense
  pending={<LoadingSpinner />}
  error={(err) => <ErrorMessage error={err} />}
>
  {() => fetchUser().then((user) => <UserProfile user={user} />)}
  {() => fetchPosts().then((posts) => <PostList posts={posts} />)}
</Suspense>
```

### Props

- **`pending`**: JSX to show while any async child is loading
- **`error`**: Function `(error: Error) => JSX` to show when any async child rejects
- **`children`**: Regular children (can include async ReactiveChildren)

### States

- **Pending**: `pendingChildren.size > 0` → Mount `pending` prop
- **Error**: `errors.size > 0` → Mount `error` prop with first error
- **Success**: No pending, no errors → Mount `children`

---

## Behavior Specification

### Example Component Tree

```tsx
function App() {
  return (
    <Suspense pending={<Loading />}>
      <div>
        <NestedComponent />
      </div>
    </Suspense>
  );
}

function NestedComponent() {
  return (
    <div>
      <div>{async () => somethingAsync(1000)}</div>
      <div>
        {async () => {
          await somethingAsync(3000);
          return <AsyncNestedComponent />;
        }}
      </div>
      <SubNested />
    </div>
  );
}

function SubNested() {
  return <div>{async () => somethingAsync(2000)}</div>;
}

function AsyncNestedComponent() {
  return <div>{async () => {}}</div>;
}
```

### Execution Flow

#### **Phase 1: Initial Component Evaluation**

```
App renders
└─ <Suspense> boundary created
   └─ <div>
      └─ <NestedComponent> runs
         ├─ First async ReactiveChild created → Returns Promise 1
         │  └─ Registers with Suspense (pending++)
         ├─ Second async ReactiveChild created → Returns Promise 2
         │  └─ Registers with Suspense (pending++)
         └─ <SubNested> runs
            └─ Third async ReactiveChild created → Returns Promise 3
               └─ Registers with Suspense (pending++)

Suspense state: { pendingChildren: 3 }
UI shows: <Loading />
```

**Key**: All three async ReactiveChildren run in **parallel** immediately.

#### **Phase 2: Promise 1 Resolves First (1000ms)**

```
Promise 1 (somethingAsync(1000)) resolves
├─ ReactiveChild renders the resolved value directly to its DOM region
├─ Notifies Suspense: resolvePendingChild(child1)
└─ Suspense: pendingChildren-- (now 2)

Suspense state: { pendingChildren: 2 }
Mounted: <Loading /> (children are not mounted yet)
```

**Key**: First promise resolves and renders to its region, but Suspense keeps `pending` mounted because other children are still loading.

#### **Phase 3: Promise 3 Resolves (2000ms)**

```
Promise 3 (somethingAsync(2000)) resolves
├─ ReactiveChild renders the resolved value directly to its DOM region
├─ Notifies Suspense: resolvePendingChild(child3)
└─ Suspense: pendingChildren-- (now 1)

Suspense state: { pendingChildren: 1 }
Mounted: <Loading />
```

**Key**: Second promise resolves and renders to its region, still waiting for the last one.

#### **Phase 4: Promise 2 Resolves (3000ms) - Returns Component**

```
Promise 2 (somethingAsync(3000) + returns <AsyncNestedComponent />) resolves
├─ ReactiveChild renders <AsyncNestedComponent /> to its DOM region
│  └─ <AsyncNestedComponent> function runs
│     └─ Creates NEW async ReactiveChild → Returns Promise 4
│        └─ Registers with Suspense (pending++)
│        └─ 🔄 SUSPENSE STAYS PENDING!
├─ Notifies Suspense: resolvePendingChild(child2)
└─ Suspense: pendingChildren-- but then ++ (still 1)

Suspense state: { pendingChildren: 1 }
Mounted: <Loading /> (never unmounted, stayed mounted)
```

**Key**: When Child 2 renders `<AsyncNestedComponent />` to its region, it **immediately** creates a new async child that registers with Suspense before Child 2 finishes notifying Suspense. The pending count goes: 1 → 0 → 1 (or just stays at 1 depending on timing). Either way, Suspense never switches what's mounted because it's never truly at 0 pending children.

#### **Phase 5: Promise 4 Resolves**

```
Promise 4 (from AsyncNestedComponent's async child) resolves
├─ ReactiveChild renders the resolved value to its DOM region
├─ Notifies Suspense: resolvePendingChild(child4)
└─ Suspense: pendingChildren-- (now 0)

Suspense state: { pendingChildren: 0 }
Mounted: Children content (all async work complete)
```

**Key**: Now all async work is truly complete. Suspense unmounts `pending` and mounts `children`. All the actual content was already rendered to ReactiveChild regions - Suspense just switches what's mounted at the Suspense boundary level.

### With Nested Suspense

```tsx
function AsyncNestedComponent() {
  return (
    <Suspense pending={<InnerLoading />}>
      <div>{async () => {}}</div>
    </Suspense>
  );
}
```

**Behavior:**

```
Phase 4 (when AsyncNestedComponent evaluates):
├─ <AsyncNestedComponent> function runs
│  └─ Creates INNER <Suspense> boundary
│     └─ Inner async ReactiveChild → Returns Promise 4
│        └─ notifySuspense() walks up parent chain
│           └─ Finds INNER Suspense first (closest ancestor)
│           └─ Registers with INNER Suspense ✅
│
└─ Outer Suspense state: { pendingChildren: 0 } ✅ Resolved!
   └─ Shows children content
   └─ Inner Suspense state: { pendingChildren: 1 }
      └─ Shows <InnerLoading />

When Promise 4 resolves:
└─ Inner Suspense: pendingChildren-- (now 0)
   └─ Shows its children content
```

**Result**:

- Outer Suspense shows all content except AsyncNestedComponent's internals
- Inner Suspense independently manages its pending state
- Async children are caught by the **closest** Suspense ancestor

---

## Implementation Details

### 1. ReactiveChild Changes

**File**: `packages/lib/src/component.ts`

Add properties to `ReactiveChild`:

```typescript
export class ReactiveChild {
  // ... existing properties
  isPending: boolean = false;

  /**
   * Walks parent chain to find Suspense boundary
   * Throws error if no Suspense found (strict mode)
   */
  findSuspenseBoundary(): ReactiveComponent {
    let current = this.parent;
    while (current) {
      if (current instanceof ReactiveComponent && current.__isSuspense) {
        return current;
      }
      current = current.parent;
    }
    throw new Error(
      "Async reactive child must be wrapped in a <Suspense> component"
    );
  }
}
```

### 2. ReactiveComponent Changes

**File**: `packages/lib/src/component.ts`

Add Suspense-related properties:

```typescript
export class ReactiveComponent {
  // ... existing properties

  // Suspense boundary marker
  __isSuspense?: boolean;

  // Suspense callback methods (set by Suspense component)
  registerPendingChild?: (child: ReactiveChild, promise: Promise<any>) => void;
  resolvePendingChild?: (child: ReactiveChild) => void;
  rejectPendingChild?: (child: ReactiveChild, error: Error) => void;
}
```

### 3. Modify appendChild in jsx.ts

**File**: `packages/lib/src/jsx.ts`

Update the autorun inside `appendChild` function to detect and handle Promises:

```typescript
const dispose = autorun(() => {
  const out = runWithMemo(child as () => any);

  // NEW: Check if result is a Promise
  if (out instanceof Promise) {
    const suspense = reactiveChild.findSuspenseBoundary(); // Throws if no Suspense

    // Mark as pending and notify Suspense
    reactiveChild.isPending = true;
    suspense.registerPendingChild?.(reactiveChild);

    // Clear the region (show nothing while loading)
    region.clearContent();

    // When promise resolves, render directly (but check if disposed first)
    out
      .then((value) => {
        // CRITICAL: Check if ReactiveChild was disposed while promise was pending
        if (reactiveChild.isDisposed) {
          return; // Don't render, Suspense was unmounted
        }

        reactiveChild.isPending = false;

        // Render the resolved value directly to the region
        const normalized = normalizeToInstanceAndNode(value);
        region.clearContent();
        region.insertBeforeRef(normalized.node, null);
        if (normalized.instance) {
          reactiveChild.children.add(normalized.instance);
          normalized.instance.callMountCallbacks();
        }

        // Notify Suspense that we're done
        suspense.resolvePendingChild?.(reactiveChild);
      })
      .catch((error) => {
        // CRITICAL: Check if ReactiveChild was disposed while promise was pending
        if (reactiveChild.isDisposed) {
          return; // Don't notify, Suspense was unmounted
        }

        reactiveChild.isPending = false;
        region.clearContent();
        suspense.rejectPendingChild?.(reactiveChild, error);
      });

    return;
  }

  // ... existing render logic for non-Promise values
});
```

### 4. Create Suspense Component

**File**: `packages/lib/src/suspense.ts` (new file)

```typescript
import { createState } from "./reactivity";
import { getCurrentComponent } from "./component";
import type { ReactiveChild } from "./component";

export interface SuspenseProps {
  pending: any;
  error: (error: Error) => any;
  children: any;
}

export function Suspense(props: SuspenseProps) {
  const state = createState({
    pendingChildren: new Set<ReactiveChild>(),
    errors: new Map<ReactiveChild, Error>(),
  });

  const component = getCurrentComponent();
  if (!component) {
    throw new Error("Suspense must be used within a component");
  }

  // Mark this component as a Suspense boundary
  component.__isSuspense = true;

  // Register callback methods for ReactiveChild to call
  component.registerPendingChild = (
    child: ReactiveChild,
    promise: Promise<any>
  ) => {
    state.pendingChildren.add(child);
  };

  component.resolvePendingChild = (child: ReactiveChild) => {
    state.pendingChildren.delete(child);
    state.errors.delete(child);
  };

  component.rejectPendingChild = (child: ReactiveChild, error: Error) => {
    state.pendingChildren.delete(child);
    state.errors.set(child, error);
  };

  // Return reactive function that switches what's mounted based on state
  return () => {
    // Mount pending if ANY children are pending
    if (state.pendingChildren.size > 0) {
      return props.pending;
    }

    // Mount error if any child failed
    if (state.errors.size > 0) {
      const firstError = Array.from(state.errors.values())[0];
      return props.error(firstError);
    }

    // Mount children (success state)
    return props.children;
  };
}
```

### 5. Export Suspense

**File**: `packages/lib/src/index.ts`

```typescript
export { Suspense } from "./suspense";
export type { SuspenseProps } from "./suspense";
```

---

## Edge Cases Handled

| Scenario                              | Behavior                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| No Suspense ancestor                  | **Throws error**: "Async reactive child must be wrapped in a `<Suspense>` component"                          |
| Nested Suspense                       | Closest ancestor catches (first match in parent chain)                                                        |
| Promise rejection                     | Error state shown via `error` prop                                                                            |
| Component unmounts during pending     | ReactiveChild checks `isDisposed` in `.then()` callback - promise resolution ignored, no rendering attempted |
| Re-fetch returns Promise              | Suspense goes back to pending state                                                                           |
| Multiple async children               | Suspense waits for **all** to resolve before mounting children                                                |
| Nested async discovered during render | Suspense stays in pending state (never unmounts pending)                                                      |
| Multiple errors                       | Mount first error (from `errors` map)                                                                         |

---

## Testing Strategy

### Test Cases

1. **Basic async child**

   - Single async ReactiveChild resolves
   - Suspense shows pending → children

2. **Multiple async children**

   - 3 async children resolve at different times
   - Suspense waits for all before showing children

3. **Nested async components**

   - Async child resolves to component with more async children
   - Suspense goes back to pending until all nested async resolves

4. **Error handling**

   - Async child rejects
   - Suspense shows error prop

5. **Nested Suspense**

   - Inner Suspense catches its async children
   - Outer Suspense not affected by inner async children

6. **No Suspense boundary**

   - Async ReactiveChild without Suspense ancestor
   - Throws clear error message

7. **Cleanup during pending**

   - Suspense unmounts while Promise pending
   - ReactiveChild disposed (sets `isDisposed = true`)
   - Promise eventually resolves
   - `.then()` callback checks `isDisposed` and returns early
   - No rendering attempted, no memory leaks

8. **Re-fetches**
   - Reactive child returns new Promise on re-run
   - Suspense goes back to pending

---

## Files to Modify

1. ✅ **`packages/lib/src/component.ts`**

   - Add properties to `ReactiveChild`: `isPending`
   - Add method to `ReactiveChild`: `findSuspenseBoundary()`
   - Add properties to `ReactiveComponent`: `__isSuspense`, callback methods

2. ✅ **`packages/lib/src/jsx.ts`**

   - Modify `appendChild` function's autorun to detect Promises
   - Register with Suspense when Promise detected
   - Render resolved value directly in `.then()` callback

3. ✅ **`packages/lib/src/suspense.ts`** (new file)

   - Implement `Suspense` component
   - Export `SuspenseProps` type

4. ✅ **`packages/lib/src/index.ts`**
   - Export `Suspense` component
   - Export `SuspenseProps` type

---

## Migration Guide

### For Users

**Before (sync only):**

```tsx
function App() {
  return <div>{() => getData()}</div>;
}
```

**After (with async support):**

```tsx
function App() {
  return (
    <Suspense
      pending={<div>Loading...</div>}
      error={(err) => <div>Error: {err.message}</div>}
    >
      <div>{() => fetchData().then((data) => <Display data={data} />)}</div>
    </Suspense>
  );
}
```

### Breaking Changes

**None** - This is a purely additive feature. Existing code continues to work without changes.

---

## Future Enhancements

1. **Error boundaries**: Separate error handling from Suspense
2. **Streaming SSR**: Server-side rendering with async boundaries
3. **DevTools integration**: Visualize Suspense boundaries and pending states

---

## Summary

This implementation adds robust async support to the reactive UI library through:

- **Async ReactiveChild detection**: Automatically detect Promise returns in reactive functions
- **Suspense coordination**: Centralized pending state management
- **Atomic commits**: All ReactiveChildren render their resolved values simultaneously when all promises complete
- **Nested boundaries**: Support for multiple Suspense levels
- **Error handling**: Built-in error state management

The design maintains the library's core principles of simplicity, explicit behavior, and proper cleanup while adding powerful async rendering capabilities.

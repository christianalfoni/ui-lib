# Component Lifecycle and Cleanup

This document explains how components, elements, event handlers, and observation scopes are managed throughout their lifecycle in the UI library.

## Overview

The library implements a robust cleanup system that ensures:
- Reactive subscriptions are disposed when components unmount
- Event listeners are properly removed from DOM nodes
- Memory leaks are prevented during mount/unmount cycles

## Component Creation

Components are functions that run **once** when first rendered:

```tsx
function MyComponent() {
  const state = createState({ count: 0 })
  // This function body runs ONCE
  return <div>{() => state.count}</div>
}
```

### What Happens During Creation
1. Component function executes
2. Any `createState` calls create reactive proxies
3. JSX is transformed into DOM nodes
4. The component returns a Node (or nodes via nested scopes)

## Reactive Scopes

Reactive scopes are created in two places:

### 1. Function Children

```tsx
<div>{() => state.count}</div>
```

**Lifecycle:**
- A **region** is created with start/end comment anchors
- An `autorun` computation subscribes to accessed properties
- When dependencies change, the computation re-runs
- The region's content is updated (diff/replace/clear)

### 2. Function Props

```tsx
<div style={() => `color: ${state.color}`} />
```

**Lifecycle:**
- An `autorun` computation is created for the prop
- The disposal function is tracked on the element via `__disposals`
- When dependencies change, the prop is re-applied
- When the element is removed, all disposals are called

## Mounting Behavior

Consider this conditional rendering:

```tsx
function MyComponent() {
  const state = createState({ count: 0 })
  return <div>{() => state.count % 2 ? <ChildComponent /> : null}</div>
}
```

### Initial Mount (evaluates to null)
1. Function child creates a region in the parent `<div>`
2. `autorun` executes and subscribes to `state.count`
3. Result is `null` → no nodes inserted
4. Mode set to `"none"`

### First Toggle (mount ChildComponent)
1. `state.count` change triggers the autorun
2. Evaluates to `<ChildComponent />` node
3. `region.clearAll()` called (no-op, nothing to clear)
4. Component inserted between comment anchors
5. **ChildComponent's event handlers attached**
6. **ChildComponent's observation scopes created**
7. Mode set to `"single"`

### Second Toggle (unmount to null)
1. `state.count` change triggers the autorun
2. Evaluates to `null`
3. **`region.clearAll()` performs cleanup:**
   - Runs all cleanup functions registered with the region
   - Disposes autorun computations (removes subscriptions)
   - Calls `cleanupNode()` on each DOM node
   - Removes nodes from the DOM
4. Mode reset to `"none"`

## Cleanup System

### Cleanup Functions

The cleanup system uses multiple mechanisms:

#### 1. Region Cleanup
Each region tracks cleanup functions:

```typescript
const region = createRegion(parent)
region.addCleanup(() => {
  // Called when region.clearAll() is invoked
})
```

The `autorun` disposal is registered with the region:

```typescript
const dispose = autorun(() => { /* ... */ })
region.addCleanup(dispose)
```

#### 2. Node Cleanup
Each node can have metadata that needs cleanup:

```typescript
// Event listeners stored on __listeners
element.__listeners = [
  { eventName: 'click', handler: fn }
]

// Reactive property disposals stored on __disposals
element.__disposals = [dispose1, dispose2]
```

When `cleanupNode(node)` is called:
1. Disposes all reactive property subscriptions (`__disposals`)
2. Removes all event listeners (`__listeners`)
3. Recursively cleans up child nodes
4. Deletes internal metadata (`__key`, `__listeners`, `__disposals`)

### Event Handler Cleanup

Event handlers are **never reactive** and are tracked for cleanup:

```tsx
<button onClick={() => state.count++}>
  Click me
</button>
```

**Lifecycle:**
1. `addEventListener` called on the button
2. Handler stored in `button.__listeners`
3. When button unmounts, `cleanupNode` removes the listener
4. Handler reference is freed

### Observation Scope Cleanup

Nested components create their own observation scopes:

```tsx
function ChildComponent() {
  const localState = createState({ value: 0 })

  return (
    <div>
      <button onClick={() => localState.value++}>
        Increment
      </button>
      <span style={() => `opacity: ${localState.value / 10}`}>
        {() => localState.value}
      </span>
    </div>
  )
}
```

When `<ChildComponent />` is unmounted:

1. **Region cleanup** runs (disposes the autorun that inserted the component)
2. **Node cleanup** walks the component's DOM tree:
   - Button's `onClick` listener is removed
   - Span's `style` autorun is disposed (removes `localState.value` subscription)
   - Span's text content autorun is disposed
3. All reactive subscriptions to `localState` are cleaned up
4. DOM nodes are removed

## Memory Management

### Subscription Tracking

Each computation tracks its subscriptions:

```typescript
const computationSubscriptions = new WeakMap<
  Computation,
  Set<{ obj: object; prop: string | symbol }>
>()
```

When a computation re-runs:
1. Previous subscriptions are cleared
2. New subscriptions are tracked during execution

When a computation is disposed:
1. All tracked subscriptions are removed from property listeners
2. The computation entry is deleted from the subscription map

### Proxy Caching

Reactive proxies are cached to avoid duplicates:

```typescript
const proxyCache = new WeakMap<object, any>()
```

This ensures that multiple accesses to the same object return the same proxy.

## Best Practices

### 1. Always Use Cleanup for Manual Effects

If you manually create autoruns outside of JSX, dispose them:

```tsx
function MyComponent() {
  const state = createState({ count: 0 })

  // Manual effect
  const dispose = autorun(() => {
    console.log('Count:', state.count)
  })

  // ⚠️ This won't auto-cleanup when component unmounts
  // You need to handle disposal yourself

  return <div>...</div>
}
```

### 2. Event Handlers Don't Need Cleanup Tracking Outside JSX

Event handlers added via JSX are automatically tracked:

```tsx
<button onClick={handler}>Click</button>  // ✓ Auto-cleaned
```

But if you manually add listeners, you must remove them:

```tsx
// ✗ Manual - no auto-cleanup
element.addEventListener('click', handler)
```

### 3. Reactive Props Create Subscriptions

Function props create permanent subscriptions until the element unmounts:

```tsx
<div style={() => `color: ${state.color}`} />
```

If `state.color` changes frequently, the autorun will re-run on every change. The subscription is only cleaned up when the `<div>` is removed from the DOM.

### 4. Conditional Rendering Triggers Cleanup

Toggling between components properly cleans up:

```tsx
{() => state.showA ? <ComponentA /> : <ComponentB />}
```

Each toggle:
- Clears the previous component (cleanup runs)
- Mounts the new component (fresh subscriptions)

### 5. Array Rendering

Keyed arrays preserve elements:

```tsx
{() => items.map(item => (
  <div key={item.id}>{item.name}</div>
))}
```

- Elements with matching keys are **moved**, not recreated
- Only removed elements are cleaned up
- New elements are freshly mounted

Without keys:

```tsx
{() => items.map(item => (
  <div>{item.name}</div>
))}
```

- All elements are **replaced** on every change
- Cleanup runs on all old elements
- All new elements are freshly mounted

## Lifecycle Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Component Function Executes (ONCE)                          │
│   - createState() calls create reactive proxies             │
│   - JSX creates DOM structure                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Mount Phase                                                  │
│   - Nodes inserted into DOM                                  │
│   - Event listeners attached (tracked in __listeners)        │
│   - Reactive props create autoruns (tracked in __disposals)  │
│   - Function children create regions + autoruns             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Active Phase                                                 │
│   - State changes trigger autorun re-runs                    │
│   - DOM updates (diff, replace, or clear)                    │
│   - Subscriptions tracked per computation                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Unmount Phase (region.clearAll())                           │
│   1. Run region cleanup functions                            │
│      - Dispose autorun → removes from property listeners     │
│   2. Call cleanupNode() on each DOM node                     │
│      - Dispose reactive props (__disposals)                  │
│      - Remove event listeners (__listeners)                  │
│      - Recursively clean children                            │
│   3. Remove nodes from DOM                                   │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### Region Structure

```typescript
{
  start: Comment,      // <!--scope-start-->
  end: Comment,        // <!--scope-end-->
  clearAll: () => void,
  insertBeforeRef: (node, ref) => void,
  addCleanup: (fn) => void
}
```

### Element Metadata

```typescript
element.__key         // Key for diffing (optional)
element.__listeners   // [{ eventName, handler }]
element.__disposals   // [() => void]
```

### Computation Structure

```typescript
{
  run: () => void,     // Re-execute the effect
  cleanup?: () => void // Called before re-run or disposal
}
```

## Testing Cleanup

To verify cleanup is working, check that:

1. Event listeners are removed (DevTools → Event Listeners)
2. Reactive subscriptions are disposed (no console logs from disposed autoruns)
3. Memory doesn't grow with repeated mount/unmount cycles

Example test:

```tsx
function TestComponent() {
  const state = createState({ toggle: true })

  return (
    <div>
      <button onClick={() => state.toggle = !state.toggle}>
        Toggle
      </button>
      {() => state.toggle ? <ChildWithListeners /> : null}
    </div>
  )
}

// Click toggle repeatedly - memory should stay stable
```

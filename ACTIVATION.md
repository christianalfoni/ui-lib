# Two-Phase Activation Plan

## Problem Statement

With eager component evaluation, this pattern fails:

```tsx
<div>
  <Suspense><SomeComp/></Suspense>
</div>
```

**Why it fails:**

1. JSX evaluates arguments before function calls
2. `h(SomeComp, null)` runs BEFORE `h(Suspense, ...)`
3. SomeComp's reactive children are created and their autoruns execute immediately
4. When async ReactiveChild calls `findSuspenseBoundary()`, Suspense doesn't exist yet in parent chain
5. Error: "Async reactive child must be wrapped in a `<Suspense>` component"

## Solution: Three-Phase Recursive Rendering

Every evaluation context (render or ReactiveChild autorun) follows the same pattern: **CREATE → ACTIVATE → APPLY DOM**

### The Pattern

```
1. CREATE
   - Start creation batch
   - Build component tree / evaluate function
   - ReactiveChildren are created but autoruns are DEFERRED
   - All nested children added to batch

2. ACTIVATE
   - End creation batch
   - Execute all deferred autoruns (forward order = deepest-first)
   - Each autorun is itself a CREATE → ACTIVATE → APPLY DOM cycle
   - Nested activations complete before parent continues

3. APPLY DOM
   - After all nested children are activated
   - Insert nodes into DOM
   - Call mount callbacks
```

### Why This Works

**Key insight:** ACTIVATE happens BEFORE APPLY DOM, which means:
- Nested ReactiveChildren activate and can modify state (e.g., register with Suspense)
- These state changes can trigger the parent to re-run BEFORE any DOM insertion
- Result: No flash of incorrect content

**Example with Suspense:**
1. Suspense ReactiveChild autorun: CREATE → build children
2. ACTIVATE nested async children → they register with Suspense
3. Registration triggers Suspense autorun to re-run
4. Re-run checks `pendingChildren.size > 0` → evaluates to pending
5. APPLY DOM → insert pending state (no flash!)

### Recursion

This pattern is **fully recursive** - `render()` and ReactiveChild autoruns use the exact same cycle:

```
render()
├─ CREATE
├─ ACTIVATE
│  └─ ReactiveChild autorun:
│     ├─ CREATE
│     ├─ ACTIVATE
│     │  └─ Nested ReactiveChild autorun:
│     │     ├─ CREATE
│     │     ├─ ACTIVATE
│     │     └─ APPLY DOM
│     └─ APPLY DOM
└─ APPLY DOM
```

Each level completes its CREATE → ACTIVATE → APPLY DOM before returning to its parent.

---

## API Changes

### New Flag: `isActivated`

Add to ReactiveChild and ReactiveComponent:

```typescript
export class ReactiveChild {
  // ... existing properties
  isActivated: boolean = false;
  pendingActivation: (() => void) | null = null;
}

export class ReactiveComponent {
  // ... existing properties
  isActivated: boolean = false;
  pendingActivations: Array<() => void> = [];
}
```

### Creation Batch System

Track activations **per evaluation context** using a stack-based approach. Each time we evaluate JSX (at render or during a ReactiveChild autorun), we create a "creation batch" that defers activations.

**Why batching per evaluation?**
- Ensures parent chains are complete before activations
- Handles dynamic Suspense boundaries (e.g., toggling `<Suspense>` into view)
- Works for both initial render and reactive re-renders

```typescript
// packages/lib/src/component.ts

// Stack of creation batches (each batch is an array of ReactiveChildren to activate)
let creationBatchStack: Array<ReactiveChild[]> = [];

/**
 * Start a new creation batch.
 * All ReactiveChildren created during this batch will defer activation.
 */
export function startCreationBatch() {
  creationBatchStack.push([]);
}

/**
 * End the current creation batch and activate all deferred ReactiveChildren.
 * Activates in forward order (deepest-first) because eager evaluation adds
 * deep children to the batch first.
 */
export function endCreationBatch() {
  const batch = creationBatchStack.pop();
  if (!batch) return;

  // Activate in FORWARD order (0→n) for deepest-first activation
  // Due to eager evaluation, deep children are added to the batch first,
  // so forward iteration gives us deepest-first order.
  // This ensures async children register with Suspense before Suspense evaluates.
  for (let i = 0; i < batch.length; i++) {
    const reactiveChild = batch[i];
    if (reactiveChild.pendingActivation) {
      reactiveChild.pendingActivation();
    }
  }
}

/**
 * Check if we're currently inside a creation batch.
 * If true, new ReactiveChildren should defer activation.
 */
export function isInCreationBatch(): boolean {
  return creationBatchStack.length > 0;
}

/**
 * Add a ReactiveChild to the current creation batch.
 */
export function addToCreationBatch(reactiveChild: ReactiveChild) {
  const currentBatch = creationBatchStack[creationBatchStack.length - 1];
  if (currentBatch) {
    currentBatch.push(reactiveChild);
  }
}
```

---

## Implementation Changes

### 1. Modify `appendChild` in jsx.ts

**Current behavior:** autorun executes immediately when ReactiveChild is created

**New behavior:** Defer autorun if inside a creation batch, otherwise execute immediately

```typescript
function appendChild(parent: Node, child: Child): void {
  // ... existing null/ReactiveComponent checks

  if (typeof child === "function") {
    const region = createRegion(parent);
    const parentInstance = getCurrentInstance();
    const reactiveChild = enterReactiveScope(parentInstance, region);

    // Create the autorun function that will evaluate the child
    // This follows the CREATE → ACTIVATE → APPLY DOM pattern
    const autorunFn = () => {
      // === PHASE 1: CREATE ===
      startCreationBatch();

      try {
        const out = runWithMemo(child as () => any);

        // Check if result is a Promise
        if (out instanceof Promise) {
          const suspense = reactiveChild.findSuspenseBoundary(); // Now safe!
          // ... async handling

          // End batch before async handling
          endCreationBatch();
          return;
        }

        // Dispose old children
        for (const childInstance of reactiveChild.children) {
          childInstance.dispose();
        }
        reactiveChild.children.clear();

        // Normalize the result to instance and node
        // (ReactiveChildren created here will be added to the batch)
        const { instance, node } = normalizeToInstanceAndNode(out);

        // === PHASE 2: ACTIVATE ===
        // CRITICAL: Activate nested children BEFORE applying DOM
        // This allows state changes (like Suspense registration) to trigger
        // re-runs before any DOM insertion happens
        endCreationBatch();

        // === PHASE 3: APPLY DOM ===
        // Now insert into DOM (everything is activated)
        region.clearContent();
        region.insertBeforeRef(node, null);
        if (instance) {
          reactiveChild.children.add(instance);
          instance.callMountCallbacks();
        }
      } catch (err) {
        endCreationBatch(); // Clean up batch even on error
        throw err;
      }
    };

    // Check if we're in a creation batch
    if (isInCreationBatch()) {
      // Defer activation - add to current batch
      reactiveChild.pendingActivation = () => {
        const dispose = autorun(autorunFn);
        reactiveChild.autorunDisposal = dispose;
        reactiveChild.isActivated = true;
      };
      addToCreationBatch(reactiveChild);
    } else {
      // Not in a batch - activate immediately
      const dispose = autorun(autorunFn);
      reactiveChild.autorunDisposal = dispose;
      reactiveChild.isActivated = true;
    }

    exitReactiveScope();
    return;
  }

  // ... rest of appendChild
}
```

### 2. Handle Components That Return Functions

When a component returns a function (like Suspense), we create a ReactiveChild for it with the component as parent.

```typescript
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
  } finally {
    exitComponentScope();
  }

  // CRITICAL: Handle components that return functions (like Suspense)
  if (typeof result === "function") {
    // Re-enter component scope to create ReactiveChild with correct parent
    enterComponentScope(component.parent);

    try {
      // Create a fragment to hold the ReactiveChild's region
      const fragment = document.createDocumentFragment();
      const region = createRegion(fragment);

      // Create ReactiveChild with the component as parent
      const reactiveChild = enterReactiveScope(component, region);

      // Set up the autorun (follows CREATE → ACTIVATE → APPLY DOM)
      const autorunFn = () => {
        // === PHASE 1: CREATE ===
        startCreationBatch();
        try {
          const out = runWithMemo(result as () => any);

          // Check for Promise (async handling)
          if (out instanceof Promise) {
            const suspense = reactiveChild.findSuspenseBoundary();
            // ... async handling
            endCreationBatch();
            return;
          }

          // Dispose old children
          for (const childInstance of reactiveChild.children) {
            childInstance.dispose();
          }
          reactiveChild.children.clear();

          // Normalize and render
          const { instance, node } = normalizeToInstanceAndNode(out);

          // === PHASE 2: ACTIVATE ===
          endCreationBatch();

          // === PHASE 3: APPLY DOM ===
          region.clearContent();
          region.insertBeforeRef(node, null);
          if (instance) {
            reactiveChild.children.add(instance);
            instance.callMountCallbacks();
          }
        } catch (err) {
          endCreationBatch();
          throw err;
        }
      };

      // Check if we're in a creation batch
      if (isInCreationBatch()) {
        // Defer activation
        reactiveChild.pendingActivation = () => {
          const dispose = autorun(autorunFn);
          reactiveChild.autorunDisposal = dispose;
          reactiveChild.isActivated = true;
        };
        addToCreationBatch(reactiveChild);
      } else {
        // Activate immediately
        const dispose = autorun(autorunFn);
        reactiveChild.autorunDisposal = dispose;
        reactiveChild.isActivated = true;
      }

      exitReactiveScope();

      // Set the fragment as domRoot
      component.domRoot = fragment;
    } finally {
      exitComponentScope();
    }
  } else if (result instanceof Node) {
    component.domRoot = result;
  } else if (result instanceof ReactiveComponent) {
    component.domRoot = result.domRoot;
  }

  return component;
}
```

### 3. Update `render()` Function

The render function follows the CREATE → ACTIVATE → APPLY DOM pattern:

```typescript
export function render(
  node: Node | KeyedItem | (() => any) | ReactiveComponent,
  container: Element
): { dispose: () => void } {
  let rootComponent: ReactiveComponent | null = null;

  // === PHASE 1: CREATE ===
  startCreationBatch();

  try {
    if (node instanceof ReactiveComponent) {
      rootComponent = node;
      if (node.domRoot) {
        // === PHASE 2: ACTIVATE ===
        // Activate all deferred children
        endCreationBatch();

        // === PHASE 3: APPLY DOM ===
        // Mount to DOM after activation
        container.appendChild(node.domRoot);
        node.callMountCallbacks();
      }
    } else if (typeof node === "function") {
      appendChild(container, node);
      // appendChild creates its own ReactiveChild which follows
      // CREATE → ACTIVATE → APPLY DOM internally
      endCreationBatch();
    } else if (isKeyedItem(node)) {
      const { instance, node: domNode } = evaluateKeyedItem(node);

      // === PHASE 2: ACTIVATE ===
      endCreationBatch();

      // === PHASE 3: APPLY DOM ===
      container.appendChild(domNode);
      rootComponent = instance;
      if (instance) {
        instance.callMountCallbacks();
      }
    } else {
      // No ReactiveChildren, just end batch and mount
      endCreationBatch();
      container.appendChild(node);
    }
  } catch (err) {
    endCreationBatch(); // Clean up batch even on error
    throw err;
  }

  return {
    dispose: () => rootComponent?.dispose(),
  };
}
```

### 4. Handle Dynamic Children and Array Rendering

The CREATE → ACTIVATE → APPLY DOM pattern handles all cases automatically:

**Dynamic children:** Each ReactiveChild autorun is its own isolated cycle:
```typescript
ReactiveChild autorun re-runs:
├─ CREATE: startCreationBatch()
├─ Evaluate: new components created, ReactiveChildren deferred
├─ ACTIVATE: endCreationBatch() → nested children activate
└─ APPLY DOM: insert into region
```

**Array rendering:** When a ReactiveChild evaluates an array:
```typescript
ReactiveChild autorun:
├─ CREATE: startCreationBatch()
├─ Evaluate: () => items.map(item => <Component />)
│  └─ All components created, their ReactiveChildren deferred
├─ ACTIVATE: endCreationBatch()
│  └─ All array item ReactiveChildren activate (deepest-first)
└─ APPLY DOM: insert all items into region
```

**The pattern is universal:** Whether it's initial render, re-render, conditional rendering, or array rendering, every evaluation follows CREATE → ACTIVATE → APPLY DOM.

---

## Why ACTIVATE Before APPLY DOM?

The key to preventing flash is that ACTIVATE happens BEFORE APPLY DOM.

### Problem: If We Applied DOM First

```tsx
<Suspense pending={<Loading />}>
  {() => <AsyncComp />}
</Suspense>
```

If we applied DOM before activating nested children:
1. Suspense ReactiveChild evaluates → returns `props.children` (`() => <AsyncComp />`)
2. **APPLY DOM:** Insert children into DOM ❌
3. **Then activate nested children**
4. AsyncComp's async child registers with Suspense
5. Suspense re-runs and switches to pending
6. **Flash!** User saw children briefly

### Solution: ACTIVATE Then APPLY DOM

With CREATE → ACTIVATE → APPLY DOM:

```
Suspense ReactiveChild autorun:
├─ CREATE
│  └─ Evaluate: returns props.children (array with () => <AsyncComp />)
│     └─ appendChild creates AsyncComp ReactiveChild (deferred)
├─ ACTIVATE ← happens HERE, before DOM
│  └─ AsyncComp ReactiveChild autorun:
│     ├─ CREATE
│     │  └─ AsyncComp creates async ReactiveChild (deferred)
│     ├─ ACTIVATE
│     │  └─ Async child activates, detects Promise, registers with Suspense
│     │     └─ Triggers Suspense autorun to RE-RUN
│     └─ APPLY DOM: insert AsyncComp's div
├─ [Suspense autorun RE-RUNS due to registration]
│  ├─ CREATE
│  │  └─ Checks pendingChildren.size > 0 → returns props.pending
│  ├─ ACTIVATE (no nested children in pending)
│  └─ APPLY DOM: insert <Loading />
└─ Original autorun was interrupted, no APPLY DOM phase
```

**No flash!** Because activation triggers the re-run BEFORE any DOM insertion.

---

## Execution Flow Examples

### Initial Render: Before (Broken)

```tsx
<div>
  <Suspense><SomeComp/></Suspense>
</div>
```

```
1. h('div', null, ...) evaluates arguments:
   ↓
2. h(Suspense, null, ...) evaluates arguments:
   ↓
3. h(SomeComp, null) evaluates:
   - SomeComp function runs
   - Returns: h('div', null, async () => fetchData())
   ↓
4. async () => fetchData() creates ReactiveChild:
   - autorun executes immediately
   - Calls findSuspenseBoundary()
   - ❌ ERROR: Suspense doesn't exist yet!
```

### Initial Render: After (Fixed)

```tsx
<div>
  <Suspense><SomeComp/></Suspense>
</div>
```

```
1. h('div', null, ...) evaluates arguments:
   ↓
2. h(Suspense, null, ...) evaluates arguments:
   ↓
3. h(SomeComp, null) evaluates:
   - SomeComp function runs
   - Returns: h('div', null, async () => fetchData())
   ↓
4. async () => fetchData() creates ReactiveChild:
   - autorun is DEFERRED (not executed)
   - ReactiveChild added to global activation queue
   ↓
5. Suspense component created
   - Suspense's reactive return creates ReactiveChild (also deferred)
   - Parent chain now includes Suspense
   - All components in queue
   ↓
6. render() calls activateAll() BEFORE mounting:
   - Activates in REVERSE order (deepest-first)
   - async () => fetchData() activates first
   - Detects Promise, calls findSuspenseBoundary()
   - Finds Suspense ✅, registers pending child
   - Suspense's reactive child activates next
   - Sees pendingChildren.size > 0, evaluates to <Loading />
   ↓
7. render() mounts to DOM:
   - Suspense already showing <Loading />
   - No flash! ✅
```

### Dynamic Render: Toggling Suspense Into View

```tsx
function App() {
  const state = createState({ show: false });

  return (
    <div>
      <button onClick={() => state.show = !state.show}>Toggle</button>
      {() => state.show ? (
        <Suspense pending={<Loading />}>
          <AsyncComp />
        </Suspense>
      ) : null}
    </div>
  );
}
```

**Initial render (show = false):**
```
1. App component created
2. div created
3. Outer ReactiveChild created for () => state.show ? ...
   - Deferred, added to queue
4. activateAll() runs (deepest-first):
   - Outer ReactiveChild activates
   - Autorun executes, sees show = false
   - Renders null
5. Mount to DOM
```

**User clicks toggle (show = true):**
```
1. state.show changes to true
2. Outer ReactiveChild's autorun re-runs (it's already activated)
3. autorun starts: startCreationBatch() ← NEW BATCH FOR THIS EVALUATION
4. Evaluates: <Suspense pending={<Loading />}>{() => <AsyncComp />}</Suspense>
5. h(Suspense, {...}, () => h(AsyncComp, null)) evaluates:
   - Suspense component function runs
   - Returns a function (Suspense's reactive child)
   - Function child `() => h(AsyncComp, null)` is NOT evaluated yet (it's a prop)
   - Suspense ReactiveChild created and DEFERRED
   ↓
6. endCreationBatch() is called:
   - Batch: [Suspense ReactiveChild]
   - Activates Suspense ReactiveChild
   ↓
7. Suspense ReactiveChild autorun runs:
   ├─ CREATE: startCreationBatch() [Batch 2]
   ├─ Evaluates: () => { return props.children; }
   ├─ Returns: [() => h(AsyncComp, null)] (function child)
   ├─ appendChild called on () => h(AsyncComp, null)
   │  └─ Creates AsyncComp ReactiveChild, DEFERRED (added to Batch 2)
   ├─ ACTIVATE: endCreationBatch() [Batch 2]
   │  └─ AsyncComp ReactiveChild autorun runs:
   │     ├─ CREATE: startCreationBatch() [Batch 3]
   │     ├─ Evaluates: h(AsyncComp, null)
   │     ├─ AsyncComp returns: h('div', null, async () => ...)
   │     ├─ Async ReactiveChild created, DEFERRED (added to Batch 3)
   │     ├─ ACTIVATE: endCreationBatch() [Batch 3]
   │     │  └─ Async child activates:
   │     │     - Detects Promise
   │     │     - Registers with Suspense → triggers Suspense autorun re-run!
   │     └─ APPLY DOM: (but Suspense autorun was interrupted)
   └─ [Suspense autorun RE-RUNS]
      ├─ CREATE: Checks pendingChildren.size > 0 → returns props.pending
      ├─ ACTIVATE: (no nested children)
      └─ APPLY DOM: insert <Loading />
```

**Key insight:** The function wrapper `{() => <AsyncComp />}` ensures AsyncComp is evaluated INSIDE Suspense's ReactiveChild autorun, establishing the correct parent chain. When async children register during ACTIVATE, they trigger a re-run BEFORE APPLY DOM, preventing flash.

### Dynamic Render: Array of Async Components

```tsx
function App() {
  const state = createState({ items: [] });

  return (
    <Suspense pending={<Loading />}>
      {() => state.items.map(item => (
        <AsyncItem key={item.id} data={item} />
      ))}
    </Suspense>
  );
}

// Later: state.items.push({ id: 1, data: '...' })
```

**When a new item is added:**
```
1. Outer ReactiveChild's autorun re-runs (watching state.items)
2. autorun starts: startCreationBatch() ← NEW BATCH
3. Evaluates the map, creates new <AsyncItem key={1} />
4. evaluateKeyedItem() is called:
   - Creates AsyncItem component
   - AsyncItem's async children are created
   - Checks: isInCreationBatch() → true ✅
   - DEFERS activation (adds to batch)
5. endCreationBatch() is called:
   - Activates all new AsyncItem children
   - They register with Suspense
6. appendChild inserts the new keyed item into DOM
7. Suspense re-renders (pendingChildren increased)
   - Shows pending state
8. No flash, all activations happen before DOM updates
```

---

## Edge Cases

### 1. Nested Suspense

```tsx
<Suspense pending={<Outer />}>
  <Suspense pending={<Inner />}>
    <AsyncComponent />
  </Suspense>
</Suspense>
```

**Behavior:**
- All three components (Outer Suspense, Inner Suspense, AsyncComponent) are created
- Parent chains are fully established
- Activation happens root-to-leaf
- AsyncComponent's async child finds **Inner Suspense** (closest ancestor) ✅

### 2. Conditional Rendering

```tsx
function App() {
  const state = createState({ show: true });

  return (
    <Suspense pending={<Loading />}>
      {() => state.show ? <AsyncComponent /> : null}
    </Suspense>
  );
}
```

**Initial render:**
- Suspense created
- Outer ReactiveChild created and deferred
- activateAll() triggers
- Outer ReactiveChild's autorun runs, evaluates `state.show ? <AsyncComponent /> : null`
- AsyncComponent is created and its children are activated **immediately** (parent is already active)

**Toggle to false:**
- Outer ReactiveChild re-runs
- AsyncComponent disposed

**Toggle back to true:**
- New AsyncComponent created
- Its children are activated **immediately** (parent is already active)

### 3. Keyed Arrays

```tsx
<Suspense pending={<Loading />}>
  {() => items.map(item => (
    <AsyncItem key={item.id} data={item} />
  ))}
</Suspense>
```

**Behavior:**
- When new keyed items are added, they're evaluated in `evaluateKeyedItem()`
- New ReactiveChildren are created
- Since parent is already activated, new children activate immediately

### 4. No Suspense Boundary

```tsx
function App() {
  return <div>{async () => fetchData()}</div>;
}
```

**Behavior:**
- ReactiveChild created and deferred
- activateAll() triggers
- autorun runs, detects Promise
- Calls findSuspenseBoundary()
- ❌ Throws: "Async reactive child must be wrapped in a `<Suspense>` component"

This still works correctly - the error just happens during activation instead of construction.

---

## Testing Strategy

### Test Cases

1. **Basic Suspense wrapping component**
   ```tsx
   <Suspense pending={<Loading />}>
     {() => <AsyncComponent />}
   </Suspense>
   ```
   Verify: AsyncComponent can find Suspense boundary

2. **Deeply nested async children**
   ```tsx
   <Suspense pending={<Loading />}>
     {() => (
       <Level1>
         <Level2>
           <Level3>
             {async () => fetchData()}
           </Level3>
         </Level2>
       </Level1>
     )}
   </Suspense>
   ```
   Verify: Deep async child finds Suspense

3. **Multiple Suspense boundaries**
   ```tsx
   <Suspense pending={<OuterLoading />}>
     {() => (
       <>
         <AsyncA />
         <Suspense pending={<InnerLoading />}>
           {() => <AsyncB />}
         </Suspense>
       </>
     )}
   </Suspense>
   ```
   Verify: Each async finds correct (closest) Suspense

4. **Dynamic async children**
   ```tsx
   <Suspense pending={<Loading />}>
     {() => show ? <AsyncComponent /> : null}
   </Suspense>
   ```
   Verify: Toggling works, no activation errors

5. **Keyed array of async components**
   ```tsx
   <Suspense pending={<Loading />}>
     {() => items.map(item => <AsyncItem key={item.id} />)}
   </Suspense>
   ```
   Verify: Adding/removing items works correctly

6. **Missing function wrapper**
   ```tsx
   <Suspense pending={<Loading />}>
     <AsyncComponent /> {/* ❌ Missing () => wrapper */}
   </Suspense>
   ```
   Verify: Async children inside AsyncComponent can't find Suspense (wrong parent chain)

7. **No Suspense boundary**
   ```tsx
   <div>{async () => fetchData()}</div>
   ```
   Verify: Throws clear error during activation

---

## Performance Considerations

### Activation Overhead

The activation phase adds minimal overhead:
1. ReactiveChildren register in the current batch during construction
2. Before DOM insertion, `endCreationBatch()` iterates the batch (forward order)
3. Each ReactiveChild runs its pending autorun

**Overhead per evaluation:**
- Stack push/pop for batch creation
- Array iteration for activation (forward order, 0→n)
- Small and proportional to number of ReactiveChildren created

### Memory

- Each batch is an array of ReactiveChild references
- Batch is cleared after activation (no lingering references)
- Stack-based approach means nested evaluations are isolated
- Memory overhead is minimal and short-lived

### Creation Batch Scope

**Why stack-based batching?**
1. Handles nested evaluations (e.g., ReactiveChild autorun creates more components)
2. Each evaluation gets its own batch, ensuring correct activation order
3. No global state pollution - batches are isolated

**Example with nested batches:**
```typescript
render(<App />, container);
// Batch 1: [ReactiveChild A]
//   ReactiveChild A evaluates, starts Batch 2
//   Batch 2: [ReactiveChild B, ReactiveChild C]
//   Batch 2 ends, activates B then C (forward order: 0→n)
// Batch 1 ends, activates A

// Each batch is independent and activates its children before returning
```

**Multiple roots work independently:**
```typescript
render(<App1 />, container1); // Batch created, activated, cleared
render(<App2 />, container2); // New batch created, activated, cleared
// No interference - batches are ephemeral
```

---

## Migration Path

This is a **breaking change** in behavior but not in API:

### Current Behavior
- Reactive children execute immediately when created
- Async children fail if Suspense isn't created yet

### New Behavior
- Reactive children defer execution until activation
- Async children always have access to parent chain

### User Impact
**None** - This is an internal implementation detail. User code doesn't change.

---

## Files to Modify

1. **`packages/lib/src/component.ts`**
   - Add `isActivated`, `pendingActivation` to ReactiveChild
   - Add `creationBatchStack` (stack of arrays)
   - Add `startCreationBatch()`, `endCreationBatch()`, `isInCreationBatch()`, `addToCreationBatch()`

2. **`packages/lib/src/jsx.ts`**
   - Modify `appendChild()` to check `isInCreationBatch()` and defer if needed
   - Wrap autorun logic with `startCreationBatch()` / `endCreationBatch()`
   - Call `startCreationBatch()` at the start of `render()`, `endCreationBatch()` before mounting
   - **CRITICAL:** Modify `evaluateComponentFunction()` to handle components that return functions by creating ReactiveChild immediately with component as parent

3. **`packages/lib/src/index.ts`**
   - No changes needed (batching is internal only)

---

## Alternative Considered: Lazy Evaluation

Instead of two-phase mounting, make component children lazy:

```typescript
// Store children as functions instead of evaluating immediately
const component = {
  children: [
    () => h(SomeComp, null)
  ]
};

// Evaluate later
for (const childFn of component.children) {
  const child = childFn();
  // ...
}
```

**Rejected because:**
- Requires major architectural changes to how children are stored
- Complicates the JSX transformation
- Two-phase mounting is simpler and more localized

---

## Summary

The **CREATE → ACTIVATE → APPLY DOM** pattern solves the eager evaluation problem with a simple, recursive approach.

### How It Works

Every evaluation context (`render()` or ReactiveChild autorun) follows the same three phases:

1. **CREATE** - Start batch, evaluate, defer ReactiveChildren
2. **ACTIVATE** - End batch, execute deferred autoruns (each follows CREATE → ACTIVATE → APPLY DOM recursively)
3. **APPLY DOM** - Insert nodes into DOM

### Key Benefits

- **Correct parent chains:** Components and ReactiveChildren are fully created before activation
- **No flash:** Activation happens before DOM insertion, so state changes (like Suspense registration) trigger re-runs before any visual changes
- **Universal pattern:** Initial render and dynamic re-renders use the exact same cycle
- **Natural recursion:** Each autorun is an isolated CREATE → ACTIVATE → APPLY DOM cycle

### Execution Model

```
render(<App />)                               [Level 0]
├─ CREATE
│  └─ Build tree, defer ReactiveChild A
├─ ACTIVATE
│  └─ ReactiveChild A autorun:               [Level 1]
│     ├─ CREATE
│     │  └─ Evaluate, defer AsyncComp ReactiveChild
│     ├─ ACTIVATE
│     │  └─ AsyncComp ReactiveChild autorun: [Level 2]
│     │     ├─ CREATE
│     │     │  └─ Build AsyncComp, defer async ReactiveChild
│     │     ├─ ACTIVATE
│     │     │  └─ Async ReactiveChild:      [Level 3]
│     │     │     ├─ CREATE
│     │     │     ├─ Detect Promise, register with Suspense
│     │     │     │  └─ Triggers parent re-run!
│     │     │     └─ ACTIVATE (no nested children)
│     │     └─ APPLY DOM: insert AsyncComp's div
│     └─ [RE-RUN triggered by registration]
│        ├─ CREATE: pendingChildren > 0 → return pending
│        ├─ ACTIVATE (no nested children in pending)
│        └─ APPLY DOM: insert <Loading />
└─ APPLY DOM: mount to container
```

Each level completes fully (CREATE → ACTIVATE → APPLY DOM) before returning to its parent. Re-runs during ACTIVATE prevent incorrect DOM insertion.

---

## Visual Example: Component Tree Through Phases

Let's trace through a complete example showing the tree at each phase.

### Example Code (h syntax)

```javascript
function App() {
  return h(
    'div',
    null,
    h(Suspense,
      { pending: h('span', null, 'Loading') },
      // IMPORTANT: Function wrapper required for Suspense children
      () => h(AsyncComp, null)
    )
  );
}

function Suspense(props) {
  // Setup Suspense boundary (marks component.__isSuspense = true)
  // Returns function that will be evaluated as ReactiveChild
  return () => {
    if (pendingChildren.size > 0) return props.pending;
    return props.children;
  };
}

function AsyncComp() {
  return h(
    'div',
    null,
    () => somethingAsync().then(() => 'Done!')
  );
}
```

**Why the function wrapper?**

Without `() => h(AsyncComp, null)`, AsyncComp would be eagerly evaluated during App's creation phase with CURRENT_INSTANCE = App. This breaks the parent chain:

```
❌ Without wrapper:
Async ReactiveChild → AsyncComp → App (Suspense not in chain!)

✅ With wrapper:
Async ReactiveChild → AsyncComp → Suspense ReactiveChild → Suspense ✅
```

### Phase 1: CREATION (Tree Built, Nothing Activated)

When `render(h(App, null), container)` executes:

```
render() starts
├─ startCreationBatch() [Batch 1]
├─ h(App, null) evaluates
│  ├─ evaluateComponentFunction(App)
│  ├─ CURRENT_INSTANCE = App component
│  ├─ App function executes
│  │  └─ Returns: h('div', null, h(Suspense, ...))
│  │     ├─ h('div') creates <div> element
│  │     └─ h(Suspense, ...) evaluates (eager!)
│  │        ├─ evaluateComponentFunction(Suspense)
│  │        ├─ CURRENT_INSTANCE = Suspense component
│  │        ├─ Suspense function executes
│  │        │  └─ Returns: function () { ... }
│  │        ├─ Component returned function!
│  │        ├─ Create ReactiveChild for this function
│  │        │  ├─ parent: Suspense component ✅
│  │        │  ├─ isInCreationBatch() = true
│  │        │  ├─ DEFER activation
│  │        │  └─ Add to Batch 1
│  │        ├─ exitComponentScope()
│  │        └─ Return Suspense component
│  ├─ exitComponentScope()
│  └─ Return App component with <div> as domRoot
└─ Batch 1: [Suspense ReactiveChild] ← ONE item

COMPONENT TREE (After Creation, Before Activation):

App ReactiveComponent
  domRoot: <div>
  parent: null
  └─ <div> element created
     └─ Suspense ReactiveComponent
        parent: App
        __isSuspense: true ✅
        pendingChildren: Set() [empty]
        domRoot: DocumentFragment
        └─ Suspense ReactiveChild [DEFERRED] ⏸️
           parent: Suspense component ✅
           isActivated: false
           pendingActivation: () => { autorun(...) }

           [NOT EVALUATED YET - will contain:]
           [props.children = [() => h(AsyncComp, null)]]
```

**Key Points:**
- ✅ Parent chain established: Suspense ReactiveChild → Suspense component
- ⏸️ No autoruns executed yet
- 📦 Batch 1 contains 1 item: Suspense ReactiveChild

---

### Phase 2: ACTIVATION (Autoruns Execute, Nested Batches)

When `endCreationBatch()` executes (before mounting to DOM):

```
endCreationBatch() [Batch 1]
└─ Activate Suspense ReactiveChild (index 0):
   ├─ pendingActivation() executes
   ├─ autorun(() => { ... }) is created
   ├─ autorun RUNS IMMEDIATELY:
   │  ├─ startCreationBatch() [Batch 2] ← NEW NESTED BATCH
   │  ├─ Evaluates: () => { if (pendingChildren.size > 0) ... }
   │  ├─ Checks: pendingChildren.size = 0 (nothing registered yet)
   │  ├─ Returns: props.children = [() => h(AsyncComp, null)]
   │  ├─ appendChild called on () => h(AsyncComp, null)
   │  │  ├─ CURRENT_INSTANCE = Suspense ReactiveChild
   │  │  ├─ Create ReactiveChild for () => h(AsyncComp, null)
   │  │  ├─ parent: Suspense ReactiveChild ✅
   │  │  ├─ isInCreationBatch() = true (Batch 2 active)
   │  │  ├─ DEFER activation
   │  │  └─ Add to Batch 2
   │  └─ Batch 2: [AsyncComp ReactiveChild]
   │
   │  ├─ endCreationBatch() [Batch 2]
   │  └─ Activate AsyncComp ReactiveChild (index 0):
   │     ├─ autorun(() => { ... }) runs:
   │     │  ├─ startCreationBatch() [Batch 3] ← NESTED AGAIN
   │     │  ├─ Evaluates: h(AsyncComp, null)
   │     │  ├─ evaluateComponentFunction(AsyncComp)
   │     │  ├─ CURRENT_INSTANCE = AsyncComp component
   │     │  ├─ AsyncComp function executes
   │     │  │  └─ Returns: h('div', null, () => somethingAsync()...)
   │     │  │     ├─ h('div') creates <div> element
   │     │  │     └─ appendChild called on () => somethingAsync()
   │     │  │        ├─ CURRENT_INSTANCE = AsyncComp component
   │     │  │        ├─ Create ReactiveChild for async function
   │     │  │        ├─ parent: AsyncComp component ✅
   │     │  │        ├─ isInCreationBatch() = true (Batch 3)
   │     │  │        ├─ DEFER activation
   │     │  │        └─ Add to Batch 3
   │     │  └─ Batch 3: [Async ReactiveChild]
   │     │
   │     │  ├─ endCreationBatch() [Batch 3]
   │     │  └─ Activate Async ReactiveChild (index 0):
   │     │     ├─ autorun(() => { ... }) runs:
   │     │     │  ├─ startCreationBatch() [Batch 4]
   │     │     │  ├─ Evaluates: somethingAsync()
   │     │     │  ├─ Returns: Promise
   │     │     │  ├─ Detect Promise!
   │     │     │  ├─ Call findSuspenseBoundary():
   │     │     │  │  ├─ Walk parent chain:
   │     │     │  │  ├─ this.parent = AsyncComp component
   │     │     │  │  ├─ AsyncComp.parent = AsyncComp ReactiveChild
   │     │     │  │  ├─ AsyncComp RC.parent = Suspense ReactiveChild
   │     │     │  │  ├─ Suspense RC.parent = Suspense component
   │     │     │  │  └─ Suspense.__isSuspense = true ✅ FOUND!
   │     │     │  ├─ suspense.registerPendingChild(this)
   │     │     │  │  └─ pendingChildren.add(asyncChild)
   │     │     │  │     └─ pendingChildren.size = 1
   │     │     │  └─ endCreationBatch() [Batch 4] (empty)
   │     │     └─ isActivated = true
   │     └─ AsyncComp ReactiveChild returns <div> with async region
   └─ Suspense ReactiveChild returns props.children

COMPONENT TREE (After Activation, Before DOM Mounting):

App ReactiveComponent
  domRoot: <div>
  parent: null
  └─ <div> element
     └─ Suspense ReactiveComponent
        parent: App
        __isSuspense: true
        pendingChildren: Set(1) ← Async child registered! ✅
        domRoot: DocumentFragment
        └─ Suspense ReactiveChild [ACTIVATED] ✅
           parent: Suspense component
           isActivated: true
           children: [AsyncComp ReactiveChild]
           └─ AsyncComp ReactiveChild [ACTIVATED] ✅
              parent: Suspense ReactiveChild
              isActivated: true
              children: [AsyncComp component]
              └─ AsyncComp Component
                 parent: AsyncComp ReactiveChild
                 domRoot: <div>
                 └─ <div> element
                    └─ Async ReactiveChild [ACTIVATED] ✅
                       parent: AsyncComp component
                       isActivated: true
                       isPending: true ⏳
                       (Promise registered with Suspense)
```

**Key Points:**
- ✅ All ReactiveChildren activated (deepest-first due to nested batches)
- ✅ Async child found Suspense via parent chain
- ✅ Async child registered with Suspense BEFORE returning
- ⚠️ **BUT**: Suspense ReactiveChild already evaluated and returned props.children
- 🔄 Suspense will need to RE-RUN when pendingChildren changes (reactive state)

**Critical Detail: Re-runs During ACTIVATE**

When an async child registers with Suspense during the ACTIVATE phase, it modifies reactive state (`state.pendingChildren.add()`). This triggers Suspense's ReactiveChild autorun to re-run **immediately**, before the original autorun reaches APPLY DOM.

The re-run also follows CREATE → ACTIVATE → APPLY DOM:
- CREATE: Evaluates function, this time `pendingChildren.size > 0`
- Returns `props.pending` instead of `props.children`
- ACTIVATE: (pending has no nested children)
- APPLY DOM: Insert `<Loading />`

The original autorun is interrupted/replaced by the re-run, so we never insert `props.children` to the DOM.

**This is why `pendingChildren` must use reactive state** (from `createState`), so that registration triggers an immediate re-run during the ACTIVATE phase.

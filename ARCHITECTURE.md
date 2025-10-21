# Architecture

A comprehensive guide to the internal architecture of @ui-lib/lib.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Reactive Proxy System](#reactive-proxy-system)
3. [Component Architecture](#component-architecture)
4. [Observation Scopes](#observation-scopes)
5. [Memory Management](#memory-management)
6. [Dynamic Content Transitions](#dynamic-content-transitions)
7. [Module Organization](#module-organization)

## Core Concepts

### Fine-Grained Reactivity

Unlike React's component-level updates, @ui-lib/lib uses fine-grained reactivity that updates only the specific DOM nodes that depend on changed state. This is achieved through:

- **Proxy-based state tracking** - Automatically intercepts property access and mutations
- **Dependency tracking** - Tracks which computations depend on which properties
- **Granular updates** - Re-runs only the computations affected by a change

### Single-Run Components

Component functions execute only once during their lifetime. They don't re-run on state changes. Instead, reactive scopes (function children and props) create observation contexts that automatically track and update:

```tsx
function MyComponent() {
  console.log("This runs ONCE");
  const state = createState({ count: 0 });

  // The arrow function creates a reactive scope that re-runs
  return <div>{() => state.count}</div>;
}
```

## Reactive Proxy System

The reactivity system uses JavaScript Proxies to create observable state objects. This is implemented in [reactivity.ts](packages/lib/src/reactivity.ts).

### How It Works

```tsx
const state = createState({ count: 0 });

// When you read state.count inside a reactive context:
// 1. Proxy's get trap fires
// 2. Current computation is subscribed to "count" property
// 3. Value is returned

// When you write state.count++:
// 1. Proxy's set trap fires
// 2. All computations subscribed to "count" are re-run
// 3. DOM updates happen automatically
```

### Global Scope Tracking

The reactivity system uses two complementary global scope trackers:

#### 1. Observation Scope (CURRENT_OBSERVATION)
- Tracks which reactive state properties are accessed during effect execution
- Set by `autorun()` when running an effect function
- Used by reactive proxies to subscribe the current computation to properties
- Analogous to React's dependency tracking in useEffect

#### 2. Component Scope (CURRENT_COMPONENT)
- Tracks cleanup functions registered during component instantiation
- Set by `enterComponentScope()` when a component function runs
- Used by `onCleanup()` to register cleanup with the component
- Cleanups are run when the component is unmounted

### Dependency Tracking

The system maintains several WeakMaps for tracking dependencies:

- **`propertyListeners`** - Maps objects to their properties, and properties to computations
- **`computationSubscriptions`** - Maps computations to their subscribed properties (for cleanup)
- **`proxyCache`** - Caches proxies to avoid creating duplicates

### Array Reactivity

Array mutations are handled specially to ensure proper reactivity:

- Array mutating methods (`push`, `pop`, `splice`, etc.) are wrapped
- Mutations trigger both the method property and the `length` property
- Array mutations are batched to prevent multiple updates

### Batching

Multiple state changes can be batched to trigger only one update cycle:

```tsx
batch(() => {
  state.x = 10;
  state.y = 20;
  state.z = 30;
}); // Only one update cycle
```

Each batch increments a global `CHANGE_COUNTER` used for memoization.

### Memoization

The system includes automatic memoization to avoid redundant computation:

- Function results are cached based on the current `CHANGE_COUNTER`
- Subsequent calls in the same change cycle return cached values
- Used internally by JSX rendering to optimize reactive props

## Component Architecture

The library maintains a **logical component tree** parallel to the physical DOM tree. This architecture uses two internal instance types defined in [component.ts](packages/lib/src/component.ts).

### ReactiveComponent

Represents user-defined function components:

```tsx
class ReactiveComponent {
  parent: ReactiveInstance | null
  children: Set<ReactiveInstance>
  cleanups: Array<() => void>
  autorunDisposals: Array<() => void>
  mountCallbacks: Array<() => void>
  domRoot: Node | null
  isDisposed: boolean
}
```

**Responsibilities:**
- Tracks children (both components and reactive scopes)
- Manages lifecycle (mount callbacks, cleanup functions)
- Owns cleanup responsibilities (event listeners, autoruns)
- Disposes entire subtree recursively

**Parent-Child Registration:**
- Auto-registers with `ReactiveComponent` parents during construction
- Does NOT auto-register with `ReactiveChild` parents (manual registration)

### ReactiveChild

Represents reactive scopes created by `{() => ...}` in JSX:

```tsx
class ReactiveChild {
  parent: ReactiveInstance | null
  children: Set<ReactiveInstance>
  cleanups: Array<() => void>
  autorunDisposal: (() => void) | null
  region: ReturnType<typeof createRegion>
  isDisposed: boolean
}
```

**Responsibilities:**
- Only created for reactive JSX children, not for reactive props
- Manages dynamic DOM content within comment-bounded regions
- Provides cleanup context for intrinsic elements inside the scope
- Handles smart diffing for keyed/non-keyed arrays

**Key Distinction:**
- Reactive **props** (e.g., `style={() => ...}`) register autoruns with the current component
- Reactive **children** (e.g., `<div>{() => ...}</div>`) create a ReactiveChild scope with its own cleanup context

### Component Tree Structure

```
Logical Tree                    Physical DOM
────────────────────            ─────────────
ReactiveComponent (App)         <div id="app">
├─ ReactiveComponent (Header)     <header>
│  └─ ReactiveChild                 <img />
│     └─ [cleanups]               </header>
└─ ReactiveComponent (List)       <ul>
   └─ ReactiveChild                 <li>Item 1</li>
      ├─ ReactiveComponent          <li>Item 2</li>
      └─ ReactiveComponent        </ul>
```

### Parent-Child Registration Flow

#### ReactiveComponent as Parent

When a ReactiveComponent is created with another ReactiveComponent as parent, it automatically registers itself during construction. This is safe because component render is deterministic:

```tsx
function Parent() {
  return <Child />  // Child auto-registers with Parent
}
```

#### ReactiveChild as Parent

When a ReactiveComponent is created with a ReactiveChild as parent (inside a reactive function), it does NOT auto-register.

**Why?** ReactiveChild runs an autorun that:
1. Disposes all current children at the start of each evaluation
2. Re-evaluates the function
3. Adds the new children to the set

If components auto-registered during step 2, they would be in the children set and immediately disposed in step 1 of the NEXT cycle.

**Solution:** ReactiveChild explicitly adds children after successful evaluation, ensuring only the final, rendered components are tracked.

## Observation Scopes

Function children and props create "observation scopes" that automatically track dependencies.

### Function Children

```tsx
// This function child:
<div>{() => state.count}</div>

// Internally creates a ReactiveChild instance with an autorun:
// 1. Runs the function to get the value
// 2. Tracks that it accessed state.count
// 3. Re-runs automatically when state.count changes
// 4. Disposes old content before inserting new content
// 5. Updates only this specific region of the DOM
```

### Function Props

```tsx
// This reactive prop:
<h1 style={() => ({ color: state.color })}>Hello</h1>

// Creates an autorun registered with the current ReactiveComponent:
// 1. Runs the function to get the prop value
// 2. Tracks that it accessed state.color
// 3. Re-runs automatically when state.color changes
// 4. Updates only this specific prop
```

### DOM Regions

Reactive children use comment-bounded regions in the DOM:

```html
<!-- reactive-scope -->
  <div>Dynamic content here</div>
<!-- /reactive-scope -->
```

Each region can:
- Insert nodes before a reference node
- Clear all content between markers
- Track cleanup functions for removal

## Memory Management

Proper cleanup prevents memory leaks through a hierarchical disposal system.

### Disposal Flow

1. **ReactiveComponent** tracks all cleanups, autoruns, and event listeners
2. **ReactiveChild** manages its region's autorun and child component lifecycles
3. When a component disposes, it recursively disposes all children first (depth-first)
4. Event listeners are automatically removed
5. Reactive subscriptions are automatically disposed
6. DOM nodes are removed from the tree

### Cleanup Example

```tsx
function Parent() {
  const state = createState({ show: true });

  return (
    <div>
      <button onClick={() => state.show = !state.show}>Toggle</button>
      {() => state.show ? <ChildWithListeners /> : null}
      {/* When toggled to null:
          - ReactiveChild disposes the old content
          - Child component's dispose() is called
          - Child's event listeners are removed
          - Child's reactive scopes are disposed
          - No memory leaks! */}
    </div>
  );
}
```

### Subscription Cleanup

When a computation is disposed:
1. Run the computation's cleanup function (if any)
2. Remove the computation from all property listeners
3. Clear the computation's subscription tracking

### Event Listener Cleanup

Event listeners are tracked by the current instance:
- `setProp()` registers a cleanup function when adding listeners
- Cleanup removes the listener when the instance disposes
- Prevents memory leaks from orphaned event handlers

## Dynamic Content Transitions

ReactiveChild handles various content transitions efficiently using smart diffing strategies.

### Single Item Transitions

```tsx
// null → element
{() => state.show ? <div>Hello</div> : null}

// element → element (same type)
{() => state.active ? <div>Active</div> : <div>Inactive</div>}

// element → component
{() => state.complex ? <ComplexComponent /> : <div>Simple</div>}
```

**Strategy:** Clear old content, insert new content

### Array Transitions

#### Non-Keyed Arrays

```tsx
{() => state.items.map(item => <li>{item.name}</li>)}
```

**Strategy:** Replace all items on every change
- Simple and predictable
- Inefficient for large lists with small changes

#### Keyed Arrays

```tsx
{() => state.items.map(item => <li key={item.id}>{item.name}</li>)}
```

**Strategy:** Efficient keyed diffing
1. Build map of old items by key (from both ReactiveComponents and DOM nodes)
2. Remove items with keys not in new array
3. Reorder/insert items based on new array order
4. Reuse existing DOM nodes where possible

### Keyed Diffing Algorithm

The keyed diffing algorithm handles both component instances and intrinsic elements:

1. **Build old map:**
   - Collect ReactiveComponents from children set
   - Scan DOM region for keyed intrinsic elements

2. **Remove old keys:**
   - Dispose ReactiveComponents no longer in new array
   - Remove intrinsic DOM nodes no longer needed

3. **Reorder/insert:**
   - Iterate backwards through new array
   - Reuse existing nodes where possible
   - Create and insert new nodes as needed
   - Maintain correct order with insertBefore

## Module Organization

The library is organized into focused modules:

### [reactivity.ts](packages/lib/src/reactivity.ts)
- Proxy-based state management
- Dependency tracking and subscriptions
- `createState()` - Creates reactive state objects
- `autorun()` - Creates reactive computations
- `batch()` - Batches updates into single cycle
- Global scope tracking (observation and component scopes)

### [component.ts](packages/lib/src/component.ts)
- Component instance infrastructure
- `ReactiveComponent` - User-defined function components
- `ReactiveChild` - Reactive scope instances
- Scope management (enter/exit component/reactive scopes)
- Parent-child registration logic

### [dom.ts](packages/lib/src/dom.ts)
- DOM manipulation utilities
- `setProp()` - Sets properties/attributes with reactive support
- `createRegion()` - Creates comment-bounded dynamic regions
- `onMount()` - Registers mount callbacks
- `onCleanup()` - Registers cleanup functions
- Event listener tracking

### [jsx.ts](packages/lib/src/jsx.ts)
- JSX factory and rendering
- `h()` - JSX factory function (pragma)
- `render()` - Mounts components into containers
- `createElement()` - Creates elements/components/keyed items
- Child appending with reactive support
- Keyed diffing algorithm

### [jsx-runtime.ts](packages/lib/src/jsx-runtime.ts)
- TypeScript JSX type definitions
- `Fragment` component
- JSX namespace for type safety

### [index.ts](packages/lib/src/index.ts)
- Public API exports
- Re-exports only public-facing functions and types

# UI Library Project Structure

## Overview
This is a monorepo containing a TypeScript library and a Vite demo project for testing. The setup allows you to make changes to the library and see them immediately reflected in the demo application.

## Project Structure
```
ui-lib/
├── packages/
│   ├── lib/                    # TypeScript library
│   │   ├── src/
│   │   │   ├── index.ts       # Public API exports
│   │   │   ├── createState.ts # Reactive state management (MobX-like)
│   │   │   ├── dom.ts         # DOM utilities, regions, cleanup
│   │   │   ├── jsx.ts         # JSX factory, rendering, diffing
│   │   │   └── jsx-runtime.ts # JSX type definitions
│   │   ├── dist/              # Compiled output (gitignored)
│   │   ├── LIFECYCLE.md       # Component lifecycle documentation
│   │   ├── package.json       # Library package config
│   │   └── tsconfig.json      # TypeScript config for library
│   └── demo/                   # Vite demo application
│       ├── src/
│       │   └── main.tsx       # Demo application code
│       ├── index.html         # HTML entry point
│       ├── package.json       # Demo package config
│       ├── tsconfig.json      # TypeScript config for demo
│       └── vite.config.ts     # Vite configuration
├── package.json               # Root workspace configuration
├── .gitignore                 # Git ignore rules
└── CLAUDE.md                  # This file

```

## How It Works

### NPM Workspaces
The root `package.json` defines workspaces that link the library and demo:
- The demo project depends on `@ui-lib/lib`
- NPM automatically symlinks the library into the demo's node_modules
- No need for `npm link` or publishing to test changes

### Development Flow
1. **Library (packages/lib/)**: TypeScript compiles `src/` → `dist/`
2. **Demo (packages/demo/)**: Vite imports from `@ui-lib/lib` (points to `dist/`)
3. **Hot Reload**: Vite watches the library's dist folder and reloads on changes

### Key Configuration

**Vite Config** (`packages/demo/vite.config.ts`):
- `optimizeDeps.exclude: ['@ui-lib/lib']` - Prevents Vite from bundling the library
- `server.watch.ignored` - Ensures Vite watches the library's node_modules

**Library Package** (`packages/lib/package.json`):
- `main` and `types` point to compiled `dist/` files
- `dev:lib` script runs TypeScript in watch mode

## Development Commands

### Starting Development (Recommended)
Open two terminal windows:

**Terminal 1 - Watch Library:**
```bash
cd packages/lib
npm run dev:lib
```
This runs TypeScript in watch mode, recompiling on every change.

**Terminal 2 - Run Demo:**
```bash
cd packages/demo
npm run dev
```
This starts the Vite dev server (typically on http://localhost:5173).

### Other Commands

**Build library once:**
```bash
cd packages/lib
npm run build
```

**Build demo for production:**
```bash
cd packages/demo
npm run build
```

**Run demo from root:**
```bash
npm run dev
```

## Making Changes

1. Edit files in `packages/lib/src/`
2. TypeScript automatically recompiles to `packages/lib/dist/`
3. Vite detects the change and hot-reloads the demo
4. Changes appear in your browser instantly

## Adding Dependencies

**To the library:**
```bash
cd packages/lib
npm install <package>
```

**To the demo:**
```bash
cd packages/demo
npm install <package>
```

**To the root workspace:**
```bash
npm install <package> -w root
```

## Tips

- Always keep `npm run dev:lib` running in the library when developing
- The library must be built at least once before the demo can import it
- TypeScript errors in the library will prevent compilation - check Terminal 1
- The demo imports from the compiled `dist/` folder, not the `src/` folder

## Library Architecture

### Core Concepts

The library implements a reactive UI system with automatic dependency tracking and proper cleanup. It consists of three main modules:

#### 1. Reactive State ([reactivity.ts](packages/lib/src/reactivity.ts))
- **`createState<T>(initial: T): T`** - Creates a reactive proxy that tracks property access
- **`autorun(effect: Function): () => void`** - Runs an effect reactively, returns disposal function
- **Proxy-based tracking** - Similar to MobX, automatically tracks which properties are accessed
- **Subscription management** - Reactive scopes track their subscriptions for efficient cleanup

**autorun Example:**
```tsx
const state = createState({ count: 0 })
const dispose = autorun(() => {
  console.log('Count:', state.count) // Automatically subscribes to state.count
})
state.count++ // Triggers the autorun
dispose() // Cleans up subscription
```

**Component Example with autorun:**
```tsx
function MyComponent() {
  const state = createState({ count: 0 })

  // You can use autorun directly in the component
  // Just clean it up when the component unmounts
  const dispose = autorun(() => {
    console.log('Count changed:', state.count)
  })

  onCleanup(dispose)

  return <div>{() => state.count}</div>
}
```

#### 2. DOM Utilities ([dom.ts](packages/lib/src/dom.ts))
- **`setProp(el, key, value)`** - Sets properties/attributes on DOM elements with reactive support
- **`createReactiveProp(el, key, fn)`** - Creates a reactive prop (internal, used by setProp)
- **`createRegion(parent)`** - Creates a dynamic content region with cleanup tracking
- **`isEventProp(key)`** - Identifies event handler props (onClick, onSubmit, etc.)
- **`onMount(callback: () => void)`** - Registers a callback to run after the component is mounted to the DOM
- **`onCleanup(cleanup: () => void)`** - Registers a cleanup function to run when the component unmounts
- **Event listener tracking** - Automatically tracks and removes event listeners on cleanup
- **Reactive prop management** - Function props create reactive scopes that are disposed when components unmount

**Lifecycle Callbacks:**
```tsx
function MyComponent() {
  const state = createState({ count: 0 })

  // Run code after the component is mounted to the DOM
  onMount(() => {
    console.log('Component mounted!')
  })

  // Set up an interval and clean it up when component unmounts
  const interval = setInterval(() => {
    state.count++
  }, 1000)

  onCleanup(() => {
    clearInterval(interval)
  })

  return <div>{() => state.count}</div>
}
```

**Regions:**
Regions are bounded areas in the DOM (marked with comment anchors) that can be cleared and repopulated:
```typescript
const region = createRegion(parentNode)
region.insertBeforeRef(newNode, null)
region.addCleanup(() => console.log('Cleaning up'))
region.clearAll() // Runs cleanups, removes nodes
```

#### 3. JSX and Rendering ([jsx.ts](packages/lib/src/jsx.ts))
- **`h(type, props, ...children)`** - JSX factory function (pragma)
- **`render(node, container)`** - Mounts a component into a container
- **Function children** - Create reactive scopes: `{() => state.value}`
- **Function props** - Create reactive attributes: `style={() => 'color: red'}`
- **Array diffing** - Keyed arrays use efficient diffing, non-keyed arrays replace all
- **Component model** - Components are functions that run once and return nodes

**JSX Transform:**
```tsx
<div className="foo">{() => state.text}</div>
// Transforms to:
h('div', { className: 'foo' }, () => state.text)
```

### Component Lifecycle

Components follow a specific lifecycle with proper cleanup. For detailed information, see [LIFECYCLE.md](packages/lib/LIFECYCLE.md).

**Key Lifecycle Phases:**
1. **Creation** - Component function runs once, `createState` creates reactive proxies
2. **Mounting** - DOM nodes inserted, event listeners attached, observation scopes created
3. **Active** - State changes trigger autorun re-runs, DOM updates applied
4. **Unmounting** - Region cleanup runs, autoruns disposed, event listeners removed, nodes deleted

**Cleanup System:**
- ReactiveContent instances manage their reactive scope disposal
- Component instances track all reactive attribute disposals
- Event listeners are automatically removed on cleanup
- Reactive scopes properly dispose and remove subscriptions from property listeners
- Recursive cleanup ensures nested components are fully cleaned up

**Example with cleanup:**
```tsx
function MyComponent() {
  const state = createState({ show: true })

  return (
    <div>
      <button onClick={() => state.show = !state.show}>Toggle</button>
      {() => state.show ? <ChildWithListeners /> : null}
      {/* When toggled to null:
          - ReactiveContent's reactive scope is disposed
          - Child component's event listeners removed
          - Child component's reactive attributes disposed
          - No memory leaks */}
    </div>
  )
}
```

### Reactive Primitives

The library provides three reactive primitives built on reactive scopes:

#### 1. Reactive Scope (Low-Level)
Created by `autorun()` - the foundational building block:
```tsx
const state = createState({ count: 0 });
const dispose = autorun(() => {
  console.log('Count:', state.count); // Automatically tracks dependencies
});
state.count++; // Triggers re-run
dispose(); // Cleanup
```

#### 2. Reactive Content
Function children (`{() => expr}`) create `ReactiveContent` instances:
- Manage dynamic DOM regions with comment boundaries
- Handle content insertion/removal
- Support smart array diffing (keyed/non-keyed)
```tsx
<div>{() => state.count}</div>
// Creates a ReactiveContent that updates only this region
```

#### 3. Reactive Attribute
Function props (`style={() => expr}`) create `ReactiveAttribute` instances:
- Lightweight abstraction over autorun
- Update specific attributes/properties only
- Registered with the current component
- No DOM region overhead
```tsx
<h1 style={() => ({ color: state.color })}>Hello</h1>
// Creates a ReactiveAttribute that updates only the style
```

**Key Distinction:**
- **Reactive content** = ReactiveContent instance + DOM region
- **Reactive attributes** = ReactiveAttribute instance (no region)

### Reactivity Rules

1. **Components run once** - The component function body executes only once
2. **Function children create reactive content** - `{() => expr}` creates a ReactiveContent with a DOM region
3. **Function props create reactive attributes** - `style={() => expr}` creates a ReactiveAttribute for that prop
4. **Event handlers are NOT reactive** - `onClick={handler}` is a plain event listener
5. **Arrays without keys replace all** - Non-keyed arrays are fully replaced on changes
6. **Arrays with keys diff efficiently** - Keyed arrays only update changed elements
7. **Use onMount for DOM manipulation** - Access and manipulate DOM elements after mounting
8. **Use onCleanup for side effects** - Clean up intervals, subscriptions, and other side effects

### Testing and Development

When developing new features:
- Use the demo app to test changes in real-time
- Check DevTools → Event Listeners to verify cleanup
- Test mount/unmount cycles to ensure no memory leaks
- Use the LIFECYCLE.md guide to understand cleanup behavior

**Memory leak testing:**
```tsx
// Toggle repeatedly - memory should stay stable
function TestComponent() {
  const state = createState({ toggle: true })
  return (
    <div>
      <button onClick={() => state.toggle = !state.toggle}>Toggle</button>
      {() => state.toggle ? <ComplexComponent /> : null}
    </div>
  )
}
```

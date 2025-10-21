# @ui-lib/lib

A lightweight, reactive JSX UI library with fine-grained reactivity and automatic dependency tracking. Inspired by React's component model and SolidJS's reactive primitives, it combines the best of both worlds: familiar JSX syntax with efficient, granular updates.

## Features

- **Fine-grained Reactivity** - Updates only the specific DOM nodes that depend on changed state, not entire components
- **Automatic Dependency Tracking** - No need to declare dependencies; the library tracks them automatically
- **Familiar JSX Syntax** - Write components that look like React, but with reactive primitives
- **Tiny Bundle Size** - Zero dependencies (except classnames utility), minimal overhead
- **Proper Cleanup** - Automatic lifecycle management prevents memory leaks
- **TypeScript First** - Full type safety with excellent IDE support

## Installation

```bash
npm install @ui-lib/lib
```

### TypeScript Configuration

Add the JSX configuration to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@ui-lib/lib"
  }
}
```

## Quick Start

```tsx
import { render, createState } from "@ui-lib/lib";

function Counter() {
  const state = createState({ count: 0 });

  return (
    <div>
      <h1>Count: {() => state.count}</h1>
      <button onClick={() => state.count++}>Increment</button>
    </div>
  );
}

render(<Counter />, document.getElementById("app")!);
```

## Core Concepts

### 1. Components Run Once

Unlike React, component functions execute only once. They don't re-run on state changes:

```tsx
function MyComponent() {
  console.log("This runs ONCE");
  const state = createState({ count: 0 });

  return <div>{() => state.count}</div>;
}
```

### 2. Reactive State with `createState`

Create reactive objects that automatically track dependencies:

```tsx
const state = createState({
  name: "Alice",
  age: 30,
  todos: []
});

// Any mutation triggers updates
state.age++;
state.todos.push({ id: 1, text: "Learn @ui-lib" });
```

### 3. Function Children for Reactivity

Wrap expressions in arrow functions to make them reactive:

```tsx
const state = createState({ count: 0 });

// ✅ Reactive - updates when count changes
<div>{() => state.count}</div>

// ❌ Not reactive - reads count once
<div>{state.count}</div>
```

### 4. Function Props for Reactive Attributes

Props can also be reactive using arrow functions:

```tsx
const state = createState({ color: "red" });

// Reactive style prop
<h1 style={() => ({ color: state.color })}>
  Hello
</h1>

// Reactive class prop
<div className={() => state.isActive ? "active" : ""}>
  Content
</div>
```

### 5. Event Handlers (Non-Reactive)

Event handlers are plain functions, not reactive:

```tsx
const state = createState({ count: 0 });

<button onClick={() => state.count++}>
  Increment
</button>
```

## Advanced Features

### Lists and Keyed Rendering

For efficient list updates, use `key` props:

```tsx
const state = createState({
  todos: [
    { id: 1, text: "Learn reactivity" },
    { id: 2, text: "Build app" }
  ]
});

// ✅ Efficient - only updates changed items
<ul>
  {() => state.todos.map(todo => (
    <li key={todo.id}>{() => todo.text}</li>
  ))}
</ul>

// ❌ Inefficient - recreates all items
<ul>
  {() => state.todos.map(todo => (
    <li>{() => todo.text}</li>
  ))}
</ul>
```

### Lifecycle Hooks

#### `onMount` - Run code after component mounts

```tsx
import { onMount } from "@ui-lib/lib";

function MyComponent() {
  onMount(() => {
    console.log("Component is now in the DOM!");
    // Access DOM elements, focus inputs, etc.
  });

  return <div>Hello</div>;
}
```

#### `onCleanup` - Clean up side effects

```tsx
import { onCleanup } from "@ui-lib/lib";

function Timer() {
  const state = createState({ time: 0 });

  const interval = setInterval(() => {
    state.time++;
  }, 1000);

  onCleanup(() => {
    clearInterval(interval);
  });

  return <div>Time: {() => state.time}</div>;
}
```

### Batched Updates

Batch multiple state changes to trigger only one update:

```tsx
import { batch } from "@ui-lib/lib";

const state = createState({ x: 0, y: 0 });

// Without batch: triggers 2 updates
state.x = 10;
state.y = 20;

// With batch: triggers 1 update
batch(() => {
  state.x = 10;
  state.y = 20;
});
```

## Comparison with Other Libraries

### vs React

| Feature | @ui-lib/lib | React |
|---------|-------------|-------|
| Component re-runs | ❌ Once only | ✅ On every update |
| Dependency tracking | ✅ Automatic | ❌ Manual (deps array) |
| Update granularity | ✅ Fine-grained | ❌ Component-level |
| Virtual DOM | ❌ Direct updates | ✅ Diffing |
| Bundle size | ~5KB | ~40KB |

```tsx
// @ui-lib/lib
function Counter() {
  const state = createState({ count: 0 });
  return <div>{() => state.count}</div>;
}

// React
function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>; // Re-runs entire component
}
```

### vs SolidJS

| Feature | @ui-lib/lib | SolidJS |
|---------|-------------|---------|
| Reactivity model | ✅ Proxy-based | ✅ Signal-based |
| API style | ✅ Object mutation | ❌ Getters/setters |
| JSX support | ✅ Full | ✅ Full |
| Compiled | ❌ Runtime | ✅ Compile-time |

```tsx
// @ui-lib/lib (MobX-like)
const state = createState({ count: 0 });
state.count++; // Direct mutation

// SolidJS (Signal-like)
const [count, setCount] = createSignal(0);
setCount(c => c + 1); // Setter function
```

## How It Works

For a deep dive into the internal architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).

**Quick overview:**

- **Reactive Proxies**: `createState` creates JavaScript Proxies that automatically track property access and notify subscribers on mutations
- **Component Tree**: Maintains a logical component tree parallel to the DOM tree for efficient cleanup and lifecycle management
- **Observation Scopes**: Function children and props create reactive scopes that automatically re-run when dependencies change
- **Memory Management**: Hierarchical disposal system ensures proper cleanup of event listeners, reactive subscriptions, and DOM nodes
- **Smart Diffing**: Efficient updates with keyed diffing for arrays and minimal DOM manipulation

## Examples

### Todo List

```tsx
import { render, createState } from "@ui-lib/lib";

function TodoApp() {
  const state = createState({
    todos: [],
    nextId: 0
  });

  const addTodo = () => {
    state.todos.push({
      id: state.nextId++,
      text: "New todo",
      completed: false
    });
  };

  const removeTodo = (id) => {
    const index = state.todos.findIndex(t => t.id === id);
    state.todos.splice(index, 1);
  };

  return (
    <div>
      <button onClick={addTodo}>Add Todo</button>
      <ul>
        {() => state.todos.map(todo => (
          <li key={todo.id}>
            <span>{() => todo.text}</span>
            <button onClick={() => removeTodo(todo.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

render(<TodoApp />, document.getElementById("app")!);
```

### Conditional Rendering

```tsx
function Toggle() {
  const state = createState({ show: true });

  return (
    <div>
      <button onClick={() => state.show = !state.show}>
        Toggle
      </button>
      {() => state.show ? (
        <p>Visible content</p>
      ) : (
        <p>Hidden content</p>
      )}
    </div>
  );
}
```

### Derived State

```tsx
function Cart() {
  const state = createState({
    items: [
      { id: 1, name: "Apple", price: 1.5 },
      { id: 2, name: "Banana", price: 0.8 }
    ]
  });

  // Computed value - recalculates when items change
  const total = () => {
    return state.items.reduce((sum, item) => sum + item.price, 0);
  };

  return (
    <div>
      <h2>Total: ${total}</h2>
      <ul>
        {() => state.items.map(item => (
          <li key={item.id}>
            {() => item.name} - ${() => item.price}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## Best Practices

### 1. Always use arrow functions for reactive content

```tsx
// ✅ Good
<div>{() => state.value}</div>

// ❌ Bad - reads once, never updates
<div>{state.value}</div>
```

### 2. Use keys for lists

```tsx
// ✅ Good - efficient updates
{() => items.map(item => <div key={item.id}>{() => item.name}</div>)}

// ❌ Bad - recreates all items
{() => items.map(item => <div>{() => item.name}</div>)}
```

### 3. Clean up side effects

```tsx
// ✅ Good
function Timer() {
  const interval = setInterval(() => {}, 1000);
  onCleanup(() => clearInterval(interval));
  return <div />;
}

// ❌ Bad - memory leak
function Timer() {
  setInterval(() => {}, 1000);
  return <div />;
}
```

### 4. Batch related updates

```tsx
// ✅ Good - one update
batch(() => {
  state.x = 10;
  state.y = 20;
  state.z = 30;
});

// ⚠️ Works but less efficient - three updates
state.x = 10;
state.y = 20;
state.z = 30;
```

## Development

See [CLAUDE.md](CLAUDE.md) for development setup and project structure.

## License

MIT

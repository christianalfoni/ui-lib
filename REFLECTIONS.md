# Reflections on React, Solid, and ui-lib

## On React's Mental Model

**What React taught us:**

- UI as a pure function of state is conceptually elegant
- Reconciliation and diffing make rendering efficient
- Declarative thinking about UI is powerful

**Where React creates cognitive strain:**

- **Temporal complexity** — Components re-run constantly, but state persists. Understanding _when_ code executes becomes a puzzle.
- **Reference instability** — Every render creates new closures. Stale references are a constant threat.
- **Effect orchestration** — `useEffect` dependency arrays blur declarative and imperative logic. Cleanup timing is non-obvious.
- **Performance tax** — `useMemo`, `useCallback`, `React.memo` are necessary evils that leak into everyday reasoning.
  -- **Execution Order** - Hooks must be called in same order for every reconciliation and conflicts with early returns.

**The core insight:** React makes _rendering_ cheap but _reasoning_ expensive. The CPU doesn't pay the price — your brain does.

---

## On Solid's Mental Model

**What Solid solved:**

- Single-run components eliminate re-render complexity
- Fine-grained reactivity updates only what changes
- Stable references mean no stale closures
- No need for memoization or dependency arrays

**Where Solid creates dissonance:**

- **Hidden compilation** — Code is silently transformed into reactive computations. What you write isn't exactly what executes.
- **Dual semantics** — Signals require unwrapping (`count()`), stores don't (`state.count`). Two mental models for state.
- **Special control flow** — `<Show>`, `<For>`, `<Switch>` replace JavaScript's native constructs.
- **Implicit reactivity** — The compiler decides what's reactive. You must remember the rules.

**The core insight:** Solid makes you forget about re-renders — but forgetting comes at a cost. There's a subtle gap between how code looks and how it behaves.

---

## On ui-lib's Direction

**The goal:** Keep Solid's precision, reduce its dissonance. Stay true to JavaScript's surface model.

### Design Principles

**1. Explicit reactivity through runtime semantics**

- Function children are reactive: `{() => state.count}`
- Static children are snapshots: `{state.count}`
- No compiler magic — just JavaScript functions capturing dependencies via proxies

**2. One consistent rule for state**

- Everything is `createState({ ... })`
- Direct mutation triggers reactivity: `state.count++`
- No distinction between signals and stores

**3. Native JavaScript control flow**

- Use `&&`, ternaries, `.map()`, `.filter()` directly
- Function children create reactive scopes automatically
- No special components needed

**4. Runtime transparency**

- Proxy-based tracking is inspectable and debuggable
- Set breakpoints, watch dependencies, understand behavior
- Mental model: "JavaScript proxies + function scopes = reactivity"

**5. Stable references without memoization**

- Components run once
- Event handlers never change
- No stale closures, no `useCallback`, no dependency arrays

---

## Key Architectural Choices

### Why explicit function syntax for reactivity?

**Instead of:**

```jsx
<div>{count()}</div> // Looks static, compiler makes it reactive
```

**We chose:**

```jsx
<div>{() => state.count}</div> // Visual indication of reactive scope
```

**Reasoning:** The syntax matches the semantics. When you see a function, you know it creates a reactive scope. No hidden transformations.

### Why proxy-based state over signals?

**Instead of:**

```jsx
const [count, setCount] = createSignal(0);
count(); // Must call to get value
setCount(5); // Must call to set value
```

**We chose:**

```jsx
const state = createState({ count: 0 });
state.count; // Direct access
state.count = 5; // Direct mutation
```

**Reasoning:** One pattern for everything. No mental switching between signals and stores. Natural JavaScript mutation.

### Why function children for control flow?

**Instead of:**

```jsx
<Show when={state.show}><Modal /></Show>
<For each={items}>{item => <div>{item}</div>}</For>
```

**We chose:**

```jsx
{
  () => state.show && <Modal />;
}
{
  () => items.map((item) => <div key={item.id}>{item}</div>);
}
```

**Reasoning:** Use JavaScript as it is. Any expression in a function child is reactive. No API surface to learn.

---

## What We Gain

**From React:** The lesson that declarative UI is powerful — but re-renders aren't the only path.

**From Solid:** Fine-grained reactivity, stable references, single-run components — the right foundation.

**Our addition:** Explicit syntax, consistent semantics, runtime transparency — clarity without compromise.

---

## What We Trade

**Bundle size:** Runtime reactivity system (~5-7KB) vs Solid's compile-time approach (~4-5KB).

**Raw performance:** Solid's compiler can optimize more aggressively. We prioritize debuggability and semantic clarity.

**Ecosystem:** We're not React or Solid. No mature ecosystem, no battle-testing, no community libraries.

---

## The Mental Load Trajectory

```
Mental Load ↑
            |          (React)
            |           •  High load: effects, timing, memoization
            |    (Solid)
            |     •  Lower load: no re-runs; minor dissonance
            | (ui-lib POC)
            |  •  Lowest load: explicit reactive rule; JS-first
            |_______________________________________________→
                 Conceptual Dissonance
```

**The thesis:** The best mental models don't hide their magic — they align what you write with what runs.

---

## On Dynamic UI and Function-Based Reactivity

**The prerequisite:** Understanding that functions define dynamic UI.

In ui-lib, the line between static and dynamic is explicit:

- **Static reference:** `<div>{state.count}</div>` — Captures the value at component creation
- **Dynamic reference:** `<div>{() => state.count}</div>` — Creates a reactive scope that updates

This principle extends to **nested components** in a way that's more transparent than Solid's approach.

### Component Props and Reactivity

When you create a component that accepts props:

```tsx
// Component definition
function Badge(props: { count: () => number }) {
  return <span class="badge">{props.count}</span>;
}

// Usage
<Badge count={() => state.count} />;
```

**Key insights:**

1. **Props must be typed as functions** if you want them to be dynamic
2. **Props are already functions** when passed this way, so you can:
   - Use them directly as children: `{props.count}` (already a function)
   - Call them for current value: `onClick={() => alert(props.count())}`
3. **The prop is the reactive scope** — no need to wrap it again

### Transparency vs Convenience

**Solid's approach:**

```jsx
function Badge(props) {
  return <span>{props.count}</span>; // Compiler makes this reactive
}

<Badge count={state.count} />; // Compiler transforms access
```

- **Pro:** Cleaner syntax, familiar destructuring
- **Con:** You can't destructure props (breaks reactivity), compiler hides behavior

**ui-lib's approach:**

```tsx
function Badge(props: { count: () => number }) {
  return <span>{props.count}</span>; // Explicitly a function
}

<Badge count={() => state.count} />;
```

- **Pro:** No hidden transformations, explicit reactivity, can reason about closures
- **Con:** Must type props as functions, slightly more verbose

### Why Explicit is Better

**1. Predictable semantics**

```tsx
function UserCard(props: { name: () => string }) {
  // This is static (called once at creation)
  const greeting = `Hello, ${props.name()}`;

  // This is dynamic (function child)
  return <div>{props.name}</div>;
}
```

You know exactly when `props.name()` executes — no compiler rules to remember.

**2. Clear data flow**

```tsx
function Parent() {
  const state = createState({ user: "Alice" });

  // Explicit: state.user is captured in a function
  return <Child name={() => state.user} />;
}
```

The syntax shows that you're creating a reactive binding, not passing a value.

**3. TypeScript alignment**

```tsx
interface Props {
  count: () => number; // Type matches runtime behavior
  label: string; // Static props are just values
}
```

The types tell you exactly how to use the prop — no magic.

### The Mental Model

**Rule:** Functions create reactive scopes everywhere:

- Function children: `{() => expr}` → ReactiveChild
- Function props: `style={() => expr}` → Reactive attribute
- Function in components: `props.value` → Already a reactive scope

**No exceptions, no special cases, no compiler rules to memorize.**

This makes ui-lib more explicit than Solid but **less confusing** — because the code you write directly represents the reactivity you get.

---

## Open Questions

**1. Compilation vs Runtime**

- Should we add optional compilation for smaller bundles?
- Can we preserve debuggability while compiling?

**2. TypeScript Experience**

- Proxy types work well, but could be better
- Should we provide stronger inference for reactive scopes?

**3. Developer Tooling**

- Devtools for visualizing reactive dependencies?
- Debug mode for tracking autorun executions?

**4. Performance Boundaries**

- Where does runtime overhead matter?
- When should users reach for memoization?

**5. Lifecycle Semantics**

- Is onMount/onCleanup sufficient?
- Do we need more lifecycle hooks?

---

## Conclusion

React and Solid teach us different lessons about mental models. React shows us the cost of re-renders — not in CPU cycles, but in cognitive overhead. Solid shows us the power of fine-grained reactivity — but reminds us that compiler magic can obscure understanding.

**ui-lib explores a middle path:** keep Solid's architectural wins (single-run components, stable references, precise updates) while favoring explicit runtime semantics over implicit compilation.

The goal isn't to be "better" — it's to be _clearer_. To make the mental model match the execution model. To let developers reason about their code without fighting the framework.

Because the best tools don't make you forget complexity — they help you understand it.

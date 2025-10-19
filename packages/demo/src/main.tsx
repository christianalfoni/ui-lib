import { render, createState, Fragment } from "@ui-lib/lib";

// Test 1: Reactive component that returns a function (dynamic null)
function ReactiveComponent() {
  const state = createState({ count: 0 });

  return () => state.count % 2 ? <div>Count is odd: {() => state.count}</div> : null;
}

// Test 2: Fragments with multiple children
function FragmentTest() {
  const state = createState({ show: true });

  return (
    <div style={{ border: "1px solid blue", padding: "10px", margin: "10px" }}>
      <h3>Fragment Test</h3>
      <button onClick={() => state.show = !state.show}>Toggle Fragment</button>
      {() => state.show ? (
        <>
          <p>First paragraph in fragment</p>
          <p>Second paragraph in fragment</p>
          <p>Third paragraph in fragment</p>
        </>
      ) : (
        <p>Fragment is hidden</p>
      )}
    </div>
  );
}

// Test 3: Nested reactive components
function NestedReactive() {
  const state = createState({ outer: 0, inner: 0 });

  const InnerComponent = () => {
    return () => state.inner > 0 ? <span>Inner: {() => state.inner}</span> : null;
  };

  return (
    <div style={{ border: "1px solid green", padding: "10px", margin: "10px" }}>
      <h3>Nested Reactive Test</h3>
      <button onClick={() => state.outer++}>Outer: {() => state.outer}</button>
      {" "}
      <button onClick={() => state.inner++}>Inner++</button>
      {" "}
      <button onClick={() => state.inner = 0}>Reset Inner</button>
      <div>
        Outer is {() => state.outer % 2 ? "odd" : "even"}
        {" - "}
        <InnerComponent />
      </div>
    </div>
  );
}

// Main App
function App() {
  const state = createState({ count: 0 });

  return (
    <div style={{ fontFamily: "system-ui", padding: "20px" }}>
      <h1>Reactive Component & Fragment Tests</h1>

      <div style={{ border: "1px solid red", padding: "10px", margin: "10px" }}>
        <h3>Basic Reactive Component (returns function)</h3>
        <button onClick={() => state.count++}>
          Count: {() => state.count}
        </button>
        <div>
          <ReactiveComponent />
        </div>
      </div>

      <FragmentTest />
      <NestedReactive />
    </div>
  );
}

const app = document.getElementById("app")!;

render(<App />, app);

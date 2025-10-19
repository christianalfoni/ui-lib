import { render, createState, batch, Fragment } from "@ui-lib/lib";

let componentCreationCount = 0;

// Test 1: Reactive component that returns a function (dynamic null)
function ReactiveComponent() {
  const state = createState({ count: 0 });

  return () => state.count % 2 ? <div>Count is odd: {() => state.count}</div> : null;
}

// Test: Keyed array optimization
function KeyedArrayTest() {
  const state = createState({
    items: [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
      { id: 3, name: 'Item 3' }
    ]
  });

  const ItemComponent = ({ item }: { item: { id: number, name: string } }) => {
    const creationId = ++componentCreationCount;

    return (
      <div style={{
        padding: "5px",
        margin: "5px",
        border: "1px solid #ccc",
        background: "#f0f0f0"
      }}>
        {item.name} (created as #{creationId})
      </div>
    );
  };

  const addItem = () => {
    const newId = Math.max(...state.items.map(i => i.id)) + 1;
    state.items.push({ id: newId, name: `Item ${newId}` });
  };

  const removeFirst = () => {
    state.items.shift();
  };

  const reverse = () => {
    state.items.reverse();
  };

  const batchUpdate = () => {
    batch(() => {
      const startId = Math.max(...state.items.map(i => i.id)) + 1;
      state.items.push({ id: startId, name: `Item ${startId}` });
      state.items.push({ id: startId + 1, name: `Item ${startId + 1}` });
      state.items.push({ id: startId + 2, name: `Item ${startId + 2}` });
    });
  };

  const resetCount = () => {
    componentCreationCount = 0;
  };

  return (
    <div style={{ border: "1px solid purple", padding: "10px", margin: "10px" }}>
      <h3>Keyed Array Optimization Test</h3>
      <p style={{ fontSize: "12px", color: "#666" }}>
        Components are only created for new items. Existing items are reused and repositioned efficiently. Try "Batch +3" to see batched updates!
      </p>
      <div>
        <button onClick={addItem}>Add Item</button>
        {" "}
        <button onClick={removeFirst}>Remove First</button>
        {" "}
        <button onClick={reverse}>Reverse</button>
        {" "}
        <button onClick={batchUpdate}>Batch +3</button>
        {" "}
        <button onClick={resetCount}>Reset Counter</button>
      </div>
      <div>
        {() => state.items.map(item => (
          <ItemComponent key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
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

      <KeyedArrayTest />
      <FragmentTest />
      <NestedReactive />
    </div>
  );
}

const app = document.getElementById("app")!;

render(<App />, app);

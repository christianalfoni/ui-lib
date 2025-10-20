import { createState, onCleanup } from "@ui-lib/lib";

type Todo = {
  id: number;
  description: string;
  completed: boolean;
};

// Track how many times this function is called
let doubleCallCount = 0;

function Count({ count }: { count: () => number }) {
  return <h4>The count is: {count}</h4>;
}

function MemoTest({ count }: { count: number }) {
  // This function should be cached within the same reactive cycle
  const getDouble = () => {
    doubleCallCount++;
    console.log("Computing double, call count:", doubleCallCount);
    return count * 2;
  };

  return (
    <div style={{ border: "1px solid gray", padding: "10px", margin: "10px" }}>
      <h3>Memoization Test</h3>
      <p>
        This demonstrates that the same function is called only once per
        reactive cycle, even when used in multiple places.
      </p>
      <div>First use: {getDouble}</div>
      <div>Second use: {getDouble}</div>
      <div>Third use: {getDouble}</div>
      <div>
        <small>
          Total function calls: {() => doubleCallCount} (should increase by 1
          per increment, not 3)
        </small>
      </div>
    </div>
  );
}

function App() {
  const state = createState({
    count: 0,
    todos: [] as Todo[],
    nextId: 0,
  });

  const interval = setInterval(() => {
    console.log("Interval tick, count is:", state.count);
  }, 1000);

  onCleanup(() => {
    clearInterval(interval);
  });

  return (
    <div>
      <h1
        style={() => ({
          color: state.count % 2 ? "red" : "blue",
        })}
      >
        Hello World
      </h1>
      <Count count={() => state.count} />
      {() => <MemoTest count={state.count} />}
      <div>{renderEvenOdd}</div>
      <button
        onClick={() => {
          state.count++;
        }}
      >
        Increase
      </button>
      <hr />
      <button onClick={onAddTodo}>Add Todo</button>
      <ul>{renderTodos}</ul>
    </div>
  );

  function renderEvenOdd() {
    if (state.count % 2) {
      return "Odd";
    }

    return "Even";
  }

  function renderTodos() {
    return state.todos.map((todo) => (
      <li key={todo.id}>
        {() => todo.description}{" "}
        <button
          onClick={() => {
            state.todos.splice(state.todos.indexOf(todo), 1);
          }}
        >
          Remove
        </button>
      </li>
    ));
  }

  function onAddTodo() {
    state.todos.push({
      id: state.nextId++,
      completed: false,
      description: "Mip Map",
    });
  }
}

export default App;

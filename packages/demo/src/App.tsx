import { createState, onCleanup } from "@ui-lib/lib";

type Todo = {
  id: number;
  description: string;
  completed: boolean;
};

function App() {
  const state = createState({
    count: 0,
    todos: [] as Todo[],
  });

  return (
    <div>
      <h4
        onClick={() => state.count++}
        style={() => ({
          color: state.count % 2 ? "red" : "blue",
        })}
      >
        The count is: {() => state.count}
      </h4>
      <button
        onClick={() => {
          state.todos.push({
            id: Date.now(),
            description: "Hihihi",
            completed: false,
          });
        }}
      >
        Add todo
      </button>
      <ul>
        {() =>
          state.todos.map((todo) => <li key={todo.id}>{todo.description}</li>)
        }
      </ul>
    </div>
  );
}

export default App;

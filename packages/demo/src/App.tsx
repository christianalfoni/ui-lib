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
    <h4
      onClick={() => state.count++}
      style={() => ({
        color: state.count % 2 ? "red" : "blue",
      })}
    >
      The count is: {() => state.count}
    </h4>
  );
}

export default App;

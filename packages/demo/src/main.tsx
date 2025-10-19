import { render, createState } from "@ui-lib/lib";

function Counter() {
  const state = createState({
    count: 0,
  });

  return (
    <div style="font-family: system-ui; padding: 20px;">
      <h1
        onClick={() => {
          state.count++;
        }}
        style={() => `color: ${state.count % 2 === 0 ? 'blue' : 'red'}; cursor: pointer;`}
      >
        Simple Counter Demo ({() => state.count})
      </h1>
      <div
        style={() => `
          background-color: rgba(0, 100, 255, ${state.count / 20});
          padding: 10px;
          margin-top: 10px;
          border-radius: 4px;
          transition: background-color 0.3s;
        `}
      >
        <p style={() => `z-index: ${state.count}; position: relative; color: white;`}>
          Z-index: {() => state.count}
        </p>
      </div>
    </div>
  );
}

const app = document.getElementById("app")!;

render(<Counter />, app);

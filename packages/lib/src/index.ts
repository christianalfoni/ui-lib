/**
 * @ui-lib/lib - A simple reactive JSX UI library
 */

// Reactivity
export { createState, autorun, batch, type Computation, type Cleanup } from "./createState";

// DOM utilities
export { setProp, isEventProp, createRegion, type Props } from "./dom";

// JSX and rendering
export { h, render, type Child, type Key } from "./jsx";

// JSX types and Fragment
export { JSX, Fragment } from "./jsx-runtime";

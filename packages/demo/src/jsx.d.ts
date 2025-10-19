/// <reference types="@ui-lib/lib" />

import { JSX as LibJSX } from "@ui-lib/lib";

declare global {
  namespace JSX {
    interface Element extends LibJSX.Element {}
    interface IntrinsicElements extends LibJSX.IntrinsicElements {}
    interface ElementChildrenAttribute extends LibJSX.ElementChildrenAttribute {}
  }
}

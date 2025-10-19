/**
 * JSX automatic runtime for @ui-lib/lib
 */

import { h } from "./jsx";
import type { Child } from "./jsx";

/**
 * JSX automatic runtime - used by TypeScript when jsx: "react-jsx" is set
 */
export function jsx(type: any, props: any): Node {
  const { children, key, __source, __self, ...rest } = props;
  if (key !== undefined) {
    rest.key = key;
  }
  // Only pass children if it's defined
  if (children !== undefined) {
    return h(type, rest, children);
  }
  return h(type, rest);
}

/**
 * JSX automatic runtime for elements with multiple children
 */
export function jsxs(type: any, props: any): Node {
  return jsx(type, props);
}

/**
 * JSX DEV runtime - used in development mode
 */
export function jsxDEV(type: any, props: any, _key?: any, _isStaticChildren?: boolean, _source?: any, _self?: any): Node {
  return jsx(type, props);
}

/**
 * Fragment support (not yet implemented)
 */
export const Fragment = (props: { children?: Child }) => {
  // For now, just return children as-is
  // You may want to implement proper fragment handling later
  return props.children as any;
};

export namespace JSX {
  export type Element = Node;

  export interface IntrinsicElements {
    // Document metadata
    base: HTMLAttributes<HTMLBaseElement>;
    head: HTMLAttributes<HTMLHeadElement>;
    link: HTMLAttributes<HTMLLinkElement>;
    meta: HTMLAttributes<HTMLMetaElement>;
    style: HTMLAttributes<HTMLStyleElement>;
    title: HTMLAttributes<HTMLTitleElement>;

    // Content sectioning
    address: HTMLAttributes<HTMLElement>;
    article: HTMLAttributes<HTMLElement>;
    aside: HTMLAttributes<HTMLElement>;
    footer: HTMLAttributes<HTMLElement>;
    header: HTMLAttributes<HTMLElement>;
    h1: HTMLAttributes<HTMLHeadingElement>;
    h2: HTMLAttributes<HTMLHeadingElement>;
    h3: HTMLAttributes<HTMLHeadingElement>;
    h4: HTMLAttributes<HTMLHeadingElement>;
    h5: HTMLAttributes<HTMLHeadingElement>;
    h6: HTMLAttributes<HTMLHeadingElement>;
    main: HTMLAttributes<HTMLElement>;
    nav: HTMLAttributes<HTMLElement>;
    section: HTMLAttributes<HTMLElement>;

    // Text content
    blockquote: HTMLAttributes<HTMLQuoteElement>;
    dd: HTMLAttributes<HTMLElement>;
    div: HTMLAttributes<HTMLDivElement>;
    dl: HTMLAttributes<HTMLDListElement>;
    dt: HTMLAttributes<HTMLElement>;
    figcaption: HTMLAttributes<HTMLElement>;
    figure: HTMLAttributes<HTMLElement>;
    hr: HTMLAttributes<HTMLHRElement>;
    li: HTMLAttributes<HTMLLIElement>;
    ol: HTMLAttributes<HTMLOListElement>;
    p: HTMLAttributes<HTMLParagraphElement>;
    pre: HTMLAttributes<HTMLPreElement>;
    ul: HTMLAttributes<HTMLUListElement>;

    // Inline text
    a: AnchorHTMLAttributes<HTMLAnchorElement>;
    abbr: HTMLAttributes<HTMLElement>;
    b: HTMLAttributes<HTMLElement>;
    bdi: HTMLAttributes<HTMLElement>;
    bdo: HTMLAttributes<HTMLElement>;
    br: HTMLAttributes<HTMLBRElement>;
    cite: HTMLAttributes<HTMLElement>;
    code: HTMLAttributes<HTMLElement>;
    data: HTMLAttributes<HTMLDataElement>;
    dfn: HTMLAttributes<HTMLElement>;
    em: HTMLAttributes<HTMLElement>;
    i: HTMLAttributes<HTMLElement>;
    kbd: HTMLAttributes<HTMLElement>;
    mark: HTMLAttributes<HTMLElement>;
    q: HTMLAttributes<HTMLQuoteElement>;
    s: HTMLAttributes<HTMLElement>;
    samp: HTMLAttributes<HTMLElement>;
    small: HTMLAttributes<HTMLElement>;
    span: HTMLAttributes<HTMLSpanElement>;
    strong: HTMLAttributes<HTMLElement>;
    sub: HTMLAttributes<HTMLElement>;
    sup: HTMLAttributes<HTMLElement>;
    time: HTMLAttributes<HTMLTimeElement>;
    u: HTMLAttributes<HTMLElement>;
    var: HTMLAttributes<HTMLElement>;
    wbr: HTMLAttributes<HTMLElement>;

    // Image and multimedia
    area: AreaHTMLAttributes<HTMLAreaElement>;
    audio: AudioHTMLAttributes<HTMLAudioElement>;
    img: ImgHTMLAttributes<HTMLImageElement>;
    map: MapHTMLAttributes<HTMLMapElement>;
    track: TrackHTMLAttributes<HTMLTrackElement>;
    video: VideoHTMLAttributes<HTMLVideoElement>;

    // Embedded content
    embed: EmbedHTMLAttributes<HTMLEmbedElement>;
    iframe: IframeHTMLAttributes<HTMLIFrameElement>;
    object: ObjectHTMLAttributes<HTMLObjectElement>;
    param: ParamHTMLAttributes<HTMLParamElement>;
    picture: HTMLAttributes<HTMLPictureElement>;
    source: SourceHTMLAttributes<HTMLSourceElement>;

    // Scripting
    canvas: CanvasHTMLAttributes<HTMLCanvasElement>;
    script: ScriptHTMLAttributes<HTMLScriptElement>;

    // Table content
    caption: HTMLAttributes<HTMLTableCaptionElement>;
    col: ColHTMLAttributes<HTMLTableColElement>;
    colgroup: ColgroupHTMLAttributes<HTMLTableColElement>;
    table: TableHTMLAttributes<HTMLTableElement>;
    tbody: HTMLAttributes<HTMLTableSectionElement>;
    td: TdHTMLAttributes<HTMLTableDataCellElement>;
    tfoot: HTMLAttributes<HTMLTableSectionElement>;
    th: ThHTMLAttributes<HTMLTableHeaderCellElement>;
    thead: HTMLAttributes<HTMLTableSectionElement>;
    tr: HTMLAttributes<HTMLTableRowElement>;

    // Forms
    button: ButtonHTMLAttributes<HTMLButtonElement>;
    datalist: HTMLAttributes<HTMLDataListElement>;
    fieldset: FieldsetHTMLAttributes<HTMLFieldSetElement>;
    form: FormHTMLAttributes<HTMLFormElement>;
    input: InputHTMLAttributes<HTMLInputElement>;
    label: LabelHTMLAttributes<HTMLLabelElement>;
    legend: HTMLAttributes<HTMLLegendElement>;
    meter: MeterHTMLAttributes<HTMLMeterElement>;
    optgroup: OptgroupHTMLAttributes<HTMLOptGroupElement>;
    option: OptionHTMLAttributes<HTMLOptionElement>;
    output: OutputHTMLAttributes<HTMLOutputElement>;
    progress: ProgressHTMLAttributes<HTMLProgressElement>;
    select: SelectHTMLAttributes<HTMLSelectElement>;
    textarea: TextareaHTMLAttributes<HTMLTextAreaElement>;

    // Interactive elements
    details: DetailsHTMLAttributes<HTMLDetailsElement>;
    dialog: DialogHTMLAttributes<HTMLDialogElement>;
    menu: MenuHTMLAttributes<HTMLMenuElement>;
    summary: HTMLAttributes<HTMLElement>;

    // Web components
    slot: SlotHTMLAttributes<HTMLSlotElement>;
    template: HTMLAttributes<HTMLTemplateElement>;
  }

  export interface ElementChildrenAttribute {
    children: {};
  }

  // Utility type to allow reactive function props
  type MaybeReactive<T> = T | (() => T);

  // Base attributes
  interface HTMLAttributes<T = HTMLElement> extends AriaAttributes, DOMAttributes<T> {
    // Standard HTML attributes
    accesskey?: MaybeReactive<string>;
    class?: MaybeReactive<string>;
    className?: MaybeReactive<string>;
    contenteditable?: MaybeReactive<boolean | "true" | "false" | "inherit">;
    contextmenu?: MaybeReactive<string>;
    dir?: MaybeReactive<"ltr" | "rtl" | "auto">;
    draggable?: MaybeReactive<boolean | "true" | "false">;
    hidden?: MaybeReactive<boolean>;
    id?: MaybeReactive<string>;
    lang?: MaybeReactive<string>;
    spellcheck?: MaybeReactive<boolean | "true" | "false">;
    style?: MaybeReactive<string | Partial<CSSStyleDeclaration>>;
    tabindex?: MaybeReactive<number | string>;
    title?: MaybeReactive<string>;
    translate?: MaybeReactive<"yes" | "no">;

    // Unknown
    inputmode?: MaybeReactive<"none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search">;
    is?: MaybeReactive<string>;
    radiogroup?: MaybeReactive<string>;

    // WAI-ARIA
    role?: MaybeReactive<string>;

    // RDFa attributes
    about?: MaybeReactive<string>;
    datatype?: MaybeReactive<string>;
    inlist?: MaybeReactive<any>;
    prefix?: MaybeReactive<string>;
    property?: MaybeReactive<string>;
    resource?: MaybeReactive<string>;
    typeof?: MaybeReactive<string>;
    vocab?: MaybeReactive<string>;

    // Non-standard attributes
    autocapitalize?: MaybeReactive<string>;
    autocorrect?: MaybeReactive<string>;
    autosave?: MaybeReactive<string>;
    color?: MaybeReactive<string>;
    itemprop?: MaybeReactive<string>;
    itemscope?: MaybeReactive<boolean>;
    itemtype?: MaybeReactive<string>;
    itemid?: MaybeReactive<string>;
    itemref?: MaybeReactive<string>;
    results?: MaybeReactive<number>;
    security?: MaybeReactive<string>;
    unselectable?: MaybeReactive<"on" | "off">;

    // Children
    children?: Child;
  }

  // Event handlers (camelCase, React-style)
  interface DOMAttributes<T = Element> {
    // Clipboard events
    onCopy?: (event: ClipboardEvent) => void;
    onCut?: (event: ClipboardEvent) => void;
    onPaste?: (event: ClipboardEvent) => void;

    // Composition events
    onCompositionEnd?: (event: CompositionEvent) => void;
    onCompositionStart?: (event: CompositionEvent) => void;
    onCompositionUpdate?: (event: CompositionEvent) => void;

    // Focus events
    onFocus?: (event: FocusEvent) => void;
    onBlur?: (event: FocusEvent) => void;

    // Form events
    onChange?: (event: Event) => void;
    onInput?: (event: Event) => void;
    onReset?: (event: Event) => void;
    onSubmit?: (event: Event) => void;
    onInvalid?: (event: Event) => void;

    // Image events
    onLoad?: (event: Event) => void;
    onError?: (event: Event | string) => void;

    // Keyboard events
    onKeyDown?: (event: KeyboardEvent) => void;
    onKeyPress?: (event: KeyboardEvent) => void;
    onKeyUp?: (event: KeyboardEvent) => void;

    // Media events
    onAbort?: (event: Event) => void;
    onCanPlay?: (event: Event) => void;
    onCanPlayThrough?: (event: Event) => void;
    onDurationChange?: (event: Event) => void;
    onEmptied?: (event: Event) => void;
    onEncrypted?: (event: Event) => void;
    onEnded?: (event: Event) => void;
    onLoadedData?: (event: Event) => void;
    onLoadedMetadata?: (event: Event) => void;
    onLoadStart?: (event: Event) => void;
    onPause?: (event: Event) => void;
    onPlay?: (event: Event) => void;
    onPlaying?: (event: Event) => void;
    onProgress?: (event: Event) => void;
    onRateChange?: (event: Event) => void;
    onSeeked?: (event: Event) => void;
    onSeeking?: (event: Event) => void;
    onStalled?: (event: Event) => void;
    onSuspend?: (event: Event) => void;
    onTimeUpdate?: (event: Event) => void;
    onVolumeChange?: (event: Event) => void;
    onWaiting?: (event: Event) => void;

    // Mouse events
    onAuxClick?: (event: MouseEvent) => void;
    onClick?: (event: MouseEvent) => void;
    onContextMenu?: (event: MouseEvent) => void;
    onDoubleClick?: (event: MouseEvent) => void;
    onDrag?: (event: DragEvent) => void;
    onDragEnd?: (event: DragEvent) => void;
    onDragEnter?: (event: DragEvent) => void;
    onDragExit?: (event: DragEvent) => void;
    onDragLeave?: (event: DragEvent) => void;
    onDragOver?: (event: DragEvent) => void;
    onDragStart?: (event: DragEvent) => void;
    onDrop?: (event: DragEvent) => void;
    onMouseDown?: (event: MouseEvent) => void;
    onMouseEnter?: (event: MouseEvent) => void;
    onMouseLeave?: (event: MouseEvent) => void;
    onMouseMove?: (event: MouseEvent) => void;
    onMouseOut?: (event: MouseEvent) => void;
    onMouseOver?: (event: MouseEvent) => void;
    onMouseUp?: (event: MouseEvent) => void;

    // Selection events
    onSelect?: (event: Event) => void;

    // Touch events
    onTouchCancel?: (event: TouchEvent) => void;
    onTouchEnd?: (event: TouchEvent) => void;
    onTouchMove?: (event: TouchEvent) => void;
    onTouchStart?: (event: TouchEvent) => void;

    // Pointer events
    onPointerDown?: (event: PointerEvent) => void;
    onPointerMove?: (event: PointerEvent) => void;
    onPointerUp?: (event: PointerEvent) => void;
    onPointerCancel?: (event: PointerEvent) => void;
    onPointerEnter?: (event: PointerEvent) => void;
    onPointerLeave?: (event: PointerEvent) => void;
    onPointerOver?: (event: PointerEvent) => void;
    onPointerOut?: (event: PointerEvent) => void;

    // UI events
    onScroll?: (event: Event) => void;

    // Wheel events
    onWheel?: (event: WheelEvent) => void;

    // Animation events
    onAnimationStart?: (event: AnimationEvent) => void;
    onAnimationEnd?: (event: AnimationEvent) => void;
    onAnimationIteration?: (event: AnimationEvent) => void;

    // Transition events
    onTransitionEnd?: (event: TransitionEvent) => void;
  }

  // ARIA attributes
  interface AriaAttributes {
    "aria-activedescendant"?: string;
    "aria-atomic"?: boolean | "true" | "false";
    "aria-autocomplete"?: "none" | "inline" | "list" | "both";
    "aria-busy"?: boolean | "true" | "false";
    "aria-checked"?: boolean | "true" | "false" | "mixed";
    "aria-colcount"?: number;
    "aria-colindex"?: number;
    "aria-colspan"?: number;
    "aria-controls"?: string;
    "aria-current"?: boolean | "true" | "false" | "page" | "step" | "location" | "date" | "time";
    "aria-describedby"?: string;
    "aria-details"?: string;
    "aria-disabled"?: boolean | "true" | "false";
    "aria-dropeffect"?: "none" | "copy" | "execute" | "link" | "move" | "popup";
    "aria-errormessage"?: string;
    "aria-expanded"?: boolean | "true" | "false";
    "aria-flowto"?: string;
    "aria-grabbed"?: boolean | "true" | "false";
    "aria-haspopup"?: boolean | "true" | "false" | "menu" | "listbox" | "tree" | "grid" | "dialog";
    "aria-hidden"?: boolean | "true" | "false";
    "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
    "aria-keyshortcuts"?: string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
    "aria-level"?: number;
    "aria-live"?: "off" | "assertive" | "polite";
    "aria-modal"?: boolean | "true" | "false";
    "aria-multiline"?: boolean | "true" | "false";
    "aria-multiselectable"?: boolean | "true" | "false";
    "aria-orientation"?: "horizontal" | "vertical";
    "aria-owns"?: string;
    "aria-placeholder"?: string;
    "aria-posinset"?: number;
    "aria-pressed"?: boolean | "true" | "false" | "mixed";
    "aria-readonly"?: boolean | "true" | "false";
    "aria-relevant"?: "additions" | "additions text" | "all" | "removals" | "text";
    "aria-required"?: boolean | "true" | "false";
    "aria-roledescription"?: string;
    "aria-rowcount"?: number;
    "aria-rowindex"?: number;
    "aria-rowspan"?: number;
    "aria-selected"?: boolean | "true" | "false";
    "aria-setsize"?: number;
    "aria-sort"?: "none" | "ascending" | "descending" | "other";
    "aria-valuemax"?: number;
    "aria-valuemin"?: number;
    "aria-valuenow"?: number;
    "aria-valuetext"?: string;
  }

  // Specific element attributes
  interface AnchorHTMLAttributes<T = HTMLAnchorElement> extends HTMLAttributes<T> {
    download?: any;
    href?: string;
    hreflang?: string;
    media?: string;
    ping?: string;
    rel?: string;
    target?: "_self" | "_blank" | "_parent" | "_top";
    type?: string;
    referrerpolicy?: string;
  }

  interface AudioHTMLAttributes<T = HTMLAudioElement> extends MediaHTMLAttributes<T> {}

  interface AreaHTMLAttributes<T = HTMLAreaElement> extends HTMLAttributes<T> {
    alt?: string;
    coords?: string;
    download?: any;
    href?: string;
    hreflang?: string;
    media?: string;
    referrerpolicy?: string;
    rel?: string;
    shape?: string;
    target?: string;
  }

  interface ButtonHTMLAttributes<T = HTMLButtonElement> extends HTMLAttributes<T> {
    autofocus?: boolean;
    disabled?: boolean;
    form?: string;
    formaction?: string;
    formenctype?: string;
    formmethod?: string;
    formnovalidate?: boolean;
    formtarget?: string;
    name?: string;
    type?: "submit" | "reset" | "button";
    value?: string | string[] | number;
  }

  interface CanvasHTMLAttributes<T = HTMLCanvasElement> extends HTMLAttributes<T> {
    height?: number | string;
    width?: number | string;
  }

  interface ColHTMLAttributes<T = HTMLTableColElement> extends HTMLAttributes<T> {
    span?: number;
    width?: number | string;
  }

  interface ColgroupHTMLAttributes<T = HTMLTableColElement> extends HTMLAttributes<T> {
    span?: number;
  }

  interface DetailsHTMLAttributes<T = HTMLDetailsElement> extends HTMLAttributes<T> {
    open?: boolean;
  }

  interface DialogHTMLAttributes<T = HTMLDialogElement> extends HTMLAttributes<T> {
    open?: boolean;
  }

  interface EmbedHTMLAttributes<T = HTMLEmbedElement> extends HTMLAttributes<T> {
    height?: number | string;
    src?: string;
    type?: string;
    width?: number | string;
  }

  interface FieldsetHTMLAttributes<T = HTMLFieldSetElement> extends HTMLAttributes<T> {
    disabled?: boolean;
    form?: string;
    name?: string;
  }

  interface FormHTMLAttributes<T = HTMLFormElement> extends HTMLAttributes<T> {
    acceptcharset?: string;
    action?: string;
    autocomplete?: string;
    enctype?: string;
    method?: string;
    name?: string;
    novalidate?: boolean;
    target?: string;
  }

  interface IframeHTMLAttributes<T = HTMLIFrameElement> extends HTMLAttributes<T> {
    allow?: string;
    allowfullscreen?: boolean;
    allowtransparency?: boolean;
    height?: number | string;
    loading?: "eager" | "lazy";
    name?: string;
    referrerpolicy?: string;
    sandbox?: string;
    src?: string;
    srcdoc?: string;
    width?: number | string;
  }

  interface ImgHTMLAttributes<T = HTMLImageElement> extends HTMLAttributes<T> {
    alt?: string;
    crossorigin?: "anonymous" | "use-credentials" | "";
    decoding?: "async" | "auto" | "sync";
    height?: number | string;
    loading?: "eager" | "lazy";
    referrerpolicy?: string;
    sizes?: string;
    src?: string;
    srcset?: string;
    usemap?: string;
    width?: number | string;
  }

  interface InputHTMLAttributes<T = HTMLInputElement> extends HTMLAttributes<T> {
    accept?: string;
    alt?: string;
    autocomplete?: string;
    autofocus?: boolean;
    capture?: boolean | string;
    checked?: boolean;
    crossorigin?: string;
    disabled?: boolean;
    form?: string;
    formaction?: string;
    formenctype?: string;
    formmethod?: string;
    formnovalidate?: boolean;
    formtarget?: string;
    height?: number | string;
    list?: string;
    max?: number | string;
    maxlength?: number;
    min?: number | string;
    minlength?: number;
    multiple?: boolean;
    name?: string;
    pattern?: string;
    placeholder?: string;
    readonly?: boolean;
    required?: boolean;
    size?: number;
    src?: string;
    step?: number | string;
    type?: string;
    value?: string | string[] | number;
    width?: number | string;
  }

  interface LabelHTMLAttributes<T = HTMLLabelElement> extends HTMLAttributes<T> {
    for?: string;
    form?: string;
  }

  interface LiHTMLAttributes<T = HTMLLIElement> extends HTMLAttributes<T> {
    value?: string | string[] | number;
  }

  interface MapHTMLAttributes<T = HTMLMapElement> extends HTMLAttributes<T> {
    name?: string;
  }

  interface MenuHTMLAttributes<T = HTMLMenuElement> extends HTMLAttributes<T> {
    type?: string;
  }

  interface MediaHTMLAttributes<T = HTMLMediaElement> extends HTMLAttributes<T> {
    autoplay?: boolean;
    controls?: boolean;
    controlslist?: string;
    crossorigin?: string;
    loop?: boolean;
    mediagroup?: string;
    muted?: boolean;
    playsinline?: boolean;
    preload?: string;
    src?: string;
  }

  interface MeterHTMLAttributes<T = HTMLMeterElement> extends HTMLAttributes<T> {
    form?: string;
    high?: number;
    low?: number;
    max?: number | string;
    min?: number | string;
    optimum?: number;
    value?: string | string[] | number;
  }

  interface ObjectHTMLAttributes<T = HTMLObjectElement> extends HTMLAttributes<T> {
    classid?: string;
    data?: string;
    form?: string;
    height?: number | string;
    name?: string;
    type?: string;
    usemap?: string;
    width?: number | string;
    wmode?: string;
  }

  interface OptgroupHTMLAttributes<T = HTMLOptGroupElement> extends HTMLAttributes<T> {
    disabled?: boolean;
    label?: string;
  }

  interface OptionHTMLAttributes<T = HTMLOptionElement> extends HTMLAttributes<T> {
    disabled?: boolean;
    label?: string;
    selected?: boolean;
    value?: string | string[] | number;
  }

  interface OutputHTMLAttributes<T = HTMLOutputElement> extends HTMLAttributes<T> {
    form?: string;
    for?: string;
    name?: string;
  }

  interface ParamHTMLAttributes<T = HTMLParamElement> extends HTMLAttributes<T> {
    name?: string;
    value?: string | string[] | number;
  }

  interface ProgressHTMLAttributes<T = HTMLProgressElement> extends HTMLAttributes<T> {
    max?: number | string;
    value?: string | string[] | number;
  }

  interface ScriptHTMLAttributes<T = HTMLScriptElement> extends HTMLAttributes<T> {
    async?: boolean;
    charset?: string;
    crossorigin?: string;
    defer?: boolean;
    integrity?: string;
    nomodule?: boolean;
    nonce?: string;
    referrerpolicy?: string;
    src?: string;
    type?: string;
  }

  interface SelectHTMLAttributes<T = HTMLSelectElement> extends HTMLAttributes<T> {
    autocomplete?: string;
    autofocus?: boolean;
    disabled?: boolean;
    form?: string;
    multiple?: boolean;
    name?: string;
    required?: boolean;
    size?: number;
    value?: string | string[] | number;
  }

  interface SlotHTMLAttributes<T = HTMLSlotElement> extends HTMLAttributes<T> {
    name?: string;
  }

  interface SourceHTMLAttributes<T = HTMLSourceElement> extends HTMLAttributes<T> {
    media?: string;
    sizes?: string;
    src?: string;
    srcset?: string;
    type?: string;
  }

  interface TableHTMLAttributes<T = HTMLTableElement> extends HTMLAttributes<T> {
    cellpadding?: number | string;
    cellspacing?: number | string;
    summary?: string;
  }

  interface TdHTMLAttributes<T = HTMLTableDataCellElement> extends HTMLAttributes<T> {
    align?: "left" | "center" | "right" | "justify" | "char";
    colspan?: number;
    headers?: string;
    rowspan?: number;
    scope?: string;
    valign?: "top" | "middle" | "bottom" | "baseline";
  }

  interface TextareaHTMLAttributes<T = HTMLTextAreaElement> extends HTMLAttributes<T> {
    autocomplete?: string;
    autofocus?: boolean;
    cols?: number;
    dirname?: string;
    disabled?: boolean;
    form?: string;
    maxlength?: number;
    minlength?: number;
    name?: string;
    placeholder?: string;
    readonly?: boolean;
    required?: boolean;
    rows?: number;
    value?: string | string[] | number;
    wrap?: string;
  }

  interface ThHTMLAttributes<T = HTMLTableHeaderCellElement> extends HTMLAttributes<T> {
    align?: "left" | "center" | "right" | "justify" | "char";
    colspan?: number;
    headers?: string;
    rowspan?: number;
    scope?: string;
    abbr?: string;
  }

  interface TrackHTMLAttributes<T = HTMLTrackElement> extends HTMLAttributes<T> {
    default?: boolean;
    kind?: string;
    label?: string;
    src?: string;
    srclang?: string;
  }

  interface VideoHTMLAttributes<T = HTMLVideoElement> extends MediaHTMLAttributes<T> {
    height?: number | string;
    playsinline?: boolean;
    poster?: string;
    width?: number | string;
    disablepictureinpicture?: boolean;
  }
}

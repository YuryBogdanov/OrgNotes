// @panopticon/api (ТЗ 26, roadmap 1.1): the only module a plugin sees. Types and `definePlugin`; the plugin gets its
// `ctx` from the core when it is activated. Every call is asynchronous or gives back a Dispose, and only data goes
// in and out (JSON, HeadingRef, Date): no object of the core leaves it, so the plugins can later run isolated.

export const API_VERSION = '1.0.0';

export type Dispose = () => void;
export type Values = Record<string, unknown>;

export interface Plugin {
  activate(ctx: Ctx): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
/** The plugin's module exports it as default: `export default definePlugin({ activate(ctx) { … } })`. */
export const definePlugin = (p: Plugin): Plugin => p;

// ---- data ---------------------------------------------------------------------------------------------------------

/** A heading: its file (relative to the notes folder), line and title. The core finds it by the title if it moved. */
export interface HeadingRef {
  path: string;
  line: number;
  title: string;
}
export interface OrgDate {
  y: number;
  m: number;
  d: number;
  time?: string;
}
export interface HeadingInfo {
  ref: HeadingRef;
  level: number;
  keyword: string | null;
  done: boolean;
  priority: string | null;
  title: string;
  /** Own, inherited and the file's. */
  tags: string[];
  scheduled?: OrgDate;
  deadline?: OrgDate;
  closed?: OrgDate;
}
export interface FileInfo {
  path: string;
  title: string;
}
/** A date of a condition, counted from today. */
export type DateVal =
  | { kind: 'before' }
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'next'; n: number }
  | { kind: 'range'; from: string; to: string };
/**
 * A condition of the agenda builder (ТЗ 05), the same engine as the agenda's. `op` by field: status — in / notin
 * (values: keywords «TODO», or «Набор␟TODO»); done — yes / no; tag, title — has / hasnot (values / text); priority —
 * eq / higher / lower / none (prio); scheduled, deadline — eq / before / after / none (date); path — in / notin.
 */
export interface Cond {
  field: 'status' | 'scheduled' | 'deadline' | 'tag' | 'priority' | 'path' | 'title' | 'done';
  op: string;
  values?: string[];
  date?: DateVal;
  prio?: string;
  text?: string;
}
export interface Query {
  /** Files or folders (relative); none: every file of the notes folder. */
  sources?: string[];
  conds: Cond[];
  sort?: 'prio' | 'scheduled' | 'deadline' | 'age' | 'alpha';
}

// ---- ctx ----------------------------------------------------------------------------------------------------------

/** A view's or a section's drawing: the core gives an empty element, the plugin draws in it and cleans up. */
export type Render<S = void> = (el: HTMLElement, state: S, tab: TabHandle<S>) => Dispose | void;
export interface TabHandle<S> {
  id: string;
  /** Change the tab's state: kept with the layout after a restart. */
  setState(state: S): void;
}
export interface ViewSpec<S> {
  /** The tab's name. */
  title(state: S): string;
  /** The toolbar's path while the tab is active. */
  crumbs?(state: S): string[];
  render: Render<S>;
  /** The state read back after a restart (checked; a default when wrong). */
  restore?(raw: unknown): S;
}
export interface Tx {
  setStatus(h: HeadingRef, keyword: string | null): void;
  setPlanning(h: HeadingRef, kind: 'SCHEDULED' | 'DEADLINE', date: Date | null): void;
  setTags(h: HeadingRef, tags: string[]): void;
  setProperty(h: HeadingRef, key: string, value: string | null): void;
  /** Org text of one heading with its subtree, its stars relevelled to the place. */
  insertHeading(at: { under: HeadingRef; position: 'first' | 'last' } | { file: string; position: 'top' | 'end' }, org: string): void;
  /** The text under the heading (after its planning and drawers), up to its first subheading. */
  replaceBody(h: HeadingRef, org: string): void;
  move(h: HeadingRef, to: { under: HeadingRef } | { file: string }): void;
  remove(h: HeadingRef): void;
  /** The file changed by the plugin's own function (its own structure in the file, ТЗ 27): null leaves it. */
  update(path: string, fn: (text: string) => string | null): void;
}
export interface Store {
  get<T>(): T | undefined;
  set<T>(value: T): Promise<void>;
  onChange(fn: () => void): Dispose;
}
export type EventName = 'file.changed' | 'heading.changed' | 'tab.active' | 'day.changed' | 'theme.changed' | 'folder.changed';
export interface Opt {
  value: string | number | boolean | null;
  label: string;
  disabled?: boolean;
}

// ---- the core's sheets and the review (§5.2) -----------------------------------------------------------------

/** A field of a form (the same kinds as in the settings by schema). */
export type FormField =
  | { type: 'choice'; key: string; label: string; hint?: string; look: 'segments' | 'menu'; options: Opt[] }
  | { type: 'switch'; key: string; label: string; hint?: string }
  | { type: 'text'; key: string; label: string; hint?: string; placeholder?: string }
  | { type: 'file'; key: string; label: string; hint?: string }
  | { type: 'pair'; key: string; key2: string; label: string; hint?: string; labels: [string, string]; options: [Opt[], Opt[]] }
  // ТЗ 27 §2.4: under their label, across the sheet
  /** Lines; ↩ goes on a «- » list, ⇥ moves its item. */
  | { type: 'textarea'; key: string; label: string; hint?: string; placeholder?: string }
  /** A day as «yyyy-mm-dd» (null: none): the calendar of three months in the form, or a chip that opens it. */
  | { type: 'date'; key: string; label: string; hint?: string; look: 'inline' | 'chip'; clear?: string }
  /** A file and its heading, in two columns: { path, heading } (heading null: only the file chosen; `create: true`:
   *  the heading `create` offered). */
  | {
      type: 'place'; key: string; label: string; hint?: string; levels?: number[]; fileCap?: string; headCap?: string;
      note?(path: string): { text: string; dim?: boolean };
      headNote?(path: string, title: string): string;
      create?(path: string): string | null;
    }
  /** Drawn by the plugin. */
  | { type: 'custom'; key: string; label: string; hint?: string; render(el: HTMLElement, ctrl: FieldCtrl): Dispose | void };
export interface FormCtrl {
  values(): Values;
  set(key: string, v: unknown): void;
  onChange(fn: (v: Values) => void): Dispose;
}
export interface FieldCtrl {
  value(): unknown;
  values(): Values;
  set(v: unknown): void;
  onChange(fn: (v: Values) => void): Dispose;
}
export interface FormSpec {
  title: string;
  groups: { caption?: string; fields: FormField[]; help?: string }[];
  /** The button that sends it («Создать»). */
  submit: string;
  initial?: Values;
  /** Why the values cannot go (shown, the sheet stays); null: they can. */
  validate?(v: Values): string | null;
  /** A value changed: what else to set (a file chosen gives a name). */
  onChange?(changed: string, v: Values): Values | void;
  /** Right of the sheet's title («Квартал Q4 2026 ⌄»). */
  headerExtra?(el: HTMLElement, form: FormCtrl): Dispose | void;
}
export interface SheetSpec {
  title: string;
  render: (el: HTMLElement, sheet: { close(button?: string): void }) => Dispose | void;
  /** The plugin draws the whole sheet (its header, body, footer, keys); the core gives the dimmed window, the place
   *  over it and «a sheet is open» (ТЗ 27: the goals' own sheets as they were). */
  bare?: boolean;
  /** At the bottom, right to left as written; the primary one on ↩. */
  buttons?: { id: string; label: string; primary?: boolean }[];
  /** A line at the bottom left. */
  note?: string;
}
export interface MenuItem {
  label: string;
  run(): void;
  danger?: boolean;
  disabled?: boolean;
}
export interface ChooseItem {
  id: string;
  label: string;
  hint?: string;
}
export type Named = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'gray';
export interface StatusSet {
  name: string;
  states: { name: string; done: boolean }[];
}
/** A place: a file, or a heading in it. */
export type Place = { path: string } | HeadingRef;
export interface ReviewAction {
  id: string;
  label: string;
  /** A command of the manifest in `"scope": "review"`: its keys run the action. */
  command?: string;
  /** A word after the label («COMPLETED»). */
  sub?: string;
  /** The look: the main one, a «done» one (green). */
  kind?: 'primary' | 'ok';
  /** Not now (no text of the mark yet, the goal is closed already). */
  disabled?(h: HeadingInfo): boolean;
  /** What it does to the heading: then the next card, or this one again. */
  run(h: HeadingInfo): 'next' | 'stay' | Promise<'next' | 'stay'>;
}
/** What a part of the card is drawn for: the heading now, and the card's place in the queue. */
export interface ReviewCard {
  heading: HeadingInfo;
  index: number;
  total: number;
}
/** A card's part drawn by the plugin: drawn again for each card (and when `redraw()` asks). */
export type CardRender = (el: HTMLElement, card: ReviewCard) => Dispose | void;
export interface ReviewSpec {
  title: string;
  items: HeadingRef[];
  actions: ReviewAction[];
  /** A line in the card's header after «3 из 7». */
  header?(h: HeadingInfo): string;
  /** Something under the card. */
  below?: Render<HeadingRef>;
  // ---- ТЗ 27 §2.3: a review of its own on the core's frame ----
  /** The card's header instead of «Разбор · 3 из 7 · file». */
  head?: CardRender;
  /** The strip of quick buttons under the header. */
  quick?: CardRender;
  /** A panel right of the narrowed editor. */
  aside?: CardRender;
  /** Lines folded in the narrowed editor, and a note at the end of a line («3 — справа»). */
  narrow?(h: HeadingInfo): { fold?: number[]; note?: { line: number; text: string } | null };
  /** The summary instead of «Разобрано N из M» (under «Разбор закончен»); `end()` closes the review. */
  summary?: (el: HTMLElement, r: ReviewResult & { end(): void }) => Dispose | void;
  /** No «Пропустить» (the plugin has its own «Следующая»). */
  noSkip?: boolean;
  /** Before the card changes (an action's «next», «Назад», a key): what is being written is saved. */
  beforeStep?(h: HeadingInfo): void | Promise<void>;
  /** The card's widest, px (820). */
  width?: number;
}
/** The review shown (from `ui.review`): move it, draw the card again. */
export interface ReviewHandle {
  step(d: 1 | -1): Promise<void>;
  /** The card's parts drawn again (they read the file anew). */
  redraw(): void;
  /** Only the bar read again (an action's `disabled` changed: a note typed). */
  update(): void;
}
export interface ReviewResult {
  total: number;
  /** The cards an action moved on from. */
  done: number;
  /** The queue went through (else the tab was closed before). */
  finished: boolean;
}

export interface NetResponse {
  status: number;
  ok: boolean;
  /** Lower-case names. */
  headers: Record<string, string>;
  text: string;
}

export interface Ctx {
  /** The plugin's manifest id. */
  id: string;
  commands: {
    /** The handler of a command the manifest declares. */
    on(id: string, run: (arg?: unknown) => void | Promise<void>): Dispose;
    /** Not offered in the palette, its keys do nothing, while off. */
    setAvailable(id: string, on: boolean): void;
    /** A command of the plugin, or of the core: `file.open` {path}, `heading.reveal` {ref}, `agenda.open`,
     *  `heading.status` {ref} (the palette's statuses for it; the heading's file is the one shown). */
    run(id: string, arg?: unknown): Promise<void>;
  };
  ui: {
    /** The section of the navigator the manifest declares. */
    navSection(id: string, render: Render): Dispose;
    /** A kind of tab the manifest declares. */
    view<S>(id: string, spec: ViewSpec<S>): Dispose;
    /** Open the view in the active editor (one tab of a kind per editor) or in the other one. */
    open<S>(viewId: string, state: S, where?: 'here' | 'beside'): Promise<void>;
    notify(text: string, actions?: { label: string; run(): void }[]): void;
    /** The core's sheet with the fields; null: cancelled. */
    form(spec: FormSpec): Promise<Values | null>;
    /** The choice of a file and a heading in it (or the file alone). */
    pickPlace(o?: { kind?: 'file' | 'heading'; title?: string; levels?: number[] }): Promise<Place | null>;
    /** The calendar of three months, as for SCHEDULED. */
    pickDate(o?: { initial?: Date; title?: string }): Promise<Date | null>;
    /** A review by cards in a tab: one heading at a time, narrowed; it ends when the queue is through or closed. */
    review(spec: ReviewSpec): Promise<ReviewResult>;
    /** The core's sheet with the plugin's content; the button pressed (null: ⎋). */
    sheet(spec: SheetSpec): Promise<string | null>;
    /** The core's context menu at a point of the window. */
    menu(items: MenuItem[], at: { x: number; y: number }): void;
    /** A choice from a list in the palette; null: ⎋. */
    choose(o: { title: string; placeholder?: string; items: ChooseItem[] }): Promise<string | null>;
    /** Close the tabs of a view of the plugin. */
    close(viewId: string): void;
    /** A control of the core in the plugin's element: the calendar of three months, the choice of a place in
     *  columns, lines with lists — as the form's fields. `set` changes its value from outside. */
    widget(el: HTMLElement, field: FormField, value: unknown, onChange: (v: unknown) => void): { set(v: unknown): void; dispose(): void };
    /** The review shown now (its parts move and redraw it); null when there is none of the plugin's. */
    currentReview(): ReviewHandle | null;
  };
  /** Needs `index.read`. */
  index?: {
    query(q: Query): Promise<HeadingInfo[]>;
    heading(ref: HeadingRef): Promise<HeadingInfo | null>;
    outline(path: string): Promise<HeadingInfo[]>;
    files(): Promise<FileInfo[]>;
    /** The named colour of a status in the sets of the file (the plugin draws with var(--p-<colour>)). */
    statusTone(keyword: string, path: string): Promise<Named | null>;
    /** The statuses the file knows: open and done keywords (for `@panopticon/api/org`). */
    workflow(path: string): Promise<{ open: string[]; done: string[] }>;
  };
  /** Needs `files.read` (or `files.edit`). */
  files?: { read(path: string): Promise<string> };
  /** Needs `files.edit`. One step of ⌘Z, as an edit by hand. */
  edit?: {
    transaction(label: string, build: (tx: Tx) => void, o?: { onUndo?(): void }): Promise<'ok' | 'conflict' | 'error'>;
  };
  /** The plugin's own: in the notes folder (goes with the notes) and on this Mac. */
  storage: { folder: Store; local: Store };
  events: { on(e: EventName, fn: (payload: unknown) => void): Dispose };
  /** Needs `clipboard`. */
  clipboard?: { write(text: string): Promise<void> };
  /** Needs `net`: only to the hosts of the manifest's `net` («jira.company.ru», «*.company.ru»); 30 s, 10 MB. */
  net?: { fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<NetResponse> };
  /** Sets of statuses from code (they replace the plugin's earlier ones; [] none); the manifest's stay. */
  statusSets: { set(defs: StatusSet[]): void };
  /** The values of the settings the manifest declares. */
  settings: {
    values(): Values;
    onChange(fn: (v: Values) => void): Dispose;
    /** What a declared field shows that depends on the values: its options, its hint. */
    dynamic(key: string, spec: { options?(v: Values): Opt[]; hint?(v: Values): string }): Dispose;
  };
}

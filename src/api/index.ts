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

export interface Ctx {
  /** The plugin's manifest id. */
  id: string;
  commands: {
    /** The handler of a command the manifest declares. */
    on(id: string, run: (arg?: unknown) => void | Promise<void>): Dispose;
    /** A command of the plugin, or of the core: `file.open` {path}, `heading.reveal` {ref}, `agenda.open`. */
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
  };
  /** Needs `index.read`. */
  index?: {
    query(q: Query): Promise<HeadingInfo[]>;
    heading(ref: HeadingRef): Promise<HeadingInfo | null>;
    outline(path: string): Promise<HeadingInfo[]>;
    files(): Promise<FileInfo[]>;
  };
  /** Needs `files.read` (or `files.edit`). */
  files?: { read(path: string): Promise<string> };
  /** Needs `files.edit`. One step of ⌘Z, as an edit by hand. */
  edit?: { transaction(label: string, build: (tx: Tx) => void): Promise<'ok' | 'conflict' | 'error'> };
  /** The plugin's own: in the notes folder (goes with the notes) and on this Mac. */
  storage: { folder: Store; local: Store };
  events: { on(e: EventName, fn: (payload: unknown) => void): Dispose };
  /** The values of the settings the manifest declares. */
  settings: {
    values(): Values;
    onChange(fn: (v: Values) => void): Dispose;
    /** What a declared field shows that depends on the values: its options, its hint. */
    dynamic(key: string, spec: { options?(v: Values): Opt[]; hint?(v: Values): string }): Dispose;
  };
}

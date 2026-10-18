// Registries of the shell (roadmap 0.3): what a feature adds to the window — a kind of tab, a section of the
// navigator, a section of the settings — it registers here, and the shell (layout, panes, navigator, settings) draws
// it without knowing the feature. Plain data: the components are given by the features, the order by numbers.

import type { Component } from 'svelte';
import type { Tab } from './layout';
import type { Schema } from './settingsSchema';
import { SvelteMap } from 'svelte/reactivity';

/** A kind of tab a feature shows (the calendar, the goals, a review). Its state lives in `tab.data`. */
export interface ViewSpec {
  kind: string;
  /** The tab's name (a file tab has its file's). */
  label(t: Tab): string;
  /** An SVG path (viewBox 0 0 20 20) for the tab and the lists of tabs. */
  icon: string;
  /** What the pane shows for the tab. */
  component: Component<any>; // given { tab, pane }
  /** The toolbar's path while the tab is active: «Календарь › Октябрь 2026». */
  crumbs?(t: Tab): string[];
  /** The inspector's content while the tab is active (none: the inspector of the file). */
  inspector?: Component;
  /** Whether the tab has it now (a plugin's view: once its code says so); by default it has. */
  hasInspector?(t: Tab): boolean;
  /** A session (a review): not kept after a restart. */
  transient?: boolean;
  /** The file the tab is about (a card's file): what the inspector and the commands of a heading work on. */
  fileOf?(t: Tab): string | undefined;
  /** The state kept after a restart, checked when read back (null: the default). */
  restore?(data: unknown): unknown;
  /** Not offered for «Продублировать в соседнем редакторе». */
  single?: boolean;
  /** Stays the first tab of the left pane: not moved, not duplicated, nothing goes before it («Сегодня»). */
  pinned?: boolean;
  /** Called when the last tab of the kind is closed (a review ends). */
  onGone?(): void;
  /** Unsaved: a dot on the tab (the agenda builder's, ТЗ 48 §5). */
  dirty?(t: Tab): boolean;
}
// reactive: a plugin's kinds, sections and commands come and go while the window is open (roadmap 1.1)
const views = new SvelteMap<string, ViewSpec>();
/** Registers it; the returned function takes it back (a plugin turned off). */
export function registerView(v: ViewSpec) {
  views.set(v.kind, v);
  return () => void (views.get(v.kind) === v && views.delete(v.kind));
}
export const viewOf = (kind: string | undefined) => (kind ? views.get(kind) : undefined);
export const allViews = () => [...views.values()];

/** A section of the navigator (its mode), with its place in the bar and its shortcut. */
export interface NavSpec {
  id: string;
  label: string;
  icon: string;
  /** The command that shows it (its shortcut is shown in the tip). */
  key?: string;
  /** The place in the bar: Файлы 0, Inbox 10, Агенда 30, Цели 40, Календарь 50, Теги 60, Поиск 70. */
  order: number;
  component: Component;
  /** A number on the button (the Inbox's count); 0 shows nothing. */
  badge?(): number;
  /** The number is an alarm (`ui.setBadge(…, { tone: 'alert' })`, ТЗ 43 §1): red in the new sidebar. */
  alert?(): boolean;
}
const navs = new SvelteMap<string, NavSpec>();
export function registerNav(n: NavSpec) {
  navs.set(n.id, n);
  return () => void (navs.get(n.id) === n && navs.delete(n.id));
}
export const navOf = (id: string) => navs.get(id);
export const allNavs = () => [...navs.values()];

/** A section of the settings sheet. */
export interface SettingsSpec {
  id: string;
  icon: string;
  /** The place in the column: Основные 0, Оформление 10, Статусы 20, Теги 30, Агенды 40, Календарь 50, Inbox 60, Файлы 70, Клавиши 80. */
  order: number;
  /** Its own component, or a schema the core draws (roadmap 0.6). */
  component?: Component;
  schema?: Schema;
  /** A dot by its name: something waits there (updates of plugins, ТЗ 37). */
  dot?(): boolean;
  /** The plugin whose section it is: under «НАСТРОЙКИ ПЛАГИНОВ», with the plugin's head. */
  plugin?: string;
}
const sections = new SvelteMap<string, SettingsSpec>();
export function registerSettings(s: SettingsSpec) {
  sections.set(s.id, s);
  return () => void (sections.get(s.id) === s && sections.delete(s.id));
}
export const settingsOf = (id: string) => sections.get(id);
export const allSettings = () => [...sections.values()];

/** A block a feature adds to another section of the settings, drawn from its schema («Цели квартала» in «Агенды»). */
export interface SettingsBlockSpec {
  section: string;
  order: number;
  schema: Schema;
}
const blocks = new SvelteMap<string, SettingsBlockSpec>();
export function registerSettingsBlock(b: SettingsBlockSpec) {
  blocks.set(b.schema.id, b);
  return () => void (blocks.get(b.schema.id) === b && blocks.delete(b.schema.id));
}
export const blocksOf = (section: string) => [...blocks.values()].filter((b) => b.section === section).sort((a, b) => a.order - b.order);

/** A command's action (a plugin's): run by its keys, the palette and «commands.run». */
const actions = new SvelteMap<string, () => void>();
export function registerAction(id: string, run: () => void) {
  actions.set(id, run);
  return () => void (actions.get(id) === run && actions.delete(id));
}
export const actionOf = (id: string) => actions.get(id);

/** A kind of tab renamed (a feature became a plugin, ТЗ 27): the old name read as the new; '' — not kept. */
const kindAliases = new Map<string, string>();
export function registerKindAlias(from: string, to: string) {
  kindAliases.set(from, to);
}
export const kindAlias = (kind: string) => (kindAliases.has(kind) ? kindAliases.get(kind)! : kind);

/** A view of a file (ТЗ 33): a file tab shown otherwise than as text («Доска»); a plugin's, by its manifest. */
export interface FileViewSpec {
  id: string;
  /** «Доска»: in «Показать как ›». */
  title: string;
  icon: string;
  /** The command that switches to it and back (its key is shown in the menu). */
  key?: string;
  /** What the pane shows for the file; given { id, path, tab }. */
  component: Component<any>;
  /** A file opened the first time is shown so («#+BOARD» in it). */
  defaultFor?(f: { name: string; text: string }): boolean;
}
const fileViews = new SvelteMap<string, FileViewSpec>();
export function registerFileView(v: FileViewSpec) {
  fileViews.set(v.id, v);
  return () => void (fileViews.get(v.id) === v && fileViews.delete(v.id));
}
export const fileViewOf = (id: string | undefined) => (id ? fileViews.get(id) : undefined);
export const allFileViews = () => [...fileViews.values()];

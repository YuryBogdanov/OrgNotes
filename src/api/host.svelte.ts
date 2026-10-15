// The host of the plugins (ТЗ 26 §4–5, roadmap 1.1): what the manifests of the plugins that are on declare is
// registered with the shell (sections, kinds of tabs, settings, palette commands, sets of statuses); `start` loads
// their code and gives each its `ctx`. Every call of a plugin's code runs inside a guard: an error turns the plugin
// off until the restart and takes back all it registered.

import { SvelteMap } from 'svelte/reactivity';
import { mount, unmount, untrack, type Component } from 'svelte';
import { store } from '../store.svelte';
import { newTab, openFile, openScoped, openView } from '../layout';
import { headingActions } from '../headingActions.svelte';
import { registerFileType } from '../fileTypes.svelte';
import { register as registerPalette } from '../commands';
import { registerAction, registerFileView, registerNav, registerSettings, registerSettingsBlock, registerView, actionOf } from '../views';
import { setLineLink } from '../lineLinks';
import PluginFileView from '../PluginFileView.svelte';
import PluginEditor from '../PluginEditor.svelte';
import type { MenuItem as CoreMenuItem } from '../ContextMenu.svelte';
import { registerTodayBlock } from '../todayBlocks';
import PluginTodayBlock from '../PluginTodayBlock.svelte';
import { fuzzy } from '../fuzzy';
import { DEFAULT_WORKFLOW, headingAt, namedFor, type WorkflowDef } from '../org';
import { parseTheme, type Theme } from '../themes';
import { displayName, isArchive } from '../names';
import type { Tx as CoreTx } from '../journal';
import type { Field, Group, Opt as CoreOpt, Schema, Values } from '../settingsSchema';
import { builtinEntries, declareKeys, entries, viewScope, installedEntries, readChoices, saveChoice, saveInstalled, undeclareKeys, type Entry, type Listed } from './declare';
import PluginsSettings from '../PluginsSettings.svelte';
import { hostAllowed, hostOf, iconOf, type Manifest, type ManifestSettings } from './manifest';
import type { MenuItem as ApiMenuItem, Ctx, Dispose, Named, SheetSpec, EventName, FormSpec, HeadingRef, Place, Plugin, Render, ReviewResult, ReviewSpec, Store, ViewSpec } from './index';
import PluginView from '../PluginView.svelte';
import PluginInspector from '../PluginInspector.svelte';
import PluginNav from '../PluginNav.svelte';
import PluginReview from '../PluginReview.svelte';
import { mountWidget } from './widgets.svelte';
import { lists } from '../taskLists.svelte';
import { bodyOf } from '../orgOps';
import { RIGHTS, rightsText, trust, trusted } from './trust';
import { apiRef, apiTx, coreRef, fileOf, findHeading, infoOf, type Change, type Changed } from './refs';
import { query } from './query';
import { coreCommand } from './coreCommands';
import { invoke, isTauri } from '../tauri';
export { RIGHTS, rightsText };

/** The data files of the built-in plugins (their themes), as text. */
const DATA = import.meta.glob('../plugins/*/**/*.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const MAINS = import.meta.glob('../plugins/*/main.ts') as Record<string, () => Promise<{ default: Plugin }>>;
const PLUG = 'M8 2.5v4M12 2.5v4M5.5 6.5h9v3a4.5 4.5 0 0 1-9 0zM10 14v3.5';

/** The kind of the tab of a plugin's review (one at a time). */
export const REVIEW_KIND = 'plugin.review';
export interface FormReq {
  plugin: string;
  spec: FormSpec;
  resolve: (v: Values | null) => void;
}
export interface PlaceReq {
  plugin: string;
  kind: 'file' | 'heading';
  title: string;
  levels?: number[];
  resolve: (p: Place | null) => void;
}
export interface ReviewRun {
  plugin: string;
  spec: ReviewSpec;
  refs: HeadingRef[];
  /** The card shown; -1: the summary. */
  cur: number;
  done: number;
  /** The cards an action moved on from (a card gone back to counts once). */
  doneAt: Set<number>;
  /** The queue set anew by the plugin with another heading at the card shown: the card is drawn anew. */
  gen: number;
  resolved: boolean;
  resolve: (r: ReviewResult) => void;
}

export interface ViewEntry {
  plugin: string;
  spec: ViewSpec<any>;
}

class Host {
  /** Every plugin known: the built-in ones, then the installed ones (as last listed). */
  entries = $state<Entry[]>(entries);
  /** What is registered now (declared, maybe running). */
  private declared = new Set<string>();
  /** The palette keeps its commands; one that has no action now is not offered. */
  private inPalette = new Set<string>();
  /** A palette's row of a plugin is running: a `ui.choose` of it becomes the palette's next step. */
  private stepCapture: { step: import('../commands').Step | null } | null = null;
  /** What the declared plugins still read (their themes). */
  private loading: Promise<void>[] = [];
  /** Turned off after an error (until the restart): the reason. */
  failed = new SvelteMap<string, string>();
  /** Activated. */
  active = new SvelteMap<string, true>();
  /** What a plugin's code gave: the drawings of its sections and kinds of tabs. */
  navs = new SvelteMap<string, { plugin: string; render: Render }>();
  views = new SvelteMap<string, ViewEntry>();
  /** The blocks of «Сегодня» (ТЗ 32): their drawings, the ones left out now; what the plugins add to a card of 1-1. */
  todayRenders = new SvelteMap<string, { plugin: string; render: (el: HTMLElement, block: { setHidden(hidden: boolean): void }) => Dispose | void }>();
  todayHidden = new SvelteMap<string, true>();
  oneOnOnes = new SvelteMap<string, Parameters<Ctx['ui']['oneOnOne']>[0]>();
  /** The pieces the plugins put into the places other plugins declare (API 1.8): by place, in the order they came. */
  slots = new SvelteMap<string, SlotPiece[]>();
  /** The functions a plugin gives the others (its manifest's `exports`). */
  private exported = new Map<string, Record<string, (...args: never[]) => unknown>>();
  /** The views of a file (ТЗ 33): their drawings by the plugins. */
  fileViews = new SvelteMap<string, { plugin: string; spec: Parameters<Ctx['ui']['fileView']>[1] }>();
  /** A tab drawn anew (`ui.open` with a new state for a tab shown): its number. */
  redraw = new SvelteMap<string, number>();
  /** The numbers on the plugins' buttons of the navigator (`ui.setBadge`). */
  badges = new SvelteMap<string, number>();
  /** What the core's month (under a review's card) shows, as a plugin set it (`ui.setMonthFilter`: the calendar's
   *  layers and hidden files, #99); null — every dated entry. */
  monthFilter = $state.raw<{ plugin: string; layers: string[]; hidden: string[] } | null>(null);
  /** The core's sheets a plugin asked for, and its review. */
  form = $state<FormReq | null>(null);
  place = $state<PlaceReq | null>(null);
  review = $state<ReviewRun | null>(null);
  sheetReq = $state<{ plugin: string; spec: SheetSpec; resolve: (button: string | null) => void } | null>(null);
  menuReq = $state<{ plugin: string; x: number; y: number; items: CoreMenuItem[] } | null>(null);
  private dynamic = new SvelteMap<string, { options?(v: Values): CoreOpt[] | [CoreOpt[], CoreOpt[]]; hint?(v: Values): string; show?(path: string | null): string; clean?(text: string): string }>();
  private disposers = new Map<string, Dispose[]>();
  private plugins = new Map<string, Plugin>();
  private started = false;

  manifest(id: string): Manifest | undefined {
    return this.entries.find((e) => e.manifest?.id === id)?.manifest ?? undefined;
  }
  name(id: string) {
    return this.manifest(id)?.name ?? id;
  }
  /** The plugin may run now: on, not failed. */
  live(id: string) {
    return this.entries.some((e) => e.enabled && e.manifest?.id === id) && !this.failed.has(id);
  }
  entry(id: string) {
    return this.entries.find((e) => e.manifest?.id === id);
  }
  /** The plugin whose manifest declares this kind of tab (a tab of a plugin that is off). */
  pluginOfView(kind: string) {
    return this.entries.find((e) => e.manifest?.contributes.views.some((v) => v.id === kind));
  }
  /** On or off at once (roadmap 1.2): kept on this Mac. */
  async setEnabled(id: string, on: boolean) {
    const e = this.entry(id);
    if (!e?.manifest || (on && e.problems.length)) return;
    if (on && !e.builtin && !trusted(e.manifest) && !(await this.askTrust(e))) return;
    this.untrusted.delete(id);
    saveChoice(id, on);
    e.enabled = on;
    if (!on) {
      this.teardown(id);
      store.resetMissingThemes(); // a theme of its was chosen: Panopticon again
      return;
    }
    this.failed.delete(id);
    this.declareAll();
    await this.activate(e);
  }
  /** The sheet before an installed plugin is first turned on (or asks for other rights): what it gets; `update` —
   *  before a new version with other rights is installed (ТЗ 37): its version. */
  trustReq = $state<{ entry: Entry; update?: string; resolve: (ok: boolean) => void } | null>(null);
  /** A new version asks for other rights: shown before it is installed; yes — they are let in. */
  askRights(m: Manifest, version: string) {
    return new Promise<boolean>((resolve) => {
      this.trustReq?.resolve(false);
      this.trustReq = {
        entry: { dir: m.id, builtin: false, manifest: m, problems: [], enabled: true },
        update: version,
        resolve: (ok) => {
          this.trustReq = null;
          if (ok) trust(m);
          resolve(ok);
        },
      };
    });
  }
  /** Updates of plugins wait (set by pluginUpdates: the host knows nothing of the network). */
  updatesWaiting = $state<() => boolean>(() => false);
  /** Installed with «Включить сразу» (ТЗ 37): the rights shown before are let in, the plugin on. */
  allow(m: Manifest) {
    trust(m);
    saveChoice(m.id, true);
  }
  /** Whether a manifest's rights are the ones let in for its id (an update asks again when not). */
  sameRights(m: Manifest) {
    return trusted(m);
  }
  /** The folder of plugins read again after an install, an update, a removal: a plugin changed is taken back, the
   *  ones on are started (the others keep running). */
  async refreshInstalled() {
    await this.listInstalled();
    await Promise.all(this.entries.filter((e) => e.enabled).map((e) => this.activate(e)));
    await Promise.all(this.loading.splice(0));
    store.resetMissingThemes();
  }
  private askTrust(entry: Entry) {
    return new Promise<boolean>((resolve) => {
      this.trustReq?.resolve(false);
      this.trustReq = {
        entry,
        resolve: (ok) => {
          this.trustReq = null;
          if (ok) trust(entry.manifest!);
          resolve(ok);
        },
      };
    });
  }
  /** «Перезагрузить плагины»: everything off, the folder read again, the plugins that are on started anew. */
  async reload() {
    for (const id of [...this.declared]) this.teardown(id);
    this.failed.clear();
    this.started = false;
    await this.start();
  }

  // ---- what the manifests declare, before any code ---------------------------------------------------------------
  declare() {
    this.declareAll(true);
    registerSettings({ id: 'Плагины', icon: PLUG, order: 85, component: PluginsSettings, dot: () => this.updatesWaiting() });
    // the core's tab of a plugin's review; its sheets wait the window's keys
    registerView({
      kind: REVIEW_KIND, icon: 'M4 4h12v12H4zM7 8h6M7 11h4', component: PluginReview, transient: true, single: true,
      label: () => this.review?.spec.title ?? 'Разбор', crumbs: () => this.review?.spec.crumbs ?? [this.review?.spec.title ?? 'Разбор'],
      fileOf: () => this.reviewHeading()?.file.path,
      onGone: () => this.endReview(false, true),
    });
    store.addSheet(() => !!(this.form || this.place || this.sheetReq));
  }

  // ---- the review -------------------------------------------------------------------------------------------------
  /** The card's heading now: found by its title near its line (an action may have moved it). */
  reviewHeading() {
    const r = this.review;
    const ref = r && r.cur >= 0 ? r.refs[r.cur] : null;
    const f = ref ? fileOf(ref.path) : undefined;
    // by its title; else the heading at its line (its title edited in the card, ТЗ 28)
    const h = f && ref ? (findHeading(f.headings, ref) ?? f.headings.find((x) => x.line === ref.line)) : undefined;
    return f && h ? { file: f, heading: h, info: infoOf(f, h) } : null;
  }
  async reviewAct(actionId: string) {
    const r = this.review;
    const c = this.reviewHeading();
    const a = r?.spec.actions.find((x) => x.id === actionId);
    if (!r || !c || !a || this.failed.has(r.plugin)) return;
    if (a.disabled && this.guard(r.plugin, () => a.disabled!(c.info), false)) return;
    let res: 'next' | 'stay' = 'stay';
    try {
      res = await a.run(c.info);
    } catch (err) {
      this.fail(r.plugin, err);
      return;
    }
    if (this.review !== r) return;
    const now = this.reviewHeading();
    if (now) r.refs[r.cur] = now.info.ref; // it may have moved: the card keeps it
    if (res === 'next') {
      r.doneAt.add(r.cur);
      r.done = r.doneAt.size;
      await this.reviewStep(1);
    } else this.reviewRedraw++;
  }
  /** The card's heading was edited in it, by the user (its line moved, its title changed): the card keeps it (ТЗ 28).
   *  A change from outside is not: the heading at its line may be another one then. */
  reviewEdited(line: number) {
    const r = this.review;
    const ref = r && r.cur >= 0 ? r.refs[r.cur] : null;
    const f = ref ? fileOf(ref.path) : undefined;
    const h = f?.headings.find((x) => x.line === line);
    // only the same heading: moved by an edit above it (its title) or retitled in place (its line); a rewrite of the
    // file (a goal moved to another quarter) leaves the narrowed range pointing elsewhere — the title finds it then
    if (r && ref && h && (h.title === ref.title || h.line === ref.line) && (ref.line !== h.line || ref.title !== h.title)) r.refs[r.cur] = { path: ref.path, line: h.line, title: h.title };
  }
  /** The card drawn again (the plugin's parts read the file anew). */
  reviewRedraw = $state(0);
  /** The bar read again (the actions' `disabled`). */
  reviewBar = $state(0);
  /** Another card; what the plugin is writing is saved first (`beforeStep`). */
  async reviewStep(d: number) {
    const r = this.review;
    if (!r) return;
    const c = this.reviewHeading();
    if (c && r.spec.beforeStep) {
      try {
        await r.spec.beforeStep(c.info);
      } catch (err) {
        this.fail(r.plugin, err);
        return;
      }
    }
    if (this.review !== r) return;
    if (r.spec.next) {
      const n = this.guard(r.plugin, () => r.spec.next!(r.cur, d < 0 ? -1 : 1), r.cur);
      if (this.review !== r || n === r.cur || n < -1 || n >= r.refs.length) return;
      r.cur = n;
      if (n < 0) this.endReview(true, false, true);
      return;
    }
    if (r.cur < 0) {
      if (d < 0) r.cur = r.refs.length - 1; // «Назад» from the summary
      return;
    }
    const n = r.cur + d;
    if (n < 0) return;
    r.cur = n < r.refs.length ? n : -1;
    if (r.cur < 0) this.endReview(true, false, true);
  }
  /** The plugin shows a card (-1: the summary): the review's tab in front. */
  reviewShow(r: ReviewRun, i: number) {
    if (this.review !== r || i < -1 || i >= r.refs.length) return;
    for (const [pi, p] of store.layout.panes.entries()) {
      const ti = p.tabs.findIndex((t) => t.kind === REVIEW_KIND);
      if (ti >= 0 && (store.layout.active !== pi || p.active !== ti)) store.activateTab(pi, ti);
    }
    r.cur = i;
    if (i < 0) this.endReview(true, false, true);
  }
  /** The review answers its plugin: through, or left; `keep`: its summary stays shown. */
  endReview(finished: boolean, gone = false, keep = false) {
    const r = this.review;
    if (!r) return;
    if (!r.resolved) {
      r.resolved = true;
      r.resolve({ total: r.refs.length, done: r.done, finished });
    }
    if (!keep) {
      this.review = null;
      if (r.spec.onClose) this.guard(r.plugin, () => r.spec.onClose!(), undefined);
    }
    if (!gone && !keep) for (const [pi, p] of store.layout.panes.entries()) {
      const ti = p.tabs.findIndex((t) => t.kind === REVIEW_KIND);
      if (ti >= 0) store.closeTab(pi, ti);
    }
  }
  /** A plugin's menu items as the core's menu draws them. */
  private coreMenu(id: string, items: (ApiMenuItem | 'sep')[]): CoreMenuItem[] {
    return items.flatMap((it): CoreMenuItem[] => (it === 'sep' ? ['sep'] : [
      { label: it.label, danger: it.danger, disabled: it.disabled, checked: it.checked, action: () => this.guard(id, () => it.run(), undefined) },
      ...(it.hint ? [{ note: it.hint }] : []),
    ]));
  }
  private listN = 0;
  private keep(id: string, d: Dispose) {
    if (!this.disposers.has(id)) this.disposers.set(id, []);
    this.disposers.get(id)!.push(d);
  }
  /** Register what the plugins that are on declare and are not registered yet; `keysDone`: their keys already are. */
  private declareAll(keysDone = false) {
    let keys = false;
    for (const e of this.entries) {
      const m = e.manifest;
      if (!e.enabled || !m || this.declared.has(m.id) || this.failed.has(m.id)) continue;
      if (!keysDone) (declareKeys(m), (keys = true));
      this.declareOne(m);
    }
    if (keys) store.keysVersion++;
  }
  private declareOne(m: Manifest) {
    const id = m.id;
    this.declared.add(id);
    if (!store.hasStorage(id)) store.registerStorage(id); // a migration from an old place may have registered it (ТЗ 27)
    if (store.loaded) void store.readFeatureFile(id); // declared after the folder was read (installed, turned on)
    // not in the palette: a review's keys, and «Навигатор: …» (as the core's own sections)
    const navKeys = new Set(m.contributes.navSections.map((n) => n.key).filter(Boolean));
    // a view's keys (the board's, ТЗ 33): while a file tab shows a view of the plugin and nothing is typed into a field
    const viewShown = () => {
      const t = store.tab;
      return !!t && t.kind === 'file' && m.contributes.fileViews.some((v) => v.id === store.viewOf(t));
    };
    const inView = () => {
      if (!viewShown()) return false;
      const a = document.activeElement as HTMLElement | null;
      return !(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable));
    };
    if (m.contributes.commands.some((c) => c.scope === 'view')) {
      const scope = viewScope(id);
      store.setScopeKeys(scope, {
        active: inView,
        run: (cmd) => {
          const run = m.contributes.commands.some((c) => c.id === cmd && c.scope === 'view') ? actionOf(cmd) : undefined;
          if (!run) return false;
          run();
          return true;
        },
      });
      this.keep(id, () => store.setScopeKeys(scope, null));
    }
    for (const c of m.contributes.commands.filter((x) => x.scope !== 'review' && !navKeys.has(x.id) && !this.inPalette.has(x.id))) {
      this.inPalette.add(c.id);
      registerPalette({
        id: c.id, title: c.title, icon: 'plug', group: 'general', synonyms: c.synonyms, plugin: m.name, ...(iconOf(m) ? { iconPath: iconOf(m) } : {}),
        when: () => !!actionOf(c.id) && (c.scope !== 'view' || viewShown()), // the palette has the focus itself
        run: () => {
          // a command that asks in the palette: run now, its choice is the palette's next step (no gap to type into)
          if (c.step) {
            this.stepCapture = { step: null };
            try {
              actionOf(c.id)?.();
              return this.stepCapture.step ?? undefined;
            } finally {
              this.stepCapture = null;
            }
          }
          setTimeout(() => actionOf(c.id)?.()); // once the palette is closed (it gives the focus back)
        },
      });
    }
    m.contributes.navSections.forEach((n, i) => {
      // the built-in plugins' sections in their places among the core's (ТЗ 38: Файлы, Inbox, Агенда, Цели, Календарь,
      // Теги, Поиск); an installed plugin's after them
      const place = this.entry(id)?.builtin ? BUILTIN_NAV[n.id] : undefined;
      this.keep(id, registerNav({ id: n.id, label: n.title, icon: n.icon, key: n.key, order: place ?? 100 + i, component: PluginNav as unknown as Component, badge: () => this.badges.get(n.id) ?? 0 }));
      if (n.key) this.keep(id, registerAction(n.key, () => this.showNav(n.id)));
    });
    for (const v of m.contributes.fileViews) {
      this.keep(id, registerFileView({
        id: v.id, title: v.title, icon: v.icon, key: v.key, component: PluginFileView as unknown as Component,
        defaultFor: (f) => !!this.guard(id, () => this.fileViews.get(v.id)?.spec.defaultFor?.(f.text), false),
      }));
    }
    for (const t of m.contributes.fileTypes) this.keep(id, registerFileType({ ...t, plugin: id }));
    for (const b of m.contributes.todayBlocks) {
      this.keep(id, registerTodayBlock({
        id: b.id, title: b.title, hint: b.hint, attach: b.attach, full: b.width === 'full', before: b.before, after: b.after, component: PluginTodayBlock as unknown as Component,
        empty: () => !this.todayRenders.has(b.id) || this.todayHidden.has(b.id),
      }));
    }
    for (const v of m.contributes.views) {
      const spec = () => this.views.get(v.id)?.spec;
      this.keep(id, registerView({
        kind: v.id, icon: v.icon, component: PluginView, inspector: PluginInspector, hasInspector: () => !!spec()?.inspector,
        label: (t) => this.guard(id, () => spec()?.title(t.data), v.title) ?? v.title,
        crumbs: (t) => this.guard(id, () => spec()?.crumbs?.(t.data), null) ?? [this.guard(id, () => spec()?.title(t.data), v.title) ?? v.title],
        restore: (raw) => {
          const r = spec()?.restore;
          return r ? this.guard(id, () => r(raw), raw) : raw;
        },
      }));
    }
    m.contributes.settings.forEach((s, i) => {
      const schema = this.schemaOf(m, s, i);
      if (s.section) this.keep(id, registerSettings({ id: s.section, icon: s.icon ?? PLUG, order: 81 + i, schema, plugin: id })); // after the core's, before «Плагины»
      else if (s.block) this.keep(id, registerSettingsBlock({ section: s.block, order: 50 + i, schema }));
    });
    if (m.contributes.themes.length) this.loading.push(this.declareThemes(m));
    for (const set of m.contributes.statusSets) {
      const [open, done] = set.states.split('|').map((x) => x.trim().split(/\s+/).filter(Boolean));
      const def: WorkflowDef = { name: set.name, states: [...open.map((n) => ({ name: n, done: false })), ...done.map((n) => ({ name: n, done: true }))] };
      this.keep(id, store.registerStatusSet(id, def, () => this.live(id)));
    }
  }
  /** A plugin's themes (roadmap 1.4): JSON files of its folder in the theme format of ТЗ 25. */
  private async declareThemes(m: Manifest) {
    const e = this.entry(m.id);
    if (!e) return;
    const texts = await Promise.all(m.contributes.themes.map(async (file) => {
      if (e.builtin) return DATA[`../plugins/${e.dir}/${file.replace(/^\.\//, '')}`] ?? null;
      return invoke<string>('read_plugin_file', { dir: e.dir, file }).catch(() => null);
    }));
    if (!this.declared.has(m.id)) return; // turned off meanwhile
    const list = texts.map((t) => (t ? parseTheme(t) : null)).filter((t): t is Theme => !!t);
    if (list.length < texts.length) console.warn(`plugin ${m.id}: ${texts.length - list.length} theme file(s) unreadable`);
    this.keep(m.id, store.addThemes(m.id, list));
  }
  /** The views with a button in the toolbar's «Открыть в панели» (after the core's): of the plugins running. */
  get toolbarViews() {
    return this.entries.flatMap((e) => (e.enabled && e.manifest && !this.failed.has(e.manifest.id) ? e.manifest.contributes.views.filter((v) => v.toolbar) : []));
  }
  /** A view's toolbar button: in the second pane (a new tab's state `restore(null)`), or out of it. */
  toggleSecond(kind: string) {
    const spec = this.views.get(kind);
    if (!spec) return;
    store.toggleSecond(kind, () => ({ ...newTab(kind), data: this.guard(spec.plugin, () => spec.spec.restore?.(null), null) ?? null }));
    store.persistLayout();
  }
  private showNav(id: string) {
    store.showNav = true;
    store.setNavMode(id);
  }

  // ---- the code --------------------------------------------------------------------------------------------------
  /** Load and activate the plugins that are on (after the window is drawn). */
  async start() {
    if (this.started) return;
    this.started = true;
    if (isTauri) await this.listInstalled();
    await Promise.all(this.entries.filter((e) => e.enabled).map((e) => this.activate(e))); // one slow to start keeps no other waiting
    await Promise.all(this.loading.splice(0)); // the plugins' themes are in
    store.pluginsReady = true;
    store.resetMissingThemes();
  }
  /** The installed plugins read anew: a plugin gone or changed is taken back, a new one comes in off. */
  private async listInstalled() {
    let list: Listed[];
    try {
      list = await invoke<Listed[]>('list_plugins');
    } catch {
      return;
    }
    saveInstalled(list);
    const next = installedEntries(list, builtinEntries, readChoices());
    // on, but its rights are not the ones let in (a new version asks for more): off until turned on again
    for (const e of next)
      if (e.enabled && e.manifest && !trusted(e.manifest)) {
        e.enabled = false;
        saveChoice(e.manifest.id, false);
        this.untrusted.set(e.manifest.id, 'Права плагина изменились — включите его снова');
      }
    for (const old of this.entries.filter((e) => !e.builtin)) {
      const now = next.find((e) => e.dir === old.dir);
      if (old.manifest && this.declared.has(old.manifest.id) && (!now || JSON.stringify(now.manifest) !== JSON.stringify(old.manifest) || !now.enabled)) this.teardown(old.manifest.id);
    }
    this.entries = [...this.entries.filter((e) => e.builtin), ...next];
    this.declareAll();
  }
  /** Load the plugin's code and give it its ctx. */
  private async activate(e: Entry) {
    const m = e.manifest;
    if (!m || !e.enabled || this.active.has(m.id) || this.failed.has(m.id)) return;
    try {
      const p = e.builtin ? await this.builtinCode(e) : await this.installedCode(e, m);
      if (!p) return; // a plugin of data only (themes, roadmap 1.4)
      if (typeof p.activate !== 'function') throw new Error('main.js не экспортирует плагин: export default { activate(ctx) { … } }');
      this.plugins.set(m.id, p);
      await p.activate(this.ctxOf(m));
      if (this.declared.has(m.id)) this.active.set(m.id, true);
      else this.dropLate(m.id); // turned off while it started: what it registered after that goes too
    } catch (err) {
      this.fail(m.id, err);
    }
  }
  private async builtinCode(e: Entry): Promise<Plugin | null> {
    const load = MAINS[`../plugins/${e.dir}/main.ts`];
    if (!load) return null;
    try {
      return (await load()).default;
    } catch {
      return (await load()).default; // once more: a module cut off by a reload of the page (dev) is fetched again
    }
  }
  /** An installed plugin's main.js (one module, everything bundled in) and its styles.css, read by Rust from its own folder. */
  private async installedCode(e: Entry, m: Manifest): Promise<Plugin | null> {
    if (m.styles) {
      const css = await invoke<string>('read_plugin_file', { dir: e.dir, file: m.styles });
      const el = document.createElement('style');
      el.dataset.plugin = m.id;
      el.textContent = css;
      document.head.append(el);
      this.keep(m.id, () => el.remove());
    }
    const file = m.main ?? 'main.js';
    let code: string;
    try {
      code = await invoke<string>('read_plugin_file', { dir: e.dir, file });
    } catch {
      if (!m.main && !m.contributes.commands.length && !m.contributes.views.length && !m.contributes.navSections.length) return null; // data only
      throw new Error(`не прочитать ${file}`);
    }
    const url = URL.createObjectURL(new Blob([code + `\n//# sourceURL=plugin://${m.id}/${file}`], { type: 'text/javascript' }));
    try {
      const mod = await import(/* @vite-ignore */ url);
      return (mod.default ?? mod.plugin) as Plugin;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  /** Run a plugin's code; an error turns the plugin off. */
  guard<T>(id: string, fn: () => T, fallback: T): T {
    if (this.failed.has(id)) return fallback;
    try {
      const r = fn();
      if (r instanceof Promise) r.catch((err) => this.fail(id, err));
      return r;
    } catch (err) {
      this.fail(id, err);
      return fallback;
    }
  }
  fail(id: string, err: unknown) {
    if (this.failed.has(id)) return;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`plugin ${id}:`, err);
    this.failed.set(id, msg);
    this.stack.set(id, err instanceof Error && err.stack ? (err.stack.includes(msg) ? err.stack : msg + '\n' + err.stack) : msg);
    this.teardown(id);
    store.note(`Плагин «${this.name(id)}» выключен: ${msg}`, undefined, 8000);
  }
  /** Turned off at the start: its rights changed since it was let in. */
  untrusted = new SvelteMap<string, string>();
  /** Why it was turned off, in full (the list of plugins' «Подробнее»). */
  stack = new SvelteMap<string, string>();
  /** Everything the plugin registered taken back; its code told to stop. */
  /** A plugin turned off while its `activate` ran: what it registered meanwhile is taken back, it is deactivated. */
  private dropLate(id: string) {
    untrack(() => {
      for (const d of (this.disposers.get(id) ?? []).reverse()) {
        try {
          d();
        } catch {
          /* taken back as far as it goes */
        }
      }
      this.disposers.delete(id);
      for (const [k, v] of this.views) if (v.plugin === id) this.views.delete(k);
      for (const [k, v] of this.navs) if (v.plugin === id) this.navs.delete(k);
      for (const [k, v] of this.todayRenders) if (v.plugin === id) (this.todayRenders.delete(k), this.todayHidden.delete(k));
      this.oneOnOnes.delete(id);
      for (const [k, v] of this.fileViews) if (v.plugin === id) this.fileViews.delete(k);
      setLineLink(id, null);
      void Promise.resolve(this.plugins.get(id)?.deactivate?.()).catch(() => {});
      this.plugins.delete(id);
    });
  }
  private teardown(id: string) {
    const m = this.manifest(id);
    this.declared.delete(id);
    this.active.delete(id);
    untrack(() => {
      if (this.form?.plugin === id) (this.form.resolve(null), (this.form = null));
      if (this.place?.plugin === id) (this.place.resolve(null), (this.place = null));
      if (this.sheetReq?.plugin === id) this.sheetReq.resolve(null);
      if (this.menuReq?.plugin === id) this.menuReq = null;
      if (this.review?.plugin === id) this.endReview(false);
      for (const d of (this.disposers.get(id) ?? []).reverse()) {
        try {
          d();
        } catch {
          /* taken back as far as it goes */
        }
      }
      this.disposers.delete(id);
      for (const [k, v] of this.views) if (v.plugin === id) this.views.delete(k);
      for (const [k, v] of this.navs) if (v.plugin === id) this.navs.delete(k);
      for (const [k, v] of this.todayRenders) if (v.plugin === id) (this.todayRenders.delete(k), this.todayHidden.delete(k));
      this.oneOnOnes.delete(id);
      for (const [k, v] of this.fileViews) if (v.plugin === id) this.fileViews.delete(k);
      setLineLink(id, null);
      store.refreshStatusSets();
      if (this.manifest(id)?.contributes.navSections.some((n) => n.id === store.navMode)) store.setNavMode('files');
      try {
        void Promise.resolve(this.plugins.get(id)?.deactivate?.()).catch(() => {});
      } catch {
        /* off anyway */
      }
      this.plugins.delete(id);
      if (m) {
        undeclareKeys(m);
        store.keysVersion++;
      }
    });
  }

  /** A place of a plugin drawn: a child per piece of the plugins on (display: contents), kept as they come and go. */
  private drawSlot<D>(el: HTMLElement, place: string, data: D) {
    let now = clone(data);
    const drawn = new Map<SlotPiece, { node: HTMLElement; dispose: Dispose | void }>();
    const draw = (p: SlotPiece, node: HTMLElement) => this.guard(p.plugin, () => p.render(node, clone(now)), undefined);
    const drop = (p: SlotPiece) => {
      const d = drawn.get(p)!;
      this.guard(p.plugin, () => d.dispose?.(), undefined);
      d.node.remove();
      drawn.delete(p);
    };
    const stop = $effect.root(() => {
      $effect(() => {
        const list = (this.slots.get(place) ?? []).filter((p) => this.live(p.plugin));
        untrack(() => {
          for (const p of [...drawn.keys()]) if (!list.includes(p)) drop(p);
          for (const p of list) {
            let d = drawn.get(p);
            if (!d) {
              const node = document.createElement('div');
              node.style.display = 'contents';
              node.dataset.plugin = p.plugin;
              d = { node, dispose: undefined };
              drawn.set(p, d);
              el.append(node);
              d.dispose = draw(p, node);
            } else el.append(d.node); // the plugins' order
          }
        });
      });
    });
    return {
      update: (d: D) => {
        now = clone(d);
        for (const [p, x] of drawn) {
          this.guard(p.plugin, () => x.dispose?.(), undefined);
          x.node.replaceChildren();
          x.dispose = draw(p, x.node);
        }
      },
      dispose: () => {
        stop();
        for (const p of [...drawn.keys()]) drop(p);
      },
    };
  }

  // ---- ctx ----------------------------------------------------------------------------------------------------
  private ctxOf(m: Manifest): Ctx {
    const id = m.id;
    const can = (p: string) => m.permissions.includes(p as never);
    const keep = (d: Dispose): Dispose => {
      this.keep(id, d);
      return d;
    };
    const declared = (kind: string, ok: boolean, x: string) => {
      if (!ok) throw new Error(`${kind} «${x}» нет в манифесте`);
    };
    // the command handlers, and which are not available now (ТЗ 27: «Новая цель…» while there are no goals)
    const handlers = new Map<string, () => void>();
    const offs = new Map<string, () => void>();
    const off_ = new Set<string>();
    let sets: Dispose[] = [];
    const ctx: Ctx = {
      id,
      commands: {
        on: (cmd, run) => {
          declared('команды', m.contributes.commands.some((c) => c.id === cmd), cmd);
          const act = () => this.guard(id, () => run(), undefined);
          handlers.set(cmd, act);
          let off = off_.has(cmd) ? () => {} : registerAction(cmd, act);
          offs.set(cmd, () => off());
          return keep(() => {
            off();
            handlers.delete(cmd);
            off = () => {};
          });
        },
        keyOf: (cmd) => store.keyHint(cmd),
        setAvailable: (cmd, on) => {
          declared('команды', m.contributes.commands.some((c) => c.id === cmd), cmd);
          if (on === !off_.has(cmd)) return;
          if (on) {
            off_.delete(cmd);
            const act = handlers.get(cmd);
            if (act) {
              const off = registerAction(cmd, act);
              offs.set(cmd, off);
              keep(off);
            }
          } else {
            off_.add(cmd);
            offs.get(cmd)?.();
          }
        },
        run: async (cmd, arg) => {
          if (m.contributes.commands.some((c) => c.id === cmd)) return void actionOf(cmd)?.();
          coreCommand(cmd, arg);
        },
      },
      ui: {
        fileView: (fv, spec) => {
          declared('вида файла', m.contributes.fileViews.some((x) => x.id === fv), fv);
          this.fileViews.set(fv, { plugin: id, spec });
          return keep(() => void (this.fileViews.get(fv)?.spec === spec && this.fileViews.delete(fv)));
        },
        openFileView: async (fv, file, where = 'here') => {
          declared('вида файла', m.contributes.fileViews.some((x) => x.id === fv), fv);
          const f = fileOf(String(file?.path ?? ''));
          if (!f) return false;
          const L = store.layout;
          if (where === 'beside' && L.panes.length < 2) store.splitRight();
          const pi = where === 'beside' ? 1 : L.active;
          const h = file.heading ? findHeading(f.headings, { path: f.path, line: Number(file.heading.line), title: String(file.heading.title) }) : undefined;
          if (file.heading && !h) return false;
          const p = L.panes[pi];
          if (h) {
            // one tab per branch and view: shown again, not opened twice
            const i = p.tabs.findIndex((t) => t.kind === 'file' && t.path === f.path && t.view === fv && t.scope?.title === h.title);
            if (i >= 0) {
              p.active = i;
              p.tabs[i].scope = { line: h.line, title: h.title };
            } else openScoped(L, pi, f.path, fv, { line: h.line, title: h.title });
          } else store.showAs(openFile(L, pi, f.path, 0, { focus: true }), fv);
          L.active = pi;
          return true;
        },
        currentHeading: () => {
          const t = store.tab;
          const f = store.fileOf(t);
          if (!t || !f) return null;
          // a view on a branch: its heading; the text: the heading at the caret
          if (t.scope && t.view) return apiRef({ path: f.path, line: t.scope.line, title: t.scope.title });
          const h = f.headings[headingAt(f.headings, t.cursor.line)];
          return h ? { path: f.name, line: h.line, title: h.title } : null;
        },
        headingAction: (spec) => {
          const key = `${id}.${++this.listN}`;
          headingActions.set(key, {
            label: String(spec.label),
            when: (path, line) => {
              if (!spec.when) return true;
              const f = fileOf(path);
              const h = f?.headings.find((x) => x.line === line);
              return !!f && !!h && !!this.guard(id, () => spec.when!(infoOf(f, h)), false);
            },
            run: (path, line) => {
              const f = fileOf(path);
              const h = f?.headings.find((x) => x.line === line);
              if (f && h) this.guard(id, () => spec.run({ path: f.name, line: h.line, title: h.title }), undefined);
            },
          });
          return keep(() => void headingActions.delete(key));
        },
        showAs: async (fv) => {
          if (fv !== null) declared('вида файла', m.contributes.fileViews.some((x) => x.id === fv), fv);
          const t = store.tab;
          if (!t || t.kind !== 'file') return false;
          store.showAs(t, fv ?? '');
          return true;
        },
        editorLink: (spec) => {
          setLineLink(id, { label: (text, line) => this.guard(id, () => spec.label(text, line), null), run: (path, line) => this.guard(id, () => spec.run(path, line), undefined) });
          return keep(() => setLineLink(id, null));
        },
        todayBlock: (blk, render) => {
          declared('блока', m.contributes.todayBlocks.some((b) => b.id === blk), blk);
          this.todayRenders.set(blk, { plugin: id, render });
          return keep(() => {
            if (this.todayRenders.get(blk)?.render !== render) return;
            this.todayRenders.delete(blk);
            this.todayHidden.delete(blk);
          });
        },
        slot: (place, render) => {
          const piece: SlotPiece = { plugin: id, render: render as SlotPiece['render'] };
          this.slots.set(place, [...(this.slots.get(place) ?? []), piece]);
          return keep(() => this.slots.set(place, (this.slots.get(place) ?? []).filter((x) => x !== piece)));
        },
        drawSlot: (el, place, data) => {
          declared('места', m.contributes.slots.some((x) => x.id === place), place);
          return this.drawSlot(el, place, data);
        },
        oneOnOne: (spec) => {
          this.oneOnOnes.set(id, spec);
          return keep(() => void (this.oneOnOnes.get(id) === spec && this.oneOnOnes.delete(id)));
        },
        navSection: (nav, render) => {
          declared('раздела', m.contributes.navSections.some((n) => n.id === nav), nav);
          this.navs.set(nav, { plugin: id, render });
          return keep(() => void (this.navs.get(nav)?.render === render && this.navs.delete(nav)));
        },
        view: (v, spec) => {
          declared('вида', m.contributes.views.some((x) => x.id === v), v);
          this.views.set(v, { plugin: id, spec });
          return keep(() => void (this.views.get(v)?.spec === spec && this.views.delete(v)));
        },
        open: async (v, state, where = 'here') => {
          declared('вида', m.contributes.views.some((x) => x.id === v), v);
          const L = store.layout;
          if (where === 'beside' && L.panes.length < 2) store.splitRight();
          const pi = where === 'beside' ? 1 : L.active;
          openView(L, pi, v, () => clone(state), (t) => {
            t.data = clone(state);
            this.redraw.set(t.id, (this.redraw.get(t.id) ?? 0) + 1);
          });
          L.active = pi;
        },
        saveFile: async (o) => {
          const { save } = await import('@tauri-apps/plugin-dialog');
          const name = String(o?.name ?? 'export').replace(/[/\\:]/g, '-');
          const path = await save({ title: o.title ?? 'Сохранить как', defaultPath: name, ...(o.filter ? { filters: [{ name: String(o.filter.name), extensions: o.filter.extensions.map(String) }] } : {}) });
          if (!path) return null;
          if (typeof o.base64 === 'string') await invoke('export_bytes', { path, data: o.base64 });
          else await invoke('export_text', { path, text: String(o.text ?? '') });
          return path;
        },
        form: (spec) =>
          new Promise((resolve) => {
            this.form?.resolve(null);
            this.form = { plugin: id, spec, resolve };
          }),
        pickPlace: (o = {}) =>
          new Promise((resolve) => {
            this.place?.resolve(null);
            this.place = { plugin: id, kind: o.kind ?? 'heading', title: o.title ?? (o.kind === 'file' ? 'Выбор файла' : 'Выбор места'), levels: o.levels, resolve };
          }),
        pickDate: (o = {}) =>
          new Promise((resolve) => {
            let picked = false;
            store.openCalendar({
              kind: o.kind ?? 'DATE', initial: o.initial ?? new Date(), current: o.current ?? null, names: o.names ?? [],
              ...(o.title || !o.kind ? { plate: { kind: 'text' as const, text: o.title ?? 'Выбор даты' } } : {}),
              pick: (d) => {
                picked = true;
                resolve(new Date(d));
              },
            });
            const stop = watch(() => store.palette, (p) => {
              if (p) return;
              stop();
              if (!picked) resolve(null);
            });
          }),
        review: (spec) =>
          new Promise((resolve) => {
            this.endReview(false, true); // the earlier review answers; its tab is reused (closing it would race the new one)
            if (!spec.items.length) return resolve({ total: 0, done: 0, finished: true });
            this.review = { plugin: id, spec, refs: spec.items.map((r) => ({ ...r })), cur: Math.min(Math.max(0, spec.start ?? 0), spec.items.length - 1), done: 0, doneAt: new Set<number>(), gen: 0, resolved: false, resolve };
            openView(store.layout, store.layout.active, REVIEW_KIND, () => ({}), (t) => this.redraw.set(t.id, (this.redraw.get(t.id) ?? 0) + 1));
          }),
        sheet: (spec) =>
          new Promise((resolve) => {
            this.sheetReq?.resolve(null);
            this.sheetReq = { plugin: id, spec, resolve: (b) => ((this.sheetReq = null), resolve(b)) };
          }),
        menu: (items, at) => {
          this.menuReq = { plugin: id, x: at.x, y: at.y, items: this.coreMenu(id, items) };
        },
        taskList: (el, spec) => {
          const lid = `plugin:${id}:${++this.listN}`;
          const off = lists.register({
            id: lid,
            el: () => el,
            // the inspector shows its task while the tab it is in is the active one
            tab: () => (document.querySelector('section.pane.active')?.contains(el) ? store.tab : undefined),
            selected: () => {
              const s = this.guard(id, () => spec.selected(), null);
              return s ? { ...coreRef(s.ref), dk: s.date ?? null } : null;
            },
            open: (other) => this.guard(id, () => spec.open(other), undefined),
            otherLabel: spec.otherLabel,
            clear: () => this.guard(id, () => spec.clear(), undefined),
            refresh: () => this.guard(id, () => spec.refresh?.(), undefined),
            freeze: () => {}, // a card goes to its column, an entry to its day at once (ТЗ 34, decided)
            more: (t) => {
              const items = spec.more ? this.guard(id, () => spec.more!(apiRef(t)!), []) : [];
              return items.length ? ['sep', ...this.coreMenu(id, items)] : [];
            },
          });
          keep(off);
          return {
            menu: (at) => {
              const sp = lists.spec(lid);
              if (sp) lists.openMenuAt(sp, at.x, at.y);
            },
            dispose: off,
          };
        },
        taskAction: (spec) =>
          keep(
            lists.addAction({
              key: `${id}.${++this.listN}`,
              label: spec.label,
              when: (f, h) => (spec.when ? this.guard(id, () => spec.when!(infoOf(f, h)), false) : true),
              run: (t) => this.guard(id, () => spec.run(apiRef(t)!), undefined),
            }),
          ),
        choose: (o) =>
          new Promise((resolve) => {
            let done = false;
            const NOTHING = { id: 'none', group: '', title: 'Ничего не найдено' };
            const step = {
              placeholder: o.placeholder ?? o.title,
              plate: () => ({ kind: 'text', text: o.title }),
              rows: (q: string) => {
                const rows = o.items
                  .map((it) => ({ it, m: q.trim() ? fuzzy(q, it.label) : null }))
                  .filter((x) => !q.trim() || x.m)
                  .map(({ it, m }) => ({ id: 'choose:' + it.id, group: o.title.toUpperCase(), title: it.label, at: m?.at, hint: it.hint, run: () => void ((done = true), resolve(it.id)) }));
                return rows.length ? rows : [NOTHING];
              },
            };
            if (this.stepCapture) this.stepCapture.step = step as never;
            else store.openStep(step as never);
            const stop = watch(() => store.palette, (p) => {
              if (p) return;
              stop();
              if (!done) resolve(null);
            });
          }),
        close: (v) => {
          declared('вида', m.contributes.views.some((x) => x.id === v), v);
          for (let pi = store.layout.panes.length - 1; pi >= 0; pi--)
            for (let ti = store.layout.panes[pi].tabs.length - 1; ti >= 0; ti--) if (store.layout.panes[pi]?.tabs[ti]?.kind === v) void store.closeTab(pi, ti);
        },
        widget: (el, field, value, onChange) => mountWidget(id, el, field, value, onChange, (err) => this.fail(id, err)),
        editor: (el, h, o = {}) => {
          const app = mount(PluginEditor, { target: el, props: { path: h.path, line: h.line, title: h.title, onref: (r: HeadingRef) => this.guard(id, () => o.onRef?.(r), undefined) } });
          const off = () => {
            void unmount(app);
          };
          keep(off);
          return { focus: () => (el.querySelector('.cm-content') as HTMLElement | null)?.focus({ preventScroll: true }), dispose: off };
        },
        currentReview: () =>
          this.review?.plugin === id
            ? ((r) => ({
                step: (d) => this.reviewStep(d),
                redraw: () => void this.reviewRedraw++,
                update: () => void this.reviewBar++,
                show: (i) => this.reviewShow(r, i),
                setItems: (items, cur) => {
                  if (this.review !== r) return;
                  const was = r.refs[r.cur];
                  r.refs = items.map((x) => ({ path: String(x.path), line: Number(x.line), title: String(x.title) }));
                  r.cur = Math.min(Math.max(-1, cur ?? r.cur), r.refs.length - 1);
                  const now = r.refs[r.cur];
                  if (now && (!was || was.path !== now.path || was.title !== now.title)) r.gen++;
                },
                end: () => void (this.review === r && this.endReview(true)),
              }))(this.review)
            : null,
        setMonthFilter: (f) => {
          if (!f) {
            if (this.monthFilter?.plugin === id) this.monthFilter = null;
            return;
          }
          const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
          if (!this.monthFilter || this.monthFilter.plugin !== id) keep(() => void (this.monthFilter?.plugin === id && (this.monthFilter = null)));
          this.monthFilter = { plugin: id, layers: strs(f.layers), hidden: strs(f.hidden) };
        },
        setBadge: (nav, n) => {
          declared('раздела', m.contributes.navSections.some((x) => x.id === nav), nav);
          this.badges.set(nav, Math.max(0, Math.floor(Number(n) || 0)));
        },
        refile: (ref, o = {}) =>
          new Promise((resolve) => {
            const f = fileOf(ref.path);
            const h = f && findHeading(f.headings, ref);
            if (!f || !h) return resolve(null);
            let done = false;
            let writing = false; // the core closes the dialog, then writes: not a cancel
            store.refileHeading(f, h, {
              before: async () => {
                writing = true;
                if (o.before) await this.guard(id, () => o.before!(), undefined);
              },
              done: (r) => {
                done = true;
                if (o.onUndo) r.step.onUndo = () => this.guard(id, () => o.onUndo!(), undefined);
                const to = store.files.find((x) => x.path === r.path);
                const th = to?.headings.find((x) => x.line === r.line);
                resolve({ path: to?.name ?? r.path, line: r.line, title: th?.title ?? h.title, label: r.label });
                return !!o.quiet; // the plugin tells of it itself, or the core's toast
              },
            });
            const stop = watch(() => store.refile, (rq) => {
              if (rq) return;
              stop();
              if (!done && !writing) resolve(null);
            });
          }),
        notify: (text, actions) => store.note(text, actions?.map((a) => ({ label: a.label, run: () => this.guard(id, () => a.run(), undefined) })), actions?.length ? 8000 : 4000),
      },
      exports: (fns) => {
        for (const k of Object.keys(fns)) declared('функции', m.exports.includes(k), k);
        this.exported.set(id, fns);
        return keep(() => void (this.exported.get(id) === fns && this.exported.delete(id)));
      },
      plugins: {
        call: async <T>(other: string, fn: string, ...args: unknown[]) => {
          const f = this.live(other) && this.active.has(other) ? this.exported.get(other)?.[fn] : undefined;
          if (!f) return undefined;
          try {
            const r = await this.guard(other, () => (f as (...a: unknown[]) => unknown)(...clone(args)), undefined);
            return clone(r) as T | undefined;
          } catch {
            return undefined;
          }
        },
      },
      storage: { folder: this.storeOf(id, 'folder', 'data', keep), local: this.storeOf(id, 'local', 'data', keep) },
      events: { on: (e, fn) => keep(this.listen(id, e, fn)) },
      statusSets: {
        set: (defs, o = {}) => {
          for (const d of sets) d();
          sets = defs.map((d) => {
            const def = { name: String(d.name), states: d.states.map((x) => ({ name: String(x.name), done: !!x.done, ...(x.color ? { color: x.color } : {}) })) };
            // `ifMissing`: only while no set of the project knows its first status (the project's own goals' set wins)
            const when = (all: WorkflowDef[]) => this.live(id) && (!o.ifMissing || !all.some((w) => !w.feature && w.states.some((x) => x.name === def.states[0]?.name)));
            return keep(store.registerStatusSet(id, def, when));
          });
          store.refreshStatusSets();
        },
      },
      settings: {
        values: () => this.settingsValues(m),
        onChange: (fn) => keep(watch(() => this.settingsValues(m), (v) => this.guard(id, () => fn(v), undefined))),
        dynamic: (key, spec) => {
          const k = id + ':' + key;
          this.dynamic.set(k, spec);
          return keep(() => void (this.dynamic.get(k) === spec && this.dynamic.delete(k)));
        },
      },
    };
    if (can('clipboard'))
      ctx.clipboard = { write: (text) => navigator.clipboard.writeText(String(text)) };
    if (can('net'))
      ctx.net = {
        fetch: async (url, init = {}) => {
          const host = hostOf(url);
          if (!host) throw new Error('адрес — http или https');
          if (!hostAllowed(m.net, host)) throw new Error(`хоста ${host} нет в манифесте`);
          const r = await invoke<{ status: number; headers: [string, string][]; text: string }>('net_fetch', {
            plugin: id, url, method: init.method ?? 'GET', headers: Object.entries(init.headers ?? {}), body: init.body ?? null,
          });
          return { status: r.status, ok: r.status >= 200 && r.status < 300, headers: Object.fromEntries(r.headers), text: r.text };
        },
      };
    if (can('index.read'))
      ctx.index = {
        query: async (q) => query(q),
        heading: async (ref) => {
          const f = fileOf(ref.path);
          const h = f && findHeading(f.headings, ref);
          return f && h ? infoOf(f, h) : null;
        },
        body: async (ref) => {
          const f = fileOf(ref.path);
          const h = f && findHeading(f.headings, ref);
          return f && h ? bodyOf(f.text, h) : null;
        },
        byId: async (id) => {
          const want = String(id).trim();
          for (const f of store.files)
            for (const h of f.headings) if (h.id === want) return { path: f.name, line: h.line, title: h.title };
          return null;
        },
        outline: async (path) => {
          const f = fileOf(path);
          return f ? f.headings.map((h) => infoOf(f, h)) : [];
        },
        files: async () => store.files.filter((f) => !isArchive(f.name)).map((f) => ({ path: f.name, title: displayName(f.name) })), // not the archives: as the agenda
        statusTone: async (kw, path) => {
          const f = fileOf(path);
          return f && kw ? (namedFor(kw, f.wf) as Named) : null;
        },
        inbox: async () => ({ path: store.inboxFile?.name ?? null, chosen: store.inboxCfg.file, add: store.inboxCfg.add }),
        folder: async () => store.dir ?? null,
        workflow: async (path) => {
          const f = fileOf(path);
          const seqs = f?.wf.sequences ?? store.config.workflows;
          return {
            open: [...(f?.wf.open ?? DEFAULT_WORKFLOW.open)], done: [...(f?.wf.done ?? DEFAULT_WORKFLOW.done)],
            sets: seqs.map((q) => ({ name: q.name, states: q.states.map((x) => ({ name: x.name, done: !!x.done, ...(x.color ? { color: x.color as Named } : {}) })) })),
            logbook: !!(f?.wf.behavior ?? store.config.behavior).logbook,
          };
        },
      };
    if (can('files.read') || can('files.edit'))
      ctx.files = {
        read: async (path) => {
          const f = fileOf(path);
          if (!f) throw new Error(`нет файла «${path}» в рабочей папке`);
          return f.text;
        },
      };
    if (can('files.edit'))
      ctx.edit = {
        transaction: async (label, build, o = {}) => {
          let t: CoreTx | null = null;
          const ev: Changed[] = [];
          const onUndo = o.onUndo ? () => this.guard(id, () => o.onUndo!(), undefined) : undefined;
          const step = await store.transaction(label, (tx) => {
            t = tx;
            build(apiTx(tx, ev));
          }, onUndo);
          const tx = t as CoreTx | null;
          if (step) {
            for (const [r, w] of ev) this.headingChanged(r, w);
            return 'ok';
          }
          return tx?.conflict ? 'conflict' : tx && !tx.error && !tx.result().length ? 'ok' : 'error';
        },
        undo: () => store.undoLast(),
        ensureFile: async (path: string) => !!(await store.ensureFile(String(path))),
      };
    return ctx;
  }

  /** The plugin's own place of a storage: `{ data, settings }` in its file (or on this Mac). */
  private whole(id: string, where: 'folder' | 'local'): Record<string, unknown> {
    const v = where === 'folder' ? store.folderData(id) : store.localData(id);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }
  private async put(id: string, where: 'folder' | 'local', part: 'data' | 'settings', value: unknown) {
    const next = { ...this.whole(id, where), [part]: value };
    if (where === 'folder') await store.setFolderData(id, next);
    else store.setLocalData(id, next);
  }
  private storeOf(id: string, where: 'folder' | 'local', part: 'data', keep: (d: Dispose) => Dispose): Store {
    return {
      get: <T>() => clone(this.whole(id, where)[part]) as T | undefined,
      set: (v) => this.put(id, where, part, clone(v)),
      onChange: (fn) => keep(watch(() => JSON.stringify(this.whole(id, where)[part] ?? null), () => this.guard(id, () => fn(), undefined))),
    };
  }

  // ---- settings by the manifest's schema --------------------------------------------------------------------------
  private fields(m: Manifest): Field[] {
    return m.contributes.settings.flatMap((s) => s.groups.flatMap((g) => g.fields));
  }
  settingsValues(m: Manifest): Values {
    const out: Values = {};
    const folder = (this.whole(m.id, 'folder').settings ?? {}) as Values;
    const local = (this.whole(m.id, 'local').settings ?? {}) as Values;
    for (const f of this.fields(m))
      for (const k of f.type === 'pair' ? [f.key, f.key2] : [f.key]) {
        const own = f.where === 'folder' ? folder : local;
        const d = (f as { default?: unknown; default2?: unknown })[k === f.key ? 'default' : 'default2'];
        out[k] = k in own ? own[k] : (d ?? null);
      }
    return out;
  }
  private async setSettings(m: Manifest, patch: Values) {
    const by = { folder: {} as Values, local: {} as Values };
    for (const f of this.fields(m)) for (const k of f.type === 'pair' ? [f.key, f.key2] : [f.key]) if (k in patch) by[f.where][k] = patch[k];
    for (const where of ['folder', 'local'] as const)
      if (Object.keys(by[where]).length) await this.put(m.id, where, 'settings', { ...((this.whole(m.id, where).settings ?? {}) as Values), ...by[where] });
    // the first change moves what config.json still has (a feature's settings of before) to the plugin's file
    if (store.hasLegacy(m.id)) await store.setFolderData(m.id, this.whole(m.id, 'folder'));
  }
  private schemaOf(m: Manifest, s: ManifestSettings, i: number): Schema {
    const dyn = (key: string) => this.dynamic.get(m.id + ':' + key);
    const field = (f: Field): Field => {
      const hint = (v: Values) => this.guard(m.id, () => dyn(f.key)?.hint?.(v), undefined) ?? (typeof f.hint === 'string' ? f.hint : '');
      if (f.type === 'choice') return { ...f, hint, options: (v) => (this.guard(m.id, () => dyn(f.key)?.options?.(v), undefined) as CoreOpt[] | undefined) ?? (Array.isArray(f.options) ? f.options : []) };
      if (f.type === 'file') return { ...f, hint, show: (rel) => this.guard(m.id, () => dyn(f.key)?.show?.(rel), undefined) ?? rel ?? 'Не выбран' };
      if (f.type === 'text') return { ...f, hint, clean: (t) => this.guard(m.id, () => dyn(f.key)?.clean?.(t), undefined) ?? t };
      if (f.type === 'pair') {
        const both = (f as unknown as { options?: [CoreOpt[], CoreOpt[]] }).options;
        return { ...f, hint, options: (v) => (this.guard(m.id, () => dyn(f.key)?.options?.(v), undefined) as [CoreOpt[], CoreOpt[]] | undefined) ?? (Array.isArray(both) ? both : [[], []]) };
      }
      return { ...f, hint };
    };
    return {
      id: `${m.id}-${i}`,
      label: s.section ?? s.block ?? m.name,
      groups: s.groups.map((g): Group => ({ ...g, fields: g.fields.map(field) })),
      values: () => this.settingsValues(m),
      set: (patch) => this.setSettings(m, patch),
    };
  }

  // ---- events -------------------------------------------------------------------------------------------------
  private listen(id: string, e: EventName, fn: (p: unknown) => void): Dispose {
    const send = (p: unknown) => this.guard(id, () => fn(p), undefined);
    switch (e) {
      case 'file.changed': {
        let last = new Map(store.files.map((f) => [f.name, f.text]));
        return watch(() => store.files, (files) => {
          const next = new Map(files.map((f) => [f.name, f.text]));
          for (const [name, text] of next)
            if (last.get(name) !== text) {
              const by = store.diskTaken.has(name) ? 'disk' : 'edit';
              store.diskTaken.delete(name);
              send({ path: name, by });
            }
          last = next;
        });
      }
      case 'heading.changed':
        this.headingListeners.add(send);
        return () => this.headingListeners.delete(send);
      case 'tab.active':
        const now = () => {
          const t = store.tab;
          const own = !!t && !!this.manifest(id)?.contributes.views.some((v) => v.id === t.kind);
          send({ kind: t?.kind ?? null, path: t?.kind === 'file' ? (store.file?.name ?? null) : null, state: own ? clone(t!.data) : undefined, view: t?.kind === 'file' ? store.viewOf(t) || null : null });
        };
        queueMicrotask(now); // the tab shown now, then each change
        return watch(() => [store.tab?.id, store.tab?.data, store.viewOf(store.tab)], now);
      case 'inbox.changed':
        return watch(() => store.inboxFile?.name ?? null, (p) => send({ path: p }));
      case 'folder.changed':
        return watch(() => store.dir, (d) => send({ folder: d }));
      case 'theme.changed': {
        const o = new MutationObserver(() => send({ appearance: document.documentElement.dataset.appearance ?? null }));
        o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-appearance', 'style'] });
        return () => o.disconnect();
      }
      case 'day.changed': {
        let day = new Date().toDateString();
        const tick = () => {
          const d = new Date().toDateString();
          if (d !== day) {
            day = d;
            send({ date: new Date() });
          }
        };
        const t = setInterval(tick, 60_000);
        document.addEventListener('visibilitychange', tick); // the Mac woke up
        return () => {
          clearInterval(t);
          document.removeEventListener('visibilitychange', tick);
        };
      }
    }
    throw new Error(`нет события «${e}»`);
  }
  private headingListeners = new Set<(p: unknown) => void>();
  /** After a plugin's transaction: what it changed in which heading. */
  headingChanged(ref: HeadingRef, what: Change) {
    for (const l of this.headingListeners) l({ ref, what });
  }
}

export const plugins = new Host();

// ---- helpers --------------------------------------------------------------------------------------------------

interface SlotPiece {
  plugin: string;
  render: (el: HTMLElement, data: unknown) => Dispose | void;
}
/** Where the built-in plugins' sections of the navigator stand (views.ts: Файлы 0 … Поиск 70). */
const BUILTIN_NAV: Record<string, number> = { inbox: 10, 'quarter-goals': 40, calendar: 50 };
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
/** An effect outside any component: `fn` with the new value when it changes (not at first). */
function watch<T>(read: () => T, fn: (v: T) => void): Dispose {
  let first = true;
  return $effect.root(() => {
    $effect(() => {
      const v = read();
      if (first) {
        first = false;
        return;
      }
      untrack(() => fn(v));
    });
  });
}

plugins.declare();

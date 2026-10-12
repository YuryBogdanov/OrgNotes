// The calendar (ТЗ 24) as a module of its own (roadmap 0.2): its settings, the layers and files shown, moving and
// making entries. It uses the core (`store`) only through what the core offers to every feature; the core knows
// nothing of it — its settings come by `store.onConfig`.

import { store, type NoteFile } from '../store.svelte';
import { newTab, openFile, openFromAgenda, openView, type Tab } from '../layout';
import { startOf, sequenceFor } from '../org';
import { weekdayNames } from '../edits';
import { bareTitle } from '../refile';
import { byDay, entriesIn, hasDated, isoDay, type CalEntry, type Layer } from '../calIndex';
import { CAL_FOLDER_KEYS, CAL_LOCAL_KEYS, calPart, insertEntry, moveEntry, readCal, type CalSettings, type NewEntry } from '../calEdit';
import type { Step } from '../journal';

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};
function readLayers(): Layer[] {
  try {
    const v = JSON.parse(lsGet('cal:layers') ?? 'null');
    if (Array.isArray(v)) return v.filter((x): x is Layer => ['task', 'deadline', 'event', 'wait', 'done'].includes(x));
  } catch {
    /* the default */
  }
  return ['task', 'deadline', 'event', 'done']; // «Ожидания» off, as on the mockup
}

class Calendar {
  // ---- «Настройки → Календарь»: what new entries go to and get in the notes folder (`.orgnotes/plugins/
  // calendar.json`), the look and the moves on this Mac -------------------------------------------------------------
  cfg = $derived<CalSettings>(
    readCal({ ...((store.folderData('calendar') as object | undefined) ?? {}), ...((store.localData('calendar') as object | undefined) ?? {}) }),
  );
  async setCfg(c: Partial<CalSettings>) {
    const next = { ...this.cfg, ...c };
    store.setLocalData('calendar', calPart(next, CAL_LOCAL_KEYS));
    if (Object.keys(c).some((k) => (CAL_FOLDER_KEYS as readonly string[]).includes(k)) || this.legacy())
      return store.setFolderData('calendar', calPart(next, CAL_FOLDER_KEYS));
    return true;
  }
  /** Its settings still in config.json (before roadmap 0.6): the first change moves them. */
  private legacy() {
    return store.hasLegacy('calendar');
  }

  // ---- the tab -----------------------------------------------------------------------------------------------
  /** ⌘3: the calendar in the active pane; the navigator shows its layers and files. */
  showHere() {
    openView(store.layout, store.layout.active, 'calendar', () => this.fresh());
    store.setNavMode('calendar');
  }
  /** The state of a new calendar tab: the view as set, today. */
  fresh(): { view: 'month' | 'week'; date: string } {
    return { view: this.cfg.view, date: isoDay(new Date()) };
  }
  /** The toolbar's «Календарь»: in the second pane (or out of it). */
  toggleSecond() {
    store.toggleSecond('calendar', () => ({ ...newTab('calendar'), data: this.fresh() }));
    const p = store.layout.panes[1];
    if (p?.tabs[p.active]?.kind === 'calendar') store.setNavMode('calendar');
  }
  /** Change the calendar state of a tab (the view, the chosen day). */
  setTab(t: Tab, c: Partial<{ view: 'month' | 'week'; date: string }>) {
    t.data = { ...(t.data ?? { view: 'month', date: isoDay(new Date()) }), ...c };
  }
  /** An entry picked in the calendar: its file in a new tab of this pane, or (⌘) in the neighbour pane. */
  openEntry(e: { path: string; line: number }, neighbour = false) {
    const pi = store.layout.active;
    if (neighbour) {
      const t = openFromAgenda(store.layout, pi, e.path, e.line, '', 'neighbor');
      t.fromAgenda = null;
    } else {
      openFile(store.layout, pi, e.path, e.line, { focus: true });
      store.layout.active = pi;
    }
  }

  // ---- layers and files shown, on this Mac ------------------------------------------------------------------
  layers = $state<Layer[]>(readLayers());
  setLayer(l: Layer, on: boolean) {
    this.layers = on ? [...new Set([...this.layers, l])] : this.layers.filter((x) => x !== l);
    lsSet('cal:layers', JSON.stringify(this.layers));
  }
  /** Files left out of the calendar, per notes folder. */
  hiddenAll = $state<Record<string, string[]>>((() => {
    try {
      const v = JSON.parse(lsGet('cal:hidden') ?? '{}');
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  })());
  get hiddenNow(): string[] {
    return this.hiddenAll[store.dir ?? ''] ?? [];
  }
  setFile(name: string, on: boolean) {
    const h = this.hiddenNow.filter((x) => x !== name);
    this.hiddenAll = { ...this.hiddenAll, [store.dir ?? '']: on ? h : [...h, name] };
    lsSet('cal:hidden', JSON.stringify(this.hiddenAll));
  }
  /** Files with something dated: the «ФАЙЛЫ» of the calendar. */
  get files(): NoteFile[] {
    return store.files.filter((f) => hasDated(f));
  }
  /** The entries between two days in the layers and files shown, by day and in order. */
  days(from: Date, to: Date): Map<string, CalEntry[]> {
    const hidden = new Set(this.hiddenNow);
    const layers = new Set(this.layers);
    const files = store.files.filter((f) => !hidden.has(f.name));
    const open = [...new Set(store.files.flatMap((f) => f.wf.open))];
    return byDay(entriesIn(files, from, to).filter((e) => layers.has(e.layer)), open);
  }

  // ---- moving and making entries (on disk at once, a step of the journal) -----------------------------------
  /** What is being dragged (a chip, an event, a task of «Без даты»); the grab's offset in an event. */
  drag = $state<{ path: string; line: number; layer: Layer | 'undated'; repeat: boolean; title: string; dy: number } | null>(null);
  /** An entry dropped on a day (and a time in the week): its date is changed in the file. */
  async move(e: { path: string; line: number; layer: Layer | 'undated' }, to: Date, time?: string | null): Promise<boolean> {
    const f = store.files.find((x) => x.path === e.path);
    if (!f) return false;
    const text = moveEntry(f.text, e.line, e.layer, to, weekdayNames(f.text), { time, keepDeadline: this.cfg.keepDeadline });
    if (text === f.text) return false;
    const done = await store.writeAll(`Дата изменена: ${bareTitle(f.headings.find((h) => h.line === e.line)?.title ?? '')}`, [{ path: f.path, text }]);
    if (!done) return false;
    store.note('Дата изменена', [{ label: 'Отменить', run: () => void store.undo(done) }]);
    return true;
  }
  /** Where a new task or event goes: the file as set (or the last one / the Inbox) and the heading. */
  target(kind: 'task' | 'event'): { file: NoteFile | undefined; heading: string } {
    const c = this.cfg;
    const set = kind === 'task' ? c.taskFile : c.eventFile;
    const last = c.pick === 'last' ? c.last[kind] : null;
    const byName = (n: string | null) => (n ? store.files.find((x) => x.name === n) : undefined);
    return { file: byName(last) ?? byName(set) ?? store.inboxFile, heading: kind === 'task' ? c.taskHeading : c.eventHeading };
  }
  /** «+ Задача» / «+ Событие»: the quick entry of the calendar (null: closed). */
  newEntry = $state<{ kind: 'task' | 'event'; date: string; n: number } | null>(null);
  openNew(kind: 'task' | 'event', date: string) {
    this.newEntry = { kind, date, n: Date.now() };
  }
  /** A new entry written into `file` (relative) as the settings say. */
  async create(e: Omit<NewEntry, 'status' | 'dateKind' | 'minutes'>, file: string): Promise<Step | null> {
    const f = store.files.find((x) => x.name === file);
    if (!f || !e.title.trim()) return null;
    const c = this.cfg;
    const open = (f.wf.sequences ?? []).flatMap((s) => s.states.map((x) => x.name));
    const status =
      e.kind === 'task'
        ? c.taskStatus && f.wf.open.includes(c.taskStatus) ? c.taskStatus : startOf(sequenceFor(f.wf, null))
        : c.eventStatus && open.includes(c.eventStatus) ? c.eventStatus : null;
    const heading = e.kind === 'task' ? c.taskHeading : c.eventHeading;
    const add = f === store.inboxFile ? store.inboxCfg.add : 'end';
    const r = insertEntry(f.text, heading || null, { ...e, status, dateKind: c.dateKind, minutes: c.minutes }, weekdayNames(f.text), add);
    const done = await store.writeAll(`${e.kind === 'task' ? 'Новая задача' : 'Новое событие'}: ${e.title.trim()}`, [{ path: f.path, text: r.text }]);
    if (!done) return null;
    if (c.last[e.kind] !== file) await this.setCfg({ last: { ...c.last, [e.kind]: file } });
    return done;
  }
}

export const calendar = new Calendar();
// before roadmap 0.6 all of it was `calendar` in config.json
store.registerStorage('calendar', { legacy: (parsed) => parsed?.calendar, legacyKeys: ['calendar'], localLegacy: (parsed) => parsed?.calendar });

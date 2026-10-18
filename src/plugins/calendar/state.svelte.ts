// The calendar (ТЗ 24) as the plugin «calendar» (ТЗ 29), on the public API only: the notes as it sees them (every
// file read and parsed with its statuses, again when one changes), its settings, the layers and the files shown,
// moving and making entries.

import type { Ctx, HeadingRef } from '@panopticon/api';
import { byDay, entriesIn, hasDated, isoDay, readOrg, sequenceFor, startOf, weekdayNames, type CalEntry, type CalFile, type Layer, type Workflow } from '@panopticon/api/org';
import { DEFAULT_CAL, insertEntry, moveEntry, readCal, type CalSettings, type NewEntry } from './edit';

export interface PFile extends CalFile {
  wf: Workflow;
}
const ALL: Layer[] = ['task', 'deadline', 'event', 'wait', 'done'];
const DEFAULT_LAYERS: Layer[] = ['task', 'deadline', 'event', 'done']; // «Ожидания» off, as on the mockup
/** A calendar tab's state. */
export interface CalState {
  view: 'month' | 'week';
  date: string;
  /** Opened from «Агенда» («Неделя», «Месяц» of its switch, ТЗ 47 §1.6): «‹ К агенде» goes back there. */
  back?: 'agenda';
}

class Calendar {
  ctx!: Ctx;
  // ---- the notes ------------------------------------------------------------------------------------------------
  files = $state.raw<PFile[]>([]);
  inbox = $state.raw<{ path: string | null; add: 'top' | 'end' }>({ path: null, add: 'top' });
  private folder: string | null = null;
  private reading = 0;
  async read(path: string): Promise<PFile | null> {
    const f = await readOrg(this.ctx, path);
    return f && { name: path, path, text: f.text, wf: f.wf, headings: f.headings };
  }
  /** Every file again (the folder changed). */
  async load() {
    const n = ++this.reading;
    const [list, ib, folder] = await Promise.all([this.ctx.index!.files(), this.ctx.index!.inbox(), this.ctx.index!.folder()]);
    const files = (await Promise.all(list.map((f) => this.read(f.path)))).filter((f): f is PFile => !!f);
    if (n !== this.reading) return;
    this.files = files.sort((a, b) => a.name.localeCompare(b.name));
    this.inbox = { path: ib.path, add: ib.add };
    this.folder = folder;
    this.readLocal();
  }
  /** One file again (an edit, a change on disk). */
  async refresh(path: string) {
    const f = await this.read(path);
    const rest = this.files.filter((x) => x.path !== path);
    this.files = f ? [...rest, f].sort((a, b) => a.name.localeCompare(b.name)) : rest;
  }
  fileOf(path: string) {
    return this.files.find((f) => f.path === path);
  }

  // ---- «Настройки → Календарь»: the manifest's fields; the last files chosen in the folder's data -----------------
  cfg = $state.raw<CalSettings>(DEFAULT_CAL);
  readCfg() {
    const last = this.ctx.storage.folder.get<{ last?: CalSettings['last'] }>()?.last;
    this.cfg = readCal({ ...this.ctx.settings.values(), last });
  }
  private async setLast(last: CalSettings['last']) {
    await this.ctx.storage.folder.set({ ...(this.ctx.storage.folder.get<object>() ?? {}), last });
  }

  // ---- the tab --------------------------------------------------------------------------------------------------
  /** The state of a new calendar tab: the view as set, today. */
  fresh(): CalState {
    return { view: this.cfg.view, date: isoDay(new Date()) };
  }
  /** ⌘3: the calendar in the active pane; the navigator shows its layers and files. */
  async showHere() {
    await this.ctx.ui.open<CalState>('calendar.view', this.fresh());
    void this.ctx.commands.run('calendar.nav');
  }
  /** An entry picked in the calendar: its file at the heading here, or (⌘) in the neighbour pane. */
  openEntry(e: { path: string; line: number }, neighbour = false) {
    void this.ctx.commands.run('file.open', { path: e.path, line: e.line, neighbour });
  }
  // ---- the entry chosen (ТЗ 34): a chip, a row of «… ещё N», a card of the day, a task without a date ------------
  /** A click chooses an entry, a double click or ↩ opens it; the core's menu, keys and palette act on it. */
  picked = $state<{ path: string; line: number; layer: Layer | 'undated'; day: string | null } | null>(null);
  isPicked(e: { path: string; line: number; layer?: Layer | 'undated' }) {
    const p = this.picked;
    return !!p && p.path === e.path && p.line === e.line && p.layer === (e.layer ?? 'undated');
  }
  pick(e: { path: string; line: number; layer?: Layer | 'undated'; day?: string }) {
    this.picked = { path: e.path, line: e.line, layer: e.layer ?? 'undated', day: e.day ?? null };
  }
  /** The heading of the entry chosen, as the file has it now. */
  pickedRef(): HeadingRef | null {
    const p = this.picked;
    const h = p && this.fileOf(p.path)?.headings.find((x) => x.line === p.line);
    return p && h ? { path: p.path, line: h.line, title: h.title } : null;
  }
  /** The core's list of the calendar tab (`ui.taskList`): its menu at a point. */
  tasks: { menu(at: { x: number; y: number }): void; dispose(): void } | null = null;
  /** Right click (⌃-click) on an entry: chosen, then the core's menu of the task. */
  menuOf(ev: MouseEvent, e: { path: string; line: number; layer?: Layer | 'undated'; day?: string }) {
    ev.preventDefault();
    ev.stopPropagation();
    this.pick(e);
    this.tasks?.menu({ x: ev.clientX, y: ev.clientY });
  }
  /** «Выполнено» of the day panel: the first final status of the task's set. */
  async done(e: { path: string; line: number }) {
    const f = this.fileOf(e.path);
    const h = f?.headings.find((x) => x.line === e.line);
    if (!f || !h) return;
    const to = sequenceFor(f.wf, h.keyword).states.find((x) => x.done)?.name;
    if (to && to !== h.keyword) await this.ctx.edit!.transaction(`Выполнено: ${h.title}`, (tx) => tx.setStatus({ path: f.path, line: h.line, title: h.title }, to));
  }
  /** «Перенести…» of the day panel: the calendar of three months, then the entry's date, as a drag does. */
  async reschedule(e: { path: string; line: number; layer: Layer | 'undated'; day: string | null }) {
    const f = this.fileOf(e.path);
    const d = await this.ctx.ui.pickDate({
      kind: e.layer === 'deadline' ? 'DEADLINE' : 'SCHEDULED', names: f ? weekdayNames(f.text) : undefined,
      current: e.day ? new Date(+e.day.slice(0, 4), +e.day.slice(5, 7) - 1, +e.day.slice(8, 10)) : null,
    });
    if (d) await this.move(e, d);
  }
  /** «Изменить в настройках». */
  settings() {
    void this.ctx.commands.run('settings.open', { section: 'Календарь' });
  }

  // ---- layers and files shown, on this Mac (the files per notes folder) -----------------------------------------
  layers = $state.raw<Layer[]>(DEFAULT_LAYERS);
  private hiddenAll: Record<string, string[]> = {};
  hiddenNow = $state.raw<string[]>([]);
  private readLocal() {
    const d = this.ctx.storage.local.get<{ layers?: unknown; hidden?: unknown }>() ?? {};
    this.layers = Array.isArray(d.layers) ? d.layers.filter((x): x is Layer => ALL.includes(x as Layer)) : DEFAULT_LAYERS;
    this.hiddenAll = d.hidden && typeof d.hidden === 'object' ? (d.hidden as Record<string, string[]>) : {};
    this.hiddenNow = this.hiddenAll[this.folder ?? ''] ?? [];
    this.tell();
  }
  private saveLocal() {
    void this.ctx.storage.local.set({ layers: this.layers, hidden: this.hiddenAll });
    this.tell();
  }
  /** The core's month under a review's card shows what the calendar shows (#99). */
  private tell() {
    this.ctx.ui.setMonthFilter({ layers: this.layers, hidden: this.hiddenNow });
  }
  setLayer(l: Layer, on: boolean) {
    this.layers = on ? [...new Set([...this.layers, l])] : this.layers.filter((x) => x !== l);
    this.saveLocal();
  }
  setFile(name: string, on: boolean) {
    const h = this.hiddenNow.filter((x) => x !== name);
    this.hiddenNow = on ? h : [...h, name];
    this.hiddenAll = { ...this.hiddenAll, [this.folder ?? '']: this.hiddenNow };
    this.saveLocal();
  }
  /** Files with something dated: the «ФАЙЛЫ» of the calendar. */
  get dated(): PFile[] {
    return this.files.filter((f) => hasDated(f));
  }
  /** The files shown (not hidden). */
  get shown(): PFile[] {
    const hidden = new Set(this.hiddenNow);
    return this.files.filter((f) => !hidden.has(f.name));
  }
  /** The entries between two days in the layers and files shown, by day and in order. */
  days(from: Date, to: Date): Map<string, CalEntry[]> {
    const layers = new Set(this.layers);
    const open = [...new Set(this.files.flatMap((f) => f.wf.open))];
    return byDay(entriesIn(this.shown, from, to).filter((e) => layers.has(e.layer)), open);
  }

  // ---- moving and making entries (on disk at once, a step of ⌘Z) -------------------------------------------------
  /** What is being dragged (a chip, an event, a task of «Без даты»); the grab's offset in an event. */
  drag = $state<{ path: string; line: number; layer: Layer | 'undated'; repeat: boolean; title: string; dy: number } | null>(null);
  /** An entry dropped on a day (and a time in the week): its date is changed in the file. */
  async move(e: { path: string; line: number; layer: Layer | 'undated' }, to: Date, time?: string | null): Promise<boolean> {
    const f = this.fileOf(e.path);
    if (!f) return false;
    const text = moveEntry(f.text, e.line, e.layer, to, weekdayNames(f.text), { time, keepDeadline: this.cfg.keepDeadline });
    if (text === f.text) return false;
    const h = f.headings.find((x) => x.line === e.line);
    const title = (h?.title ?? '').replace(/\s*\[\d*(?:\/\d*|%)\]/g, '').trim(); // without a [2/3] cookie
    const keepDeadline = this.cfg.keepDeadline;
    const r = await this.ctx.edit!.transaction(`Дата изменена: ${title}`, (tx) => tx.update(f.path, (now) => moveEntry(now, e.line, e.layer, to, weekdayNames(now), { time, keepDeadline })));
    if (r !== 'ok') return false;
    this.ctx.ui.notify('Дата изменена', [{ label: 'Отменить', run: () => void this.ctx.edit!.undo() }]);
    return true;
  }
  /** Where a new task or event goes: the file as set (or the last one / the Inbox) and the heading. */
  target(kind: 'task' | 'event'): { file: PFile | undefined; heading: string } {
    const c = this.cfg;
    const set = kind === 'task' ? c.taskFile : c.eventFile;
    const last = c.pick === 'last' ? c.last[kind] : null;
    const byName = (n: string | null) => (n ? this.files.find((x) => x.name === n) : undefined);
    return { file: byName(last) ?? byName(set) ?? byName(this.inbox.path), heading: kind === 'task' ? c.taskHeading : c.eventHeading };
  }
  /** «+ Задача» / «+ Событие»: the calendar's quick entry, a sheet of its own. */
  openNew!: (kind: 'task' | 'event', date: string) => void;
  /** A new entry written into `file` (relative) as the settings say: the heading made where it goes. */
  async create(e: Omit<NewEntry, 'status' | 'dateKind' | 'minutes'>, file: string): Promise<HeadingRef | null> {
    const f = this.files.find((x) => x.name === file);
    if (!f || !e.title.trim()) return null;
    const c = this.cfg;
    const open = (f.wf.sequences ?? []).flatMap((s) => s.states.map((x) => x.name));
    const status =
      e.kind === 'task'
        ? c.taskStatus && f.wf.open.includes(c.taskStatus) ? c.taskStatus : startOf(sequenceFor(f.wf, null))
        : c.eventStatus && open.includes(c.eventStatus) ? c.eventStatus : null;
    const heading = e.kind === 'task' ? c.taskHeading : c.eventHeading;
    const add = f.name === this.inbox.path ? this.inbox.add : 'end';
    const entry = { ...e, status, dateKind: c.dateKind, minutes: c.minutes };
    let line = -1;
    const r = await this.ctx.edit!.transaction(`${e.kind === 'task' ? 'Новая задача' : 'Новое событие'}: ${e.title.trim()}`, (tx) =>
      tx.update(f.path, (text) => {
        const w = insertEntry(text, heading || null, entry, weekdayNames(text), add);
        line = w.line;
        return w.text;
      }),
    );
    if (r !== 'ok') return null;
    if (c.last[e.kind] !== file) await this.setLast({ ...c.last, [e.kind]: file });
    return { path: f.path, line, title: e.title.trim() };
  }
}

export const cal = new Calendar();

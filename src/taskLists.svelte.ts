// Actions on a task chosen in a list (ТЗ 34): the agenda, «Сегодня», the calendar, the navigator's «Задачи». A list
// registers itself here; a click chooses a task, the keys of the scope «list», the context menu and the palette's
// «ВЫДЕЛЕННАЯ ЗАДАЧА» act on it. Every change is a transaction of the core and a step of the lists' own stack of ⌘Z;
// the list keeps the changed row where it was until it is refreshed (`freeze`), and a toast offers to take it back.

import { store } from './store.svelte';
import { Tx, type HeadingRef, type Step } from './journal';
import { firstDone, sequenceFor, setKeyword, setPriority, toJs, toneFor, type Heading } from './org';
import { setTags, shiftEvent } from './edits';
import { priorityAfter, rotateStatus } from './outline';
import { bare, headingStep, setListTask, setMoreTaskCommands, taskCommands, type Ctx, type HeadingAct, type Icon, type TaskCommand, type TaskCtx } from './commands';
import { toneStyle } from './colors';
import type { MenuItem } from './ContextMenu.svelte';
import type { NoteFile } from './store.svelte';
import type { Tab } from './layout';

/** The date a row stands by in its list: ⌥⇧← → moves this one. */
export type { DateKind } from './org';
import type { DateKind } from './org';
/** A task of a list: its heading (found by line and title, as the journal finds it) and the date of its row. */
export interface ListTask extends HeadingRef {
  dk?: DateKind | null;
}
/** What a list tells the lists: where it is, what is chosen, and what it does for the menu and the keys. */
export interface ListSpec {
  id: string;
  el: () => HTMLElement | null | undefined;
  /** The tab it is shown in: the inspector shows its task while that tab is active. */
  tab?: () => Tab | undefined;
  selected: () => ListTask | null;
  /** ↩ (false) and ⌥↩ (true). */
  open: (other: boolean) => void;
  /** The second item of the menu (the agenda opens next to itself already: «Открыть здесь»). */
  otherLabel?: string;
  clear: () => void;
  /** ⌘R: the changed rows go, new ones come. */
  refresh: () => void;
  /** Before a change: the rows stay where they are. */
  freeze: () => void;
  /** More at the end of the menu (the board's «В архив», «Удалить»). */
  more?: (t: ListTask) => MenuItem[];
}

/** An action of a plugin on a task («действия с задачей», API 1.6): in the menu and in the palette's group. */
export interface TaskAction {
  key: string; // plugin + its id
  label: string;
  when: (f: NoteFile, h: Heading) => boolean;
  run: (t: HeadingRef) => void;
}

const PRIO: Record<string, string> = { A: '--tl:var(--todo)', B: '--tl:var(--wait)', C: '--tl:var(--fg2)' };
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WD = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const dayLabel = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const WD2 = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
/** «сегодня», «завтра», «вчера», else «16 окт»: the day in the new interface's toast. */
function relDay(d: Date): string {
  const n = Math.round((+new Date(d.getFullYear(), d.getMonth(), d.getDate()) - +midnight()) / 86_400_000);
  return n === 0 ? 'сегодня' : n === 1 ? 'завтра' : n === -1 ? 'вчера' : dayLabel(d);
}
const midnight = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};
const plus = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** The nearest Monday after today. */
export const nextMonday = (from = midnight()) => plus(from, ((8 - from.getDay()) % 7) || 7);

/** The file and the heading of a task now: at its line with its title, else the nearest one with that title. */
export function resolve(t: HeadingRef | null | undefined): { f: NoteFile; fi: number; h: Heading; hi: number } | null {
  if (!t) return null;
  const fi = store.files.findIndex((x) => x.path === t.path);
  const f = store.files[fi];
  if (!f) return null;
  let hi = f.headings.findIndex((h) => h.line === t.line && h.title === t.title);
  if (hi < 0) {
    let best = Infinity;
    f.headings.forEach((h, i) => {
      if (h.title === t.title && Math.abs(h.line - t.line) < best) {
        best = Math.abs(h.line - t.line);
        hi = i;
      }
    });
  }
  return hi >= 0 ? { f, fi, h: f.headings[hi], hi } : null;
}

class TaskLists {
  /** The lists shown now. */
  specs = $state.raw<ListSpec[]>([]);
  /** The list the focus was in last (the palette, a menu, the tags field keep it); null when it went elsewhere. */
  active = $state<string | null>(null);
  /** «„X“ — DONE · скроется при обновлении · Отменить ⌘Z» at the bottom of the list that made the change. */
  /** The toast after a change: `text` as the old interface says it; `lead`, `value` (bold), `title` — the new one's
   *  «Запланировано на **завтра** · План переезда» (ТЗ 48 §1). */
  toast = $state<{ list: string; text: string; n: number; lead?: string; value?: string; title?: string; action?: { label: string; run: () => void } } | null>(null);
  /** The context menu of a task, and the tags field. */
  menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  tagsReq = $state<{ list: string; task: ListTask; x: number; y: number } | null>(null);
  /** The steps made from the lists, the last one on top: ⌘Z in a list takes them back first. */
  private stack: Step[] = [];
  /** The texts the lists wrote: a list does not take them for a change from outside. */
  own = new Map<string, string>();
  /** A frozen list (its rows kept until ⌘R) is computed again when a file came, went, or changed not by the lists:
   *  `texts` are the files as the list was frozen. */
  changedOutside(files: readonly { path: string; text: string }[], texts: ReadonlyMap<string, string>): boolean {
    return files.length !== texts.size || files.some((f) => {
      const was = texts.get(f.path);
      return was === undefined || (f.text !== was && this.own.get(f.path) !== f.text);
    });
  }
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  /** The plugins' actions on a task. */
  actions = $state.raw<TaskAction[]>([]);
  addAction(a: TaskAction): () => void {
    this.actions = [...this.actions.filter((x) => x.key !== a.key), a];
    return () => void (this.actions = this.actions.filter((x) => x !== a));
  }
  /** The plugins' actions that apply to the task. */
  actionsFor(t: ListTask): TaskAction[] {
    const r = resolve(t);
    return r ? this.actions.filter((a) => a.when(r.f, r.h)) : [];
  }

  register(spec: ListSpec): () => void {
    this.specs = [...this.specs.filter((s) => s.id !== spec.id), spec];
    return () => {
      this.specs = this.specs.filter((s) => s !== spec);
      if (this.active === spec.id) this.active = null;
      if (this.toast?.list === spec.id) this.toast = null;
    };
  }
  spec(id: string | null) {
    return id ? this.specs.find((s) => s.id === id) : undefined;
  }
  /** The list with the focus in it now (its keys work), if any. */
  focused(): ListSpec | undefined {
    const a = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    // a field typed in, an editor or a panel inside a list (the board's new card, its card at the side) keep their keys
    if (!a || a.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return undefined;
    return this.specs.find((s) => s.el()?.contains(a));
  }
  /** The task chosen in the active list (the palette's group). */
  current(): { spec: ListSpec; task: ListTask } | null {
    const spec = this.spec(this.active);
    const task = spec?.selected();
    return spec && task ? { spec, task } : null;
  }
  /** The task chosen in the list shown in this tab (the inspector). */
  forTab(tab: Tab | undefined): { spec: ListSpec; task: ListTask } | null {
    if (!tab) return null;
    const spec = this.specs.find((s) => s.tab?.() === tab);
    const task = spec?.selected();
    return spec && task ? { spec, task } : null;
  }

  // ---- writing ---------------------------------------------------------------------------------------------------

  /**
   * One change of a task: built as the journal builds it, the list frozen first, its texts noted as the lists' own,
   * then written as one step. The toast tells `what` and offers to take it back.
   */
  async apply(list: string, t: ListTask, label: string, what: string, build: (tx: Tx, ref: HeadingRef) => void): Promise<boolean> {
    const tx = new Tx((path) => {
      const f = store.files.find((x) => x.path === path);
      return f && { path: f.path, text: f.text, wf: f.wf };
    });
    build(tx, t);
    if (tx.conflict || tx.error) {
      store.say(tx.conflict ? 'Не удалось: задача изменилась или пропала' : 'Не удалось: ' + tx.error);
      return false;
    }
    const texts = tx.result();
    if (!texts.length) return false;
    const spec = this.spec(list);
    spec?.freeze();
    for (const x of texts) this.own.set(x.path, x.text);
    const step = await store.writeAll(label, texts);
    if (!step) {
      spec?.refresh();
      return false;
    }
    this.stack.push(step);
    if (this.stack.length > 100) this.stack.shift();
    this.say(list, `«${bare(t.title)}» — ${what}`, { ...(this.words ?? { lead: what }), title: bare(t.title) });
    this.words = null;
    return true;
  }
  /** The words of the new interface's toast for the change being written (set by the action before `apply`). */
  private words: { lead: string; value?: string } | null = null;
  private say(list: string, text: string, w?: { lead: string; value?: string; title?: string }) {
    this.toast = { list, text, n: Date.now(), ...(w ?? {}) };
    this.holdToast(false);
  }
  /** The same toast for something else of the window (ТЗ 48 §3: «Добавлено в Inbox» with «Открыть»): its own button
   *  in place of «Отменить». */
  tell(w: { lead: string; value?: string; title?: string; action?: { label: string; run: () => void } }) {
    this.toast = { list: '*', text: w.lead, n: Date.now(), ...w };
    this.holdToast(false);
  }
  /** The pointer over the toast holds it (the new interface); off it — the time again: 4 s there, 6 s in the old one. */
  holdToast(on: boolean) {
    clearTimeout(this.toastTimer);
    if (!on && this.toast) this.toastTimer = setTimeout(() => (this.toast = null), store.nextUi ? 4000 : 6000);
  }
  /** ⌘Z in a list: the last step made from the lists, if it can still be taken back. False: none here. */
  async undo(): Promise<boolean> {
    const step = this.stack.pop();
    if (!step) return false;
    for (const c of step.changes) this.own.set(c.path, c.before);
    const ok = await store.undo(step);
    if (ok) this.toast = null;
    return ok;
  }
  get canUndo() {
    return this.stack.length > 0;
  }

  // ---- the actions ----------------------------------------------------------------------------------------------

  async status(list: string, t: ListTask, kw: string | null) {
    this.words = { lead: 'Статус', value: kw ?? 'без статуса' };
    const ok = await this.apply(list, t, 'Статус задачи', kw ?? 'без статуса', (tx, ref) => tx.update(ref.path, (text, wf) => {
      const h = tx.heading(ref);
      return h ? setKeyword(text, h, kw, wf) : null;
    }));
    // a repeating task done: its date moved on and its status came back (as in Org)
    const r = ok && kw ? resolve(t) : null;
    const d = r && r.h.keyword !== kw ? (r.h.scheduled ?? r.h.deadline) : undefined;
    if (d) this.say(list, `«${bare(t.title)}» — ${kw}, следующий раз ${dayLabel(toJs(d))}`, { lead: `${kw}, следующий раз`, value: relDay(toJs(d)), title: bare(t.title) });
    return ok;
  }
  /** ⇧→ / ⇧←: the next or the previous status of the task's set, as in the text. */
  cycleStatus(list: string, t: ListTask, dir: 'next' | 'prev') {
    const r = resolve(t);
    if (r) return this.status(list, t, rotateStatus(r.f.wf, r.h.keyword, dir));
  }
  priority(list: string, t: ListTask, p: string | null) {
    this.words = p ? { lead: 'Приоритет', value: '#' + p } : { lead: 'Приоритет снят' };
    return this.apply(list, t, 'Приоритет задачи', p ? `приоритет ${p}` : 'без приоритета', (tx, ref) => tx.update(ref.path, (text) => {
      const h = tx.heading(ref);
      return h ? setPriority(text, h, p) : null;
    }));
  }
  cyclePriority(list: string, t: ListTask, dir: 'up' | 'down') {
    const r = resolve(t);
    if (r) return this.priority(list, t, priorityAfter(r.h.priority, dir));
  }
  date(list: string, t: ListTask, kind: 'SCHEDULED' | 'DEADLINE', d: Date | null) {
    const what = d ? `${kind === 'SCHEDULED' ? 'перенесено на' : 'дедлайн'} ${dayLabel(d)}` : kind === 'SCHEDULED' ? 'дата снята' : 'дедлайн снят';
    this.words = d ? { lead: kind === 'SCHEDULED' ? 'Запланировано на' : 'Дедлайн', value: relDay(d) } : { lead: kind === 'SCHEDULED' ? 'Дата снята' : 'Дедлайн снят' };
    return this.apply(list, t, kind === 'SCHEDULED' ? 'Запланировать' : 'Дедлайн', what, (tx, ref) => tx.setPlanning(ref, kind, d));
  }
  /** ⌥⇧← →: the date the row stands by, ±1 day (a task with one date: that one; none: from today). */
  shiftDate(list: string, t: ListTask, n: number) {
    const r = resolve(t);
    if (!r) return;
    const h = r.h;
    const kind: DateKind = t.dk && (t.dk === 'event' ? h.event : t.dk === 'SCHEDULED' ? h.scheduled : h.deadline) ? t.dk
      : h.scheduled ? 'SCHEDULED' : h.deadline ? 'DEADLINE' : h.event ? 'event' : 'SCHEDULED';
    if (kind === 'event') {
      const to = plus(toJs(h.event!), n);
      this.words = { lead: 'Событие перенесено на', value: relDay(to) };
      return this.apply(list, t, 'Дата события', `перенесено на ${dayLabel(to)}`, (tx, ref) => tx.update(ref.path, (text) => {
        const x = tx.heading(ref);
        return x ? shiftEvent(text, x, n) : null;
      }));
    }
    const cur = kind === 'SCHEDULED' ? h.scheduled : h.deadline;
    return this.date(list, t, kind, plus(cur ? toJs(cur) : midnight(), n));
  }
  tags(list: string, t: ListTask, tags: string[]) {
    this.words = tags.length ? { lead: 'Теги', value: tags.join(', ') } : { lead: 'Теги сняты' };
    return this.apply(list, t, 'Теги задачи', tags.length ? `теги: ${tags.join(', ')}` : 'без тегов', (tx, ref) => tx.update(ref.path, (text) => {
      const h = tx.heading(ref);
      return h ? setTags(text, h, tags) : null;
    }));
  }
  /** «Копировать ссылку»: the link to the task as ⌃C L makes it (ТЗ 35: by :ID: — added when missing — or by title). */
  async copyLink(list: string, t: ListTask) {
    const r = resolve(t);
    if (!r) return;
    const res = await store.headingLinkAt(r.f.path, r.h.line);
    if (!res) return;
    const now = store.files.find((f) => f.path === r.f.path)?.text;
    if (now !== undefined && now !== r.f.text) this.own.set(r.f.path, now); // the :ID: added: not a change from outside
    try {
      await navigator.clipboard.writeText(res.link);
      this.say(list, `«${res.label}» — ссылка скопирована`);
    } catch (e) {
      store.say('Не удалось скопировать ссылку: ' + e);
    }
  }
  refile(t: ListTask) {
    const r = resolve(t);
    if (r) store.refileHeading(r.f, r.h, {});
  }
  /** «Выбрать дату…»: the calendar of three months (ТЗ 20), the time and the repeat of the stamp kept. */
  pickDate(list: string, t: ListTask, kind: 'SCHEDULED' | 'DEADLINE') {
    const c = this.ctx(list, t);
    if (c) store.openStep(headingStep(c, kind === 'SCHEDULED' ? 'schedule' : 'deadline'));
  }
  openTags(list: string, t: ListTask) {
    const row = this.spec(list)?.el()?.querySelector<HTMLElement>('[aria-selected="true"]');
    const r = row?.getBoundingClientRect();
    this.tagsReq = { list, task: t, x: r ? r.left + 60 : 200, y: r ? r.bottom + 4 : 200 };
  }

  /** The heading commands' context for a task: the palette's steps write through the list. */
  ctx(list: string, t: ListTask): Ctx | null {
    const r = resolve(t);
    if (!r) return null;
    const act: HeadingAct = {
      status: (k) => void this.status(list, t, k),
      priority: (p) => void this.priority(list, t, p),
      planning: (k, d) => void this.date(list, t, k, d),
      tags: (x) => void this.tags(list, t, x),
    };
    return { file: r.f, fileIdx: r.fi, heading: r.h, line: r.h.line, folderRel: '', canFiles: store.canManageFiles, noFolder: store.needsFolder, act };
  }

  // ---- the keys of the scope «list» --------------------------------------------------------------------------------

  run(id: string): boolean {
    const spec = this.focused();
    if (!spec || store.sheetOpen) return false;
    if (id === 'taskRefresh') return spec.refresh(), true;
    if (id === 'taskDeselect') {
      if (!spec.selected()) return false;
      spec.clear();
      return true;
    }
    const t = spec.selected();
    if (!t) return false;
    const L = spec.id;
    switch (id) {
      case 'taskOpen': spec.open(false); break;
      case 'taskOpenOther': spec.open(true); break;
      case 'taskStatusNext': void this.cycleStatus(L, t, 'next'); break;
      case 'taskStatusPrev': void this.cycleStatus(L, t, 'prev'); break;
      case 'taskPrioUp': void this.cyclePriority(L, t, 'up'); break;
      case 'taskPrioDown': void this.cyclePriority(L, t, 'down'); break;
      case 'taskDateNext': void this.shiftDate(L, t, 1); break;
      case 'taskDatePrev': void this.shiftDate(L, t, -1); break;
      case 'taskSchedule': this.pickDate(L, t, 'SCHEDULED'); break;
      case 'taskDeadline': this.pickDate(L, t, 'DEADLINE'); break;
      case 'taskTags': this.openTags(L, t); break;
      case 'taskRefile': this.refile(t); break;
      default: return false;
    }
    return true;
  }

  // ---- the context menu -----------------------------------------------------------------------------------------

  /** Right click (or ⌃-click) on a chosen task: the menu at the pointer. */
  openMenu(e: MouseEvent, spec: ListSpec) {
    e.preventDefault();
    this.openMenuAt(spec, e.clientX, e.clientY);
  }
  /** The menu of the list's chosen task at a point (a plugin's list, ⌃-click or its own key). */
  openMenuAt(spec: ListSpec, x: number, y: number) {
    const t = spec.selected();
    if (!t) return;
    this.active = spec.id;
    this.menu = { x, y, items: this.menuItems(spec, t) };
  }
  menuItems(spec: ListSpec, t: ListTask): MenuItem[] {
    const r = resolve(t);
    if (!r) return [];
    const L = spec.id;
    const hint = (id: string) => store.keyHint(id) || undefined;
    const none = () => {};
    return [
      { label: 'Открыть', shortcut: hint('taskOpen'), action: () => spec.open(false) },
      // the new interface has no second pane yet (ТЗ 48 §1): the row is there, off
      { label: spec.otherLabel ?? 'Открыть во второй панели', shortcut: hint('taskOpenOther'), disabled: store.nextUi && !spec.otherLabel, action: () => spec.open(true) },
      'sep',
      { label: 'Статус', action: none, sub: this.statusItems(L, t, r), subWidth: store.nextUi ? 230 : 200, soft: store.nextUi },
      { label: 'Приоритет', action: none, sub: this.prioItems(L, t, r.h), subWidth: 200 },
      { label: 'Запланировать', action: none, sub: this.dateItems(L, t, r.h, 'SCHEDULED'), subWidth: 250 },
      { label: 'Дедлайн', action: none, sub: this.dateItems(L, t, r.h, 'DEADLINE'), subWidth: 250 },
      { label: 'Теги…', shortcut: hint('taskTags'), action: () => this.openTags(L, t) },
      'sep',
      { label: 'Перенести в другой файл…', shortcut: hint('taskRefile'), action: () => this.refile(t) },
      { label: 'Копировать ссылку', shortcut: store.nextUi ? hint('copyLink') : undefined, action: () => void this.copyLink(L, t) },
      ...this.pluginItems(t),
      ...(spec.more?.(t) ?? []),
    ];
  }
  private pluginItems(t: ListTask): MenuItem[] {
    const acts = this.actionsFor(t);
    return acts.length ? ['sep', ...acts.map((a): MenuItem => ({ label: a.label, action: () => a.run(t) }))] : [];
  }
  /** The statuses of the task's set (an event: of the default one), a check at the current, ⇧→ ⇧← at the neighbours. */
  private statusItems(L: string, t: ListTask, r: { f: NoteFile; h: Heading }): MenuItem[] {
    const wf = r.f.wf;
    const kw = r.h.keyword;
    const seq = sequenceFor(wf, kw);
    const next = rotateStatus(wf, kw, 'next');
    const prev = kw ? rotateStatus(wf, kw, 'prev') : null;
    const items: MenuItem[] = seq.states.map((s) => ({
      label: s.name, capsule: toneStyle(toneFor(s.name, wf)), checked: s.name === kw,
      shortcut: s.name === next ? store.keyHint('taskStatusNext') || undefined : s.name === prev ? store.keyHint('taskStatusPrev') || undefined : undefined,
      action: () => void this.status(L, t, s.name),
    }));
    items.push({ label: 'Без статуса', checked: !kw, disabled: !kw, action: () => void this.status(L, t, null) });
    return items;
  }
  private prioItems(L: string, t: ListTask, h: Heading): MenuItem[] {
    const up = priorityAfter(h.priority, 'up');
    const down = priorityAfter(h.priority, 'down');
    const items: MenuItem[] = ['A', 'B', 'C'].map((p) => ({
      label: '#' + p, capsule: PRIO[p], checked: h.priority === p,
      shortcut: p === h.priority ? undefined : p === up ? store.keyHint('taskPrioUp') || undefined : p === down ? store.keyHint('taskPrioDown') || undefined : undefined,
      action: () => void this.priority(L, t, p),
    }));
    items.push({ label: 'Без приоритета', checked: !h.priority, disabled: !h.priority, action: () => void this.priority(L, t, null) });
    return items;
  }
  private dateItems(L: string, t: ListTask, h: Heading, kind: 'SCHEDULED' | 'DEADLINE'): MenuItem[] {
    const cur = kind === 'SCHEDULED' ? h.scheduled : h.deadline;
    const today = midnight();
    const mon = nextMonday(today);
    const set = (d: Date | null) => () => void this.date(L, t, kind, d);
    // the new interface (ТЗ 48 §1): the days with their dates grey on the right, «Снять дату» in `todo`
    const next = store.nextUi;
    const short = (d: Date) => `${WD2[d.getDay()]} ${d.getDate()}`;
    const items: MenuItem[] = [
      { label: 'Сегодня', shortcut: next ? short(today) : undefined, action: set(today) },
      { label: 'Завтра', shortcut: next ? short(plus(today, 1)) : kind === 'SCHEDULED' ? store.keyHint('taskDateNext') || undefined : undefined, action: set(plus(today, 1)) },
      { label: '+1 неделя', action: set(plus(cur ? toJs(cur) : today, 7)) },
      { label: `${WD[mon.getDay()]}, ${dayLabel(mon)}`, action: set(mon) },
      'sep',
      { label: 'Выбрать дату…', shortcut: store.keyHint(kind === 'SCHEDULED' ? 'taskSchedule' : 'taskDeadline') || undefined, action: () => this.pickDate(L, t, kind) },
    ];
    if (cur) items.push('sep', { label: 'Снять дату', danger: next, action: set(null) });
    return items;
  }
}

export const lists = new TaskLists();

// the palette asks for the active list's task (no import of this module there)
setListTask((): TaskCtx | null => {
  const cur = lists.current();
  const c = cur && lists.ctx(cur.spec.id, cur.task);
  return c && cur ? { title: bare(c.heading!.title), ctx: c } : null;
});

// the active list: the one the focus went into; the palette, a menu and the tags field keep it
if (typeof window !== 'undefined') {
  window.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement | null;
    const spec = el ? lists.specs.find((s) => s.el()?.contains(el)) : undefined;
    if (spec) lists.active = spec.id;
    else if (!el?.closest?.('[role=dialog], [role=menu], .tagpop')) lists.active = null;
  });
}

// «ВЫДЕЛЕННАЯ ЗАДАЧА» of the palette
const task = (id: string, title: string | ((t: TaskCtx) => string), icon: Icon, run: (t: TaskCtx, list: string, lt: ListTask) => ReturnType<typeof headingStep> | void, more: { keyId?: string; synonyms?: string[]; hint?: (t: TaskCtx) => string } = {}) =>
  taskCommands.push({
    id, title, icon, ...more,
    run: (t) => {
      const cur = lists.current();
      return cur ? run(t, cur.spec.id, cur.task) : undefined;
    },
  });
const doneOf = (t: TaskCtx) => firstDone(sequenceFor(t.ctx.file!.wf, t.ctx.heading!.keyword));
task('task.done', (t) => `Задача: завершить${doneOf(t) ? ` (${doneOf(t)})` : ''}`, 'check', (t, L, lt) => {
  const done = doneOf(t);
  if (done) void lists.status(L, lt, done);
}, { synonyms: ['готово', 'выполнено', 'done', 'закрыть'], keyId: '' });
task('task.status', 'Задача: сменить статус…', 'status', (t) => headingStep(t.ctx, 'status'), { keyId: '', synonyms: ['статус', 'todo'] });
task('task.tomorrow', 'Задача: запланировать на завтра', 'sched', (_t, L, lt) => void lists.date(L, lt, 'SCHEDULED', plus(midnight(), 1)), { keyId: 'taskDateNext', synonyms: ['завтра', 'перенести'] });
task('task.schedule', 'Задача: запланировать…', 'sched', (t) => headingStep(t.ctx, 'schedule'), { keyId: 'taskSchedule', synonyms: ['scheduled', 'дата'] });
task('task.deadline', 'Задача: дедлайн…', 'dead', (t) => headingStep(t.ctx, 'deadline'), { keyId: 'taskDeadline', synonyms: ['срок', 'deadline'] });
task('task.priority', 'Задача: приоритет…', 'prio', (t) => headingStep(t.ctx, 'priority'), { keyId: '', synonyms: ['priority'] });
task('task.tags', 'Задача: теги…', 'tag', (_t, L, lt) => void setTimeout(() => lists.openTags(L, lt)), { keyId: 'taskTags', synonyms: ['метки', 'tags'] });
task('task.refile', 'Задача: перенести в другой файл…', 'refile', (_t, _L, lt) => void setTimeout(() => lists.refile(lt)), { keyId: 'taskRefile', synonyms: ['refile', 'переместить'] });
task('task.open', 'Задача: открыть', 'goto', (_t, L) => void setTimeout(() => lists.spec(L)?.open(false)), { keyId: 'taskOpen' });

// the keys of the scope «list» work while the focus is in a list (not while its menu or the tags field is open)
store.setScopeKeys('list', { active: () => !!lists.focused() && !lists.menu && !lists.tagsReq, run: (id) => lists.run(id) });

// the plugins' actions in «ВЫДЕЛЕННАЯ ЗАДАЧА»: «Задача: добавить отметку…»
setMoreTaskCommands((): TaskCommand[] => {
  const cur = lists.current();
  if (!cur) return [];
  return lists.actionsFor(cur.task).map((a) => ({
    id: 'task.' + a.key, title: 'Задача: ' + a.label[0].toLowerCase() + a.label.slice(1), icon: 'plug' as Icon, keyId: '',
    run: () => void setTimeout(() => a.run(cur.task)),
  }));
});

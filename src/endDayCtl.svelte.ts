import { tick } from 'svelte';
import { Reorder } from './reorder.svelte';
import { store } from './store.svelte';
import { toneFor } from './org';
import { toneStyle } from './colors';
import { fuzzy } from './fuzzy';
import { weekdayNames } from './edits';
import { doneOn, leftOn, nextWorkday, openTasks, type DayTask } from './endDay';
import { focusRows, journalDays, lastDay } from './today';
import { today, type EndTask } from './todayState.svelte';

// The workings of «Завершить день» (ТЗ 32 §3), out of EndDay.svelte so the old sheet and the new one (ТЗ 45 §2.5) are
// one: what was done, what is left (moved or kept), up to three tasks for tomorrow found as in the palette, a note to
// tomorrow; ⌘↩ writes it all into the journal at once, ⎋ leaves. Read once, when the sheet opens.

const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const DONE_CAP = 8;
export type Item = EndTask & { kw: string; file: string };
export type Choice = 'keep' | 'next' | Date;
export const isDate = (v: unknown): v is Date => v instanceof Date;
export const shortDay = (d: Date) => `${d.getDate()} ${SHORT[d.getMonth()]}`;

export class EndDayCtl {
  readonly day = today.day;
  readonly files = store.agendaFiles;
  readonly cfg = today.folder;
  readonly when = `${WD[this.day.getDay()]}, ${this.day.getDate()} ${MON[this.day.getMonth()]}`;
  readonly done = doneOn(this.files, this.day);
  readonly left = leftOn(this.files, this.day);
  readonly next = nextWorkday(this.day);
  /** «На понедельник» on a Friday, else «На завтра». */
  readonly nextWord = this.next.getDay() === 1 && this.day.getDay() >= 5 ? 'На понедельник' : 'На завтра';
  /** «понедельник» or «завтра»: whose the choice is. */
  readonly nextDay = this.next.getDay() === 1 && this.day.getDay() >= 5 ? 'понедельник' : 'завтра';
  tone = (kw: string, path: string) => {
    const f = this.files.find((x) => x.path === path);
    return f && kw ? toneStyle(toneFor(kw, f.wf)) : '';
  };

  private item = (t: DayTask): Item => ({ key: t.key, path: t.path, line: t.line, title: t.title, id: t.id, kw: t.kw, file: t.file });
  focus = $state<Item[]>([]);
  note = $state('- ');
  /** «Не успел»: kept (the default), tomorrow, or a date. */
  choice = $state<Record<string, Choice>>({});
  constructor() {
    const journal = this.files.find((f) => f.name === this.cfg.journal);
    const days = journal ? journalDays(journal) : [];
    const mine = days.find((d) => +d.date === +this.day); // the day was ended already: what it wrote
    const morning = lastDay(days, this.day);
    const fromLinks = (links: { id: string; title: string }[], keepDone: boolean): Item[] =>
      focusRows(links, this.files, this.day).flatMap((r) => (r.task && (keepDone || !r.task.done) ? [{ key: r.task.key, path: r.task.path, line: r.task.line, title: r.task.title, id: r.id, kw: r.task.kw, file: r.task.file }] : []));
    this.focus = mine?.focus.length ? fromLinks(mine.focus, true) : fromLinks(morning?.focus ?? [], false);
    this.note = mine?.note?.text ?? '- ';
    this.choice = Object.fromEntries(this.left.map((t) => [t.key, 'keep' as Choice]));
  }
  pickDate(t: DayTask) {
    const f = this.files.find((x) => x.path === t.path);
    store.openCalendar({ kind: 'SCHEDULED', initial: this.next, current: this.day, names: weekdayNames(f?.text ?? ''), pick: (d) => (this.choice[t.key] = d) });
  }

  // ---- «Главное на завтра»: up to three, found as in the palette ----
  q = $state('');
  sel = $state(0);
  input: HTMLInputElement | undefined = $state();
  readonly candidates = $derived.by(() => {
    if (!this.q.trim()) return [] as DayTask[];
    const taken = new Set(this.focus.map((f) => f.key));
    return openTasks(this.files)
      .filter((t) => !taken.has(t.key))
      .map((t) => ({ t, m: fuzzy(this.q, t.title) }))
      .filter((x) => x.m)
      .sort((a, b) => Number(b.m!.wordStart) - Number(a.m!.wordStart) || a.m!.span - b.m!.span || a.t.title.length - b.t.title.length)
      .slice(0, 6)
      .map((x) => x.t);
  });
  setQuery(v: string) {
    this.q = v;
    this.sel = 0;
  }
  add(t: DayTask | undefined) {
    if (!t || this.focus.length >= 3) return;
    this.focus = [...this.focus, this.item(t)];
    this.q = '';
    void tick().then(() => this.input?.focus());
  }
  remove(key: string) {
    this.focus = this.focus.filter((x) => x.key !== key);
  }
  searchKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.sel = Math.max(0, Math.min(this.candidates.length - 1, this.sel + (e.key === 'ArrowDown' ? 1 : -1)));
    } else if (e.key === 'Enter' && !e.metaKey) {
      e.preventDefault();
      this.add(this.candidates[this.sel]);
    } else if (e.key === 'Escape' && this.q) {
      e.preventDefault();
      e.stopPropagation();
      this.q = '';
    }
  }
  /** A row dragged onto another: it goes there (after it when dragged down). */
  readonly drag = new Reorder((key, target) => {
    if (key === target) return;
    const list = [...this.focus];
    const from = list.findIndex((x) => x.key === key);
    const [it] = list.splice(from, 1);
    list.splice(list.findIndex((x) => x.key === target) + (from <= list.findIndex((x) => x.key === target) ? 1 : 0), 0, it);
    this.focus = list;
  });
  /** ⌥↑ / ⌥↓ on a row: it moves up or down. */
  stepKey(e: KeyboardEvent, i: number) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= this.focus.length) return;
    const list = [...this.focus];
    [list[i], list[j]] = [list[j], list[i]];
    this.focus = list;
  }

  // ---- the end ----
  busy = $state(false);
  async finish() {
    if (this.busy) return;
    this.busy = true;
    const moves = this.left.flatMap((t) => {
      const c = this.choice[t.key];
      return c === 'keep' ? [] : [{ task: this.item(t), date: c === 'next' ? this.next : c }];
    });
    await today.finishDay({ moves, focus: this.focus, done: this.done.map(this.item), note: this.note.trim() === '-' ? '' : this.note });
    this.busy = false;
  }
  close = () => (today.ending = false);
  /** On the window: ⎋ leaves, ⌘↩ ends the day — the calendar of «Дата…» answers first. */
  keys(e: KeyboardEvent) {
    if (store.palette) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      void this.finish();
    }
  }
}

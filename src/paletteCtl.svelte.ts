// The palette's workings (ТЗ 09, 20), apart from how it looks: the step shown and its query, the row chosen among the
// rows it gives, the calendar's day and month, the keys. The old palette (Palette.svelte) and the new one
// (next/Palette.svelte, ТЗ 44 §2) draw the same state.

import { tick, untrack } from 'svelte';
import { store } from './store.svelte';
import { calStep, contextOf, gotoStep, headingStep, mainStep, nameStep, type Row, type Step, type Unit } from './commands';
import { busyDays, shiftDate } from './calendar';
import { parseDate } from './edits';

const ARROWS: Record<string, [Unit, number]> = { ArrowLeft: ['day', -1], ArrowRight: ['day', 1], ArrowUp: ['week', -1], ArrowDown: ['week', 1] };
/** ⇧ ← → a day, ⇧ ↑ ↓ a week; with ⌥ a month, a year (as org-read-date's S- and M-S-arrows). */
export const unitOf = (e: KeyboardEvent): [Unit, number] | null => {
  const a = ARROWS[e.key];
  if (!a || !e.shiftKey || e.metaKey || e.ctrlKey) return null;
  return e.altKey ? [a[0] === 'day' ? 'month' : 'year', a[1]] : a;
};

export class PaletteCtl {
  readonly ctx = contextOf();
  step: Step = $state(null as unknown as Step);
  q = $state('');
  sel = $state(0); // an index into the selectable rows
  rows = $derived(this.step.rows(this.q));
  pickable = $derived(this.rows.flatMap((r, i) => (r.run ? [i] : [])));
  plate = $derived(this.step.plate(this.q));
  current = $derived(this.rows[this.pickable[this.sel] ?? -1] as Row | undefined);
  // the calendar step: the chosen day, the month in the middle, the typed text not a date
  cal = $state(new Date());
  view = $state(new Date());
  bad = $state(false);
  busy = $derived(this.step.calendar ? busyDays(store.agendaFiles) : new Map<string, 'task' | 'deadline'>());
  private calOf: Step | null = null;
  /** The component's: a new step shown (its field selected), the chosen row scrolled into view. */
  onstep: () => void = () => {};
  onmove: () => void = () => {};

  constructor() {
    const start = store.palette?.start;
    const cal0 = start === 'calendar' ? store.calReq : null;
    const ctx = this.ctx;
    this.step =
      cal0 ? calStep(cal0, () => cal0.plate ?? null)
      : start === 'step' && store.stepReq ? store.stepReq
      : start === 'goto' ? gotoStep() : start === 'newFile' ? nameStep(ctx, 'file') : start === 'newFolder' ? nameStep(ctx, 'folder') : start && start !== 'calendar' && start !== 'step' ? headingStep(ctx, start) : mainStep(ctx);
    this.q = this.step.initial ?? '';
  }
  /** The effects a component runs: typing selects the first result (or the row preferred), only typing; fewer rows
   *  than the one chosen — back into the list; a calendar step sets its day. */
  effects() {
    $effect(() => {
      void this.q;
      untrack(() => (this.sel = Math.max(0, this.pickable.findIndex((i) => this.rows[i].prefer))));
    });
    $effect(() => {
      if (this.sel >= this.pickable.length) untrack(() => (this.sel = Math.max(0, this.pickable.length - 1)));
    });
    $effect.pre(() => {
      if (this.step.calendar && this.calOf !== this.step) {
        this.calOf = this.step;
        this.cal = this.view = this.step.calendar.initial;
        this.bad = false;
      }
    });
  }
  close = () => (store.palette = null);
  typedDate = () => {
    if (!this.step.calendar) return;
    if (!this.q.trim()) return void (this.bad = false);
    const d = parseDate(this.q);
    this.bad = !d;
    if (d) this.cal = this.view = d;
  };
  moveCal(d: Date) {
    this.cal = this.view = d;
    this.q = ''; // ⇧ + arrows after typing go on from the typed date; the text goes
    this.bad = false;
  }
  pickCal = (d: Date) => {
    const spec = this.step.calendar;
    this.close();
    spec?.pick(d);
  };
  turn = (n: number) => (this.view = shiftDate(this.view, 'month', n));
  async run(r: Row | undefined) {
    if (!r?.run) return; // «Ничего не найдено» and prompts do nothing
    const next = r.run();
    if (next) {
      this.step = next;
      this.q = next.initial ?? '';
      await tick();
      this.onstep();
    } else this.close();
  }
  async move(d: 1 | -1) {
    if (!this.pickable.length) return;
    this.sel = (this.sel + d + this.pickable.length) % this.pickable.length; // round the ends
    await tick();
    this.onmove();
  }
  /** The pointer picks a row only when it moves, not when keyboard scrolling slides a row under it. */
  hover(i: number) {
    const k = this.pickable.indexOf(i);
    if (k >= 0) this.sel = k;
  }
  key = (e: KeyboardEvent) => {
    const u = unitOf(e);
    const step = this.step;
    if (step.calendar) {
      if (u) {
        e.preventDefault();
        return this.moveCal(shiftDate(this.cal, u[0], u[1]));
      }
      if (e.key === '.' && !this.q) {
        e.preventDefault();
        return this.moveCal(new Date());
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        return this.pickCal(this.cal);
      }
      if (e.key === 'Backspace' && !this.q && step.calendar.back) {
        e.preventDefault();
        this.step = step.calendar.back();
        return;
      }
    } else if (u && step.shift) {
      e.preventDefault();
      this.step = step.shift(u[0], u[1]);
      this.q = '';
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      void this.move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // ⌘↩: a row's other action («Ссылка на»: the heading's title as the label)
      const c = this.current;
      void this.run(e.metaKey && c?.alt ? { ...c, run: c.alt } : c);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'Tab') e.preventDefault(); // the focus stays in the field
  };
}

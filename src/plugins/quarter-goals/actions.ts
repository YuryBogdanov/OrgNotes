// What the goals open: their sheets (drawn whole by the plugin over the window) and the 1-1 review on the core's
// frame (`ui.review`, its parts the plugin's: the header, the quick buttons, the marks, the summary).

import { mount, unmount, type Component } from 'svelte';
import type { CardRender, HeadingRef } from '@panopticon/api';
import { weekdayNames } from '@panopticon/api/org';
import { goals } from './state.svelte';
import { FIELDS, GOAL_STATES, goalsIn, quarterLabel, reviewQueue } from './goals';
import Form from './Form.svelte';
import Add from './Add.svelte';
import Report from './Report.svelte';
import Carry from './Carry.svelte';
import Head from './Head.svelte';
import Quick from './Quick.svelte';
import Marks from './Marks.svelte';
import Summary from './Summary.svelte';

export const openForm = (key: string | null = goals.goalKeyOfFile()) => void goals.sheet('Новая цель', Form, { key });
export const openAdd = (o: { me?: boolean; replace?: string; file?: string } = {}) => void goals.sheet('Добавить цели', Add, o);
export const openReport = (key = '*') => void goals.sheet('Отчёт за квартал', Report, { key });
export const openCarry = (key = '*') => void goals.sheet('Перенести незакрытые', Carry, { key });

/** A part of the card: a component of ours in the core's element. */
const part = (comp: Component<any>): CardRender => (el, card) => {
  const app = mount(comp, { target: el, props: { card } });
  return () => void unmount(app);
};

/** «Сдвинуть срок…»: the calendar, then the new DEADLINE and a mark. */
export async function shiftDeadline(ref: HeadingRef) {
  const c = goals.cardOf(ref);
  if (!c?.goal) return;
  const d = await goals.ctx.ui.pickDate({ initial: c.goal.deadline ?? new Date(), kind: 'DEADLINE', current: c.goal.deadline, names: weekdayNames(c.file.text) });
  if (d && (await goals.goalShiftDeadline(ref, d))) goals.ctx.ui.currentReview()?.redraw();
}
/** The day of the mark being written. */
export async function markDay() {
  const r = goals.goalReview;
  if (!r) return;
  const p = goals.goalPeople.find((x) => x.key === r.key);
  const d = await goals.ctx.ui.pickDate({ initial: r.date ?? new Date(), kind: 'MARK', names: weekdayNames(p?.file?.text ?? '') });
  if (d && goals.goalReview === r) {
    r.date = d;
    goals.ctx.ui.currentReview()?.redraw();
  }
}

/** «Разобрать цели»: the open goals of the quarter, the silent first; `title`: start at that goal (⌥-click). */
export async function startReview(key: string, title?: string) {
  const p = goals.goalPeople.find((x) => x.key === key);
  if (!p?.file) return;
  const q = goals.goalsQuarter;
  const queue = reviewQueue(goalsIn(p.data, q), p.file.wf.done, new Date(), goals.goalSettings.silent);
  if (!queue.length) {
    goals.ctx.ui.notify(`Открытых целей в ${quarterLabel(q)} нет`);
    return;
  }
  const at = title ? Math.max(0, queue.findIndex((g) => g.title === title)) : 0;
  goals.goalReview = { key, marks: 0, closed: 0, moved: 0, draft: '', date: null, showMarks: false, rev: null };
  const st = () => goals.goalReview!;
  await goals.ctx.ui.review({
    title: `Разбор целей · ${p.name}`,
    crumbs: ['Цели', `Разбор · ${p.name}`],
    cls: 'greview',
    width: 1080,
    start: at,
    noSkip: true,
    backCommand: 'quarter-goals.back',
    items: queue.map((g) => ({ path: p.file!.path, line: g.line, title: g.title })),
    head: part(Head),
    quick: part(Quick),
    aside: part(Marks),
    // «Отметки» folded on the left, «N — справа» at its end; unfolded when a mark is double-clicked
    narrow: (h) => {
      const c = goals.cardOf(h.ref);
      const f = c?.file;
      if (!c?.goal || !f) return {};
      const gi = f.headings.findIndex((x) => x.line === c.goal!.line);
      const m = f.headings.find((x, i) => x.parent === gi && i > gi && x.title.trim().toLowerCase() === FIELDS.marks.toLowerCase());
      const s = goals.goalReview;
      if (!m) return {};
      return s?.showMarks ? { fold: [], reveal: s.rev } : { fold: [m.line], note: c.goal.marks.length ? { line: m.line, text: `${c.goal.marks.length} — справа` } : null };
    },
    summary: (el, res) => {
      const app = mount(Summary, { target: el, props: { end: res.end } });
      return () => void unmount(app);
    },
    // a mark being written is saved when the card changes, without asking; the next card starts clean
    beforeStep: async (h) => {
      if (st().draft.trim()) await goals.goalAddMark(h.ref);
      Object.assign(st(), { draft: '', date: null, showMarks: false, rev: null });
    },
    actions: [
      { id: 'mark', label: 'Добавить отметку', kind: 'primary', command: 'quarter-goals.mark', disabled: () => !st().draft.trim(),
        run: async (h) => ((await goals.goalAddMark(h.ref)), 'stay' as const) },
      { id: 'done', label: 'Цель достигнута', sub: GOAL_STATES.done, kind: 'ok', command: 'quarter-goals.done', disabled: (h) => h.done,
        run: async (h) => ((await goals.goalComplete(h.ref)), 'stay' as const) },
      { id: 'shift', label: 'Сдвинуть срок…', command: 'quarter-goals.shift', run: async (h) => ((await shiftDeadline(h.ref)), 'stay' as const) },
      { id: 'next', label: 'Следующая', command: 'quarter-goals.next', run: () => 'next' },
    ],
  });
  // the state stays while its tab does («Назад» from the summary); the next review starts anew
}

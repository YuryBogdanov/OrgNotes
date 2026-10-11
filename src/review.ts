// «Разбор Inbox»: the Inbox tasks one by one, as cards. Pure functions — the queue, the dates of «Отложить», which
// status «Выполнено» and «Отменить» write, the labels — shared by the store, the panel and the tests.

import { inboxItems, type InboxItem } from './inbox';
import { sequenceFor, type Heading, type OrgDate, type Workflow } from './org';

export type Result = 'done' | 'cancel' | 'move' | 'defer' | 'skip' | 'delete';
export interface ReviewItem {
  id: string;
  path: string; // where the task is now (the target file after «Перенести»)
  line: number; // its heading line there, kept up to date while the card is open
  title: string;
  created: string | null; // the :CREATED: stamp text, to find the task again after edits
  hasDetails: boolean;
  firstDetail: string;
  keyword: string;
  result: Result | null;
  note?: string; // «→ finance › Банки и лимиты», «Отложена до 14 окт · в Inbox»
}

const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dateOf = (o: OrgDate) => new Date(o.y, o.m - 1, o.d);
let seq = 0;

/**
 * The tasks to go through: the open top-level tasks of the Inbox (as in its list) without those scheduled after
 * today (deferred: they come back on their day). Oldest first by :CREATED: (or newest first); the ones without
 * :CREATED: at the end, in the file's order.
 */
export function reviewQueue(text: string, headings: Heading[], wf: Workflow, path: string, order: 'old' | 'new', today = new Date()): ReviewItem[] {
  const t0 = +day0(today);
  const items = inboxItems(text, headings, wf, 'file').filter((it) => {
    const s = headings[it.index].scheduled;
    return !s || +dateOf(s) <= t0;
  });
  const dated = items.filter((it) => it.created).sort((a, b) => (order === 'old' ? +a.created! - +b.created! : +b.created! - +a.created!) || a.order - b.order);
  const rest = items.filter((it) => !it.created);
  return [...dated, ...rest].map((it) => toItem(it, text, path));
}
function toItem(it: InboxItem, text: string, path: string): ReviewItem {
  return {
    id: 'r' + ++seq, path, line: it.line, title: it.title, created: createdStamp(text, it.line), hasDetails: it.hasDetails,
    firstDetail: it.details, keyword: it.keyword, result: null,
  };
}
const CREATED = /^\s*:CREATED:\s*(\[[^\]]*\])/i;
/** The :CREATED: stamp under a heading (its drawer), or null. */
function createdStamp(text: string, line: number): string | null {
  const lines = text.split('\n');
  for (let i = line + 1; i < lines.length && !/^\*+\s/.test(lines[i]); i++) {
    const m = CREATED.exec(lines[i]);
    if (m) return m[1];
  }
  return null;
}

/** The heading of a task now: by its :CREATED: if it has one, else by its title; the nearest to where it was. */
export function locate(text: string, headings: Heading[], item: Pick<ReviewItem, 'line' | 'title' | 'created'>): Heading | undefined {
  const near = (hs: Heading[]) => hs.sort((a, b) => Math.abs(a.line - item.line) - Math.abs(b.line - item.line))[0];
  if (item.created) {
    const byStamp = headings.filter((h) => createdStamp(text, h.line) === item.created);
    if (byStamp.length) return near(byStamp);
  }
  return near(headings.filter((h) => h.title === item.title));
}

/** The next card after `cur`: the first task not gone through, going on from there and round to the start. */
export function nextOpen(items: ReviewItem[], cur: number): number {
  for (let k = 1; k <= items.length; k++) {
    const i = (cur + k) % items.length;
    if (!items[i].result) return i;
  }
  return -1;
}

// ---- «Отложить до…» ---------------------------------------------------------------------------------------

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const short = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;
export const withDay = (d: Date) => `${WD[d.getDay()]}, ${short(d)}`;
/** Завтра, через 3 дня, понедельник следующей недели, та же дата через месяц (the last day of a shorter month). */
export function deferDates(today = new Date()): { label: string; date: Date }[] {
  const t = day0(today);
  const plus = (n: number) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + n);
  const monday = plus(((8 - t.getDay()) % 7) || 7);
  const last = new Date(t.getFullYear(), t.getMonth() + 2, 0).getDate();
  const month = new Date(t.getFullYear(), t.getMonth() + 1, Math.min(t.getDate(), last));
  return [
    { label: 'Завтра', date: plus(1) },
    { label: 'Через 3 дня', date: plus(3) },
    { label: 'На следующей неделе', date: monday },
    { label: 'Через месяц', date: month },
  ];
}

// ---- statuses -----------------------------------------------------------------------------------------------

/**
 * What «Выполнено» and «Отменить» write for a task: the chosen statuses when its set has them, else its set's
 * done statuses (the first, the second). Null: none (the button is off).
 */
export function closingStatus(wf: Workflow, keyword: string | null, which: 'done' | 'cancel', chosen: string): string | null {
  const done = sequenceFor(wf, keyword).states.filter((s) => s.done).map((s) => s.name);
  if (done.includes(chosen)) return chosen;
  return done[which === 'done' ? 0 : 1] ?? null;
}

// ---- labels -------------------------------------------------------------------------------------------------

/** Whole days since a :CREATED: stamp. */
export function ageDays(created: string | null, now = new Date()): number | null {
  const m = created && /(\d{4})-(\d{2})-(\d{2})/.exec(created);
  if (!m) return null;
  return Math.round((+day0(now) - +new Date(+m[1], +m[2] - 1, +m[3])) / 86400000);
}
export const days = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дня' : 'дней'}`;
export const tasksWord = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'задача' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'задачи' : 'задач'}`;
/** «9 дней в Inbox · создана 2 окт» (today: «сегодня в Inbox»). */
export function agePill(created: string | null, now = new Date()): string {
  const n = ageDays(created, now);
  const m = created && /(\d{4})-(\d{2})-(\d{2})/.exec(created);
  if (n === null || !m) return '';
  const made = new Date(+m[1], +m[2] - 1, +m[3]);
  return `${n <= 0 ? 'сегодня' : days(n)} в Inbox · создана ${short(made)}`;
}
/** The short age in the list: «4 ч», «вчера», «12 дн». */
export function ageShort(created: string | null, now = new Date()): string {
  const n = ageDays(created, now);
  if (n === null) return '';
  if (n <= 0) {
    const m = created && /(\d{1,2}):(\d{2})/.exec(created);
    if (!m) return 'сегодня';
    const h = Math.floor((now.getHours() * 60 + now.getMinutes() - (+m[1] * 60 + +m[2])) / 60);
    return h < 1 ? 'только что' : `${h} ч`;
  }
  return n === 1 ? 'вчера' : `${n} дн`;
}
/** The line under a task in the list during a review: what was done to it, or its first line of text. */
export function subLabel(it: ReviewItem, current: boolean): string {
  if (it.result === 'skip') return 'Пропущена';
  if (it.result) return it.note ?? '';
  return current ? 'Сейчас на карточке' : it.firstDetail || it.keyword;
}

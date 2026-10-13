// «Завершить день» (ТЗ 32 §3–4): what was done today (by CLOSED), what was planned and is left (SCHEDULED today), the
// next working day, and the day written into the journal — a datetree as Emacs keeps it: «* 2026» › «** 2026-10
// Октябрь» › «*** 2026-10-13 Вт» › «На завтра», «Главное», «Сделано». Pure: texts in, a text out.

import { parseHeadings, DEFAULT_WORKFLOW, type Heading, type OrgDate } from './org';
import type { TFile, TaskRow } from './today';

const toDate = (d: OrgDate) => new Date(d.y, d.m - 1, d.d);
const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const row = (f: TFile, h: Heading): TaskRow & { id?: string } => ({
  key: f.path + '#' + h.line, file: f.name, path: f.path, line: h.line, title: h.title, kw: h.keyword ?? '', prio: h.priority,
  done: !!h.keyword && f.wf.done.includes(h.keyword), id: h.id,
});
export type DayTask = ReturnType<typeof row>;

/** The tasks finished on the day: a done status and CLOSED on it. */
export function doneOn(files: TFile[], day: Date): DayTask[] {
  return files.flatMap((f) => f.headings.filter((h) => h.keyword && f.wf.done.includes(h.keyword) && h.closed && same(toDate(h.closed), day)).map((h) => row(f, h)));
}
/** The open tasks scheduled for the day. */
export function leftOn(files: TFile[], day: Date): DayTask[] {
  return files.flatMap((f) => f.headings.filter((h) => h.keyword && !f.wf.done.includes(h.keyword) && h.scheduled && same(toDate(h.scheduled), day)).map((h) => row(f, h)));
}
/** The open tasks of every file (the choice of «Главное на завтра»). */
export function openTasks(files: TFile[]): DayTask[] {
  return files.flatMap((f) => f.headings.filter((h) => h.keyword && !f.wf.done.includes(h.keyword)).map((h) => row(f, h)));
}
/** The next working day: after Friday (and the weekend) — Monday. */
export function nextWorkday(day: Date): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
/** A new org-id: a UUID, as `org-id-new` makes them. */
export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((Math.random() * 16) | (c === 'x' ? 0 : 8)).toString(16));

// ---- the journal ------------------------------------------------------------------------------------------------

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const p2 = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
/** «2026-10-13 Вт» — the day's heading, and where the sheet says it writes. */
export const dayTitle = (d: Date) => `${isoOf(d)} ${WD[d.getDay()]}`;

export interface Link {
  id: string;
  title: string;
}
export interface DayEntry {
  note: string; // «На завтра»: org text (empty: none)
  focus: Link[]; // «Главное»
  done: Link[]; // «Сделано»
}
const PARTS = ['На завтра', 'Главное', 'Сделано'] as const;
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const linkLine = (l: Link) => `- [[id:${l.id}][${l.title.replace(/\[/g, '(').replace(/\]/g, ')').trim()}]]`;

/**
 * The day written into the journal: the year, the month and the day made where they are missing, in order (a later
 * date below an earlier one); its «На завтра», «Главное», «Сделано» put anew (an empty one goes away); its other
 * subheadings, written by hand, stay as they are.
 */
export function writeDay(text: string, day: Date, e: DayEntry, now: Date): string {
  const lines = text.split('\n');
  const hs = () => parseHeadings(lines.join('\n'), DEFAULT_WORKFLOW);
  // a heading of the level under `parent` (-1: the top) whose title starts with `key`, made in order when missing
  const ensure = (parent: Heading | null, level: number, key: string, title: string): Heading => {
    const all = hs();
    const kids = all.filter((h) => h.level === level && (parent ? h.line > parent.line && h.line < parent.end : true) && (parent ? true : h.parent === -1));
    const have = kids.find((h) => h.title.startsWith(key));
    if (have) return have;
    const after = kids.find((h) => /^\d{4}/.test(h.title) && h.title.slice(0, key.length) > key);
    let at = after ? after.line : parent ? parent.end : lines.length;
    if (!after) while (at > (parent ? parent.line + 1 : 0) && lines[at - 1].trim() === '') at--; // above the blank lines of the end
    lines.splice(at, 0, '*'.repeat(level) + ' ' + title);
    return hs().find((h) => h.line === at)!;
  };
  const y = String(day.getFullYear());
  const ym = `${y}-${p2(day.getMonth() + 1)}`;
  const year = ensure(null, 1, y, y);
  const month = ensure(year, 2, ym, `${ym} ${MONTHS[day.getMonth()]}`);
  const dayH = ensure(month, 3, isoOf(day), dayTitle(day));

  const stamp = `[${isoOf(now)} ${WD[now.getDay()]} ${p2(now.getHours())}:${p2(now.getMinutes())}]`;
  const blocks: Record<(typeof PARTS)[number], string[]> = {
    'На завтра': e.note.trim() ? ['**** На завтра', ':PROPERTIES:', `:CREATED:  ${stamp}`, ':END:', ...e.note.replace(/\s+$/, '').split('\n')] : [],
    'Главное': e.focus.length ? ['**** Главное', ...e.focus.map(linkLine)] : [],
    'Сделано': e.done.length ? ['**** Сделано', ...e.done.map(linkLine)] : [],
  };
  PARTS.forEach((name, i) => {
    const all = hs();
    const d = all.find((h) => h.line === dayH.line) ?? all.find((h) => h.level === 3 && h.title.startsWith(isoOf(day)))!;
    const kids = all.filter((h) => h.level === 4 && h.line > d.line && h.line < d.end);
    const have = kids.find((h) => norm(h.title) === norm(name));
    const block = blocks[name];
    if (have) {
      let end = have.end;
      while (end > have.line + 1 && lines[end - 1].trim() === '') end--; // the blank lines after it stay
      lines.splice(have.line, end - have.line, ...block);
      return;
    }
    if (!block.length) return;
    const later = kids.find((h) => PARTS.slice(i + 1).some((n) => norm(n) === norm(h.title)));
    let at = later ? later.line : d.end;
    if (!later) while (at > d.line + 1 && lines[at - 1].trim() === '') at--;
    lines.splice(at, 0, ...block);
  });
  const out = lines.join('\n');
  return out.endsWith('\n') ? out : out + '\n';
}

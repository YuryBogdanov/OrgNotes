// «Агенда» in the mode «День» (ТЗ 45 §3.2): what a day has — the entries with a time (a row of chips), the planned
// ones without a time and the deadlines of the day, the overdue ones (only on today) — the week around it with how
// busy each day is, and «Горизонт»: what is planned, due and on in the 30 days after it, by date. Pure: the files of
// the calendar in, the rows out.

import { byDay, entriesIn, isoDay, type CalEntry, type CalFile } from './calIndex';

export interface DayRow {
  key: string;
  title: string;
  kw: string | null;
  path: string;
  file: string; // relative
  line: number;
  done: boolean;
  /** «срок сегодня» (a deadline of the day), «3 дн.» (overdue): in `todo`. */
  chip: string | null;
  dk: 'SCHEDULED' | 'DEADLINE' | 'event';
}
export interface Timed {
  key: string;
  time: string; // «09:30»
  end: string | null;
  title: string;
  path: string;
  line: number;
  past: boolean;
  now: boolean;
}
export interface HorizonDay {
  day: Date;
  /** A deadline falls on it (its dot in `todo`, «· СРОК»). */
  due: boolean;
  items: { key: string; kw: string | null; title: string; path: string; line: number; layer: CalEntry['layer'] }[];
}

const mid = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const days = (a: Date, b: Date) => Math.round((+mid(a) - +mid(b)) / 86_400_000);
const keyOf = (e: CalEntry) => `${e.layer}|${e.path}|${e.line}|${e.day}`;

/** The Monday to Sunday the day is in. */
export const weekOf = (day: Date) => {
  const k = (day.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => add(day, i - k));
};

/** How many entries each day of the week has (the strip's dots, up to 5 drawn), the finished ones left out. */
export function weekCounts(files: CalFile[], week: Date[]): number[] {
  const by = byDay(entriesIn(files, week[0], week[6]).filter((e) => e.layer !== 'done'));
  return week.map((d) => by.get(isoDay(d))?.length ?? 0);
}

/** The day: the entries with a time, the planned and due ones, the overdue (on today). */
export function dayOf(files: CalFile[], day: Date, now: Date) {
  const list = entriesIn(files, day, day);
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const isToday = days(day, now) === 0;
  const past = days(day, now) < 0;
  const timed: Timed[] = list
    .filter((e) => e.time && e.layer !== 'done')
    .sort((a, b) => a.time!.localeCompare(b.time!))
    .map((e) => {
      const end = e.end ?? e.time!;
      return { key: keyOf(e), time: e.time!, end: e.end, title: e.title, path: e.path, line: e.line, past: past || (isToday && end <= hm), now: isToday && e.time! <= hm && hm < end };
    });
  const rank = { deadline: 0, task: 1, wait: 1, event: 2, done: 3 } as const;
  const planned: DayRow[] = list
    .filter((e) => !e.time && e.layer !== 'event')
    .sort((a, b) => rank[a.layer] - rank[b.layer] || (a.priority ?? 'Z').localeCompare(b.priority ?? 'Z') || a.title.localeCompare(b.title, 'ru'))
    .filter((e, i, all) => all.findIndex((x) => x.path === e.path && x.line === e.line) === i) // a task both planned and due: once
    .map((e) => ({
      key: keyOf(e), title: e.title, kw: e.keyword, path: e.path, file: e.file, line: e.line, done: e.layer === 'done',
      chip: e.layer === 'deadline' ? (isToday ? 'срок сегодня' : 'срок') : null, dk: e.layer === 'deadline' ? 'DEADLINE' : 'SCHEDULED',
    }));
  return { timed, planned, isToday };
}

/** «Горизонт»: what is planned, due and on in the `n` days after the day, by date; the finished left out. */
export function horizonOf(files: CalFile[], day: Date, n = 30): HorizonDay[] {
  const by = byDay(entriesIn(files, add(day, 1), add(day, n)).filter((e) => e.layer !== 'done'));
  return [...by.keys()]
    .sort()
    .map((k) => {
      const list = by.get(k)!;
      return {
        day: new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)),
        due: list.some((e) => e.layer === 'deadline'),
        items: list.map((e) => ({ key: keyOf(e), kw: e.keyword, title: e.title, path: e.path, line: e.line, layer: e.layer })),
      };
    });
}

const WD = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
const MON = ['ЯНВ', 'ФЕВР', 'МАРТ', 'АПР', 'МАЯ', 'ИЮНЯ', 'ИЮЛЯ', 'АВГ', 'СЕНТ', 'ОКТ', 'НОЯБ', 'ДЕК'];
/** «СР 21 · СРОК»; another month than the day's: «ПН 2 НОЯБ». */
export function horizonDate(h: HorizonDay, from: Date): string {
  const month = h.day.getMonth() !== from.getMonth() ? ` ${MON[h.day.getMonth()]}` : '';
  return `${WD[h.day.getDay()]} ${h.day.getDate()}${month}${h.due ? ' · СРОК' : ''}`;
}

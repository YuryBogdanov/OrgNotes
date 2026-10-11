// The date chooser of the palette (like org-read-date): three months, moved with ⇧ + arrows. Pure functions: moving
// the date, the grid of a month, the words around the chosen day and what will be written.

import type { Heading } from './org';

const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** A day, a week, a month (the same day, or the month's last) or a year away. */
export function shiftDate(d: Date, unit: 'day' | 'week' | 'month' | 'year', n: number): Date {
  if (unit === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  if (unit === 'week') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * n);
  const y = d.getFullYear() + (unit === 'year' ? n : 0);
  const m = d.getMonth() + (unit === 'month' ? n : 0);
  const first = new Date(y, m, 1);
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), lastDay(first.getFullYear(), first.getMonth())));
}

/** The weeks of a month, Monday first; days of other months are null. */
export function monthGrid(y: number, m: number): (Date | null)[][] {
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= lastDay(y, m); d++) cells.push(new Date(y, m, d));
  while (cells.length % 7) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const WD_LONG = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON_NAME = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const monthName = (y: number, m: number) => `${MON_NAME[m]} ${y}`;
/** «Среда, 21 октября 2026». */
export const longDate = (d: Date) => `${WD_LONG[d.getDay()]}, ${d.getDate()} ${MON_GEN[d.getMonth()]} ${d.getFullYear()}`;
export const shortDate = (d: Date) => `${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;
/** «сегодня», «завтра», «вчера», «через 10 дней», «3 дня назад». */
export function relWords(d: Date, now = new Date()): string {
  const n = Math.round((+day0(d) - +day0(now)) / 86400000);
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === -1) return 'вчера';
  const w = `${Math.abs(n)} ${plural(Math.abs(n), 'день', 'дня', 'дней')}`;
  return n > 0 ? `через ${w}` : `${w} назад`;
}
export const sameDay = (a: Date | null | undefined, b: Date | null | undefined) => !!a && !!b && +day0(a) === +day0(b);
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** What will be written: «<2026-10-21 Ср>», with the old stamp's time and repeat kept («<… 10:00 +1w>»). */
export function stampText(d: Date, names: string[], old?: string): string {
  const tail = old ? (/^<\d{4}-\d{2}-\d{2}(?:\s+[^\s\d>]+)?([^>]*)>/.exec(old)?.[1] ?? '') : '';
  return `<${isoDay(d)} ${names[d.getDay()]}${tail}>`;
}

/** Days with tasks on them (what the agenda shows): any open task, and whether one of them is a deadline. */
export function busyDays(files: { headings: Heading[]; wf: { done: string[] } }[]): Map<string, 'task' | 'deadline'> {
  const out = new Map<string, 'task' | 'deadline'>();
  const key = (o: { y: number; m: number; d: number }) => `${o.y}-${pad(o.m)}-${pad(o.d)}`;
  for (const f of files)
    for (const h of f.headings) {
      if (!h.keyword || f.wf.done.includes(h.keyword)) continue;
      if (h.deadline) out.set(key(h.deadline), 'deadline');
      for (const o of [h.scheduled, h.event]) if (o && !out.has(key(o))) out.set(key(o), 'task');
    }
  return out;
}

// Text edits behind the palette commands: dates, tags, moving a subtree to another file, a new task.
import { inactiveStamp, logNote, type Heading } from './org';

const pad = (n: number) => String(n).padStart(2, '0');
const WD_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// ---- reading a date typed in the palette ------------------------------------------------------------

const MONTHS: [RegExp, number][] = [
  [/^янв/, 0], [/^фев/, 1], [/^мар/, 2], [/^апр/, 3], [/^ма[йя]/, 4], [/^июн/, 5], [/^июл/, 6], [/^авг/, 7],
  [/^сен/, 8], [/^окт/, 9], [/^ноя/, 10], [/^дек/, 11],
  [/^jan/, 0], [/^feb/, 1], [/^mar/, 2], [/^apr/, 3], [/^may/, 4], [/^jun/, 5], [/^jul/, 6], [/^aug/, 7],
  [/^sep/, 8], [/^oct/, 9], [/^nov/, 10], [/^dec/, 11],
];
const WEEKDAYS: [RegExp, number][] = [
  [/^(пн|понед|mon)/, 1], [/^(вт|втор|tue)/, 2], [/^(ср|сред|wed)/, 3], [/^(чт|четв|thu)/, 4],
  [/^(пт|пятн|fri)/, 5], [/^(сб|субб|sat)/, 6], [/^(вс|воскр|sun)/, 0],
];

/**
 * A date the way people type it: «сегодня», «завтра», «пт», «14 окт», «14.10», «2026-10-14», «+3д», «+2н», «+1м».
 * A weekday is the nearest one from today on; a day without a year is the next one to come. Null if not a date.
 */
export function parseDate(input: string, now = new Date()): Date | null {
  const s = input.trim().toLowerCase().replace(/ё/g, 'е');
  const today = day0(now);
  if (!s) return null;
  if (/^(сегодня|сег|today|\.)$/.test(s)) return today;
  if (/^(завтра|tomorrow)$/.test(s)) return addDays(today, 1);
  if (/^послезавтра$/.test(s)) return addDays(today, 2);
  if (/^(вчера|yesterday)$/.test(s)) return addDays(today, -1);
  let m = /^([+-])\s*(\d+)\s*(д|дн|дня|дней|d|н|нед|w|м|мес|m|г|год|y)?$/.exec(s);
  if (m) {
    const n = (m[1] === '-' ? -1 : 1) * +m[2];
    const u = m[3] ?? 'д';
    if (/^(н|нед|w)$/.test(u)) return addDays(today, 7 * n);
    if (/^(м|мес|m)$/.test(u)) return addMonths(today, n);
    if (/^(г|год|y)$/.test(u)) return addMonths(today, 12 * n);
    return addDays(today, n);
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return valid(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/.exec(s);
  if (m) return withYear(+m[1], +m[2] - 1, m[3], today);
  m = /^(\d{1,2})\s+([a-zа-я]+)\.?(?:\s+(\d{4}))?$/.exec(s);
  if (m) {
    const mo = MONTHS.find(([re]) => re.test(m![2]));
    return mo ? withYear(+m[1], mo[1], m[3], today) : null;
  }
  m = /^(\d{1,2})$/.exec(s);
  if (m) {
    // a bare day: this month, or the next one when it has passed
    let d = valid(today.getFullYear(), today.getMonth(), +m[1]);
    if (d && d < today) d = valid(today.getFullYear(), today.getMonth() + 1, +m[1]);
    return d;
  }
  const wd = WEEKDAYS.find(([re]) => re.test(s));
  if (wd) return addDays(today, (wd[1] - today.getDay() + 7) % 7);
  return null;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function addMonths(d: Date, n: number) {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  r.setDate(Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return r;
}
function valid(y: number, mo: number, d: number): Date | null {
  const r = new Date(y, mo, d);
  return r.getDate() === d && r.getMonth() === ((mo % 12) + 12) % 12 ? r : null;
}
function withYear(d: number, mo: number, y: string | undefined, today: Date) {
  if (y) return valid(y.length === 2 ? 2000 + +y : +y, mo, d);
  const r = valid(today.getFullYear(), mo, d);
  return r && r < today ? valid(today.getFullYear() + 1, mo, d) : r;
}

// ---- writing dates, tags --------------------------------------------------------------------------

const PLANNING = /^\s*(SCHEDULED|DEADLINE|CLOSED):/;
/** Weekday names as the file already writes them (English if it has an English timestamp), else Russian. */
/** The day names a file writes in its stamps (English if it already has an English one). */
export const weekdayNames = (text: string) => (/<\d{4}-\d{2}-\d{2} (Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(text) ? WD_EN : WD_RU);

/**
 * Set or remove SCHEDULED: / DEADLINE: of a heading. The time and repeater of an existing stamp are kept. `log` (the
 * workflow's journal on): a SCHEDULED moved to another day is noted in :LOGBOOK: as Org's `org-log-reschedule` does —
 * `- Rescheduled from "<old>" on [now]`.
 */
export function setPlanning(text: string, h: Heading, kind: 'SCHEDULED' | 'DEADLINE', date: Date | null, log?: Date): string {
  const lines = text.split('\n');
  const names = weekdayNames(text);
  const has = PLANNING.test(lines[h.line + 1] ?? '');
  const line = has ? lines[h.line + 1] : '';
  const re = new RegExp(`${kind}:\\s*<[^>]*>\\s*`);
  const old = new RegExp(`${kind}:\\s*<\\d{4}-\\d{2}-\\d{2}(?:\\s+[^\\s\\d>]+)?([^>]*)>`).exec(line);
  let next = line.replace(re, '').replace(/\s+$/, '');
  if (date) {
    const tail = old?.[1] ?? ''; // " 10:00 +1w"
    const stamp = `${kind}: <${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${names[date.getDay()]}${tail}>`;
    const indent = /^\s*/.exec(line)?.[0] ?? '';
    next = next.trim() ? `${next} ${stamp}` : indent + stamp;
  }
  if (has) {
    if (next.trim()) lines[h.line + 1] = next;
    else lines.splice(h.line + 1, 1);
  } else if (next.trim()) lines.splice(h.line + 1, 0, next);
  const was = kind === 'SCHEDULED' && log && date ? new RegExp(`SCHEDULED:\\s*(<(\\d{4})-(\\d{2})-(\\d{2})[^>]*>)`).exec(line) : null;
  if (was && (+was[2] !== date!.getFullYear() || +was[3] !== date!.getMonth() + 1 || +was[4] !== date!.getDate())) {
    logNote(lines, h, `- Rescheduled from "${was[1]}" on ${inactiveStamp(log!)}`);
  }
  return lines.join('\n');
}

/**
 * An event's timestamp (the line right under the heading) moved by `days`: its time, end time and repeater kept;
 * both ends of a range move, so it keeps its length (ТЗ 34, ⌥⇧← → in a list).
 */
export function shiftEvent(text: string, h: Heading, days: number): string {
  const lines = text.split('\n');
  const at = h.line + 1;
  if (!/^\s*<\d{4}-/.test(lines[at] ?? '')) return text;
  const names = weekdayNames(text);
  lines[at] = lines[at].replace(/<(\d{4})-(\d{2})-(\d{2})(?:\s+[^\s\d>]+)?([^>]*)>/g, (_, y: string, m: string, d: string, tail: string) => {
    const to = new Date(+y, +m - 1, +d + days);
    return `<${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())} ${names[to.getDay()]}${tail}>`;
  });
  return lines.join('\n');
}

/** Replace the tags of a heading: «:a:b:» at the end of its line, none for an empty list. */
export function setTags(text: string, h: Heading, tags: string[]): string {
  const lines = text.split('\n');
  const base = lines[h.line].replace(/\s+:[^\s:]+(?::[^\s:]+)*:\s*$/, '').replace(/\s+$/, '');
  lines[h.line] = tags.length ? `${base} :${tags.join(':')}:` : base;
  return lines.join('\n');
}
/** «budget, finance #q4» → ["budget", "finance", "q4"]: spaces, commas and colons separate tags. */
export const splitTags = (s: string) => [...new Set(s.split(/[\s,:;#]+/).map((t) => t.trim()).filter(Boolean))];

// ---- adding a task ----------------------------------------------------------------

/** A new top-level task at the end of a file; returns the text and its line (for the caret). */
export function appendTask(text: string, keyword: string): { text: string; line: number } {
  const body = text.replace(/\n*$/, '');
  const lines = body ? body.split('\n') : [];
  lines.push(`* ${keyword} `);
  return { text: lines.join('\n') + '\n', line: lines.length - 1 };
}

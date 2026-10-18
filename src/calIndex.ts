// The calendar (ТЗ 24): every dated entry of the notes — scheduled tasks, deadlines, events (an active timestamp in
// a heading or right under it), finished tasks by CLOSED — laid out over days. Repeats and ranges are unfolded only
// inside the days shown. Pure: files in, entries out; the per-file part is kept until the file's text changes.

import { occurrences, type Heading, type OrgDate } from './org';

export type Layer = 'task' | 'deadline' | 'event' | 'wait' | 'done';
export const LAYERS: { id: Layer; name: string; color: string }[] = [
  { id: 'task', name: 'Запланированные задачи', color: 'var(--next)' },
  { id: 'deadline', name: 'Дедлайны', color: 'var(--todo)' },
  { id: 'event', name: 'События', color: 'var(--acc)' },
  { id: 'wait', name: 'Ожидания', color: 'var(--wait)' },
  { id: 'done', name: 'Выполненные', color: 'var(--done)' },
];

export interface CalFile {
  name: string; // relative path
  path: string;
  text: string;
  headings: Heading[];
  wf: { open: string[]; done: string[] };
}
/** One entry on one day. */
export interface CalEntry {
  layer: Layer;
  day: string; // YYYY-MM-DD
  time: string | null; // «10:00»; null: the whole day
  end: string | null; // «11:30» from «10:00-11:30»
  title: string;
  keyword: string | null;
  priority: string | null;
  file: string; // relative path
  path: string; // absolute path
  line: number; // the heading's line
  where: string; // «work › Q4 2026»
  repeat: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s: string) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// a timestamp with an optional end time and repeater: <2026-10-12 Пн 10:00-11:30 +1w>
const STAMP = /<(\d{4})-(\d{2})-(\d{2})(?:\s+[^\s\d>]+)?(?:\s+(\d{1,2}:\d{2})(?:-(\d{1,2}:\d{2}))?)?(?:\s+([.+]{1,2}\d+[hdwmy]))?[^>]*>/;
const RANGE = new RegExp(STAMP.source + '--' + STAMP.source);
const toOrg = (m: RegExpExecArray, k = 0): OrgDate & { end?: string } => ({ y: +m[1 + k], m: +m[2 + k], d: +m[3 + k], time: m[4 + k], end: m[5 + k], repeater: m[6 + k] });
const hhmm = (t?: string) => (t ? t.padStart(5, '0') : null);

/** What a heading puts on the calendar, with its dates still unfolded (a repeat, a range). */
interface Raw {
  layer: Layer;
  date: OrgDate & { end?: string };
  until?: OrgDate; // a range «<a>--<b>»: every day up to this one
}
function rawOf(f: CalFile, h: Heading, lines: string[]): Raw[] {
  const done = !!h.keyword && f.wf.done.includes(h.keyword);
  const out: Raw[] = [];
  const planning = lines[h.line + 1] ?? '';
  const stampOf = (kind: string) => {
    const m = new RegExp(`${kind}:\\s*(<[^>]*>)`).exec(planning);
    const s = m && STAMP.exec(m[1]);
    return s ? toOrg(s) : undefined;
  };
  if (done) {
    const d = h.closed ?? h.scheduled;
    if (d) out.push({ layer: 'done', date: { y: d.y, m: d.m, d: d.d } });
    return out;
  }
  const sc = /^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(planning) ? stampOf('SCHEDULED') : undefined;
  const dl = /^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(planning) ? stampOf('DEADLINE') : undefined;
  if (sc) out.push({ layer: h.keyword === 'WAIT' ? 'wait' : 'task', date: sc });
  if (dl) out.push({ layer: 'deadline', date: dl });
  if (!sc && !dl) {
    // an event: a timestamp in the heading's title, or a line of it right under the heading
    for (const src of [lines[h.line], /^\s*</.test(planning) ? planning : '']) {
      const r = RANGE.exec(src);
      if (r) {
        out.push({ layer: 'event', date: toOrg(r), until: toOrg(r, 6) });
        break;
      }
      const s = STAMP.exec(src);
      if (s) {
        out.push({ layer: h.keyword === 'WAIT' ? 'wait' : 'event', date: toOrg(s) });
        break;
      }
    }
  }
  return out;
}

const cache = new Map<string, { text: string; raws: { h: Heading; raw: Raw }[] }>();
function rawsOf(f: CalFile) {
  const c = cache.get(f.path);
  if (c && c.text === f.text) return c.raws;
  const lines = f.text.split('\n');
  const raws = f.headings.flatMap((h) => rawOf(f, h, lines).map((raw) => ({ h, raw })));
  cache.set(f.path, { text: f.text, raws });
  return raws;
}
/** The file has something dated (the «ФАЙЛЫ» of the calendar). */
export const hasDated = (f: CalFile) => rawsOf(f).length > 0;
/** How many dated entries a file has (the number by it in the calendar's panel, ТЗ 47 §1.1). */
export const datedCount = (f: CalFile) => rawsOf(f).length;
const clean = (t: string) => t.replace(/<\d{4}-\d{2}-\d{2}[^>]*>(--<[^>]*>)?/g, '').replace(/\s+/g, ' ').trim();

/** The entries of the files between two days (both included), unordered. */
export function entriesIn(files: CalFile[], from: Date, to: Date): CalEntry[] {
  const out: CalEntry[] = [];
  const a = day0(from), b = day0(to);
  for (const f of files) {
    const base = f.name.split('/').pop()!.replace(/\.org$/, '');
    for (const { h, raw } of rawsOf(f)) {
      const days: Date[] = [];
      if (raw.until) {
        const s = new Date(raw.date.y, raw.date.m - 1, raw.date.d), e = new Date(raw.until.y, raw.until.m - 1, raw.until.d);
        for (let d = new Date(Math.max(+s, +a)); d <= e && d <= b; d.setDate(d.getDate() + 1)) days.push(new Date(d));
      } else days.push(...occurrences(raw.date, a, b));
      for (const d of days)
        out.push({
          layer: raw.layer, day: isoDay(d), time: hhmm(raw.date.time), end: hhmm(raw.date.end), title: clean(h.title), keyword: h.keyword, priority: h.priority,
          file: f.name, path: f.path, line: h.line, where: [base, ...h.path].join(' › '), repeat: !!raw.date.repeater,
        });
    }
  }
  return out;
}

const RANK: Record<Layer, number> = { event: 0, deadline: 1, task: 2, wait: 2, done: 3 };
/** The order inside a day: events by time, then deadlines, then tasks by priority and status, the finished last. */
export function sortDay(list: CalEntry[], open: string[] = []): CalEntry[] {
  const pr = (e: CalEntry) => (e.priority ? e.priority.charCodeAt(0) : 'Z'.charCodeAt(0));
  const st = (e: CalEntry) => (e.keyword ? open.indexOf(e.keyword) : 99);
  return [...list].sort(
    (x, y) => RANK[x.layer] - RANK[y.layer] || (x.layer === 'event' ? (x.time ?? '99').localeCompare(y.time ?? '99') : 0) || pr(x) - pr(y) || st(x) - st(y) || x.title.localeCompare(y.title, 'ru'),
  );
}
/** Entries by day, each day in order. */
export function byDay(list: CalEntry[], open: string[] = []): Map<string, CalEntry[]> {
  const m = new Map<string, CalEntry[]>();
  for (const e of list) (m.get(e.day) ?? m.set(e.day, []).get(e.day)!).push(e);
  for (const [k, v] of m) m.set(k, sortDay(v, open));
  return m;
}

/** «Без даты»: open tasks with neither SCHEDULED nor DEADLINE, those with a priority first, at most `n`. */
export function undated(files: CalFile[], n = 20) {
  const out: { title: string; keyword: string; priority: string | null; file: string; path: string; line: number }[] = [];
  for (const f of files)
    for (const h of f.headings)
      if (h.keyword && !f.wf.done.includes(h.keyword) && !h.scheduled && !h.deadline && !h.event && !/<\d{4}-\d{2}-\d{2}/.test(h.title))
        out.push({ title: h.title, keyword: h.keyword, priority: h.priority, file: f.name, path: f.path, line: h.line });
  return out.sort((a, b) => (a.priority ? a.priority.charCodeAt(0) : 99) - (b.priority ? b.priority.charCodeAt(0) : 99)).slice(0, n);
}

// ---- the grid -----------------------------------------------------------------------------------------------------

/** The weeks of a month (Monday first by default), the days of the neighbour months included. */
export function monthWeeks(y: number, m: number, firstDay = 1): Date[][] {
  const first = new Date(y, m, 1);
  const shift = (first.getDay() - firstDay + 7) % 7;
  const start = new Date(y, m, 1 - shift);
  const weeks: Date[][] = [];
  for (let d = new Date(start); weeks.length < 6; ) {
    const w: Date[] = [];
    for (let i = 0; i < 7; i++, d.setDate(d.getDate() + 1)) w.push(new Date(d));
    weeks.push(w);
    if (d.getMonth() !== m && d > first) break;
  }
  return weeks;
}
/** The seven days of the week of `d`. */
export function weekDays(d: Date, firstDay = 1): Date[] {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() - firstDay + 7) % 7));
  return Array.from({ length: 7 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i));
}
/** ISO 8601 week number. */
export function weekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dn = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dn);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +y0) / 86400000 + 1) / 7);
}
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WD_LONG = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WD_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const monthTitle = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** «Четверг, 1 – суббота, 31 октября». */
export function monthSub(d: Date): string {
  const a = new Date(d.getFullYear(), d.getMonth(), 1), b = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${cap(WD_LONG[a.getDay()])}, 1 – ${WD_LONG[b.getDay()]}, ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
}
/** «12 – 18 октября 2026», «28 сентября – 4 октября 2026». */
export function weekSub(days: Date[]): string {
  const a = days[0], b = days[6];
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]} ${b.getFullYear()}`
    : `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]} ${b.getFullYear()}`;
}
/** «Среда, 14 октября». */
export const dayTitle = (d: Date) => `${cap(WD_LONG[d.getDay()])}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
/** «Пт, 16 октября». */
export const dayShort = (d: Date) => `${WD_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
export const weekdayShort = (i: number) => WD_SHORT[i];
/** «6 записей». */
export function entriesWord(n: number) {
  const w = n % 10 === 1 && n % 100 !== 11 ? 'запись' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'записи' : 'записей';
  return `${n} ${w}`;
}

/** Events of a day laid out over the hours: columns for those that overlap. */
export function layoutEvents(list: CalEntry[], defaultMinutes = 60): { e: CalEntry; start: number; end: number; col: number; cols: number }[] {
  const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const items = list
    .filter((e) => e.time)
    .map((e) => {
      const start = mins(e.time!);
      const end = e.end && mins(e.end) > start ? mins(e.end) : start + defaultMinutes;
      return { e, start, end, col: 0, cols: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  // groups of events that overlap each other; in a group each takes the first free column
  let group: typeof items = [];
  let groupEnd = -1;
  const close = () => {
    const n = Math.max(1, ...group.map((x) => x.col + 1));
    for (const x of group) x.cols = n;
    group = [];
  };
  for (const it of items) {
    if (it.start >= groupEnd) close();
    const used = new Set(group.filter((x) => x.end > it.start).map((x) => x.col));
    let c = 0;
    while (used.has(c)) c++;
    it.col = c;
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  }
  close();
  return items;
}

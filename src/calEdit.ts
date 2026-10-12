// The calendar's edits (ТЗ 24, part 2): an entry moved to another day (or time) by the mouse, and a new task or
// event made on a day. Pure: the text in, the text out; the store writes it as any edit of a file.

import { headingLines } from './org';
import type { Layer } from './calIndex';

const pad = (n: number) => String(n).padStart(2, '0');
const STAMP = /<(\d{4})-(\d{2})-(\d{2})(\s+[^\s\d>]+)?(?:\s+(\d{1,2}):(\d{2})(?:-(\d{1,2}):(\d{2}))?)?([^>]*)>/;
const mins = (h: string, m: string) => +h * 60 + +m;
const hm = (t: number) => `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;

/**
 * A timestamp moved to `to`: the day name as the file writes it, the repeater kept; `time` undefined keeps the time,
 * null takes it away, «14:00» sets it — and an end time moves with it, so the length stays.
 */
export function moveStamp(stamp: string, to: Date, names: string[], time?: string | null): string {
  const m = STAMP.exec(stamp);
  if (!m) return stamp;
  let t = '';
  const had = m[5] !== undefined ? mins(m[5], m[6]) : null;
  const end = m[7] !== undefined ? mins(m[7], m[8]) : null;
  const start = time === undefined ? had : time === null ? null : mins(time.slice(0, 2), time.slice(3, 5));
  if (start !== null) {
    t = ' ' + hm(start);
    if (end !== null && had !== null) t += '-' + hm(Math.min(24 * 60 - 1, start + (end - had)));
  }
  const date = `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())} ${names[to.getDay()]}`;
  return stamp.replace(STAMP, `<${date}${t}${m[9] ?? ''}>`);
}
const dayDelta = (a: Date, b: Date) => Math.round((+new Date(b.getFullYear(), b.getMonth(), b.getDate()) - +new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
const dateOf = (stamp: string) => {
  const m = STAMP.exec(stamp);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

/**
 * A heading's entry of the calendar moved to `to` (and `time` in the week): a task's SCHEDULED (its DEADLINE moves
 * by as many days unless `keepDeadline`), a deadline's DEADLINE, an event's timestamp (in the title or right
 * under it). A task without a date gets SCHEDULED.
 */
export function moveEntry(text: string, line: number, layer: Layer | 'undated', to: Date, names: string[], o: { time?: string | null; keepDeadline?: boolean } = {}): string {
  const lines = text.split('\n');
  const head = lines[line];
  const plan = lines[line + 1] ?? '';
  const isPlan = /^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(plan);
  const swap = (s: string, kind: 'SCHEDULED' | 'DEADLINE', d: Date, time?: string | null) =>
    s.replace(new RegExp(`(${kind}:\\s*)(<[^>]*>)`), (_, k: string, st: string) => k + moveStamp(st, d, names, time));
  // an event: a timestamp in the title or on the line right under it (a WAIT entry may be one too)
  const evAt = STAMP.test(head) ? line : !isPlan && /^\s*</.test(plan) ? line + 1 : -1;
  if (layer === 'event' || (layer === 'wait' && !/SCHEDULED:/.test(plan) && evAt >= 0)) {
    if (evAt < 0) return text;
    const src = lines[evAt];
    const range = /(<[^>]*>)--(<[^>]*>)/.exec(src);
    if (range) {
      // a range keeps its length: the end moves by as many days
      const a = dateOf(range[1])!, b = dateOf(range[2])!;
      const n = dayDelta(a, to);
      const end = new Date(b.getFullYear(), b.getMonth(), b.getDate() + n);
      lines[evAt] = src.replace(range[0], `${moveStamp(range[1], to, names, o.time)}--${moveStamp(range[2], end, names)}`);
    } else lines[evAt] = src.replace(/<\d{4}-[^>]*>/, (st) => moveStamp(st, to, names, o.time));
  } else if (layer === 'deadline') {
    if (isPlan) lines[line + 1] = swap(plan, 'DEADLINE', to, o.time);
  } else if (isPlan && /SCHEDULED:/.test(plan)) {
    const was = dateOf(/SCHEDULED:\s*(<[^>]*>)/.exec(plan)![1]);
    let next = swap(plan, 'SCHEDULED', to, o.time);
    if (!o.keepDeadline && was && /DEADLINE:\s*</.test(plan)) {
      const dl = dateOf(/DEADLINE:\s*(<[^>]*>)/.exec(plan)![1])!;
      next = swap(next, 'DEADLINE', new Date(dl.getFullYear(), dl.getMonth(), dl.getDate() + dayDelta(was, to)));
    }
    lines[line + 1] = next;
  } else {
    // no SCHEDULED yet («Без даты», or a task with a DEADLINE only)
    const t = o.time ? ' ' + o.time : '';
    const stamp = `SCHEDULED: <${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())} ${names[to.getDay()]}${t}>`;
    if (isPlan) lines[line + 1] = plan.replace(/^(\s*)(.*?)\s*$/, (_, ind: string, rest: string) => `${ind}${stamp} ${rest}`);
    else lines.splice(line + 1, 0, stamp);
  }
  return lines.join('\n');
}

// ---- a new task or event ---------------------------------------------------------------------------------------

export type DateKind = 'SCHEDULED' | 'DEADLINE' | 'plain';
export interface NewEntry {
  kind: 'task' | 'event';
  title: string;
  status: string | null;
  date: Date;
  time: string | null; // «10:00»
  minutes: number; // the length of an event with a time
  dateKind: DateKind; // a task's date
}
/** The lines of a new entry at a level: `* TODO title` and its date line. */
export function entryLines(e: NewEntry, level: number, names: string[]): string[] {
  const day = `${e.date.getFullYear()}-${pad(e.date.getMonth() + 1)}-${pad(e.date.getDate())} ${names[e.date.getDay()]}`;
  const t = e.time ? (e.kind === 'event' ? ` ${e.time}-${hm(Math.min(24 * 60 - 1, mins(e.time.slice(0, 2), e.time.slice(3, 5)) + e.minutes))}` : ` ${e.time}`) : '';
  const head = `${'*'.repeat(level)} ${e.status ? e.status + ' ' : ''}${e.title.replace(/\s+/g, ' ').trim()}`;
  if (e.kind === 'event' || e.dateKind === 'plain') return [head, `<${day}${t}>`];
  return [head, `${e.dateKind}: <${day}${t}>`];
}

/**
 * The file with the entry added: at the end of the level-1 heading `heading` (made at the end of the file if it is
 * not there), or — no heading — at the top or the end of the file as the Inbox does.
 */
export function insertEntry(text: string, heading: string | null, e: NewEntry, names: string[], add: 'top' | 'end' = 'end'): { text: string; line: number } {
  const lines = text.split('\n');
  const heads = [...headingLines(lines)].sort((a, b) => a - b);
  if (!heading) {
    const body = entryLines(e, 1, names);
    if (add === 'top' && heads.length) {
      const at = heads[0];
      lines.splice(at, 0, ...body, '');
      return { text: lines.join('\n'), line: at };
    }
    const base = text.replace(/\n\s*$/, '');
    const out = (base.trim() ? base + '\n\n' : '') + body.join('\n') + '\n';
    return { text: out, line: out.split('\n').length - 1 - body.length };
  }
  const level1 = heads.find((i) => /^\*\s/.test(lines[i]) && lines[i].replace(/^\*\s+/, '').trim().toLowerCase() === heading.trim().toLowerCase());
  if (level1 === undefined) {
    const base = text.replace(/\n\s*$/, '');
    const pre = (base.trim() ? base + '\n\n' : '') + `* ${heading}\n`;
    const out = pre + entryLines(e, 2, names).join('\n') + '\n';
    return { text: out, line: pre.split('\n').length - 1 };
  }
  let end = heads.find((i) => i > level1 && /^\*\s/.test(lines[i])) ?? lines.length;
  while (end > level1 + 1 && !lines[end - 1].trim()) end--;
  lines.splice(end, 0, ...entryLines(e, 2, names));
  return { text: lines.join('\n'), line: end };
}

// ---- «Настройки → Календарь» (`calendar` in config.json) ---------------------------------------------------------

export interface CalSettings {
  pick: 'default' | 'ask' | 'last'; // the file of a new entry: as set, asked each time, as the last time
  taskFile: string | null; // relative; null: the Inbox file
  taskHeading: string; // a level-1 heading; '': at the top or the end of the file, as the Inbox
  eventFile: string | null;
  eventHeading: string;
  taskStatus: string | null; // null: the first status of the file's set
  eventStatus: string; // '' : no status (and none when the file's sets do not have it)
  dateKind: DateKind;
  minutes: number; // an event's length: 30, 60, 90, 120
  view: 'month' | 'week';
  from: number; // the hours of the week: 0…12
  to: number; // 12…24
  weekNumbers: boolean;
  weekends: boolean;
  undated: boolean; // «Без даты» in the navigator
  keepDeadline: boolean;
  askRepeat: boolean;
  last: { task: string | null; event: string | null }; // «Как в прошлый раз»: the files chosen last
}
export const DEFAULT_CAL: CalSettings = {
  pick: 'default', taskFile: null, taskHeading: '', eventFile: null, eventHeading: '', taskStatus: null, eventStatus: 'MEETING',
  dateKind: 'SCHEDULED', minutes: 60, view: 'month', from: 8, to: 20, weekNumbers: true, weekends: true, undated: true,
  keepDeadline: true, askRepeat: true, last: { task: null, event: null },
};
export function readCal(raw: unknown): CalSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const d = DEFAULT_CAL;
  const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x : null);
  const bool = (x: unknown, def: boolean) => (typeof x === 'boolean' ? x : def);
  const one = <T,>(x: unknown, of: T[], def: T) => (of.includes(x as T) ? (x as T) : def);
  const from = Number.isInteger(v.from) && v.from >= 0 && v.from <= 12 ? v.from : d.from;
  const to = Number.isInteger(v.to) && v.to >= 12 && v.to <= 24 && v.to > from ? v.to : d.to;
  return {
    pick: one(v.pick, ['default', 'ask', 'last'], d.pick),
    taskFile: str(v.taskFile), taskHeading: str(v.taskHeading) ?? '', eventFile: str(v.eventFile), eventHeading: str(v.eventHeading) ?? '',
    taskStatus: str(v.taskStatus), eventStatus: typeof v.eventStatus === 'string' ? v.eventStatus : d.eventStatus,
    dateKind: one(v.dateKind, ['SCHEDULED', 'DEADLINE', 'plain'], d.dateKind),
    minutes: one(v.minutes, [30, 60, 90, 120], d.minutes),
    view: one(v.view, ['month', 'week'], d.view), from, to,
    weekNumbers: bool(v.weekNumbers, d.weekNumbers), weekends: bool(v.weekends, d.weekends), undated: bool(v.undated, d.undated),
    keepDeadline: bool(v.keepDeadline, d.keepDeadline), askRepeat: bool(v.askRepeat, d.askRepeat),
    last: { task: str(v.last?.task), event: str(v.last?.event) },
  };
}
/** Where each setting lives (roadmap 0.6): what new entries go to and get — the folder's; the look and the moves —
 *  this Mac's. */
export const CAL_FOLDER_KEYS = ['pick', 'taskFile', 'taskHeading', 'eventFile', 'eventHeading', 'taskStatus', 'eventStatus', 'dateKind', 'minutes', 'last'] as const;
export const CAL_LOCAL_KEYS = ['view', 'from', 'to', 'weekNumbers', 'weekends', 'undated', 'keepDeadline', 'askRepeat'] as const;
/** The settings of `keys` that differ from the defaults. */
export function calPart(c: CalSettings, keys: readonly (keyof CalSettings)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (JSON.stringify(c[k]) !== JSON.stringify(DEFAULT_CAL[k])) out[k] = c[k];
  return out;
}
/** The config text with the settings: only what differs from the defaults is written (before roadmap 0.6). */
export function withCal(raw: string | null, c: CalSettings): string {
  let base: Record<string, unknown> = {};
  try {
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p === 'object' && !Array.isArray(p)) base = p;
  } catch {
    /* replaced */
  }
  const out: Record<string, unknown> = { version: base.version ?? 1, ...base };
  const keep: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULT_CAL) as (keyof CalSettings)[])
    if (JSON.stringify(c[k]) !== JSON.stringify(DEFAULT_CAL[k])) keep[k] = c[k];
  if (Object.keys(keep).length) out.calendar = keep;
  else delete out.calendar;
  return JSON.stringify(out, null, 2) + '\n';
}

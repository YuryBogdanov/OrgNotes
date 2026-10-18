// «Сегодня» (ТЗ 32): the morning's overview on one screen. Pure: the day (it starts at 4:00), the settings as read,
// the journal's days (a datetree: year › month › day › «На завтра», «Главное»), and what each block shows — the
// agenda of the day, the tasks of the chosen statuses and files, the overdue ones. The store gives the files.

import { bodyOf } from './orgOps';
import { firstDone, sequenceFor, type Heading, type OrgDate, type Workflow } from './org';
import { isoDay, weekNumber, type CalEntry } from './calIndex';
import { nameOf } from './oneOnOne';

// ---- the day ------------------------------------------------------------------------------------------------------

/** The day starts at 4:00: work after midnight is still the day before. */
export const DAY_START = 4;
/** Midnight of the day `now` belongs to. */
export function dayOf(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() < DAY_START) d.setDate(d.getDate() - 1);
  return d;
}
/** When the day of `now` started: its 4:00. */
export const dayStart = (now: Date) => {
  const d = dayOf(now);
  d.setHours(DAY_START);
  return d;
};

const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** «СРЕДА · 42 НЕДЕЛЯ». */
export const kicker = (day: Date) => `${WD[day.getDay()].toUpperCase()} · ${weekNumber(day)} НЕДЕЛЯ`;
/** «пятница, 16 октября · неделя 42» — the second line of the panel «Сегодня» (ТЗ 50 §4.1). */
export const panelDate = (day: Date) => `${WD[day.getDay()]}, ${day.getDate()} ${MON_GEN[day.getMonth()]} · неделя ${weekNumber(day)}`;
/** «Доброе утро. Среда, 14 октября» till noon (and in the small hours of the day before), then «Среда, 14 октября». */
export function dateTitle(day: Date, now: Date): string {
  const d = `${cap(WD[day.getDay()])}, ${day.getDate()} ${MON_GEN[day.getMonth()]}`;
  return now.getHours() < 12 && now.getHours() >= DAY_START ? `Доброе утро. ${d}` : d;
}
/** «вторник, 18:42» — the day of the week of a note, with its time. */
export const noteWhen = (d: Date, time: string | null) => WD[d.getDay()] + (time ? `, ${time}` : '');

const ON_DAY = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];
/** «вчера», else «в пятницу»: when the morning's choice was made. */
export const whenChosen = (d: Date, day: Date) => (days(day, d) === 1 ? 'вчера' : ON_DAY[d.getDay()]);

const mid = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const days = (a: Date, b: Date) => Math.round((+mid(a) - +mid(b)) / 86400000);
const toDate = (d: OrgDate) => new Date(d.y, d.m - 1, d.d);

// ---- when the screen is shown ---------------------------------------------------------------------------------------

export type ShowMode = 'day' | 'launch' | 'command';
/**
 * Whether «Сегодня» opens by itself now: at launch in «При запуске»; in «В начале дня» when it has not been shown
 * since this day's 4:00 (at launch, on coming back to the window, on the first action after 4:00).
 */
export function shouldShow(mode: ShowMode, lastShown: number | null, now: Date, launch: boolean): boolean {
  if (mode === 'command') return false;
  if (mode === 'launch') return launch;
  return lastShown === null || lastShown < +dayStart(now);
}

/**
 * The reminder to end the day is due: on, a working day, its time passed (a Mac asleep then: on waking, till
 * midnight), not reminded today, the day not ended (the journal has it).
 */
export function remindDue(o: { remind: boolean; remindAt: string }, now: Date, remindedOn: string | null, ended: boolean): boolean {
  if (!o.remind || ended || now.getDay() === 0 || now.getDay() === 6) return false;
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return hm >= o.remindAt.padStart(5, '0') && remindedOn !== isoDay(now);
}

// ---- the settings ---------------------------------------------------------------------------------------------------

export type BlockId = 'note' | 'focus' | 'agenda' | 'oneOnOne' | 'tasks' | 'overdue';
export interface BlockState {
  id: string;
  on: boolean;
}
/** Kept in the notes folder (`.orgnotes/plugins/today.json`): what the screen is made of. */
export interface TodayFolder {
  statuses: string[]; // the tasks of these statuses («Задачи»)
  files: string[] | null; // from these files; null: the Inbox's file
  overdueAll: boolean; // the overdue ones of every file (else of `files`)
  agenda: string; // '': the built-in day; else the id of an agenda of the builder
  tag: string; // the tag of the 1-1 meetings
  journal: string; // the journal's file
  blocks: BlockState[]; // in their order
}
/** Kept on this Mac: when it shows, the reminder. */
export interface TodayLocal {
  show: ShowMode;
  overTabs: boolean; // over yesterday's tabs (else they close)
  remind: boolean;
  remindAt: string; // «18:30»
}
export const BLOCKS: { id: BlockId; title: string; hint?: string }[] = [
  { id: 'note', title: 'Записка со вчера' },
  { id: 'focus', title: 'Главное на сегодня' },
  { id: 'agenda', title: 'Агенда' },
  { id: 'oneOnOne', title: '1-1 сегодня' },
  { id: 'tasks', title: 'Задачи' },
  { id: 'overdue', title: 'Просрочено' },
];
// «Цели квартала» is the plugin's block (`contributes.todayBlocks`): after these in the order until moved
export const DEFAULT_FOLDER: TodayFolder = {
  statuses: ['TODO', 'NEXT'], files: null, overdueAll: true, agenda: '', tag: '1on1', journal: 'journal.org',
  blocks: BLOCKS.map((b) => ({ id: b.id, on: true })),
};
export const DEFAULT_LOCAL: TodayLocal = { show: 'day', overTabs: true, remind: true, remindAt: '17:30' }; // 17:30: the mockup

const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : null);
/** The tag as written in the settings: «:1on1:», «#1on1», «1on1» → «1on1». */
export const cleanTag = (s: string) => s.replace(/[\s:#]+/g, '');

export function readFolder(raw: unknown): TodayFolder {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_FOLDER;
  // the blocks in their saved order; a block not saved yet (a new one) after them
  const saved = Array.isArray(v.blocks) ? (v.blocks as unknown[]).filter((b): b is BlockState => !!b && typeof (b as BlockState).id === 'string') : [];
  const seen = new Set<string>();
  const blocks = saved.filter((b) => !seen.has(b.id) && !!seen.add(b.id)).map((b) => ({ id: b.id, on: b.on !== false }));
  for (const b of d.blocks) if (!seen.has(b.id)) blocks.push({ ...b });
  const tag = typeof v.tag === 'string' ? cleanTag(v.tag) : '';
  return {
    statuses: strs(v.statuses) ?? d.statuses,
    files: strs(v.files),
    overdueAll: typeof v.overdueAll === 'boolean' ? v.overdueAll : d.overdueAll,
    agenda: typeof v.agenda === 'string' ? v.agenda : d.agenda,
    tag: tag || d.tag,
    journal: typeof v.journal === 'string' && v.journal.trim() ? v.journal : d.journal,
    blocks,
  };
}
export function readLocal(raw: unknown): TodayLocal {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LOCAL;
  return {
    show: v.show === 'launch' || v.show === 'command' ? v.show : d.show,
    overTabs: typeof v.overTabs === 'boolean' ? v.overTabs : d.overTabs,
    remind: typeof v.remind === 'boolean' ? v.remind : d.remind,
    remindAt: typeof v.remindAt === 'string' && /^\d{1,2}:\d{2}$/.test(v.remindAt) ? v.remindAt.padStart(5, '0') : d.remindAt,
  };
}

// ---- the files as the blocks see them -----------------------------------------------------------------------------

export interface TFile {
  name: string; // relative path
  path: string;
  text: string;
  wf: Workflow;
  headings: Heading[];
}
/** A task as a row of a block: where it is and how it reads. */
export interface TaskRow {
  key: string;
  file: string; // relative path
  path: string;
  line: number;
  title: string;
  kw: string;
  prio: string | null;
  done: boolean;
}
const rowOf = (f: TFile, h: Heading): TaskRow => ({
  key: f.path + '#' + h.line, file: f.name, path: f.path, line: h.line, title: h.title, kw: h.keyword ?? '', prio: h.priority,
  done: !!h.keyword && f.wf.done.includes(h.keyword),
});
const prioRank = (p: string | null) => (p ? p.charCodeAt(0) - 64 : 2.5); // [#A] 1, [#B] 2, none between B and C

// ---- «Задачи» -----------------------------------------------------------------------------------------------------

export interface TaskGroup {
  file: string; // relative path
  missing: boolean; // no such file
  total: number;
  rows: TaskRow[]; // up to `cap`
  more: number;
}
/** The open tasks of the statuses, by file in the order of the settings; inside — priority, then the file's order. */
export function taskGroups(files: TFile[], statuses: string[], paths: string[], cap = 8): TaskGroup[] {
  const want = new Set(statuses);
  return paths.map((p) => {
    const f = files.find((x) => x.name === p);
    if (!f) return { file: p, missing: true, total: 0, rows: [], more: 0 };
    const all = f.headings
      .filter((h) => h.keyword && want.has(h.keyword) && !f.wf.done.includes(h.keyword))
      .map((h, i) => ({ r: rowOf(f, h), i }))
      .sort((a, b) => prioRank(a.r.prio) - prioRank(b.r.prio) || a.i - b.i)
      .map((x) => x.r);
    return { file: p, missing: false, total: all.length, rows: all.slice(0, cap), more: Math.max(0, all.length - cap) };
  });
}

// ---- «Просрочено» -----------------------------------------------------------------------------------------------

export interface OverdueRow extends TaskRow {
  kinds: ('SCHEDULED' | 'DEADLINE')[]; // the dates that are past (both move)
  kind: 'SCHEDULED' | 'DEADLINE'; // the oldest one, which the row tells
  date: Date;
  late: number; // days
}
/** Open tasks with a SCHEDULED or DEADLINE before the day; the oldest first. */
export function overdue(files: TFile[], day: Date): OverdueRow[] {
  const out: OverdueRow[] = [];
  for (const f of files)
    for (const h of f.headings) {
      if (!h.keyword || f.wf.done.includes(h.keyword)) continue;
      const past = ([['SCHEDULED', h.scheduled], ['DEADLINE', h.deadline]] as const)
        .filter(([, d]) => d && days(toDate(d), day) < 0)
        .map(([k, d]) => ({ k, d: toDate(d!) }))
        .sort((a, b) => +a.d - +b.d);
      if (!past.length) continue;
      out.push({ ...rowOf(f, h), kinds: past.map((p) => p.k), kind: past[0].k, date: past[0].d, late: days(day, past[0].d) });
    }
  return out.sort((a, b) => +a.date - +b.date || a.title.localeCompare(b.title, 'ru'));
}
const dni = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'дня' : 'дней');
/** «запланировано на 12 окт · 2 дня», «дедлайн 11 окт · 3 дня». */
export const overdueWords = (r: OverdueRow) =>
  `${r.kind === 'DEADLINE' ? 'дедлайн' : 'запланировано на'} ${r.date.getDate()} ${MON_SHORT[r.date.getMonth()]} · ${r.late} ${dni(r.late)}`;

// ---- «Агенда на сегодня» ------------------------------------------------------------------------------------------

export interface AgendaRow {
  key: string;
  time: string; // «10:00–10:30», «до 18:00», «весь день»
  kind: 'event' | 'task' | 'deadline';
  title: string;
  kw: string | null;
  meeting: boolean; // a 1-1 (the heading has the tag)
  past: boolean;
  path: string;
  line: number;
  sort: string;
}
/** The entries of the day as rows: by time, the ones of the whole day last. Finished tasks are not shown. */
export function agendaRows(entries: CalEntry[], files: TFile[], day: Date, now: Date, tag: string): AgendaRow[] {
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = isoDay(now) === isoDay(day);
  const gone = days(now, day) > 0; // the small hours: the whole day is behind
  return entries
    .filter((e) => e.layer !== 'done')
    .map((e): AgendaRow => {
      const kind = e.layer === 'event' ? 'event' : e.layer === 'deadline' ? 'deadline' : 'task';
      const f = files.find((x) => x.path === e.path);
      const h = f?.headings.find((x) => x.line === e.line);
      const meeting = !!tag && !!h?.tags.includes(tag);
      const who = meeting && f ? nameOf(f) : '';
      const time = e.time ? (kind === 'deadline' ? `до ${e.time}` : e.end ? `${e.time}–${e.end}` : e.time) : 'весь день';
      const ends = e.end ?? e.time;
      return {
        key: e.path + '#' + e.line + kind, time, kind, kw: e.keyword, meeting, path: e.path, line: e.line,
        // a 1-1 says whose («1-1 Петров Алексей»)
        title: kind === 'deadline' ? `Дедлайн: ${e.title}` : who && !e.title.includes(who) ? `${e.title} ${who}` : e.title,
        past: gone || (today && !!ends && ends < hm),
        sort: (e.time ?? '99:99') + (kind === 'event' ? '0' : kind === 'deadline' ? '1' : '2'),
      };
    })
    .sort((a, b) => a.sort.localeCompare(b.sort) || a.title.localeCompare(b.title, 'ru'));
}

// ---- the journal ------------------------------------------------------------------------------------------------

export interface JournalDay {
  date: Date;
  line: number; // the day's heading
  note: { text: string; line: number; time: string | null } | null; // «На завтра»
  focus: { id: string; title: string }[]; // «Главное»: the links by ID
}
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})\b/;
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
/** The body without its drawers (the note's :PROPERTIES:). */
const noDrawers = (s: string) => s.replace(/^[ \t]*:[A-Za-z_-]+:[ \t]*\n[\s\S]*?^[ \t]*:END:[ \t]*$\n?/gm, '');
const LINK = /\[\[id:([^\]]+)\](?:\[([^\]]*)\])?\]/g;

/** The days of the journal: every heading titled «2026-10-13 …» with its «На завтра» and «Главное». */
export function journalDays(f: { text: string; headings: Heading[] }): JournalDay[] {
  const out: JournalDay[] = [];
  const lines = f.text.split('\n');
  f.headings.forEach((h, i) => {
    const m = DAY_RE.exec(h.title);
    if (!m) return;
    const kids = f.headings.filter((x) => x.parent === i);
    const noteH = kids.find((x) => norm(x.title) === 'на завтра');
    const focusH = kids.find((x) => norm(x.title) === 'главное');
    let note: JournalDay['note'] = null;
    if (noteH) {
      const created = lines.slice(noteH.line + 1, noteH.end).join('\n').match(/^[ \t]*:CREATED:[ \t]*\[[^\]]*?(\d{1,2}:\d{2})[^\]]*\]/m);
      const text = noDrawers(bodyOf(f.text, noteH)).replace(/^\n+|\s+$/g, '');
      if (text.trim()) note = { text, line: noteH.line, time: created?.[1]?.padStart(5, '0') ?? null };
    }
    const focus: JournalDay['focus'] = [];
    if (focusH) for (const l of bodyOf(f.text, focusH).matchAll(LINK)) focus.push({ id: l[1].trim(), title: (l[2] ?? '').trim() || l[1].trim() });
    out.push({ date: new Date(+m[1], +m[2] - 1, +m[3]), line: h.line, note, focus: focus.slice(0, 3) });
  });
  return out;
}
/** The day the morning reads: the latest one before today with a note or a choice (after a weekend, Friday's). */
export function lastDay(list: JournalDay[], day: Date): JournalDay | null {
  return list.filter((d) => days(d.date, day) < 0 && (d.note || d.focus.length)).sort((a, b) => +b.date - +a.date)[0] ?? null;
}

// ---- «Главное на сегодня» --------------------------------------------------------------------------------------

export interface FocusRow {
  id: string;
  title: string;
  task: (TaskRow & { meta: string; late: boolean }) | null; // null: no task has this ID now
}
/** The tasks of the links, found by their :ID: in every file; the meta — a deadline today, a time today, the file. */
export function focusRows(focus: JournalDay['focus'], files: TFile[], day: Date): FocusRow[] {
  return focus.map(({ id, title }) => {
    for (const f of files) {
      const h = f.headings.find((x) => x.id === id);
      if (!h) continue;
      const on = (d?: OrgDate) => !!d && days(toDate(d), day) === 0;
      const dl = on(h.deadline);
      const meta = dl ? 'дедлайн сегодня' : on(h.scheduled) && h.scheduled!.time ? h.scheduled!.time.padStart(5, '0') : f.name.split('/').pop()!;
      return { id, title, task: { ...rowOf(f, h), meta, late: dl } };
    }
    return { id, title, task: null };
  });
}
/** What ticking a task's box writes: the first finished status of its set (unticking: the first open one). */
export function doneStatus(kw: string, wf: Workflow): string | null {
  return firstDone(sequenceFor(wf, kw));
}

// ---- the note as formatted text (read only) -----------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const EMPH: [RegExp, string][] = [
  [/(^|[\s(«"])\*([^\s*](?:[^*]*[^\s*])?)\*(?=$|[\s.,:;!?)»"])/g, '$1<b>$2</b>'],
  [/(^|[\s(«"])\/([^\s/](?:[^/]*[^\s/])?)\/(?=$|[\s.,:;!?)»"])/g, '$1<i>$2</i>'],
  [/(^|[\s(«"])_([^\s_](?:[^_]*[^\s_])?)_(?=$|[\s.,:;!?)»"])/g, '$1<u>$2</u>'],
  [/(^|[\s(«"])\+([^\s+](?:[^+]*[^\s+])?)\+(?=$|[\s.,:;!?)»"])/g, '$1<s>$2</s>'],
  [/(^|[\s(«"])[=~]([^\s=~](?:[^=~]*[^\s=~])?)[=~](?=$|[\s.,:;!?)»"])/g, '$1<code>$2</code>'],
];
/** One line of org as HTML: links by their description, emphasis, code. */
export function inlineHtml(line: string): string {
  const links: string[] = [];
  let s = line.replace(/\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g, (_, t: string, d?: string) => {
    links.push(`<span class="lnk" title="${esc(t)}">${esc(d || t.replace(/^(file|id):/, ''))}</span>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  s = esc(s);
  for (const [re, to] of EMPH) s = s.replace(re, to);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => links[+i]);
}
/** The note's lines: list items (their marker and depth), the rest as paragraphs. */
export function noteLines(text: string): { item: boolean; depth: number; html: string }[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const m = /^(\s*)(?:[-+]|\d+[.)])\s+(?:\[[ xX-]\]\s+)?(.*)$/.exec(l);
      return m ? { item: true, depth: Math.floor(m[1].length / 2), html: inlineHtml(m[2]) } : { item: false, depth: 0, html: inlineHtml(l.trim()) };
    });
}

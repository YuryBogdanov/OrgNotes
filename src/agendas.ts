// Custom agendas ("Мои агенды"): a saved list of blocks, each picking tasks by conditions. Plain data and pure
// functions, so the builder, the agenda view and the tests share them. Stored in `.orgnotes/config.json` under
// "agendas", next to the statuses.

import { dayDiff, sequenceFor, toJs, type Heading, type OrgDate, type Workflow } from './org';
import { asNamed } from './themes';
import { displayName } from './names';

export type Field = 'status' | 'scheduled' | 'deadline' | 'tag' | 'priority' | 'path' | 'title' | 'done' | 'touched';
/** A date value of a condition. Relative ones are counted from the day the agenda is shown. */
export type DateVal =
  | { kind: 'before' } // раньше сегодня
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'next'; n: number } // ближайшие N дней, today included
  | { kind: 'range'; from: string; to: string }; // yyyy-mm-dd, both included

export interface Cond {
  id: string;
  field: Field;
  op: string;
  /** status: "set\u001fname"; tag: tag names; path: relative paths of files or folders */
  values?: string[];
  date?: DateVal;
  prio?: string;
  text?: string;
  /** touched: a number of days */
  days?: number;
}
export type Group = 'none' | 'day' | 'file' | 'status' | 'tag';
export type Sort = 'prio' | 'scheduled' | 'deadline' | 'age' | 'alpha';
export interface Block {
  id: string;
  name: string;
  color: string; // a palette id or #rrggbb
  conds: Cond[];
  group: Group;
  sort: Sort;
  limit: number | null;
}
export interface Agenda {
  id: string;
  name: string;
  sources: string[]; // relative paths; empty = every file of the notes folder
  blocks: Block[];
}

/** The agendas that come with the app; custom ones may not take their names. */
export const BUILTIN = ['Агенда'];

export const FIELDS: { id: Field; label: string }[] = [
  { id: 'status', label: 'Статус' },
  { id: 'scheduled', label: 'Запланировано' },
  { id: 'deadline', label: 'Дедлайн' },
  { id: 'tag', label: 'Тег' },
  { id: 'priority', label: 'Приоритет' },
  { id: 'path', label: 'Файл или папка' },
  { id: 'title', label: 'Заголовок содержит' },
  { id: 'done', label: 'Выполнено' },
  { id: 'touched', label: 'Касание' },
];
export const OPS: Record<Field, { id: string; label: string }[]> = {
  status: [{ id: 'in', label: 'одно из' }, { id: 'notin', label: 'не одно из' }],
  scheduled: [{ id: 'eq', label: 'равно' }, { id: 'before', label: 'раньше' }, { id: 'after', label: 'позже' }, { id: 'none', label: 'не задано' }],
  deadline: [{ id: 'eq', label: 'равно' }, { id: 'before', label: 'раньше' }, { id: 'after', label: 'позже' }, { id: 'none', label: 'не задано' }],
  tag: [{ id: 'has', label: 'содержит' }, { id: 'all', label: 'все из' }, { id: 'hasnot', label: 'не содержит' }],
  priority: [{ id: 'eq', label: 'равен' }, { id: 'higher', label: 'выше' }, { id: 'lower', label: 'ниже' }, { id: 'none', label: 'не задан' }],
  path: [{ id: 'in', label: 'находится в' }, { id: 'notin', label: 'не находится в' }],
  title: [{ id: 'has', label: 'содержит' }, { id: 'hasnot', label: 'не содержит' }],
  done: [{ id: 'yes', label: 'да' }, { id: 'no', label: 'нет' }],
  // ТЗ 40: the last change of the task's subtree — «давнее чем 30 дней»: 30 days or more ago; «за последние 7 дней»:
  // today and the 6 days before
  touched: [{ id: 'older', label: 'давнее чем' }, { id: 'within', label: 'за последние' }],
};
export const GROUPS: { id: Group; label: string }[] = [
  { id: 'none', label: 'без группировки' },
  { id: 'day', label: 'по дням' },
  { id: 'file', label: 'по файлам' },
  { id: 'status', label: 'по статусу' },
  { id: 'tag', label: 'по тегам' },
];
export const SORTS: { id: Sort; label: string }[] = [
  { id: 'prio', label: 'приоритет, затем время' },
  { id: 'scheduled', label: 'по дате плана' },
  { id: 'deadline', label: 'по дедлайну' },
  { id: 'age', label: 'по давности' },
  { id: 'alpha', label: 'по алфавиту' },
];
export const PRIORITIES = ['A', 'B', 'C'];

export const fieldLabel = (f: Field) => FIELDS.find((x) => x.id === f)!.label;
export const opLabel = (f: Field, op: string) => OPS[f].find((x) => x.id === op)?.label ?? op;
/** Operators that need no value. */
export const noValue = (c: Pick<Cond, 'field' | 'op'>) => c.field === 'done' || c.op === 'none';

// ---- statuses ---------------------------------------------------------------------------------------------

const SEP = '\u001f';
export const statusKey = (set: string, name: string) => set + SEP + name;
export const statusName = (key: string) => key.slice(key.indexOf(SEP) + 1);
export const statusSet = (key: string) => key.slice(0, key.indexOf(SEP));

// ---- creating ---------------------------------------------------------------------------------------------

let seq = 0;
export const uid = (p: string) => `${p}${Date.now().toString(36)}${(++seq).toString(36)}`;

export const newBlock = (): Block => ({ id: uid('b'), name: 'Без названия', color: 'blue', conds: [], group: 'none', sort: 'prio', limit: null });
export const newAgenda = (): Agenda => ({ id: uid('a'), name: 'Новая агенда', sources: [], blocks: [newBlock()] });
/** A new condition: the field's default operator, no value yet. */
export const newCond = (field: Field): Cond => ({ id: uid('c'), field, op: OPS[field][0].id });

/** A condition without the value it needs: it is not applied, and the agenda cannot be saved with it. */
export function incomplete(c: Cond): boolean {
  if (noValue(c)) return false;
  switch (c.field) {
    case 'status':
    case 'tag':
    case 'path':
      return !c.values?.length;
    case 'scheduled':
    case 'deadline':
      return !c.date || (c.date.kind === 'range' && (!c.date.from || !c.date.to)) || (c.date.kind === 'next' && !(c.date.n >= 1));
    case 'priority':
      return !c.prio;
    case 'title':
      return !c.text?.trim();
    case 'touched':
      return !(Number.isInteger(c.days) && c.days! >= 1);
  }
  return false;
}

/** Why the agenda cannot be saved, or null. */
export function nameProblem(name: string, others: string[]): string | null {
  const n = name.trim();
  if (!n) return 'Введите название агенды';
  const low = n.toLocaleLowerCase('ru');
  if ([...BUILTIN, ...others].some((o) => o.trim().toLocaleLowerCase('ru') === low)) return 'Агенда с таким названием уже есть';
  return null;
}

// ---- reading and writing the config ----------------------------------------------------------------------------

const FIELD_IDS = FIELDS.map((f) => f.id);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function readDate(v: any): DateVal | undefined {
  switch (v?.kind) {
    case 'before':
    case 'today':
    case 'tomorrow':
      return { kind: v.kind };
    case 'next':
      return Number.isInteger(v.n) && v.n >= 1 ? { kind: 'next', n: v.n } : undefined;
    case 'range':
      return ISO.test(v.from) && ISO.test(v.to) ? { kind: 'range', from: v.from, to: v.to } : undefined;
  }
  return undefined;
}

function readCond(v: any): Cond | null {
  const field = v?.field as Field;
  if (!FIELD_IDS.includes(field)) return null;
  const op = OPS[field].some((o) => o.id === v.op) ? v.op : OPS[field][0].id;
  const c: Cond = { id: uid('c'), field, op };
  if (field === 'status') c.values = Array.isArray(v.values) ? v.values.filter((s: any) => typeof s?.name === 'string').map((s: any) => statusKey(str(s.set), s.name)) : [];
  if (field === 'tag' || field === 'path') c.values = strs(v.values);
  if (field === 'scheduled' || field === 'deadline') c.date = readDate(v.date);
  if (field === 'priority' && PRIORITIES.includes(v.value)) c.prio = v.value;
  if (field === 'title') c.text = str(v.value);
  if (field === 'touched' && Number.isInteger(v.value) && v.value >= 1) c.days = v.value;
  return c;
}

/** The "agendas" part of config.json. Never throws: what cannot be read is skipped. */
export function readAgendas(raw: unknown): Agenda[] {
  const out: Agenda[] = [];
  for (const a of Array.isArray(raw) ? raw : []) {
    const name = str(a?.name).trim();
    if (!name || out.some((x) => x.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) continue;
    const blocks: Block[] = [];
    for (const b of Array.isArray(a.blocks) ? a.blocks : []) {
      blocks.push({
        id: uid('b'),
        name: str(b?.name).trim() || 'Без названия',
        color: asNamed(b?.color) ?? 'blue',
        conds: (Array.isArray(b?.conds) ? b.conds : []).map(readCond).filter((c: Cond | null): c is Cond => !!c),
        group: GROUPS.some((g) => g.id === b?.group) ? b.group : 'none',
        sort: SORTS.some((s) => s.id === b?.sort) ? b.sort : 'prio',
        limit: Number.isInteger(b?.limit) && b.limit >= 1 ? b.limit : null,
      });
    }
    if (!blocks.length) blocks.push(newBlock());
    out.push({ id: str(a.id) || uid('a'), name, sources: strs(a.sources), blocks });
  }
  return out;
}

function writeCond(c: Cond): Record<string, unknown> {
  const o: Record<string, unknown> = { field: c.field, op: c.op };
  if (noValue(c)) return o;
  if (c.field === 'status') o.values = (c.values ?? []).map((k) => ({ set: statusSet(k), name: statusName(k) }));
  if (c.field === 'tag' || c.field === 'path') o.values = c.values ?? [];
  if (c.date) o.date = c.date;
  if (c.field === 'priority') o.value = c.prio;
  if (c.field === 'title') o.value = c.text ?? '';
  if (c.field === 'touched') o.value = c.days;
  return o;
}
export const writeAgenda = (a: Agenda) => ({
  id: a.id,
  name: a.name.trim(),
  sources: a.sources,
  blocks: a.blocks.map((b) => ({
    name: b.name.trim() || 'Без названия', color: b.color, conds: b.conds.map(writeCond), group: b.group, sort: b.sort,
    ...(b.limit ? { limit: b.limit } : {}),
  })),
});

/** config.json with the agendas replaced; every other key stays as it is. */
export function withAgendas(raw: string | null, agendas: Agenda[]): string {
  let base: Record<string, unknown> = {};
  try {
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p === 'object' && !Array.isArray(p)) base = p;
  } catch {
    /* an unreadable file is replaced */
  }
  const out: Record<string, unknown> = { version: base.version ?? 1, ...base };
  if (agendas.length) out.agendas = agendas.map(writeAgenda);
  else delete out.agendas;
  return JSON.stringify(out, null, 2) + '\n';
}

/** A deep copy that can be edited without touching the original (the builder's draft). */
export const cloneAgenda = (a: Agenda): Agenda => JSON.parse(JSON.stringify(a));
/** Two agendas say the same (ids of conditions and blocks do not count). */
export const sameAgenda = (a: Agenda, b: Agenda) => JSON.stringify(writeAgenda(a)) === JSON.stringify(writeAgenda(b));

// ---- picking tasks ----------------------------------------------------------------------------------------------

/** What the agenda needs to know about a note. */
export interface Source {
  name: string; // relative path
  wf: Workflow;
  headings: Heading[];
  filetags: string[];
}
export interface Task {
  file: number; // index into the sources passed in
  line: number;
  kw: string;
  set: string;
  done: boolean;
  title: string;
  prio: string | null;
  scheduled?: OrgDate;
  deadline?: OrgDate;
  closed?: OrgDate;
  /** The last touch of its subtree, ms (ТЗ 40); none while the index is not read. */
  touched?: number;
  tags: string[]; // own, inherited and the file's
  src: string; // "work › Q4 2026"
  path: string; // relative path of the file
  order: number; // position in the notes
}
export interface BlockResult {
  block: Block;
  total: number; // every task that matched
  groups: { key: string; title: string; tasks: Task[] }[]; // after sorting and the limit
  more: number; // matched but cut by the limit (or the preview's cap)
}

const norm = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е');
const inPath = (name: string, p: string) => name === p || name.startsWith(p.replace(/\/$/, '') + '/');

/** Where the agenda learns the touches of headings (ТЗ 40): set by the index (touchIndex.svelte.ts). */
let touchOf: (file: string, line: number) => number | undefined = () => undefined;
export const setTouchSource = (fn: (file: string, line: number) => number | undefined) => void (touchOf = fn);

/** The files an agenda reads: all when it names none; a missing source just adds nothing. */
export const inSources = (name: string, sources: string[]) => !sources.length || sources.some((s) => inPath(name, s));

/** Every heading with a status in the given files. */
export function tasksOf(files: Source[], sources: string[]): Task[] {
  const out: Task[] = [];
  let order = 0;
  files.forEach((f, fi) => {
    if (!inSources(f.name, sources)) return;
    f.headings.forEach((h) => {
      order++;
      if (!h.keyword) return;
      const tags = new Set([...f.filetags, ...h.tags]);
      for (let p = h.parent; p >= 0; p = f.headings[p].parent) for (const t of f.headings[p].tags) tags.add(t);
      out.push({
        file: fi, line: h.line, kw: h.keyword, set: sequenceFor(f.wf, h.keyword).name, done: f.wf.done.includes(h.keyword),
        title: h.title, prio: h.priority, scheduled: h.scheduled, deadline: h.deadline, closed: h.closed, touched: touchOf(f.name, h.line),
        tags: [...tags], src: [displayName(f.name), ...h.path].join(' › '), path: f.name, order,
      });
    });
  });
  return out;
}

const day = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** The days a date value covers, as offsets from today; an open end is ±Infinity. */
export function span(v: DateVal, today: Date): [number, number] {
  switch (v.kind) {
    case 'before':
      return [-Infinity, -1];
    case 'today':
      return [0, 0];
    case 'tomorrow':
      return [1, 1];
    case 'next':
      return [0, v.n - 1];
    case 'range':
      return [dayDiff(day(v.from), today), dayDiff(day(v.to), today)];
  }
}

export function matches(t: Task, c: Cond, today: Date): boolean {
  switch (c.field) {
    case 'status': {
      const hit = (c.values ?? []).includes(statusKey(t.set, t.kw));
      return c.op === 'notin' ? !hit : hit;
    }
    case 'scheduled':
    case 'deadline': {
      const d = t[c.field];
      if (c.op === 'none') return !d;
      if (!d || !c.date) return false; // a task without the date never passes «равно», «раньше», «позже»
      const n = dayDiff(toJs(d), today);
      const [lo, hi] = span(c.date, today);
      if (c.op === 'before') return n < lo;
      if (c.op === 'after') return n > hi;
      return n >= lo && n <= hi;
    }
    case 'tag': {
      // «все из» (ТЗ 38: the tab «Тег» saved as an agenda): every tag at once
      if (c.op === 'all') return (c.values ?? []).every((v) => t.tags.includes(v));
      const hit = (c.values ?? []).some((v) => t.tags.includes(v));
      return c.op === 'hasnot' ? !hit : hit;
    }
    case 'priority': {
      if (c.op === 'none') return !t.prio;
      if (!t.prio || !c.prio) return false;
      const d = t.prio.localeCompare(c.prio); // A is the highest
      return c.op === 'higher' ? d < 0 : c.op === 'lower' ? d > 0 : d === 0;
    }
    case 'path': {
      const hit = (c.values ?? []).some((p) => inPath(t.path, p));
      return c.op === 'notin' ? !hit : hit;
    }
    case 'title': {
      const hit = norm(t.title).includes(norm(c.text ?? '').trim());
      return c.op === 'hasnot' ? !hit : hit;
    }
    case 'done':
      return c.op === 'yes' ? t.done : !t.done;
    case 'touched': {
      if (t.touched === undefined || !c.days) return false; // not known yet: in neither
      const age = dayDiff(today, new Date(t.touched));
      return c.op === 'within' ? age < c.days : age >= c.days;
    }
  }
}

/** Every condition must pass (version 1). Without «Выполнено», finished tasks are left out — unless a status
 *  condition asks for a finished status by name. */
export function blockMatches(t: Task, b: Block, today: Date, doneNames: Set<string>): boolean {
  const conds = b.conds.filter((c) => !incomplete(c));
  const asksDone = conds.some((c) => c.field === 'done' || (c.field === 'status' && c.op === 'in' && (c.values ?? []).some((k) => doneNames.has(k))));
  if (!asksDone && t.done) return false;
  return conds.every((c) => matches(t, c, today));
}

const stamp = (d?: OrgDate) => (d ? d.y * 1e8 + d.m * 1e6 + d.d * 1e4 + (d.time ? +d.time.replace(':', '') : 0) : Infinity);
const prioRank = (p: string | null) => (p ? PRIORITIES.indexOf(p) : PRIORITIES.length);
const SORTERS: Record<Sort, (a: Task, b: Task) => number> = {
  prio: (a, b) => prioRank(a.prio) - prioRank(b.prio) || Math.min(stamp(a.scheduled), stamp(a.deadline)) - Math.min(stamp(b.scheduled), stamp(b.deadline)) || a.order - b.order,
  scheduled: (a, b) => stamp(a.scheduled) - stamp(b.scheduled) || a.order - b.order,
  deadline: (a, b) => stamp(a.deadline) - stamp(b.deadline) || a.order - b.order,
  // the oldest first: the earliest date the task carries (planned, deadline or closed)
  age: (a, b) => Math.min(stamp(a.scheduled), stamp(a.deadline), stamp(a.closed)) - Math.min(stamp(b.scheduled), stamp(b.deadline), stamp(b.closed)) || a.order - b.order,
  alpha: (a, b) => a.title.localeCompare(b.title, 'ru') || a.order - b.order,
};

const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function groupOf(t: Task, g: Group): { key: string; title: string; rank: number | string }[] {
  switch (g) {
    case 'none':
      return [{ key: '', title: '', rank: 0 }];
    case 'day': {
      const d = t.scheduled ?? t.deadline;
      if (!d) return [{ key: 'nodate', title: 'Без даты', rank: Infinity }];
      const js = toJs(d);
      return [{ key: `${d.y}-${d.m}-${d.d}`, title: `${WD[js.getDay()][0].toUpperCase()}${WD[js.getDay()].slice(1)}, ${d.d} ${MG[d.m - 1]}`, rank: +js }];
    }
    case 'file':
      return [{ key: t.path, title: displayName(t.path), rank: t.path }];
    case 'status':
      return [{ key: t.kw, title: t.kw, rank: t.order }];
    case 'tag':
      return t.tags.length ? [{ key: 't:' + t.tags[0], title: t.tags[0], rank: t.tags[0] }] : [{ key: 'notag', title: 'Без тегов', rank: '￿' }];
  }
}

/** One block: the matching tasks, sorted, cut at the limit (and at `cap`, the preview's), grouped. */
export function runBlock(all: Task[], b: Block, today: Date, doneNames: Set<string>, cap = Infinity): BlockResult {
  const hit = all.filter((t) => blockMatches(t, b, today, doneNames)).sort(SORTERS[b.sort]);
  const shown = hit.slice(0, Math.min(b.limit ?? Infinity, cap));
  const map = new Map<string, { key: string; title: string; rank: number | string; tasks: Task[] }>();
  for (const t of shown) {
    const g = groupOf(t, b.group)[0];
    if (!map.has(g.key)) map.set(g.key, { ...g, tasks: [] });
    map.get(g.key)!.tasks.push(t);
  }
  const groups = [...map.values()].sort((x, y) =>
    typeof x.rank === 'number' && typeof y.rank === 'number' ? x.rank - y.rank : String(x.rank).localeCompare(String(y.rank), 'ru'),
  );
  return { block: b, total: hit.length, groups: groups.map(({ key, title, tasks }) => ({ key, title, tasks })), more: hit.length - shown.length };
}

/** The whole agenda. Blocks with an unfinished condition are left out (the builder shows them as such). */
export function runAgenda(a: Agenda, files: Source[], today: Date, cap = Infinity): BlockResult[] {
  const all = tasksOf(files, a.sources);
  const doneNames = new Set(files.flatMap((f) => (f.wf.sequences ?? []).flatMap((s) => s.states.filter((x) => x.done).map((x) => statusKey(s.name, x.name)))));
  // a file with no sequences (built-in statuses): its done words under the default set's name
  for (const f of files) for (const d of f.wf.done) doneNames.add(statusKey(sequenceFor(f.wf, d).name, d));
  return a.blocks.filter((b) => !b.conds.some(incomplete)).map((b) => runBlock(all, b, today, doneNames, cap));
}

// ---- words ----------------------------------------------------------------------------------------------------

export function dateLabel(v: DateVal): string {
  switch (v.kind) {
    case 'before':
      return 'раньше сегодня';
    case 'today':
      return 'сегодня';
    case 'tomorrow':
      return 'завтра';
    case 'next':
      return `ближайшие ${v.n} ${plural(v.n, 'день', 'дня', 'дней')}`;
    case 'range':
      return `${fmtIso(v.from)} – ${fmtIso(v.to)}`;
  }
}
const MS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const fmtIso = (s: string) => {
  const [, m, d] = s.split('-').map(Number);
  return `${d} ${MS[m - 1]}`;
};
export const shortDay = (d: OrgDate) => `${d.d} ${MS[d.m - 1]}`;
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
export const tasksCount = (n: number) => `${n} ${plural(n, 'задача', 'задачи', 'задач')}`;

/** The value of a condition as chips' words (statuses, tags, paths, a date…). */
export function valueWords(c: Cond): string[] {
  if (noValue(c)) return [];
  switch (c.field) {
    case 'status':
      return (c.values ?? []).map(statusName);
    case 'tag':
      return c.values ?? [];
    case 'path':
      return (c.values ?? []).map((p) => displayName(p));
    case 'scheduled':
    case 'deadline':
      return c.date ? [dateLabel(c.date)] : [];
    case 'priority':
      return c.prio ? [c.prio] : [];
    case 'title':
      return c.text?.trim() ? [c.text.trim()] : [];
    case 'touched':
      return c.days ? [`${c.days} ${plural(c.days, 'день', 'дня', 'дней')}`] : [];
  }
  return [];
}

/** One line under a collapsed block: "статус: TODO, NEXT · запланировано: раньше сегодня". */
export function summary(b: Block): string {
  const parts = b.conds.map((c) => {
    const f = fieldLabel(c.field).toLocaleLowerCase('ru');
    if (c.field === 'done') return `выполнено: ${opLabel('done', c.op)}`;
    if (c.op === 'none') return `${f}: ${opLabel(c.field, c.op)}`;
    const v = valueWords(c).join(', ') || '…';
    const first = OPS[c.field][0].id;
    return `${f}: ${c.op === first ? '' : opLabel(c.field, c.op) + ' '}${v}`;
  });
  if (b.group !== 'none') parts.push('группировка: ' + GROUPS.find((g) => g.id === b.group)!.label);
  if (b.sort !== 'prio') parts.push('сортировка: ' + SORTS.find((s) => s.id === b.sort)!.label);
  if (b.limit) parts.push('лимит: ' + b.limit);
  return parts.join(' · ') || 'все задачи';
}

const list = (vs: string[]) => {
  const q = vs.map((v) => (/[\s()"]/.test(v) ? JSON.stringify(v) : v));
  return q.length === 1 ? q[0] : `(${q.join(' ')})`;
};
function dateQuery(v: DateVal): string {
  switch (v.kind) {
    case 'before':
      return '<today';
    case 'today':
      return 'today';
    case 'tomorrow':
      return 'tomorrow';
    case 'next':
      return `today..+${v.n - 1}d`;
    case 'range':
      return `${v.from}..${v.to}`;
  }
}

/** The block's conditions as one line of text (read-only in version 1). */
export function query(b: Block): string {
  const parts: string[] = [];
  for (const c of b.conds) {
    if (incomplete(c)) continue;
    switch (c.field) {
      case 'status': {
        const names = [...new Set((c.values ?? []).map(statusName))];
        parts.push(`${c.op === 'notin' ? 'not ' : ''}status:${list(names)}`);
        break;
      }
      case 'scheduled':
      case 'deadline': {
        if (c.op === 'none') parts.push(`not ${c.field}`);
        else {
          const v = dateQuery(c.date!);
          const pre = c.op === 'before' ? '<' : c.op === 'after' ? '>' : '';
          parts.push(`${c.field}:${pre && v.startsWith('<') ? v : pre + v}`);
        }
        break;
      }
      case 'tag':
        parts.push(c.op === 'all' ? (c.values ?? []).map((v) => `tag:${v}`).join(' ') : `${c.op === 'hasnot' ? 'not ' : ''}tag:${list(c.values ?? [])}`);
        break;
      case 'priority':
        parts.push(c.op === 'none' ? 'not priority' : `priority:${c.op === 'higher' ? '>' : c.op === 'lower' ? '<' : ''}${c.prio}`);
        break;
      case 'path':
        parts.push(`${c.op === 'notin' ? 'not ' : ''}file:${list(c.values ?? [])}`);
        break;
      case 'title':
        parts.push(`${c.op === 'hasnot' ? 'not ' : ''}title:${JSON.stringify(c.text!.trim())}`);
        break;
      case 'touched':
        parts.push(`touched:${c.op === 'within' ? '<' : '>='}${c.days}d`);
        break;
      case 'done':
        parts.push(c.op === 'yes' ? 'done' : 'not done');
        break;
    }
  }
  return parts.join(' and ') || 'все задачи';
}

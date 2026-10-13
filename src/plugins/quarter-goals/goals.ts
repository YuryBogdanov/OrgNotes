// Goals of the quarter (ТЗ 23): a source is a file and a heading of level 1 in it («Квартальные задачи»); under it
// the quarters are headings of level 2 («Квартал Q4 2026», newest first), the goals level 3 with a status of the set
// «Цели на квартал», and the fields of a goal level 4: «Что буду делать», «Ожидаемый результат», «Отметки». Pure
// functions on the text, so the navigator, the views and the tests share them.

import type { Heading } from '@panopticon/api/org';

export const GOAL_STATES = { backlog: 'BACKLOG', active: 'ACTIVE', done: 'COMPLETED' } as const;
export const GOALS_WORKFLOW = {
  name: 'Цели на квартал',
  states: [{ name: 'BACKLOG', color: 'gray' }, { name: 'ACTIVE', color: 'blue' }, { name: 'COMPLETED', done: true, color: 'green' }],
};
/** The capsules of the goals' statuses, as on the mockups (a set without colours of its own gets these). */
export const GOAL_TONES: Record<string, string> = { BACKLOG: 'var(--fg2)', ACTIVE: 'var(--next)', COMPLETED: 'var(--done)' };
export const FIELDS = { plan: 'Что буду делать', result: 'Ожидаемый результат', marks: 'Отметки' } as const;
export const SOURCE_HEADING = 'Квартальные задачи';
export const SILENT_DAYS = 14; // an active goal without a mark this long «молчит»
export const SOON_WEEKS = 6; // a deadline closer than this is lit

// ---- sources: `goals` in .orgnotes/config.json --------------------------------------------------------------------

export interface GoalSource {
  file: string; // relative path
  heading: string; // the title of the level-1 heading
  title: string; // the name in the navigator
  me?: boolean; // «Мои цели»: one source at most
}
export const sourceKey = (s: { file: string; heading: string }) => s.file + '#' + s.heading;

export function readGoals(raw: unknown): GoalSource[] {
  if (!Array.isArray(raw)) return [];
  const out: GoalSource[] = [];
  let me = false;
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (typeof o.file !== 'string' || !o.file.trim() || typeof o.heading !== 'string' || !o.heading.trim()) continue;
    const s: GoalSource = { file: o.file.trim(), heading: o.heading.trim(), title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : o.file.trim().split('/').pop()!.replace(/\.org$/, '') };
    if (o.me === true && !me) s.me = me = true;
    if (!out.some((x) => sourceKey(x) === sourceKey(s))) out.push(s);
  }
  return out;
}
/** The sources as they are written (the goals' file in the notes folder, roadmap 0.6). */
export const sourcesJson = (list: GoalSource[]) => list.map((s) => ({ file: s.file, heading: s.heading, title: s.title, ...(s.me ? { me: true } : {}) }));
/** config.json with the sources replaced; every other key stays (before roadmap 0.6). */
export function withGoals(raw: string | null, list: GoalSource[]): string {
  let base: Record<string, unknown> = {};
  try {
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p === 'object' && !Array.isArray(p)) base = p;
  } catch {
    /* an unreadable file is replaced */
  }
  const out: Record<string, unknown> = { version: base.version ?? 1, ...base };
  if (list.length) out.goals = list.map((s) => ({ file: s.file, heading: s.heading, title: s.title, ...(s.me ? { me: true } : {}) }));
  else delete out.goals;
  return JSON.stringify(out, null, 2) + '\n';
}

// ---- people: initials and a colour ----------------------------------------------------------------------------------

/** «Петров Алексей» → «АП» (the name before the surname), one word → its first letter; «Мои цели» → «Я». */
export function initials(title: string, me = false): string {
  if (me) return 'Я';
  const w = title.split(/\s+/).filter((x) => /\p{L}/u.test(x));
  if (!w.length) return '?';
  return (w.length > 1 ? w[1][0] + w[0][0] : w[0][0]).toUpperCase();
}
const AVATARS = ['#5b6ee1', '#c2477a', '#2f8f6b', '#b4632a', '#8a6d1f', '#7a4fc4', '#2b7fa8', '#a33f3f'];
/** A colour of its own for each file, the same every time. */
export function avatarColor(path: string): string {
  let h = 0;
  for (const ch of path) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATARS[h % AVATARS.length];
}

// ---- quarters --------------------------------------------------------------------------------------------------------

export interface Quarter {
  y: number;
  q: number; // 1–4
}
const QUARTER = /^Квартал\s+Q([1-4])\s+(\d{4})$/i;
export function parseQuarter(title: string): Quarter | null {
  const m = QUARTER.exec(title.trim());
  return m ? { y: +m[2], q: +m[1] } : null;
}
export const quarterTitle = (q: Quarter) => `Квартал Q${q.q} ${q.y}`;
export const quarterLabel = (q: Quarter) => `Q${q.q} ${q.y}`;
export const quarterOf = (d: Date): Quarter => ({ y: d.getFullYear(), q: Math.floor(d.getMonth() / 3) + 1 });
export const shiftQuarter = (q: Quarter, n: number): Quarter => {
  const i = q.y * 4 + (q.q - 1) + n;
  return { y: Math.floor(i / 4), q: (i % 4) + 1 };
};
export const cmpQuarter = (a: Quarter, b: Quarter) => a.y * 4 + a.q - (b.y * 4 + b.q);
export const qStart = (q: Quarter) => new Date(q.y, (q.q - 1) * 3, 1);
export const qEnd = (q: Quarter) => new Date(q.y, q.q * 3, 0);
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a: Date, b: Date) => Math.round((+day0(b) - +day0(a)) / 86400000);
/** A new goal goes to the current quarter; in its last two weeks, to the next one. */
export function defaultQuarter(now = new Date()): Quarter {
  const q = quarterOf(now);
  return daysBetween(now, qEnd(q)) < 14 ? shiftQuarter(q, 1) : q;
}
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const shortDay = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
const plural = (n: number, a: string, b: string, c: string) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c);
export const days = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
/** «4 квартал 2026 · 1 окт – 31 дек · осталось 80 дней». */
export function quarterSub(q: Quarter, now = new Date()): string {
  const s = qStart(q), e = qEnd(q);
  const left = daysBetween(now, e);
  const tail = now > e ? 'закончился' : now < s ? `начнётся через ${days(daysBetween(now, s))}` : `осталось ${days(left)}`;
  return `${q.q} квартал ${q.y} · ${shortDay(s)} – ${shortDay(e)} · ${tail}`;
}

// ---- reading a source ------------------------------------------------------------------------------------------------

export interface Mark {
  date: Date;
  text: string; // the rest of the first line and the lines that continue it, unindented
  line: number;
}
export interface Goal {
  title: string;
  keyword: string | null;
  line: number;
  end: number;
  deadline: Date | null;
  closed: Date | null;
  created: Date | null;
  plan: string;
  result: string;
  marks: Mark[]; // in the order of the file
}
export interface QuarterGoals {
  q: Quarter;
  line: number;
  end: number;
  goals: Goal[];
}
export interface SourceGoals {
  head: number; // the index of the source heading in `headings`; -1: not found
  quarters: QuarterGoals[];
}

const toDate = (o?: { y: number; m: number; d: number }) => (o ? new Date(o.y, o.m - 1, o.d) : null);
const same = (a: string, b: string) => a.trim().toLowerCase().replace(/ё/g, 'е') === b.trim().toLowerCase().replace(/ё/g, 'е');
const kids = (hs: Heading[], i: number) => hs.flatMap((h, j) => (h.parent === i ? [j] : []));

/** The level-1 heading of the source, by its title (found again after edits elsewhere); -1 if gone. */
export const findSource = (hs: Heading[], title: string) => hs.findIndex((h) => h.level === 1 && same(h.title, title));

/** The text under a heading up to its first child, without planning lines and drawers, unindented. */
function bodyOf(lines: string[], from: number, to: number): string {
  const out: string[] = [];
  let drawer = false;
  for (let i = from; i < to; i++) {
    const l = lines[i];
    if (/^\s*:[A-Za-z_-]+:\s*$/.test(l) && !/^\s*:END:\s*$/i.test(l)) {
      drawer = true;
      continue;
    }
    if (drawer) {
      if (/^\s*:END:\s*$/i.test(l)) drawer = false;
      continue;
    }
    if (i === from && /^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(l)) continue;
    out.push(l);
  }
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  const indent = Math.min(...out.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length));
  return out.map((l) => l.slice(isFinite(indent) ? indent : 0).replace(/^,(\*)/, '$1')).join('\n');
}
const MARK = /^(\s*)- \[(\d{4})-(\d{2})-(\d{2})[^\]]*\]\s?(.*)$/;
/** `- [2026-09-22 Вт] text` items with the lines that continue them. */
export function readMarks(lines: string[], from: number, to: number): Mark[] {
  const out: Mark[] = [];
  let base = -1;
  for (let i = from; i < to; i++) {
    const m = MARK.exec(lines[i]);
    if (m && (base < 0 || m[1].length <= base)) {
      base = m[1].length;
      out.push({ date: new Date(+m[2], +m[3] - 1, +m[4]), text: m[5], line: i });
    } else if (out.length && (lines[i].trim() === '' || /^\s*/.exec(lines[i])![0].length > base)) {
      out[out.length - 1].text += '\n' + lines[i].slice(Math.min(base + 2, /^\s*/.exec(lines[i])![0].length));
    }
  }
  for (const m of out) m.text = m.text.replace(/\s+$/, '');
  return out;
}

export function readSource(text: string, hs: Heading[], heading: string): SourceGoals {
  const head = findSource(hs, heading);
  if (head < 0) return { head, quarters: [] };
  const lines = text.split('\n');
  const quarters: QuarterGoals[] = [];
  for (const qi of kids(hs, head)) {
    const q = parseQuarter(hs[qi].title);
    if (!q) continue;
    const goals: Goal[] = kids(hs, qi).map((gi) => {
      const g = hs[gi];
      const fields = kids(hs, gi);
      const field = (name: string) => fields.find((fi) => same(hs[fi].title, name));
      const firstKid = fields.length ? hs[fields[0]].line : g.end;
      const own = lines.slice(g.line + 1, firstKid).join('\n');
      const cr = /:CREATED:\s*\[(\d{4})-(\d{2})-(\d{2})/.exec(own);
      const p = field(FIELDS.plan), r = field(FIELDS.result), mk = field(FIELDS.marks);
      return {
        title: g.title, keyword: g.keyword, line: g.line, end: g.end,
        deadline: toDate(g.deadline), closed: toDate(g.closed), created: cr ? new Date(+cr[1], +cr[2] - 1, +cr[3]) : null,
        plan: p !== undefined ? bodyOf(lines, hs[p].line + 1, hs[p].end) : '',
        result: r !== undefined ? bodyOf(lines, hs[r].line + 1, hs[r].end) : '',
        marks: mk !== undefined ? readMarks(lines, hs[mk].line + 1, hs[mk].end) : [],
      };
    });
    quarters.push({ q, line: hs[qi].line, end: hs[qi].end, goals });
  }
  quarters.sort((a, b) => cmpQuarter(b.q, a.q));
  return { head, quarters };
}

// ---- how a goal stands ---------------------------------------------------------------------------------------------

export const lastMark = (g: Goal) => g.marks.reduce<Date | null>((d, m) => (!d || m.date > d ? m.date : d), null);
/** Days without a mark (from :CREATED: if there is none); null if neither is known. */
export function quietDays(g: Goal, now = new Date()): number | null {
  const from = lastMark(g) ?? g.created;
  return from ? daysBetween(from, now) : null;
}
export const isDone = (g: Goal, done: string[]) => !!g.keyword && done.includes(g.keyword);
/** «Молчит»: an active goal with no mark for longer than the threshold. */
export function isSilent(g: Goal, now = new Date(), threshold = SILENT_DAYS): boolean {
  const d = quietDays(g, now);
  return g.keyword === GOAL_STATES.active && d !== null && d > threshold;
}
export const deadlineSoon = (g: Goal, done: string[], now = new Date(), weeks = SOON_WEEKS) =>
  !isDone(g, done) && !!g.deadline && daysBetween(now, g.deadline) < weeks * 7;
/** The note on the right of a row: «закрыта 8 окт», «20 дней без отметок», «отметка 3 дня назад», «нет отметок». */
export function goalNote(g: Goal, done: string[], now = new Date(), threshold = SILENT_DAYS): string {
  if (isDone(g, done)) return g.closed ? `закрыта ${shortDay(g.closed)}` : 'закрыта';
  if (isSilent(g, now, threshold)) return `${days(quietDays(g, now)!)} без отметок`;
  const m = lastMark(g);
  if (!m) return 'нет отметок';
  const n = daysBetween(m, now);
  return n <= 0 ? 'отметка сегодня' : n === 1 ? 'отметка вчера' : `отметка ${days(n)} назад`;
}
/** The expected result on one line, without the list marks. */
export const resultLine = (g: Goal) =>
  g.result.split('\n').map((l) => l.replace(/^\s*(?:[-+]|\d+[.)])\s+/, '').trim()).filter(Boolean).join('; ').replace(/;;+/g, ';').replace(/[;,]\s*;/g, ';');

// ---- writing a goal ----------------------------------------------------------------------------------------------------

export interface NewGoal {
  title: string;
  plan: string;
  result: string;
  deadline: Date | null;
  status: string;
}
const escape = (body: string) =>
  body.replace(/\r\n?/g, '\n').replace(/\s+$/, '').split('\n').map((l) => (/^\*+\s/.test(l) ? ',' + l : l));

/** The lines of a goal: `*** ACTIVE …`, its DEADLINE and :CREATED:, the three fields (the marks empty). */
export function goalLines(g: NewGoal, names: string[], now = new Date()): string[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const out = [`*** ${g.status} ${g.title.replace(/\s+/g, ' ').trim()}`];
  if (g.deadline) out.push(`DEADLINE: <${g.deadline.getFullYear()}-${pad(g.deadline.getMonth() + 1)}-${pad(g.deadline.getDate())} ${names[g.deadline.getDay()]}>`);
  // the day names as the file writes them (RU or EN), as DEADLINE
  const created = `[${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${names[now.getDay()]} ${pad(now.getHours())}:${pad(now.getMinutes())}]`;
  out.push(':PROPERTIES:', `:CREATED: ${created}`, ':END:');
  out.push(`**** ${FIELDS.plan}`, ...(g.plan.trim() ? escape(g.plan) : []));
  out.push(`**** ${FIELDS.result}`, ...(g.result.trim() ? escape(g.result) : []));
  out.push(`**** ${FIELDS.marks}`);
  return out;
}

/** «2 квартала · 7 целей» for a heading that looks like a source; '' otherwise. */
export function sourceSummary(text: string, hs: Heading[], i: number): string {
  const src = readSource(text, hs, hs[i].title);
  if (!src.quarters.length) return '';
  const n = src.quarters.reduce((s, x) => s + x.goals.length, 0);
  return `${src.quarters.length} ${plural(src.quarters.length, 'квартал', 'квартала', 'кварталов')} · ${n} ${plural(n, 'цель', 'цели', 'целей')}`;
}
export const goalsWord = (n: number) => `${n} ${plural(n, 'цель', 'цели', 'целей')}`;
export const activeWord = (n: number) => `${n} ${plural(n, 'активная', 'активных', 'активных')}`;

/** The goals of one quarter in a source (none if it has no such quarter). */
export const goalsIn = (s: SourceGoals, q: Quarter) => s.quarters.find((x) => cmpQuarter(x.q, q) === 0)?.goals ?? [];
export const GOAL_ICON = 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z';

// ---- the review on 1-1 (part 2): the queue, the marks, another quarter -------------------------------------------

/** The goal of a quarter by its title (lines move with every edit; the title does not). */
export const findGoal = (s: SourceGoals, q: Quarter, title: string) => goalsIn(s, q).find((g) => g.title === title) ?? null;

/** The cards of a review: open goals, the silent first (longest silence first), then by deadline. */
export function reviewQueue(goals: Goal[], done: string[], now = new Date(), threshold = SILENT_DAYS): Goal[] {
  const open = goals.filter((g) => !isDone(g, done));
  const far = 1e15;
  return open
    .map((g, i) => ({ g, i, s: isSilent(g, now, threshold) ? (quietDays(g, now) ?? 0) : -1, d: g.deadline ? +g.deadline : far }))
    .sort((a, b) => b.s - a.s || a.d - b.d || a.i - b.i)
    .map((x) => x.g);
}

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
/** «Вт, 22 сен». */
export const dayLabel = (d: Date) => `${WD[d.getDay()]}, ${shortDay(d)}`;
/** «Сегодня, Пн 12 окт», «Вчера, Вс 11 окт», «Пт 9 окт». */
export function markDayLabel(d: Date, now = new Date()): string {
  const n = daysBetween(d, now);
  const s = `${WD[d.getDay()]} ${shortDay(d)}`;
  return n === 0 ? `Сегодня, ${s}` : n === 1 ? `Вчера, ${s}` : s;
}

/** `- [2026-10-12 Пн] first line`, the other lines under it (a «- » line becomes a nested item). */
export function markLines(date: Date, body: string, names: string[]): string[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lines = body.replace(/\r\n?/g, '\n').replace(/\s+$/, '').split('\n');
  const stamp = `[${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${names[date.getDay()]}]`;
  return [`- ${stamp} ${lines[0].trim()}`.replace(/\s+$/, ''), ...lines.slice(1).map((l) => (l.trim() ? '  ' + l.replace(/^,?(\*)/, ',$1') : ''))];
}

// ---- part 3: the settings, the report of a quarter, the carry-over ------------------------------------------------

/** «Настройки → Агенды → Цели квартала» (`goalSettings` in config.json). */
export interface GoalSettings {
  silent: number; // days without a mark: 7, 14, 21, 30
  soon: number; // weeks before a deadline: 2, 4, 6, 8
}
export const DEFAULT_GOAL_SETTINGS: GoalSettings = { silent: SILENT_DAYS, soon: SOON_WEEKS };
export function readGoalSettings(raw: unknown): GoalSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    silent: [7, 14, 21, 30].includes(v.silent as number) ? (v.silent as number) : SILENT_DAYS,
    soon: [2, 4, 6, 8].includes(v.soon as number) ? (v.soon as number) : SOON_WEEKS,
  };
}
export function withGoalSettings(raw: string | null, c: GoalSettings): string {
  let base: Record<string, unknown> = {};
  try {
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p === 'object' && !Array.isArray(p)) base = p;
  } catch {
    /* replaced */
  }
  const out: Record<string, unknown> = { version: base.version ?? 1, ...base };
  const keep: Record<string, number> = {};
  if (c.silent !== SILENT_DAYS) keep.silent = c.silent;
  if (c.soon !== SOON_WEEKS) keep.soon = c.soon;
  if (Object.keys(keep).length) out.goalSettings = keep;
  else delete out.goalSettings;
  return JSON.stringify(out, null, 2) + '\n';
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const longDay = (d: Date) => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
/** The words of a status for the platform. */
export function statusWords(g: Goal, done: string[]): string {
  if (isDone(g, done)) return 'Выполнена';
  if (g.keyword === GOAL_STATES.active) return 'В работе';
  if (g.keyword === GOAL_STATES.backlog) return 'В бэклоге';
  return g.keyword ?? '—';
}
/** The last mark that sums the goal up («Итог: …»), if any. */
export const finalMark = (g: Goal) => [...g.marks].reverse().find((m) => /^итог\s*:/i.test(m.text.trim())) ?? null;
/** The newest marks first, without the final one. */
export const lastMarks = (g: Goal, n = 3) => {
  const fin = finalMark(g);
  return [...g.marks].filter((m) => m !== fin).sort((a, b) => +b.date - +a.date).slice(0, n);
};

export interface ReportPerson {
  name: string;
  goals: Goal[];
  done: string[];
}
/**
 * The report of a quarter to paste on the platform: per person, per goal «Название / Что делал / Результат / Срок /
 * Статус»; «Что делал» is «Что буду делать» and the marks (oldest first). As plain text or Markdown.
 */
export function reportText(people: ReportPerson[], q: Quarter, format: 'text' | 'md'): string {
  const md = format === 'md';
  const out: string[] = [md ? `# Цели ${quarterLabel(q)}` : `Цели ${quarterLabel(q)}`, ''];
  for (const p of people) {
    if (!p.goals.length) continue;
    out.push(md ? `## ${p.name}` : p.name.toUpperCase(), '');
    p.goals.forEach((g, i) => {
      const did = [g.plan.trim(), ...[...g.marks].sort((a, b) => +a.date - +b.date).map((m) => `${shortDay(m.date)}: ${m.text.trim()}`)].filter(Boolean).join('\n');
      const field = (k: string, v: string) => (md ? `**${k}:** ${v.includes('\n') ? '\n' + v : v}` : `${k}: ${v}`);
      out.push(md ? `### ${g.title}` : `${i + 1}. ${g.title}`);
      out.push(field('Что делал', did || '—'));
      out.push(field('Результат', g.result.trim() || '—'));
      out.push(field('Срок', g.deadline ? longDay(g.deadline) : '—'));
      out.push(field('Статус', statusWords(g, p.done)));
      out.push('');
    });
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

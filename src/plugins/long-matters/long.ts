// «Долгие дела» (ТЗ 40): which headings are long matters, when each is due for a look, its group and its tone. Pure:
// the plugin gives the files, the headings' facts from the index and today.

import type { Heading } from '@panopticon/api/org';

/** Where long matters are (ТЗ 40 §8): headings of a level in a file, or headings with their own tag. */
export type Source = { kind: 'file'; file: string; level: number } | { kind: 'tag'; tag: string };
export interface Settings {
  sources: Source[];
  /** Days between looks («Норма проверки»). */
  norm: number;
  /** The status of waiting. */
  wait: string;
  /** The block on «Сегодня». */
  today: boolean;
}
export const DEFAULTS: Settings = {
  sources: [
    { kind: 'file', file: 'Midterm.org', level: 1 },
    { kind: 'tag', tag: 'long' },
  ],
  norm: 14,
  wait: 'WAIT',
  today: true,
};

/** The settings as stored (the notes folder), the defaults for what is missing or wrong. */
export function readSettings(raw: unknown): Settings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sources = Array.isArray(o.sources)
    ? o.sources.flatMap((s): Source[] => {
        const x = (s ?? {}) as Record<string, unknown>;
        if (x.kind === 'file' && typeof x.file === 'string' && x.file) return [{ kind: 'file', file: x.file, level: Math.min(3, Math.max(1, Number(x.level) || 1)) }];
        if (x.kind === 'tag' && typeof x.tag === 'string' && x.tag.trim()) return [{ kind: 'tag', tag: x.tag.trim().replace(/^:|:$/g, '') }];
        return [];
      })
    : DEFAULTS.sources;
  const norm = Number(o.norm);
  return {
    sources,
    norm: Number.isFinite(norm) && norm >= 1 ? Math.round(norm) : DEFAULTS.norm,
    wait: typeof o.wait === 'string' && o.wait ? o.wait : DEFAULTS.wait,
    today: o.today === undefined ? DEFAULTS.today : !!o.today,
  };
}

const isArchive = (path: string) => /_archive$|\.org_archive$/i.test(path);
const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The long matters of a file: the headings under a source, not done, not archived (their own `:ARCHIVE:` or one of
 *  their parents'); each once, in the file's order. */
export function longIn(path: string, headings: Heading[], done: string[], sources: Source[]): Heading[] {
  if (isArchive(path)) return [];
  const archived = (i: number): boolean => {
    for (let k = i; k >= 0; k = headings[k].parent) if (headings[k].tags.some((t) => t === 'ARCHIVE')) return true;
    return false;
  };
  return headings.filter((h, i) => {
    if (h.keyword && done.includes(h.keyword)) return false;
    if (archived(i)) return false;
    return sources.some((s) => (s.kind === 'file' ? s.file === path && h.level === s.level : h.tags.some((t) => sameTag(t, s.tag))));
  });
}

/** An inactive date `[2026-10-30 Пт]` (`:NEXT_REVIEW:`); null when it is not one. */
export function readDay(v: string | undefined): Date | null {
  const m = /^\s*[[<]?(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Whole days from `a` to `b` (calendar days, not 24 hours). */
export const daysBetween = (a: Date, b: Date) => Math.round((+day(b) - +day(a)) / 86_400_000);

export type Group = 'due' | 'waiting' | 'ok';
export type Tone = 'late' | 'soon' | 'calm';
/** A long matter as the plugin knows it. */
export interface Matter {
  key: string;
  path: string;
  line: number;
  title: string;
  keyword: string | null;
  touched?: { at: Date; approx: boolean; src?: 'logbook' | 'closed' | 'file' };
  note: { at: Date; text: string } | null;
  waiting: string | null;
  nextReview: Date | null;
  /** Long by its own tag (taken away by «Убрать из долгих дел»); by its place in a file. */
  byTag: string | null;
  byPlace: boolean;
}
/** What the views show of it today. */
export interface Shown {
  /** Days since the last touch; null while it is not known. */
  age: number | null;
  /** The day to look at it: `:NEXT_REVIEW:`, else the touch and the norm. */
  due: Date | null;
  /** Days left to it (< 0: overdue). */
  left: number | null;
  group: Group;
  tone: Tone;
}
export function shown(m: Matter, today: Date, norm: number): Shown {
  const age = m.touched ? Math.max(0, daysBetween(m.touched.at, today)) : null;
  // `:NEXT_REVIEW:` stands while it is after the last touch; touched on its day or later (looked at), the norm again
  const byNorm = m.touched ? new Date(day(m.touched.at).getTime() + norm * 86_400_000) : null;
  const due = m.nextReview && (!m.touched || +m.nextReview > +day(m.touched.at)) ? m.nextReview : byNorm;
  const left = due ? daysBetween(today, due) : null;
  const late = left !== null && left < 0;
  const group: Group = late ? 'due' : m.waiting ? 'waiting' : 'ok';
  const tone: Tone = late ? 'late' : left !== null && left < norm * 0.3 ? 'soon' : 'calm';
  return { age, due, left, group, tone };
}

export const GROUPS: { id: Group; title: string }[] = [
  { id: 'due', title: 'Пора проверить' },
  { id: 'waiting', title: 'Ждём' },
  { id: 'ok', title: 'В норме' },
];
/** The matters by group, the most overdue first in each (unknown dates last). */
export function grouped<T extends { s: Shown; m: Matter }>(rows: T[]): Record<Group, T[]> {
  const out: Record<Group, T[]> = { due: [], waiting: [], ok: [] };
  for (const r of rows) out[r.s.group].push(r);
  const at = (r: T) => (r.s.due ? +r.s.due : Infinity);
  for (const g of Object.values(out)) g.sort((a, b) => at(a) - at(b) || a.m.title.localeCompare(b.m.title, 'ru'));
  return out;
}

/** The section's badge (ТЗ 43 §1): «Пора проверить» as an alarm when there are some, else how many matters. */
export function badgeOf(groups: Record<Group, unknown[]>): { n: number; alert: boolean } {
  const due = groups.due.length;
  return due ? { n: due, alert: true } : { n: groups.waiting.length + groups.ok.length, alert: false };
}

/** The source that makes the heading long: its own tag of a tag source (null: none), a file source. */
export function sourceOf(path: string, h: Heading, sources: Source[]): { byTag: string | null; byPlace: boolean } {
  const tag = sources.flatMap((s) => (s.kind === 'tag' ? h.tags.filter((t) => sameTag(t, s.tag)) : []))[0] ?? null;
  return { byTag: tag, byPlace: sources.some((s) => s.kind === 'file' && s.file === path && h.level === s.level) };
}

/** An inactive date with the file's weekday names: `[2026-10-30 Пт]`. */
export const stampOf = (d: Date, names: string[]) =>
  `[${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${names[d.getDay()]}]`;

/** «Больше не ждём»: the status before the waiting one, by the newest `- State "WAIT" from "NEXT"` of the heading's
 *  own :LOGBOOK:; null — none there. */
export function statusBefore(lines: readonly string[], h: Heading, wait: string): string | null {
  let best: { at: number; from: string } | null = null;
  for (let i = h.line + 1; i < lines.length && i < h.end; i++) {
    if (/^\*+\s/.test(lines[i])) break;
    const m = /^\s*-\s+State\s+"([^"]*)"\s+from\s+"([^"]*)"\s*\[(\d{4})-(\d{2})-(\d{2})[^\]]*?(?:(\d{1,2}):(\d{2}))?\]/.exec(lines[i]);
    if (!m || m[1] !== wait || !m[2] || m[2] === wait) continue;
    const at = +new Date(+m[3], +m[4] - 1, +m[5], m[6] ? +m[6] : 0, m[7] ? +m[7] : 0);
    if (!best || at > best.at) best = { at, from: m[2] };
  }
  return best?.from ?? null;
}

/** The days «Проверить через…» offers. */
export const REVIEW_IN = [
  { label: 'Через неделю', days: 7 },
  { label: 'Через 2 недели', days: 14 },
  { label: 'Через месяц', days: 30 },
];
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// ---- words ---------------------------------------------------------------------------------------------------
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const shortDay = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
/** «23 дн.», «≈ 23 дн.» */
export const ageWords = (s: Shown, m: Matter) => (s.age === null ? '…' : `${m.touched?.approx ? '≈ ' : ''}${s.age} дн.`);
/** «просрочено 9 дн.», «сегодня», «21 окт». */
export const dueWords = (s: Shown) => (s.left === null || !s.due ? '—' : s.left < 0 ? `просрочено ${-s.left} дн.` : s.left === 0 ? 'сегодня' : shortDay(s.due));
/** Where an approximate date came from. */
export function approxWords(m: Matter): string | null {
  const t = m.touched;
  if (!t?.approx) return null;
  if (t.src === 'logbook') return `Примерно: по записи от ${shortDay(t.at)} в :LOGBOOK:`;
  if (t.src === 'closed') return `Примерно: по дате закрытия ${shortDay(t.at)}`;
  return 'Примерно: по дате изменения файла';
}
/** The hint of a row: the last status with its date, whom we wait for, the day to look. */
export function tipOf(m: Matter, s: Shown): string {
  return [
    m.note ? `${shortDay(m.note.at)}: ${m.note.text}` : 'Статуса нет',
    m.waiting ? `Ждём: ${m.waiting}` : null,
    s.due ? `Проверить: ${s.left !== null && s.left < 0 ? `${shortDay(s.due)}, ${dueWords(s)}` : shortDay(s.due)}` : null,
    approxWords(m),
  ]
    .filter(Boolean)
    .join('\n');
}
/** «14 дел» */
export function mattersWord(n: number) {
  const k = n % 10 === 1 && n % 100 !== 11 ? 'дело' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дела' : 'дел';
  return `${n} ${k}`;
}

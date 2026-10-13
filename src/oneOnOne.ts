// «1-1 сегодня» (ТЗ 32 §2.4): a person's file has a heading tagged :1on1: with a repeated date of the meeting, and under
// it a subheading per meeting («** [2026-09-30 Ср]»). A card for each meeting of the day: the person, how often, the
// last meeting, the open agreements of it; «Новая встреча» puts today's subheading first. Pure: files in.

import { occurrences, type Heading, type OrgDate } from './org';
import type { TFile } from './today';

export interface OneOnOne {
  key: string;
  file: string; // relative path
  path: string;
  line: number; // the 1-1 heading
  title: string;
  name: string; // #+TITLE, else the file's name
  initials: string;
  color: string;
  time: string | null; // «15:00»
  end: string | null;
  every: string; // «каждые 2 недели»
  last: Date | null; // the last meeting before today
  open: number; // open tasks under it
  today: number | null; // the line of today's meeting, if made
}

const mid = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const same = (a: Date, b: Date) => +mid(a) === +mid(b);
const DATE = /[[<](\d{4})-(\d{2})-(\d{2})/;
// as the calendar reads it: <2026-10-14 Ср 15:00-15:45 +2w>
const STAMP = /<(\d{4})-(\d{2})-(\d{2})(?:\s+[^\s\d>]+)?(?:\s+(\d{1,2}:\d{2})(?:-(\d{1,2}:\d{2}))?)?(?:\s+([.+]{1,2}\d+[hdwmy]))?[^>]*>/;
const hm = (t?: string) => (t ? t.padStart(5, '0') : null);
const COLORS = ['#5b6ee1', '#c2477a', '#2f8f6b', '#b5651d', '#7a5bd1', '#2b7fae', '#a0522d', '#5f7d1e'];

/** «каждые 2 недели» from «+2w». */
export function everyWords(rep?: string): string {
  const m = rep ? /(\d+)([dwmy])$/.exec(rep) : null;
  if (!m) return '';
  const n = +m[1];
  const one = { d: 'каждый день', w: 'каждую неделю', m: 'каждый месяц', y: 'каждый год' }[m[2] as 'd'];
  if (n === 1) return one;
  const unit = { d: ['день', 'дня', 'дней'], w: ['неделю', 'недели', 'недель'], m: ['месяц', 'месяца', 'месяцев'], y: ['год', 'года', 'лет'] }[m[2] as 'd'];
  const form = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? unit[1] : n % 10 === 1 && n % 100 !== 11 ? unit[0] : unit[2];
  return `каждые ${n} ${form}`;
}
/** «АП» for «Петров Алексей». */
export const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
export const colorOf = (path: string) => COLORS[[...path].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];
/** The person's name: the file's #+TITLE, else its name without .org. */
export const nameOf = (f: { name: string; text: string }) => /^#\+TITLE:[ \t]*(.+)$/im.exec(f.text)?.[1].trim() || f.name.split('/').pop()!.replace(/\.org$/, '');

const dateOf = (title: string) => {
  const m = DATE.exec(title);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

/** The meetings of the day: every heading with the tag whose repeated date falls on it, by time. */
export function oneOnOnes(files: TFile[], day: Date, tag: string): OneOnOne[] {
  const out: OneOnOne[] = [];
  if (!tag) return out;
  for (const f of files) {
    const lines = f.text.split('\n');
    f.headings.forEach((h, i) => {
      if (!h.tags.includes(tag)) return;
      // the stamp: in the title, or on a line right under it
      const s = STAMP.exec(lines[h.line]) ?? STAMP.exec(lines[h.line + 1] ?? '');
      if (!s) return;
      const d: OrgDate = { y: +s[1], m: +s[2], d: +s[3], repeater: s[6] };
      if (!occurrences(d, mid(day), mid(day)).length) return;
      const kids = f.headings.map((x, j) => ({ x, j })).filter(({ x }) => x.parent === i);
      const meetings = kids.map(({ x, j }) => ({ x, j, date: dateOf(x.title) })).filter((k) => k.date);
      const before = meetings.filter((k) => k.date! < mid(day)).sort((a, b) => +b.date! - +a.date!)[0];
      const now = meetings.find((k) => same(k.date!, day));
      const open = before ? f.headings.filter((x) => x.line > before.x.line && x.line < before.x.end && x.keyword && !f.wf.done.includes(x.keyword)).length : 0;
      const name = nameOf(f);
      out.push({
        key: f.path + '#' + h.line, file: f.name, path: f.path, line: h.line, title: h.title, name, initials: initialsOf(name), color: colorOf(f.name),
        time: hm(s[4]), end: hm(s[5]), every: everyWords(s[6]), last: before?.date ?? null, open, today: now ? now.x.line : null,
      });
    });
  }
  return out.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
}

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const p2 = (n: number) => String(n).padStart(2, '0');
/**
 * «Новая встреча»: «** [2026-10-14 Ср]» first in the list of meetings (right under the 1-1 heading and its date), with
 * an empty line under it for the caret. The text and that line; null — the heading is not there.
 */
export function newMeeting(text: string, hs: Heading[], line: number, day: Date): { text: string; line: number } | null {
  const i = hs.findIndex((h) => h.line === line);
  if (i < 0) return null;
  const h = hs[i];
  const lines = text.split('\n');
  const first = hs.find((x) => x.parent === i);
  let at = first ? first.line : h.end;
  if (!first) while (at > h.line + 1 && lines[at - 1].trim() === '') at--;
  lines.splice(at, 0, `${'*'.repeat(h.level + 1)} [${day.getFullYear()}-${p2(day.getMonth() + 1)}-${p2(day.getDate())} ${WD[day.getDay()]}]`, '');
  return { text: lines.join('\n'), line: at + 1 };
}

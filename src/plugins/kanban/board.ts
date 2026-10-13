// The board (ТЗ 33): an Org file as a kanban — the columns are the statuses of one workflow (a set of «Настройки →
// Статусы»), the cards its level-1 headings with those statuses, in the file's order. The set is named in the file:
// «#+BOARD: Разработка». Pure: the text and the headings in, what the board shows out.

import type { Heading, OrgDate } from '@panopticon/api/org';

export interface StatusSet {
  name: string;
  states: { name: string; done: boolean }[];
}

// ---- #+BOARD -------------------------------------------------------------------------------------------------------

const BOARD = /^#\+BOARD:[ \t]*(.*?)[ \t]*$/im;
/** The workflow the file names, null — none. */
export function boardOf(text: string): string | null {
  const head = text.split('\n');
  for (const l of head) {
    if (/^\*+\s/.test(l)) break;
    const m = BOARD.exec(l);
    if (m) return m[1] || null;
  }
  return null;
}
/** The line «#+BOARD: …» (0-based), -1 — none. */
export function boardLine(text: string): number {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && !/^\*+\s/.test(lines[i]); i++) if (/^#\+BOARD:/i.test(lines[i])) return i;
  return -1;
}
/**
 * The file naming another workflow (null: none): the line changed in place, or put after the other «#+» lines of the
 * file's header (before the first heading), or taken away.
 */
export function withBoard(text: string, name: string | null): string {
  const lines = text.split('\n');
  const at = boardLine(text);
  if (at >= 0) {
    if (name === null) lines.splice(at, 1);
    else lines[at] = `#+BOARD: ${name}`;
    return lines.join('\n');
  }
  if (name === null) return text;
  let i = 0;
  while (i < lines.length && /^#\+/.test(lines[i])) i++;
  lines.splice(i, 0, `#+BOARD: ${name}`);
  return lines.join('\n');
}

// ---- the cards -------------------------------------------------------------------------------------------------------

export interface Card {
  key: string;
  line: number;
  title: string; // without the status, the priority, the tags and a cookie
  heading: string; // the heading's title as the file has it (a cookie too): what finds it again
  keyword: string;
  priority: string | null;
  tags: string[];
  done: boolean;
  date: { text: string; late: boolean } | null;
  progress: string | null; // «2/5»
  closed: Date | null;
}
export interface Column {
  keyword: string;
  done: boolean;
  cards: Card[]; // shown (filtered, the old finished ones left out unless asked)
  total: number; // before the filter
  matched: number; // after the filter, before the old ones are left out
  older: number; // finished long ago, not shown
}
export interface Board {
  columns: Column[];
  off: { line: number; title: string; keyword: string | null }[]; // level-1 headings not on it
}

const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const toDate = (d: OrgDate) => new Date(d.y, d.m - 1, d.d);
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const days = (a: Date, b: Date) => Math.round((+day0(a) - +day0(b)) / 86400000);
const short = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;
const COOKIE = /\s*\[(\d+%|\d+\/\d+)\]/;

/** The date a card tells: CLOSED of a finished one; else the deadline (red when today or past); else SCHEDULED. */
export function cardDate(h: Heading, done: boolean, today: Date): Card['date'] {
  if (done) return h.closed ? { text: short(toDate(h.closed)), late: false } : null;
  if (h.deadline) {
    const d = toDate(h.deadline);
    return { text: `дедлайн ${short(d)}`, late: days(d, today) <= 0 };
  }
  return h.scheduled ? { text: short(toDate(h.scheduled)), late: false } : null;
}
/** «2/5»: the cookie of the title; else the checkboxes and the tasks under the heading. */
export function progressOf(lines: string[], hs: Heading[], i: number, doneWords: string[]): string | null {
  const h = hs[i];
  const c = COOKIE.exec(h.title);
  if (c) return c[1];
  let done = 0;
  let total = 0;
  for (let l = h.line + 1; l < h.end; l++) {
    const m = /^\s*(?:[-+*]|\d+[.)])\s+\[([ xX-])\]/.exec(lines[l]);
    if (m && !/^\*+\s/.test(lines[l])) {
      total++;
      if (m[1] === 'x' || m[1] === 'X') done++;
    }
  }
  for (const k of hs) {
    if (k.line <= h.line || k.line >= h.end || !k.keyword) continue;
    total++;
    if (doneWords.includes(k.keyword)) done++;
  }
  return total ? `${done}/${total}` : null;
}

/** A filter of the header: words in the title, «:tag:» tokens in the tags; every one must match. */
export function matches(c: Pick<Card, 'title' | 'tags'>, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((w) => {
    const tag = /^:(.+?):?$/.exec(w);
    if (tag) return c.tags.some((t) => t.toLowerCase() === tag[1]);
    return c.title.toLowerCase().includes(w);
  });
}

/** The board of a file by a workflow. `doneDays`: a finished card closed longer ago is left out (0: none). */
export function boardFor(text: string, hs: Heading[], set: StatusSet, o: { filter?: string; doneDays?: number; showOld?: Set<string>; today?: Date } = {}): Board {
  const today = o.today ?? new Date();
  const lines = text.split('\n');
  const doneWords = set.states.filter((s) => s.done).map((s) => s.name);
  const names = new Set(set.states.map((s) => s.name));
  const off: Board['off'] = [];
  const byKw = new Map<string, Card[]>(set.states.map((s) => [s.name, []]));
  hs.forEach((h, i) => {
    if (h.level !== 1) return;
    if (!h.keyword || !names.has(h.keyword)) {
      off.push({ line: h.line, title: h.title, keyword: h.keyword });
      return;
    }
    const done = doneWords.includes(h.keyword);
    byKw.get(h.keyword)!.push({
      key: `${h.line}:${h.title}`, line: h.line, title: h.title.replace(COOKIE, '').trim(), heading: h.title, keyword: h.keyword, priority: h.priority, tags: h.tags, done,
      date: cardDate(h, done, today), progress: progressOf(lines, hs, i, doneWords), closed: h.closed ? toDate(h.closed) : null,
    });
  });
  const columns = set.states.map((s): Column => {
    const all = byKw.get(s.name)!;
    const hit = all.filter((c) => matches(c, o.filter ?? ''));
    const recent = (c: Card) => !s.done || !o.doneDays || !c.closed || days(today, c.closed) <= o.doneDays;
    const shown = o.showOld?.has(s.name) ? hit : hit.filter(recent);
    return { keyword: s.name, done: s.done, cards: shown, total: all.length, matched: hit.length, older: hit.length - shown.length };
  });
  return { columns, off };
}

/** For the choice of a workflow: how many level-1 headings each set would put on the board. */
export function countFor(hs: Heading[], set: StatusSet): number {
  const names = new Set(set.states.map((s) => s.name));
  return hs.filter((h) => h.level === 1 && !!h.keyword && names.has(h.keyword)).length;
}
/** The set chosen first: the one with the most headings (the first of them on a tie). */
export function bestSet(hs: Heading[], sets: StatusSet[]): StatusSet | null {
  let best: StatusSet | null = null;
  let n = -1;
  for (const s of sets) {
    const c = countFor(hs, s);
    if (c > n) [best, n] = [s, c];
  }
  return best;
}
/** «15 из 18 заголовков», «нет заголовков». */
export function countWords(n: number, of: number): string {
  if (!n) return 'нет заголовков';
  const w = of % 10 === 1 && of % 100 !== 11 ? 'заголовка' : 'заголовков';
  return `${n} из ${of} ${w}`;
}
/** «3 заголовка» for «Не на доске». */
export function headingsWord(n: number): string {
  const w = n % 10 === 1 && n % 100 !== 11 ? 'заголовок' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'заголовка' : 'заголовков';
  return `${n} ${w}`;
}

// ---- the title with its inline markup (ТЗ 19), as HTML ---------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const B = '(^|[\\s(«"])';
const E = '(?=$|[\\s.,:;!?)»"])';
const EMPH: [RegExp, string][] = [
  [new RegExp(`${B}\\*([^\\s*](?:[^*]*[^\\s*])?)\\*${E}`, 'g'), '$1<b>$2</b>'],
  [new RegExp(`${B}\\/([^\\s/](?:[^/]*[^\\s/])?)\\/${E}`, 'g'), '$1<i>$2</i>'],
  [new RegExp(`${B}_([^\\s_](?:[^_]*[^\\s_])?)_${E}`, 'g'), '$1<u>$2</u>'],
  [new RegExp(`${B}\\+([^\\s+](?:[^+]*[^\\s+])?)\\+${E}`, 'g'), '$1<s>$2</s>'],
  [new RegExp(`${B}[=~]([^\\s=~](?:[^=~]*[^\\s=~])?)[=~]${E}`, 'g'), '$1<code>$2</code>'],
];
/** A title as HTML: links by their description, emphasis, code. */
export function titleHtml(t: string): string {
  const links: string[] = [];
  let s = t.replace(/\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g, (_, target: string, d?: string) => {
    links.push(`<span class="kb-link">${esc(d || target.replace(/^(file|id):/, ''))}</span>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  s = esc(s);
  for (const [re, to] of EMPH) s = s.replace(re, to);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => links[+i]);
}

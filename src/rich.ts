// «Оформленный текст» (like org-modern): the pure part — reading dates, emphasis, checkboxes and tables in a line,
// and the labels drawn for them. The editor's extension (`orgRich.ts`) draws them; the file never changes.

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export interface Stamp {
  date: Date; // the day, at midnight
  time: string | null; // «10:00» or «10:00–11:30»
  repeat: string | null; // «каждую неделю»
  active: boolean; // <…> (a [ … ] stamp is inactive)
}
const STAMP = /^([<[])(\d{4})-(\d{2})-(\d{2})(?:\s+[^\s\d>\]]+)?(?:\s+(\d{1,2}:\d{2})(?:-(\d{1,2}:\d{2}))?)?(?:\s+((?:\.\+|\+\+|\+)\d+[hdwmy]))?(?:\s+-\d+[hdwmy])?\s*[>\]]$/;
/** A whole Org timestamp («<2026-10-14 Ср 10:00 +1w>»), or null. */
export function parseStamp(s: string): Stamp | null {
  const m = STAMP.exec(s);
  if (!m || (m[1] === '<') !== s.endsWith('>')) return null;
  const date = new Date(+m[2], +m[3] - 1, +m[4]);
  if (date.getMonth() !== +m[3] - 1) return null;
  return { date, time: m[5] ? (m[6] ? `${m[5]}–${m[6]}` : m[5]) : null, repeat: m[7] ? repeatWords(m[7]) : null, active: m[1] === '<' };
}
function repeatWords(r: string): string {
  const m = /(\d+)([hdwmy])$/.exec(r)!;
  const n = +m[1];
  const one: Record<string, string> = { h: 'каждый час', d: 'каждый день', w: 'каждую неделю', m: 'каждый месяц', y: 'каждый год' };
  const many: Record<string, [string, string, string]> = { h: ['час', 'часа', 'часов'], d: ['день', 'дня', 'дней'], w: ['неделю', 'недели', 'недель'], m: ['месяц', 'месяца', 'месяцев'], y: ['год', 'года', 'лет'] };
  if (n === 1) return one[m[2]];
  const [a, b, c] = many[m[2]];
  return `каждые ${n} ${plural(n, a, b, c)}`;
}
const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Whole days from today to a date (negative: past). */
export const daysFrom = (d: Date, now = new Date()) => Math.round((+day0(d) - +day0(now)) / 86400000);

/** «Ср, 14 окт» (another year: «Ср, 14 окт 2027»), with the time and the repeat: «Пн, 12 окт, 10:00 · каждую неделю». */
export function stampLabel(s: Stamp, now = new Date(), weekday = true): string {
  const d = s.date;
  let t = `${weekday ? WD[d.getDay()] + ', ' : ''}${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : ''}`;
  if (s.time) t += `, ${s.time}`;
  if (s.repeat) t += ` · ${s.repeat}`;
  return t;
}
/** The grey words after a date: «сегодня», «завтра», «через 3 дн», «2 дн назад». */
export function relLabel(d: Date, now = new Date()): string {
  const n = daysFrom(d, now);
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === -1) return 'вчера';
  return n > 0 ? `через ${n} дн` : `${-n} дн назад`;
}
/** A deadline: how urgent (the chip's colour) and its words. */
export function deadlineState(d: Date, now = new Date()): { level: 'over' | 'near' | 'far'; rel: string } {
  const n = daysFrom(d, now);
  if (n < 0) return { level: 'over', rel: `просрочен на ${-n} дн` };
  return { level: n <= 3 ? 'near' : 'far', rel: relLabel(d, now) };
}

// ---- inside a line ------------------------------------------------------------------------------------------

export interface Span {
  from: number; // offsets in the line
  to: number;
}
const STAMPS = /[<[]\d{4}-\d{2}-\d{2}[^>\]\n]*[>\]]/g;
/** The timestamps of a line. */
export function stampsIn(text: string): (Span & { stamp: Stamp })[] {
  const out: (Span & { stamp: Stamp })[] = [];
  for (const m of text.matchAll(STAMPS)) {
    const stamp = parseStamp(m[0]);
    if (stamp) out.push({ from: m.index!, to: m.index! + m[0].length, stamp });
  }
  return out;
}
/** «SCHEDULED: <…>» and its kin: the keyword with its stamp. */
export function planningIn(text: string): (Span & { kind: 'SCHEDULED' | 'DEADLINE' | 'CLOSED'; stamp: Stamp })[] {
  if (!/^\s*(?:SCHEDULED|DEADLINE|CLOSED):/.test(text)) return [];
  const out: (Span & { kind: 'SCHEDULED' | 'DEADLINE' | 'CLOSED'; stamp: Stamp })[] = [];
  for (const m of text.matchAll(/(SCHEDULED|DEADLINE|CLOSED):\s*([<[][^>\]]*[>\]])/g)) {
    const stamp = parseStamp(m[2]);
    if (stamp) out.push({ from: m.index!, to: m.index! + m[0].length, kind: m[1] as 'SCHEDULED', stamp });
  }
  return out;
}

export type Emph = 'b' | 'i' | 'u' | 's' | 'code';
const EMPH: Record<string, Emph> = { '*': 'b', '/': 'i', _: 'u', '+': 's', '=': 'code', '~': 'code' };
// Org's rule: before — the start or a space or one of -({'"; inside — no space at either end; after — the end, a
// space or punctuation
const EMPH_RE = /(^|[\s\-({'"])([*/_+=~])(\S|\S.*?\S)\2(?=$|[\s\-.,:!?;'")}[\]])/g;
/** Emphasis in a line: where its marks are and what is inside; spans in `skip` (links, dates) are left alone. */
export function emphasisIn(text: string, skip: Span[] = []): (Span & { kind: Emph; inner: Span })[] {
  const out: (Span & { kind: Emph; inner: Span })[] = [];
  for (const m of text.matchAll(EMPH_RE)) {
    const from = m.index! + m[1].length;
    const to = from + m[3].length + 2;
    if (skip.some((s) => from < s.to && to > s.from)) continue;
    out.push({ from, to, kind: EMPH[m[2]], inner: { from: from + 1, to: to - 1 } });
  }
  return out;
}

/** A list item: its bullet («-», «+», «1.») and, if any, its checkbox. */
export function listItem(text: string): { indent: number; bullet: Span; ordered: boolean; box: (Span & { state: ' ' | 'X' | '-' }) | null } | null {
  const m = /^(\s*)([-+]|\d+[.)])(\s+)(?:\[([ Xx-])\](\s|$))?/.exec(text);
  if (!m || (m[2] === '+' && !m[3]) || (!m[1] && m[2] === '-' && /^-{5,}/.test(text))) return null;
  const at = m[1].length;
  const bullet = { from: at, to: at + m[2].length };
  const boxAt = at + m[2].length + m[3].length;
  const box = m[4] !== undefined ? { from: boxAt, to: boxAt + 3, state: (m[4] === 'x' ? 'X' : m[4]) as ' ' | 'X' | '-' } : null;
  return { indent: at, bullet, ordered: /\d/.test(m[2]), box };
}

/** Lines of a table: `|` at the start; a rule (`|---+---|`) and the header (rows above the first rule). */
export const isTableLine = (t: string) => /^\s*\|/.test(t);
export const isTableRule = (t: string) => /^\s*\|[-+:]+\|?\s*$/.test(t);
/** For each line index of `lines`: 'head' | 'rule' | 'row' | null. */
export function tableRoles(lines: string[]): ('head' | 'rule' | 'row' | null)[] {
  const out: ('head' | 'rule' | 'row' | null)[] = lines.map(() => null);
  for (let i = 0; i < lines.length; ) {
    if (!isTableLine(lines[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && isTableLine(lines[j])) j++;
    const rule = lines.slice(i, j).findIndex(isTableRule);
    for (let k = i; k < j; k++) out[k] = isTableRule(lines[k]) ? 'rule' : rule > 0 && k < i + rule ? 'head' : 'row';
    i = j;
  }
  return out;
}

/** The [n/m] or [n%] cookie of a heading line. */
export function cookieIn(text: string): (Span & { done: number; total: number; pct: boolean }) | null {
  const m = /\[(\d*)\/(\d*)\]|\[(\d*)%\]/.exec(text);
  if (!m) return null;
  const pct = m[3] !== undefined;
  return { from: m.index, to: m.index + m[0].length, done: pct ? +(m[3] || 0) : +(m[1] || 0), total: pct ? 100 : +(m[2] || 0), pct };
}

/**
 * Ticking a checkbox: the new text of its line, and the parent heading's cookie counted again over the checkboxes
 * under it (up to the next heading). `lines` is the whole text; `at` the item's line; `head` its heading line.
 */
export function toggleBox(lines: string[], at: number, head: number | null, isHeading: (i: number) => boolean): { line: number; text: string }[] {
  const it = listItem(lines[at]);
  if (!it?.box) return [];
  const next = it.box.state === 'X' ? ' ' : 'X';
  const t = lines[at];
  const out = [{ line: at, text: t.slice(0, it.box.from + 1) + next + t.slice(it.box.from + 2) }];
  if (head === null) return out;
  const c = cookieIn(lines[head]);
  if (!c) return out;
  let done = 0;
  let total = 0;
  for (let i = head + 1; i < lines.length && !isHeading(i); i++) {
    const l = i === at ? out[0].text : lines[i];
    const b = listItem(l)?.box;
    if (!b) continue;
    total++;
    if (b.state === 'X') done++;
  }
  const h = lines[head];
  const cookie = c.pct ? `[${total ? Math.round((done / total) * 100) : 0}%]` : `[${done}/${total}]`;
  out.push({ line: head, text: h.slice(0, c.from) + cookie + h.slice(c.to) });
  return out;
}

/** The name drawn for a folded drawer. */
export const drawerName = (name: string) => (/^properties$/i.test(name) ? 'Свойства' : /^logbook$/i.test(name) ? 'Журнал' : name);

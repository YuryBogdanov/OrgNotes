// Minimal Org parsing + text patching. The file text stays the source of truth:
// every edit is a targeted string patch, nothing is re-serialised from a tree.

export interface OrgDate {
  y: number;
  m: number;
  d: number;
  time?: string;
  repeater?: string;
}

export interface Workflow {
  open: string[];
  done: string[];
}

export interface Heading {
  line: number; // 0-based line index
  end: number; // exclusive line index of the end of the subtree
  level: number;
  keyword: string | null;
  priority: string | null;
  title: string;
  tags: string[];
  scheduled?: OrgDate;
  deadline?: OrgDate;
  closed?: OrgDate;
  event?: OrgDate; // bare active timestamp right under the heading
  effort?: string;
  parent: number; // index into headings array, -1 for top level
  path: string[]; // titles of ancestors
}

export const DEFAULT_WORKFLOW: Workflow = { open: ['TODO', 'NEXT', 'WAIT'], done: ['DONE', 'CANCELLED'] };

const stripKey = (w: string) => w.replace(/\(.*\)$/, '');

export function parseWorkflow(text: string): Workflow {
  const open: string[] = [];
  const done: string[] = [];
  for (const m of text.matchAll(/^#\+(?:SEQ_|TYP_)?TODO:\s*(.+)$/gm)) {
    const [a, b] = m[1].split('|');
    const left = a.trim().split(/\s+/).filter(Boolean).map(stripKey);
    if (b === undefined) {
      done.push(left.pop()!);
      open.push(...left);
    } else {
      open.push(...left);
      done.push(...b.trim().split(/\s+/).filter(Boolean).map(stripKey));
    }
  }
  return open.length || done.length ? { open, done } : DEFAULT_WORKFLOW;
}

const TS = /<(\d{4})-(\d{2})-(\d{2})(?:\s+[^\s\d>]+)?(?:\s+(\d{2}:\d{2}))?(?:\s+([.+]{1,2}\d+[hdwmy]))?[^>]*>/;
const TS_INACTIVE = /\[(\d{4})-(\d{2})-(\d{2})(?:\s+[^\s\d\]]+)?(?:\s+(\d{2}:\d{2}))?[^\]]*\]/;

function toDate(m: RegExpMatchArray | null): OrgDate | undefined {
  if (!m) return undefined;
  return { y: +m[1], m: +m[2], d: +m[3], time: m[4], repeater: m[5] };
}

export function parseHeadings(text: string, wf: Workflow): Heading[] {
  const lines = text.split('\n');
  const kws = new Set([...wf.open, ...wf.done]);
  const out: Heading[] = [];
  const stack: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = /^(\*+)\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    const level = m[1].length;
    let rest = m[2];
    let keyword: string | null = null;
    const first = /^(\S+)(?:\s+|$)/.exec(rest);
    if (first && kws.has(first[1])) {
      keyword = first[1];
      rest = rest.slice(first[0].length);
    }
    let priority: string | null = null;
    const pr = /^\[#([A-Z])\]\s*/.exec(rest);
    if (pr) {
      priority = pr[1];
      rest = rest.slice(pr[0].length);
    }
    let tags: string[] = [];
    const tg = /\s+(:(?:[^\s:]+:)+)\s*$/.exec(rest);
    if (tg) {
      tags = tg[1].split(':').filter(Boolean);
      rest = rest.slice(0, tg.index);
    }
    while (stack.length && out[stack[stack.length - 1]].level >= level) stack.pop();
    const parent = stack.length ? stack[stack.length - 1] : -1;
    const path = parent >= 0 ? [...out[parent].path, out[parent].title] : [];
    out.push({ line: i, end: lines.length, level, keyword, priority, title: rest.trim(), tags, parent, path });
    stack.push(out.length - 1);
  }

  // subtree ends + planning/properties
  for (let k = 0; k < out.length; k++) {
    const h = out[k];
    for (let j = k + 1; j < out.length; j++) {
      if (out[j].level <= h.level) {
        h.end = out[j].line;
        break;
      }
    }
    // planning line (line directly under heading) and property drawer
    const body = lines.slice(h.line + 1, Math.min(h.end, h.line + 12));
    const first = body[0] ?? '';
    if (/^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(first)) {
      const sc = /SCHEDULED:\s*(<[^>]*>)/.exec(first);
      const dl = /DEADLINE:\s*(<[^>]*>)/.exec(first);
      const cl = /CLOSED:\s*(\[[^\]]*\])/.exec(first);
      if (sc) h.scheduled = toDate(TS.exec(sc[1]));
      if (dl) h.deadline = toDate(TS.exec(dl[1]));
      if (cl) h.closed = toDate(TS_INACTIVE.exec(cl[1]));
    } else if (/^\s*<\d{4}-/.test(first)) {
      h.event = toDate(TS.exec(first));
    }
    const ef = body.find((l) => /^\s*:Effort:/i.test(l));
    if (ef) h.effort = ef.replace(/^\s*:Effort:\s*/i, '').trim();
  }
  return out;
}

/** Heading whose subtree contains the given line (deepest one). */
export function headingAt(hs: Heading[], line: number): number {
  let best = -1;
  for (let i = 0; i < hs.length; i++) if (hs[i].line <= line && line < hs[i].end) best = i;
  return best;
}

export function subtreeProgress(hs: Heading[], idx: number, wf: Workflow): { done: number; total: number } {
  const h = hs[idx];
  let done = 0;
  let total = 0;
  for (let i = idx + 1; i < hs.length && hs[i].line < h.end; i++) {
    if (hs[i].keyword) {
      total++;
      if (hs[i].keyword && wf.done.includes(hs[i].keyword!)) done++;
    }
  }
  return { done, total };
}

// ---- patching ----------------------------------------------------------------

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

export function inactiveStamp(d = new Date()): string {
  return `[${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${WD[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}]`;
}

/** Change (or remove) the TODO keyword of one heading; maintains CLOSED: like Org does. */
export function setKeyword(text: string, h: Heading, keyword: string | null, wf: Workflow): string {
  const lines = text.split('\n');
  const m = /^(\*+\s+)(.*)$/.exec(lines[h.line]);
  if (!m) return text;
  let rest = m[2];
  if (h.keyword && rest.startsWith(h.keyword)) rest = rest.slice(h.keyword.length).replace(/^\s+/, '');
  lines[h.line] = m[1] + (keyword ? keyword + ' ' : '') + rest;

  const next = lines[h.line + 1] ?? '';
  const hasPlanning = /^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(next);
  const isDone = keyword !== null && wf.done.includes(keyword);
  const stripClosed = (s: string) => s.replace(/\s*CLOSED:\s*\[[^\]]*\]/, '');

  if (isDone && !(hasPlanning && /CLOSED:/.test(next))) {
    const stamp = `CLOSED: ${inactiveStamp()}`;
    if (hasPlanning) lines[h.line + 1] = next.replace(/^(\s*)/, `$1${stamp} `);
    else lines.splice(h.line + 1, 0, stamp);
  } else if (!isDone && hasPlanning && /CLOSED:/.test(next)) {
    const cleaned = stripClosed(next);
    if (/^\s*$/.test(cleaned)) lines.splice(h.line + 1, 1);
    else lines[h.line + 1] = cleaned;
  }
  return lines.join('\n');
}

export function setPriority(text: string, h: Heading, p: string | null): string {
  const lines = text.split('\n');
  const m = /^(\*+\s+)(?:(\S+)\s+)?(.*)$/.exec(lines[h.line]);
  if (!m) return text;
  let head = m[1];
  let rest = lines[h.line].slice(head.length);
  let kw = '';
  if (h.keyword && rest.startsWith(h.keyword)) {
    kw = h.keyword + ' ';
    rest = rest.slice(h.keyword.length).replace(/^\s+/, '');
  }
  rest = rest.replace(/^\[#[A-Z]\]\s*/, '');
  lines[h.line] = head + kw + (p ? `[#${p}] ` : '') + rest;
  return lines.join('\n');
}

// ---- dates -------------------------------------------------------------------

export const toJs = (d: OrgDate) => new Date(d.y, d.m - 1, d.d);
export const dayDiff = (a: Date, b: Date) => Math.round((+toMid(a) - +toMid(b)) / 86400000);
const toMid = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WD_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export const fmtShort = (d: OrgDate) => `${d.d} ${MONTHS_SHORT[d.m - 1]}, ${WD_SHORT[toJs(d).getDay()]}`;
export const fmtLong = (d: Date) => `${WD_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
export const fmtDay = (d: Date) => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
export const weekdayName = (d: Date) => WD_FULL[d.getDay()][0].toUpperCase() + WD_FULL[d.getDay()].slice(1);

/** CSS custom property that colours a keyword. */
export function kwTone(kw: string, wf: Workflow): string {
  const known: Record<string, string> = { TODO: '--todo', NEXT: '--next', WAIT: '--wait', DONE: '--done', CANCELLED: '--fg3' };
  if (known[kw]) return known[kw];
  return wf.done.includes(kw) ? '--done' : '--todo';
}

export function repeaterLabel(r?: string): string {
  if (!r) return '';
  const m = /(\d+)([hdwmy])$/.exec(r);
  if (!m) return 'Повторяется';
  const n = +m[1];
  const u = m[2];
  if (u === 'd') return n === 1 ? 'Каждый день' : `Раз в ${n} дн.`;
  if (u === 'w') return n === 1 ? 'Каждую неделю' : `Раз в ${n} нед.`;
  if (u === 'm') return n === 1 ? 'Каждый месяц' : n === 3 ? 'Раз в квартал' : `Раз в ${n} мес.`;
  if (u === 'y') return 'Каждый год';
  return 'Повторяется';
}

/** Occurrences of a repeating date inside [from, to], first one included. */
export function occurrences(d: OrgDate, from: Date, to: Date): Date[] {
  const base = toJs(d);
  const out: Date[] = [];
  const m = d.repeater ? /(\d+)([dwmy])$/.exec(d.repeater) : null;
  if (!m) return base >= from && base <= to ? [base] : [];
  const n = +m[1];
  let cur = new Date(base);
  for (let i = 0; i < 400 && cur <= to; i++) {
    if (cur >= from) out.push(new Date(cur));
    cur = new Date(cur);
    if (m[2] === 'd') cur.setDate(cur.getDate() + n);
    else if (m[2] === 'w') cur.setDate(cur.getDate() + 7 * n);
    else if (m[2] === 'm') cur.setMonth(cur.getMonth() + n);
    else cur.setFullYear(cur.getFullYear() + n);
  }
  return out;
}

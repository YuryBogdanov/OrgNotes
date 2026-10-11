import { isColor, toneOf, type Tone } from './colors';
// Minimal Org parsing + text patching. The file text stays the source of truth:
// every edit is a targeted string patch, nothing is re-serialised from a tree.

/** Files may use CRLF; inside the app text is always LF and the original style is restored on save. */
export type Eol = '\n' | '\r\n';
export function splitEol(raw: string): { text: string; eol: Eol } {
  if (!raw.includes('\r')) return { text: raw, eol: '\n' };
  return { text: raw.replace(/\r\n?/g, '\n'), eol: raw.includes('\r\n') ? '\r\n' : '\n' };
}
export const joinEol = (text: string, eol: Eol) => (eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text);

export interface OrgDate {
  y: number;
  m: number;
  d: number;
  time?: string;
  repeater?: string;
}

/** Project-wide behaviour of status changes. */
export interface WorkflowBehavior {
  closed: boolean; // write CLOSED: [..] when a task is finished
  logbook: boolean; // log every status change into the heading's :LOGBOOK: drawer
}
export const DEFAULT_BEHAVIOR: WorkflowBehavior = { closed: true, logbook: false };

export interface Workflow {
  behavior?: WorkflowBehavior;
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
  id?: string; // :ID: property
  customId?: string; // :CUSTOM_ID: property
  parent: number; // index into headings array, -1 for top level
  path: string[]; // titles of ancestors
}

export interface WorkflowState {
  name: string;
  done: boolean;
  key?: string; // quick-select letter, like TODO(t) (kept if a hand-written config has it)
  color?: string; // a palette id (gray red orange green teal blue purple pink) or a #rrggbb hex
}

/** One status sequence, e.g. "Задачи": NEW TODO IN-PROGRESS | DONE. The first state is where new items start. */
export interface WorkflowDef {
  name: string;
  states: WorkflowState[];
  initial?: string; // the status a new task gets; an open state of this workflow (default: the first open one)
}

export interface Workflow {
  open: string[]; // all not-done keywords of all sequences (flat; used for recognition)
  done: string[]; // all done keywords
  sequences?: WorkflowDef[];
  primary?: number; // sequence used for headings that have no keyword yet
  source?: 'file' | 'project' | 'default';
}

export interface ProjectConfig {
  workflows: WorkflowDef[];
  behavior: WorkflowBehavior;
}

export const EMPTY_CONFIG: ProjectConfig = { workflows: [], behavior: DEFAULT_BEHAVIOR };

const stateOf = (name: string, done: boolean): WorkflowState => ({ name, done });

export const DEFAULT_SEQUENCE: WorkflowDef = {
  name: 'Задачи',
  states: [stateOf('TODO', false), stateOf('NEXT', false), stateOf('WAIT', false), stateOf('DONE', true), stateOf('CANCELLED', true)],
};

export function fromSequences(sequences: WorkflowDef[], primary: number, source: Workflow['source']): Workflow {
  const all = sequences.flatMap((s) => s.states);
  return {
    open: [...new Set(all.filter((s) => !s.done).map((s) => s.name))],
    done: [...new Set(all.filter((s) => s.done).map((s) => s.name))],
    sequences,
    primary,
    source,
  };
}

export const DEFAULT_WORKFLOW: Workflow = fromSequences([DEFAULT_SEQUENCE], 0, 'default');

/** The sequence a keyword belongs to; without a keyword (or an unknown one) the file's primary sequence. */
export function sequenceFor(wf: Workflow, keyword: string | null): WorkflowDef {
  const seqs = wf.sequences;
  if (!seqs?.length) {
    // plain {open, done} object (older callers, tests)
    return { name: '', states: [...wf.open.map((n) => stateOf(n, false)), ...wf.done.map((n) => stateOf(n, true))] };
  }
  const own = keyword ? seqs.find((s) => s.states.some((x) => x.name === keyword)) : undefined;
  return own ?? seqs[Math.min(wf.primary ?? 0, seqs.length - 1)];
}
export const firstOpen = (s: WorkflowDef) => s.states.find((x) => !x.done)?.name ?? s.states[0]?.name ?? 'TODO';
/** Where a new task of this workflow starts: the chosen initial status, else the first open one. */
export const startOf = (s: WorkflowDef) => {
  const i = s.initial ? s.states.find((x) => x.name === s.initial && !x.done) : undefined;
  return i ? i.name : firstOpen(s);
};
export const firstDone = (s: WorkflowDef) => s.states.find((x) => x.done)?.name ?? null;

const stripKey = (w: string) => w.replace(/\(.*\)$/, '');

/** `#+TODO:` lines of a file, one sequence per line. */
export function parseFileSequences(text: string): WorkflowDef[] {
  const out: WorkflowDef[] = [];
  for (const m of text.matchAll(/^#\+(?:SEQ_|TYP_)?TODO:\s*(.+)$/gm)) {
    const [a, b] = m[1].split('|');
    const left = a.trim().split(/\s+/).filter(Boolean);
    const right = b === undefined ? [] : b.trim().split(/\s+/).filter(Boolean);
    const states: WorkflowState[] = [];
    if (b === undefined) {
      // no bar: the last word is the done state
      const last = left.pop();
      left.forEach((w) => states.push(stateOf(stripKey(w), false)));
      if (last) states.push(stateOf(stripKey(last), true));
    } else {
      left.forEach((w) => states.push(stateOf(stripKey(w), false)));
      right.forEach((w) => states.push(stateOf(stripKey(w), true)));
    }
    if (states.length) out.push({ name: `#+TODO ${out.length + 1}`, states });
  }
  return out;
}

/** Statuses declared in the file itself only; DEFAULT_WORKFLOW when there are none. */
export function parseWorkflow(text: string): Workflow {
  const seqs = parseFileSequences(text);
  return seqs.length ? fromSequences(seqs, 0, 'file') : DEFAULT_WORKFLOW;
}

/**
 * Statuses that apply to one file. Precedence: `#+TODO:` in the file, then the project's workflows
 * (the first one is where a heading without a status starts), then the built-in default.
 */
export function resolveWorkflow(text: string, _relPath: string, cfg: ProjectConfig): Workflow {
  const own = parseFileSequences(text);
  let wf: Workflow;
  if (own.length) wf = fromSequences(own, 0, 'file');
  else if (!cfg.workflows.length) wf = DEFAULT_WORKFLOW;
  else wf = fromSequences(cfg.workflows, 0, 'project');
  // behaviour is a project setting and applies whichever statuses are in effect
  const b = cfg.behavior ?? DEFAULT_BEHAVIOR;
  return b === DEFAULT_BEHAVIOR || (b.closed === DEFAULT_BEHAVIOR.closed && b.logbook === DEFAULT_BEHAVIOR.logbook) ? wf : { ...wf, behavior: b };
}

const KEYWORD = /^[^\s()|:]+$/;

/** Reads `.orgnotes/config.json`. Never throws: problems become warnings and the offending part is skipped. */
export function parseProjectConfig(json: string): { config: ProjectConfig; warnings: string[] } {
  const warnings: string[] = [];
  let raw: any;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { config: EMPTY_CONFIG, warnings: ['config.json: ' + String(e)] };
  }
  const workflows: WorkflowDef[] = [];
  for (const w of Array.isArray(raw?.workflows) ? raw.workflows : []) {
    const name = typeof w?.name === 'string' ? w.name.trim() : '';
    if (!name) {
      warnings.push('workflow без имени пропущен');
      continue;
    }
    const states: WorkflowState[] = [];
    for (const st of Array.isArray(w.states) ? w.states : []) {
      // status names are Org keywords: no spaces, so "IN PROGRESS" becomes "IN-PROGRESS"
      const n = typeof st?.name === 'string' ? st.name.trim().replace(/\s+/g, '-') : '';
      if (!KEYWORD.test(n)) {
        warnings.push(`${name}: недопустимое имя статуса «${st?.name}»`);
        continue;
      }
      if (states.some((x) => x.name === n)) continue;
      // Org cannot tell which sequence to cycle a repeated keyword in, so a status belongs to one workflow only
      const owner = workflows.find((x) => x.states.some((y) => y.name === n));
      if (owner) {
        warnings.push(`статус ${n} уже есть в workflow «${owner.name}», в «${name}» он пропущен`);
        continue;
      }
      states.push({
        name: n,
        done: st.done === true,
        key: typeof st.key === 'string' && st.key.length === 1 ? st.key : undefined,
        color: isColor(st.color) ? st.color : undefined,
      });
    }
    if (!states.length) {
      warnings.push(`workflow «${name}» без статусов пропущен`);
      continue;
    }
    if (workflows.some((x) => x.name === name)) {
      warnings.push(`workflow «${name}» объявлен дважды, второй пропущен`);
      continue;
    }
    const def: WorkflowDef = { name, states };
    const initial = typeof w.initial === 'string' ? w.initial.trim().replace(/\s+/g, '-') : '';
    if (initial) {
      if (states.some((x) => x.name === initial && !x.done)) def.initial = initial;
      else warnings.push(`${name}: «${w.initial}» не подходит как состояние новой задачи`);
    }
    workflows.push(def);
  }
  const bh = raw?.behavior ?? {};
  const behavior: WorkflowBehavior = {
    closed: typeof bh.closedTimestamp === 'boolean' ? bh.closedTimestamp : DEFAULT_BEHAVIOR.closed,
    logbook: typeof bh.logbook === 'boolean' ? bh.logbook : DEFAULT_BEHAVIOR.logbook,
  };
  return { config: { workflows, behavior }, warnings };
}

const TS = /<(\d{4})-(\d{2})-(\d{2})(?:\s+[^\s\d>]+)?(?:\s+(\d{2}:\d{2}))?(?:\s+([.+]{1,2}\d+[hdwmy]))?[^>]*>/;
const TS_INACTIVE = /\[(\d{4})-(\d{2})-(\d{2})(?:\s+[^\s\d\]]+)?(?:\s+(\d{2}:\d{2}))?[^\]]*\]/;

function toDate(m: RegExpMatchArray | null): OrgDate | undefined {
  if (!m) return undefined;
  return { y: +m[1], m: +m[2], d: +m[3], time: m[4], repeater: m[5] };
}

/** 0-based indices of real heading lines; `* foo` inside #+BEGIN_…/#+END_… blocks is plain text. */
/** A drawer's first line (`:PROPERTIES:`, `:LOGBOOK:`, `:NOTES:` …) and its `:END:` line, 0-based. */
export interface DrawerRange {
  start: number;
  end: number;
}
const DRAWER_OPEN = /^\s*:([A-Za-z0-9_-]+):\s*$/;
const DRAWER_END = /^\s*:END:\s*$/i;
/**
 * The drawers of a text: from a line that is only `:NAME:` to the nearest `:END:`. One that reaches a heading or
 * the end of the file first is not a drawer (plain text). Not inside #+BEGIN_…/#+END_… blocks, like headings.
 */
export function drawerRanges(lines: string[]): DrawerRange[] {
  const heads = headingLines(lines);
  const out: DrawerRange[] = [];
  let block: RegExp | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (block) {
      if (block.test(l)) block = null;
      continue;
    }
    const b = /^\s*#\+BEGIN_(\w+)/i.exec(l);
    if (b) {
      block = new RegExp(`^\\s*#\\+END_${b[1]}\\b`, 'i');
      continue;
    }
    if (heads.has(i) || DRAWER_END.test(l) || !DRAWER_OPEN.test(l)) continue;
    for (let j = i + 1; j < lines.length && !heads.has(j); j++) {
      if (DRAWER_END.test(lines[j])) {
        out.push({ start: i, end: j });
        i = j;
        break;
      }
    }
  }
  return out;
}

export function headingLines(lines: Iterable<string>): Set<number> {
  const out = new Set<number>();
  let block: RegExp | null = null;
  let i = 0;
  for (const l of lines) {
    if (block) {
      if (block.test(l)) block = null;
    } else {
      const b = /^\s*#\+BEGIN_(\w+)/i.exec(l);
      if (b) block = new RegExp(`^\\s*#\\+END_${b[1]}\\b`, 'i');
      else if (/^\*+\s/.test(l)) out.add(i);
    }
    i++;
  }
  return out;
}

export function parseHeadings(text: string, wf: Workflow): Heading[] {
  const lines = text.split('\n');
  const real = headingLines(lines);
  const kws = new Set([...wf.open, ...wf.done]);
  const out: Heading[] = [];
  const stack: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!real.has(i)) continue;
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
    // the heading's own text only: stop at the next heading of any level (child headings have their own)
    const ownEnd = out[k + 1]?.line ?? lines.length;
    const body = lines.slice(h.line + 1, Math.min(ownEnd, h.line + 12));
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
    // property drawer: first :PROPERTIES: ... :END: right below the heading/planning line
    const start = body.findIndex((l) => /^\s*:PROPERTIES:\s*$/i.test(l));
    if (start >= 0 && start <= 1) {
      for (let j = start + 1; j < body.length && !/^\s*:END:\s*$/i.test(body[j]); j++) {
        const pm = /^\s*:([^\s:]+):\s*(.*)$/.exec(body[j]);
        if (!pm) continue;
        const key = pm[1].toUpperCase();
        if (key === 'EFFORT') h.effort = pm[2].trim();
        else if (key === 'ID') h.id = pm[2].trim();
        else if (key === 'CUSTOM_ID') h.customId = pm[2].trim();
      }
    }
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

const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function addUnit(d: Date, n: number, unit: string): Date {
  const r = new Date(d);
  if (unit === 'h') r.setHours(r.getHours() + n);
  else if (unit === 'd') r.setDate(r.getDate() + n);
  else if (unit === 'w') r.setDate(r.getDate() + 7 * n);
  else {
    // months/years: clamp to the end of a shorter month instead of overflowing
    const day = r.getDate();
    r.setDate(1);
    if (unit === 'm') r.setMonth(r.getMonth() + n);
    else r.setFullYear(r.getFullYear() + n);
    r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  }
  return r;
}

/**
 * Next occurrence of a repeating active timestamp, as Org does when the task is completed:
 * `+1w` shifts once, `++1w` until it is in the future, `.+1w` counts from now.
 * Returns null when the timestamp has no (valid) repeater.
 */
export function shiftTimestamp(ts: string, now: Date): string | null {
  const m = /^<(\d{4})-(\d{2})-(\d{2})((?:\s+[^\s\d>]+)?)((?:\s+\d{2}:\d{2}(?:-\d{2}:\d{2})?)?)\s+(\+\+|\.\+|\+)(\d+)([hdwmy])((?:\s+-{1,2}\d+[hdwmy])?)>$/.exec(ts);
  if (!m) return null;
  const [, y, mo, d, wk, time, kind, nStr, unit, warn] = m;
  const n = +nStr;
  if (n <= 0) return null;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const hm = /(\d{2}):(\d{2})/.exec(time);
  const at = (x: Date) => (hm ? new Date(x.getFullYear(), x.getMonth(), x.getDate(), +hm[1], +hm[2]) : x);
  let date = new Date(+y, +mo - 1, +d);
  if (kind === '+') date = addUnit(date, n, unit);
  else if (kind === '++') {
    const limit = hm ? now : startOfDay(now);
    do date = addUnit(date, n, unit);
    while (at(date) <= limit);
  } else date = addUnit(startOfDay(now), n, unit);
  const ru = WD_RU.includes(wk.trim());
  const name = wk ? ' ' + (ru ? WD_RU : WD_EN)[date.getDay()] : '';
  const pad2 = (v: number) => String(v).padStart(2, '0');
  return `<${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}${name}${time} ${kind}${n}${unit}${warn}>`;
}

/** Set (or add) a property in the heading's :PROPERTIES: drawer, creating the drawer if needed. */
function setProperty(lines: string[], h: Heading, key: string, value: string) {
  let i = h.line + 1;
  if (/^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(lines[i] ?? '')) i++;
  if (/^\s*:PROPERTIES:\s*$/i.test(lines[i] ?? '')) {
    let j = i + 1;
    for (; j < lines.length && !/^\s*:END:\s*$/i.test(lines[j]); j++) {
      const m = new RegExp(`^(\\s*:${key}:)\\s*.*$`, 'i').exec(lines[j]);
      if (m) {
        lines[j] = `${m[1]} ${value}`;
        return;
      }
    }
    lines.splice(j, 0, `:${key}: ${value}`);
  } else {
    lines.splice(i, 0, ':PROPERTIES:', `:${key}: ${value}`, ':END:');
  }
}

/** Add a `- State "NEW" from "OLD" [stamp]` entry on top of the heading's :LOGBOOK: drawer, creating it if needed. */
function logState(lines: string[], h: Heading, to: string, from: string | null, now: Date) {
  const q = (w: string) => `"${w}"`.padEnd(12);
  const entry = `- State ${q(to)} from ${q(from ?? '')} ${inactiveStamp(now)}`;
  let i = h.line + 1;
  if (/^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(lines[i] ?? '')) i++;
  if (/^\s*:PROPERTIES:\s*$/i.test(lines[i] ?? '')) {
    while (i < lines.length && !/^\s*:END:\s*$/i.test(lines[i])) i++;
    i++;
  }
  if (/^\s*:LOGBOOK:\s*$/i.test(lines[i] ?? '')) lines.splice(i + 1, 0, entry);
  else lines.splice(i, 0, ':LOGBOOK:', entry, ':END:');
}

/** Change (or remove) the TODO keyword of one heading. Maintains CLOSED: and repeaters like Org does. */
export function setKeyword(text: string, h: Heading, keyword: string | null, wf: Workflow, now = new Date()): string {
  const lines = text.split('\n');
  const m = /^(\*+\s+)(.*)$/.exec(lines[h.line]);
  if (!m) return text;
  let rest = m[2];
  if (h.keyword && rest.startsWith(h.keyword)) rest = rest.slice(h.keyword.length).replace(/^\s+/, '');
  const write = (kw: string | null) => (lines[h.line] = m[1] + (kw ? kw + ' ' : '') + rest);

  // Completing a repeating task: move the date forward and go back to the first open state.
  if (keyword !== null && wf.done.includes(keyword) && /^\s*(SCHEDULED|DEADLINE):/.test(lines[h.line + 1] ?? '')) {
    let shifted = false;
    lines[h.line + 1] = lines[h.line + 1].replace(/(SCHEDULED|DEADLINE):(\s*)(<[^>]*>)/g, (all, k: string, sp: string, ts: string) => {
      const next = shiftTimestamp(ts, now);
      if (!next) return all;
      shifted = true;
      return `${k}:${sp}${next}`;
    });
    if (shifted) {
      write(startOf(sequenceFor(wf, h.keyword)));
      setProperty(lines, h, 'LAST_REPEAT', inactiveStamp(now));
      if (wf.behavior?.logbook) logState(lines, h, keyword, h.keyword, now);
      return lines.join('\n');
    }
  }

  write(keyword);

  const next = lines[h.line + 1] ?? '';
  const hasPlanning = /^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(next);
  const isDone = keyword !== null && wf.done.includes(keyword);
  const stripClosed = (s: string) => s.replace(/CLOSED:\s*\[[^\]]*\]\s*/, '').replace(/\s+$/, '');

  const writeClosed = wf.behavior?.closed ?? DEFAULT_BEHAVIOR.closed;
  if (isDone && writeClosed && !(hasPlanning && /CLOSED:/.test(next))) {
    const stamp = `CLOSED: ${inactiveStamp(now)}`;
    if (hasPlanning) lines[h.line + 1] = next.replace(/^(\s*)/, `$1${stamp} `);
    else lines.splice(h.line + 1, 0, stamp);
  } else if (!isDone && hasPlanning && /CLOSED:/.test(next)) {
    const cleaned = stripClosed(next);
    if (/^\s*$/.test(cleaned)) lines.splice(h.line + 1, 1);
    else lines[h.line + 1] = cleaned;
  }
  if (wf.behavior?.logbook && keyword !== null && keyword !== h.keyword) logState(lines, h, keyword, h.keyword, now);
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

const DEFAULT_COLOR: Record<string, string> = { TODO: 'red', NEXT: 'blue', WAIT: 'orange', DONE: 'green', CANCELLED: 'gray' };

/** Colour of a status in both themes: its own colour, else by well-known name, else by open/done. */
export function toneFor(kw: string, wf: Workflow): Tone {
  const st = wf.sequences?.flatMap((s) => s.states).find((x) => x.name === kw);
  const t = toneOf(st?.color) ?? toneOf(DEFAULT_COLOR[kw]) ?? toneOf(wf.done.includes(kw) ? 'green' : 'red')!;
  return t;
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

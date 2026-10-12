// Structure editing in the spirit of Org's M-RET, M-left/right, M-up/down, S-up/down.
// Pure functions: text + caret offset in, text edits + new caret out. The editor applies them as one
// transaction, so one ⌘Z undoes one command.
import { headingLines, parseHeadings, sequenceFor, setKeyword, setPriority, startOf, type Workflow, type WorkflowDef } from './org';

export interface Edit {
  from: number;
  to: number;
  insert: string;
}
export interface Result {
  changes: Edit[];
  caret: number; // caret offset in the *new* document
}

interface Ctx {
  text: string;
  lines: string[];
  starts: number[]; // offset of each line start
  real: Set<number>; // real heading lines (not inside #+BEGIN blocks)
  n: number; // number of real lines (a trailing "\n" does not make an extra line)
}

function ctx(text: string): Ctx {
  const lines = text.split('\n');
  const starts: number[] = [];
  let o = 0;
  for (const l of lines) {
    starts.push(o);
    o += l.length + 1;
  }
  const n = text.endsWith('\n') ? lines.length - 1 : lines.length;
  return { text, lines, starts, real: headingLines(lines), n };
}

const levelOf = (c: Ctx, i: number) => /^\*+/.exec(c.lines[i])![0].length;

function lineAt(c: Ctx, caret: number): number {
  let lo = 0;
  let hi = c.lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (c.starts[mid] <= caret) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The heading a line belongs to: the nearest heading line at or above it. */
function currentHeading(c: Ctx, line: number): number {
  for (let i = Math.min(line, c.lines.length - 1); i >= 0; i--) if (c.real.has(i)) return i;
  return -1;
}

/** First line after the subtree rooted at heading line `h`. */
function subtreeEnd(c: Ctx, h: number): number {
  const L = levelOf(c, h);
  for (let i = h + 1; i < c.n; i++) if (c.real.has(i) && levelOf(c, i) <= L) return i;
  return c.n;
}

export const isHeadingLine = (text: string, caret: number): boolean => {
  const c = ctx(text);
  return c.real.has(lineAt(c, caret));
};

// ---- M-RET ---------------------------------------------------------------------

/**
 * New heading at the level of the current one (level 1 before the first heading).
 *  - on a blank line: that line becomes the heading
 *  - at the start of a heading line: a new heading above it
 *  - at the end of a folded heading: after its whole subtree
 *  - otherwise: at the caret (the rest of the line becomes the new title)
 */
export function insertHeading(text: string, caret: number, opts: { todo?: string; folded?: boolean } = {}): Result {
  const c = ctx(text);
  const ln = lineAt(c, caret);
  const h = currentHeading(c, ln);
  const level = h >= 0 ? levelOf(c, h) : 1;
  const prefix = '*'.repeat(level) + ' ' + (opts.todo ? opts.todo + ' ' : '');
  const line = c.lines[ln];
  const start = c.starts[ln];
  const col = caret - start;
  const isHead = c.real.has(ln);

  if (line.trim() === '') {
    return { changes: [{ from: start, to: start + line.length, insert: prefix }], caret: start + prefix.length };
  }
  if (isHead && col === 0) {
    return { changes: [{ from: start, to: start, insert: prefix + '\n' }], caret: start + prefix.length };
  }
  if (isHead && opts.folded && col >= line.length) {
    const end = subtreeEnd(c, ln);
    if (end < c.n) {
      const at = c.starts[end];
      return { changes: [{ from: at, to: at, insert: prefix + '\n' }], caret: at + prefix.length };
    }
    // subtree runs to the end of the file
    const hasNl = text.endsWith('\n');
    const at = text.length;
    return hasNl
      ? { changes: [{ from: at, to: at, insert: prefix + '\n' }], caret: at + prefix.length }
      : { changes: [{ from: at, to: at, insert: '\n' + prefix }], caret: at + 1 + prefix.length };
  }
  return { changes: [{ from: caret, to: caret, insert: '\n' + prefix }], caret: caret + 1 + prefix.length };
}

// ---- M-left / M-right: the heading alone; M-S-left / M-S-right: with its subtree ----------

/** Promote (delta -1) or demote (+1) the heading under the caret together with everything below it. */
export function shiftSubtree(text: string, caret: number, delta: -1 | 1): Result | null {
  const c = ctx(text);
  const ln = lineAt(c, caret);
  if (!c.real.has(ln)) return null;
  if (delta < 0 && levelOf(c, ln) === 1) return null;
  const end = subtreeEnd(c, ln);
  const changes: Edit[] = [];
  for (let i = ln; i < end; i++) {
    if (!c.real.has(i)) continue;
    const s = c.starts[i];
    changes.push(delta > 0 ? { from: s, to: s, insert: '*' } : { from: s, to: s + 1, insert: '' });
  }
  return { changes, caret: Math.max(c.starts[ln], caret + delta) };
}

/** Promote (-1) or demote (+1) only the heading under the caret, as org-do-promote: what is below it stays. */
export function shiftHeading(text: string, caret: number, delta: -1 | 1): Result | null {
  const c = ctx(text);
  const ln = lineAt(c, caret);
  if (!c.real.has(ln)) return null;
  if (delta < 0 && levelOf(c, ln) === 1) return null;
  const s = c.starts[ln];
  return { changes: [delta > 0 ? { from: s, to: s, insert: '*' } : { from: s, to: s + 1, insert: '' }], caret: Math.max(s, caret + delta) };
}

// ---- M-up / M-down --------------------------------------------------------------

/** Swap the heading's subtree with the previous (-1) or next (+1) sibling of the same level. */
export function moveSubtree(text: string, caret: number, dir: -1 | 1): Result | null {
  const c = ctx(text);
  const ln = lineAt(c, caret);
  if (!c.real.has(ln)) return null;
  const L = levelOf(c, ln);
  const end = subtreeEnd(c, ln);

  let a0: number; // first line of the region, then [a0,mid) comes first now and [mid,b1) second
  let mid: number;
  let b1: number;
  if (dir < 0) {
    let s = -1;
    for (let i = ln - 1; i >= 0; i--) {
      if (!c.real.has(i)) continue;
      const li = levelOf(c, i);
      if (li < L) return null; // reached the parent: no previous sibling
      if (li === L) {
        s = i;
        break;
      }
    }
    if (s < 0) return null;
    a0 = s;
    mid = ln;
    b1 = end;
  } else {
    if (end >= c.n || !c.real.has(end) || levelOf(c, end) !== L) return null;
    a0 = ln;
    mid = end;
    b1 = subtreeEnd(c, end);
  }
  const first = c.lines.slice(a0, mid);
  const second = c.lines.slice(mid, b1);
  const joined = [...second, ...first].join('\n');
  const from = c.starts[a0];
  const to = c.starts[b1 - 1] + c.lines[b1 - 1].length;
  // the moved heading's block starts where? (it is `first` when moving down, `second` when moving up)
  const off = caret - c.starts[ln];
  const newStart = dir < 0 ? from : from + second.join('\n').length + 1;
  return { changes: [{ from, to, insert: joined }], caret: newStart + off };
}

// ---- S-up / S-down --------------------------------------------------------------

const RING = ['A', 'B', 'C'];

/**
 * Org-like priority cycling: no priority starts at the default B; up goes towards A and wraps to C,
 * down goes towards C and wraps to A.
 */
export function cyclePriority(text: string, caret: number, dir: 'up' | 'down', wf: Workflow): Result | null {
  const c = ctx(text);
  const ln = lineAt(c, caret);
  if (!c.real.has(ln)) return null;
  const h = parseHeadings(text, wf).find((x) => x.line === ln);
  if (!h) return null;
  const cur = h.priority ? RING.indexOf(h.priority) : -1;
  const next = cur < 0 ? 'B' : RING[(cur + (dir === 'up' ? -1 : 1) + RING.length) % RING.length];
  const updated = setPriority(text, h, next).split('\n')[ln];
  const old = c.lines[ln];
  // where the priority cookie sits: after the stars and the keyword
  let p = /^\*+\s+/.exec(old)![0].length;
  if (h.keyword && old.startsWith(h.keyword, p)) p += h.keyword.length + (old[p + h.keyword.length] === ' ' ? 1 : 0);
  const delta = updated.length - old.length;
  const start = c.starts[ln];
  const col = caret - start;
  return {
    changes: [{ from: start, to: start + old.length, insert: updated }],
    caret: start + (col > p ? col + delta : col),
  };
}

// ---- S-Tab: global visibility cycle ----------------------------------------------

/**
 * Heading lines that must be folded in cycle state `state`: 0 folds everything (only top-level headings
 * stay visible), k unfolds levels up to k, `max` unfolds all.
 */
export function foldTargets(text: string, state: number): { lines: number[]; max: number } {
  const c = ctx(text);
  const heads = [...c.real].filter((i) => i < c.n).sort((a, b) => a - b);
  const max = heads.reduce((m, i) => Math.max(m, levelOf(c, i)), 0);
  return { lines: heads.filter((i) => levelOf(c, i) > state), max };
}

export const nextCycleState = (current: number | undefined, max: number) => ((current ?? max) + 1) % (max + 1);

/** First open state of the file's first workflow, for M-S-RET. */
export const newTaskState = (wf: Workflow) => startOf(sequenceFor(wf, null));

// ---- Shift+←/→ and Ctrl+Shift+←/→ : status and workflow rotation --------------------

const sequencesOf = (wf: Workflow): WorkflowDef[] => (wf.sequences?.length ? wf.sequences : [sequenceFor(wf, null)]);

/**
 * Shift+→ / Shift+←: the next / previous status inside the heading's own workflow.
 *  - no status: the first status of the first workflow (either direction)
 *  - → after the last status: the status is removed
 *  - ← on the first status of any workflow: the status is removed
 */
export function rotateStatus(wf: Workflow, keyword: string | null, dir: 'next' | 'prev'): string | null {
  const seqs = sequencesOf(wf);
  const seq = keyword ? seqs.find((s) => s.states.some((x) => x.name === keyword)) : undefined;
  if (!seq || !keyword) return startOf(seqs[0]);
  const i = seq.states.findIndex((x) => x.name === keyword);
  if (dir === 'next') return i + 1 < seq.states.length ? seq.states[i + 1].name : null;
  return i === 0 ? null : seq.states[i - 1].name;
}

/**
 * Ctrl+Shift+→ / Ctrl+Shift+←: jump to the first status of the next / previous workflow.
 *  - no status: the first status of the first workflow (either direction)
 *  - → from the last workflow, and ← from the first one: the status is removed
 */
export function rotateWorkflow(wf: Workflow, keyword: string | null, dir: 'next' | 'prev'): string | null {
  const seqs = sequencesOf(wf);
  const k = keyword ? seqs.findIndex((s) => s.states.some((x) => x.name === keyword)) : -1;
  if (k < 0) return startOf(seqs[0]);
  const to = dir === 'next' ? k + 1 : k - 1;
  return to >= 0 && to < seqs.length ? startOf(seqs[to]) : null;
}

/** Apply a status change to the heading on the caret's line (CLOSED, repeaters etc. as in setKeyword). */
export function changeStatusAt(
  text: string,
  caret: number,
  how: (wf: Workflow, keyword: string | null) => string | null,
  wf: Workflow,
  now = new Date(),
): Result | null {
  const c = ctx(text);
  const ln = lineAt(c, caret);
  if (!c.real.has(ln)) return null;
  const h = parseHeadings(text, wf).find((x) => x.line === ln);
  if (!h) return null;
  const updated = setKeyword(text, h, how(wf, h.keyword), wf, now);
  if (updated === text) return null;
  // one minimal edit (keyword on the heading line, and CLOSED / LAST_REPEAT lines below it)
  let a = 0;
  const max = Math.min(text.length, updated.length);
  while (a < max && text[a] === updated[a]) a++;
  let b = 0;
  while (b < max - a && text[text.length - 1 - b] === updated[updated.length - 1 - b]) b++;
  const from = a;
  const to = text.length - b;
  const insert = updated.slice(a, updated.length - b);
  // the caret stays on its heading line, after the keyword it was after before
  const oldLine = c.lines[ln];
  const newLine = updated.split('\n')[ln];
  const keywordAt = /^\*+\s+/.exec(oldLine)![0].length;
  const col = caret - c.starts[ln];
  const next = c.starts[ln] + (col >= keywordAt ? col + (newLine.length - oldLine.length) : col);
  return { changes: [{ from, to, insert }], caret: next };
}

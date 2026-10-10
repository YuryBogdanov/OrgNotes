// Draft model behind Settings → Статусы: editing workflows without touching the live config until it is valid.
import { DEFAULT_BEHAVIOR, DEFAULT_SEQUENCE, type ProjectConfig, type WorkflowBehavior } from './org';

export interface DraftState {
  id: string;
  keyword: string; // exactly as written in a file: upper case, "-" instead of spaces
  done: boolean;
  key: string; // an explicit quick-key from a hand-written config, '' = derived from the keyword
  color: string; // a palette id, a #rrggbb hex, or '' (automatic)
  pending?: boolean; // a row just added with "+ Состояние" that has not been confirmed yet
}
export interface DraftWorkflow {
  id: string;
  name: string;
  initialId?: string; // the state a new task gets; an open one, default: the first open state
  states: DraftState[]; // invariant: open states first, then done ones
}
export interface Draft {
  workflows: DraftWorkflow[];
  behavior: WorkflowBehavior;
}
export interface Problem {
  workflow?: string; // draft ids
  state?: string;
  message: string;
}

export const MAX_KEYWORD = 24;

let counter = 0;
const uid = () => `d${++counter}`;

// ---- keywords -----------------------------------------------------------------------

/** What the user typed, as it goes into a file: trimmed, upper case, spaces become dashes. */
export const normalizeKeyword = (raw: string) => raw.trim().toLocaleUpperCase('ru').replace(/\s+/g, '-');

/** The human name of a status: derived from the keyword, never edited by hand. */
export const displayName = (keyword: string) => keyword.replace(/-/g, ' ');

/** Rules that depend on the word alone. null = fine. */
export function keywordProblem(keyword: string): string | null {
  if (!keyword) return 'Введите ключевое слово';
  if ([...keyword].length > MAX_KEYWORD) return `Не длиннее ${MAX_KEYWORD} символов`;
  if (/[()|@!/]/.test(keyword)) return 'Нельзя использовать ( ) | @ ! /: они значимы в синтаксисе #+TODO:';
  if (!/^[\p{L}\p{N}_-]+$/u.test(keyword)) return 'Допустимы буквы, цифры, дефис и подчёркивание';
  return null;
}

/** Name of the workflow that already uses `keyword` (other than the state `except`), else null. */
export function keywordOwner(d: Draft, keyword: string, except?: string): string | null {
  for (const w of d.workflows) {
    for (const s of w.states) {
      if (s.id !== except && !s.pending && s.keyword === keyword) return w.name.trim() || '…';
    }
  }
  return null;
}

/** All problems with a word being entered for state `id`, in the order the user should see them. */
export function checkKeyword(d: Draft, keyword: string, id: string): string | null {
  const own = keywordProblem(keyword);
  if (own) return own;
  const owner = keywordOwner(d, keyword, id);
  return owner ? `Такое слово уже есть в наборе «${owner}»` : null;
}

// ---- quick keys ----------------------------------------------------------------------

/**
 * The key letter of every state: an explicit one if the config has it, else the first letter of the word,
 * or the next free letter of the word when that one is taken by another state of the set.
 */
export function effectiveKeys(w: DraftWorkflow): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const s of w.states) {
    if (s.key && !s.pending) {
      out.set(s.id, s.key);
      used.add(s.key.toLowerCase());
    }
  }
  for (const s of w.states) {
    if (out.has(s.id)) continue;
    let key = '';
    for (const ch of s.keyword.toLocaleLowerCase('ru')) {
      if (/\p{L}/u.test(ch) && !used.has(ch)) {
        key = ch;
        break;
      }
    }
    if (key) used.add(key);
    out.set(s.id, key);
  }
  return out;
}

/** What may be typed into the quick-key field: one letter or digit. */
export const normalizeKey = (raw: string) => [...raw.trim().toLocaleLowerCase('ru')].slice(-1).join('');

/**
 * Problems with a quick-key being entered for state `id` (null = fine). Only another state's *explicit* key
 * clashes: automatic keys step aside to the next free letter.
 */
export function checkKey(w: DraftWorkflow, key: string, id: string): string | null {
  if (!key) return null; // empty = automatic
  if (!/^[\p{L}\p{N}]$/u.test(key)) return 'Клавиша — одна буква или цифра';
  const other = w.states.find((s) => s.id !== id && !s.pending && s.key.toLowerCase() === key);
  return other ? `Клавиша «${key}» уже занята статусом ${other.keyword}` : null;
}

// ---- building a draft -----------------------------------------------------------------

function normalize(w: DraftWorkflow) {
  // stable partition: open first, done after
  w.states = [...w.states.filter((s) => !s.done), ...w.states.filter((s) => s.done)];
}

export function fromConfig(cfg: ProjectConfig): Draft {
  const source = cfg.workflows.length ? cfg.workflows : [DEFAULT_SEQUENCE];
  const workflows = source.map((w) => {
    const states: DraftState[] = w.states.map((s) => ({
      id: uid(),
      keyword: s.name,
      done: s.done,
      key: s.key ?? '',
      color: s.color ?? '',
    }));
    const d: DraftWorkflow = { id: uid(), name: w.name, states };
    const init = w.initial ? states.find((s) => s.keyword === w.initial && !s.done) : undefined;
    if (init) d.initialId = init.id;
    normalize(d);
    return d;
  });
  return { workflows, behavior: { ...(cfg.behavior ?? DEFAULT_BEHAVIOR) } };
}

export const initialOf = (w: DraftWorkflow): DraftState | undefined =>
  w.states.find((s) => s.id === w.initialId && !s.done && !s.pending) ?? w.states.find((s) => !s.done && !s.pending);

// ---- operations ------------------------------------------------------------------------

const allKeywords = (d: Draft) => new Set(d.workflows.flatMap((w) => w.states.filter((s) => !s.pending).map((s) => s.keyword)));

function freshName(d: Draft, base: string): string {
  const taken = allKeywords(d);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function addWorkflow(d: Draft): DraftWorkflow {
  let n = d.workflows.length + 1;
  const names = new Set(d.workflows.map((w) => w.name));
  while (names.has(`Набор ${n}`)) n++;
  const w: DraftWorkflow = {
    id: uid(),
    name: `Набор ${n}`,
    states: [
      { id: uid(), keyword: freshName(d, 'NEW'), done: false, key: '', color: 'gray' },
      { id: uid(), keyword: freshName(d, 'DONE'), done: true, key: '', color: 'green' },
    ],
  };
  d.workflows.push(w);
  return w;
}

export const canRemoveWorkflow = (d: Draft) => d.workflows.length > 1;

export function removeWorkflow(d: Draft, id: string) {
  if (!canRemoveWorkflow(d)) return;
  d.workflows = d.workflows.filter((w) => w.id !== id);
}

/** Drop workflow `id` before `beforeId`, or at the end for null. */
export function dropWorkflow(d: Draft, id: string, beforeId: string | null) {
  const w = d.workflows.find((x) => x.id === id);
  if (!w || beforeId === id) return;
  d.workflows = d.workflows.filter((x) => x.id !== id);
  const at = beforeId ? d.workflows.findIndex((x) => x.id === beforeId) : -1;
  d.workflows.splice(at < 0 ? d.workflows.length : at, 0, w);
}

export const pendingState = (d: Draft) => {
  for (const w of d.workflows) {
    const s = w.states.find((x) => x.pending);
    if (s) return { workflow: w, state: s };
  }
  return null;
};

/** "+ Состояние": an empty grey row at the end of the open block, waiting for its keyword. */
export function addState(d: Draft, w: DraftWorkflow, done = false): DraftState {
  const existing = pendingState(d);
  if (existing && existing.workflow.id === w.id) return existing.state; // never a second empty row
  if (existing) removeState(existing.workflow, existing.state.id);
  const s: DraftState = { id: uid(), keyword: '', done, key: '', color: 'gray', pending: true };
  w.states.push(s);
  normalize(w);
  return s;
}

export const canRemoveState = (w: DraftWorkflow, id: string) => {
  const s = w.states.find((x) => x.id === id);
  if (!s) return false;
  if (s.pending || s.done) return true;
  return w.states.filter((x) => !x.done && !x.pending).length > 1; // the last open state stays
};

export function removeState(w: DraftWorkflow, id: string) {
  if (!canRemoveState(w, id)) return;
  w.states = w.states.filter((s) => s.id !== id);
  if (w.initialId === id) w.initialId = undefined; // falls back to the first open state
}

/** Move one step; crossing the open/done separator changes whether the state closes the task. */
export function moveState(w: DraftWorkflow, id: string, dir: -1 | 1) {
  const i = w.states.findIndex((s) => s.id === id);
  if (i < 0) return;
  const s = w.states[i];
  const open = w.states.filter((x) => !x.done);
  if (dir < 0 && s.done && w.states[i - 1] && !w.states[i - 1].done) {
    s.done = false; // first done state moves up over the separator
    return;
  }
  if (dir > 0 && !s.done && i === open.length - 1) {
    if (open.length === 1) return; // the last open state cannot become a closing one
    s.done = true; // last open state moves down over the separator
    if (w.initialId === s.id) w.initialId = undefined;
    return;
  }
  const j = i + dir;
  if (j < 0 || j >= w.states.length) return;
  [w.states[i], w.states[j]] = [w.states[j], w.states[i]];
}

/** Drop `id` before `beforeId`; `'separator'` makes it the first done state, `null` the last open one. */
export function dropState(w: DraftWorkflow, id: string, beforeId: string | 'separator' | null) {
  const s = w.states.find((x) => x.id === id);
  if (!s || beforeId === id) return;
  const wasOpen = !s.done;
  const others = w.states.filter((x) => x.id !== id);
  if (wasOpen && beforeId === 'separator' && !others.some((x) => !x.done)) return; // keep one open state
  w.states = others;
  if (beforeId === 'separator') {
    s.done = true;
    const at = w.states.findIndex((x) => x.done);
    w.states.splice(at < 0 ? w.states.length : at, 0, s);
  } else if (beforeId === null) {
    s.done = false;
    const at = w.states.findIndex((x) => x.done);
    w.states.splice(at < 0 ? w.states.length : at, 0, s);
  } else {
    const at = w.states.findIndex((x) => x.id === beforeId);
    s.done = w.states[at].done;
    w.states.splice(at, 0, s);
  }
  normalize(w);
  if (s.done && w.initialId === s.id) w.initialId = undefined;
}

// ---- validation ---------------------------------------------------------------------------

/** Problems of the whole draft; rows that are still being added are not part of it. */
export function validate(d: Draft): Problem[] {
  const out: Problem[] = [];
  const names = new Map<string, string>();
  const seen = new Map<string, string>(); // keyword -> workflow name
  for (const w of d.workflows) {
    const wn = w.name.trim();
    if (!wn) out.push({ workflow: w.id, message: 'У набора должно быть название' });
    else if (names.has(wn)) out.push({ workflow: w.id, message: `Набор «${wn}» уже есть` });
    names.set(wn, w.id);

    const real = w.states.filter((s) => !s.pending);
    if (!real.some((s) => !s.done)) out.push({ workflow: w.id, message: 'Нужно хотя бы одно незавершённое состояние' });
    // explicit quick keys (from a hand-written config or the editor) must be unique within the set
    const explicit = new Map<string, string>();
    for (const s of real) {
      if (!s.key) continue;
      const k = s.key.toLowerCase();
      if (explicit.has(k)) out.push({ workflow: w.id, state: s.id, message: `Клавиша «${s.key}» уже занята статусом ${explicit.get(k)}` });
      else explicit.set(k, s.keyword);
    }
    for (const s of real) {
      const own = keywordProblem(s.keyword);
      if (own) {
        out.push({ workflow: w.id, state: s.id, message: own });
        continue;
      }
      const owner = seen.get(s.keyword);
      if (owner !== undefined) out.push({ workflow: w.id, state: s.id, message: `Такое слово уже есть в наборе «${owner}»` });
      else seen.set(s.keyword, wn || '…');
    }
  }
  return out;
}

// ---- output ----------------------------------------------------------------------------------

/** `#+TODO:` line equivalent of a workflow, for people who also use Emacs. */
export function orgLine(w: DraftWorkflow): string {
  const keys = effectiveKeys(w);
  const real = w.states.filter((s) => !s.pending && s.keyword);
  const fmt = (s: DraftState) => s.keyword + (keys.get(s.id) ? `(${keys.get(s.id)})` : '');
  const open = real.filter((s) => !s.done).map(fmt);
  const done = real.filter((s) => s.done).map(fmt);
  return `#+TODO: ${open.join(' ')} |${done.length ? ' ' + done.join(' ') : ''}`;
}

/**
 * The config file text. Unknown top-level keys of the existing file are kept, so hand-added settings survive.
 */
export function toJson(existingRaw: string | null, d: Draft): string {
  let base: Record<string, unknown> = {};
  try {
    const parsed = existingRaw ? JSON.parse(existingRaw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) base = parsed as Record<string, unknown>;
  } catch {
    /* an unreadable file is replaced */
  }
  const { version, workflows: _w, behavior: oldBehavior, ...rest } = base as Record<string, unknown>;
  const out: Record<string, unknown> = { version: version ?? 1, ...rest };
  out.workflows = d.workflows.map((w) => {
    const real = w.states.filter((s) => !s.pending);
    const o: Record<string, unknown> = { name: w.name.trim() };
    const firstOpen = real.find((s) => !s.done);
    const init = w.initialId ? real.find((s) => s.id === w.initialId && !s.done) : undefined;
    if (init && init !== firstOpen) o.initial = init.keyword;
    o.states = real.map((s) => {
      const st: Record<string, unknown> = { name: s.keyword };
      if (s.done) st.done = true;
      if (s.key) st.key = s.key;
      if (s.color) st.color = s.color;
      return st;
    });
    return o;
  });
  const isDefault = d.behavior.closed === DEFAULT_BEHAVIOR.closed && d.behavior.logbook === DEFAULT_BEHAVIOR.logbook;
  if (!isDefault || oldBehavior !== undefined) out.behavior = { closedTimestamp: d.behavior.closed, logbook: d.behavior.logbook };
  return JSON.stringify(out, null, 2) + '\n';
}

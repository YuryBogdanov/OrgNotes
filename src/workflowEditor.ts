// Draft model behind Settings → Статусы: editing workflows without touching the live config until it is valid.
import { DEFAULT_BEHAVIOR, DEFAULT_SEQUENCE, type ProjectConfig, type WorkflowBehavior } from './org';

export const COLORS = ['gray', 'red', 'blue', 'orange', 'green', 'purple'] as const;

export interface DraftState {
  id: string;
  label: string; // as typed; spaces turn into "-" in the file
  done: boolean;
  key: string; // quick-select letter or ''
  color: string; // one of COLORS or '' (automatic)
}
export interface DraftWorkflow {
  id: string;
  name: string;
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

let counter = 0;
const uid = () => `d${++counter}`;

/** The keyword as it is written in a file. */
export const keywordOf = (label: string) => label.trim().replace(/\s+/g, '-');
const KEYWORD = /^[^\s()|:]+$/;

function normalize(w: DraftWorkflow) {
  // stable partition: open first, done after
  w.states = [...w.states.filter((s) => !s.done), ...w.states.filter((s) => s.done)];
}

export function fromConfig(cfg: ProjectConfig): Draft {
  const source = cfg.workflows.length ? cfg.workflows : [DEFAULT_SEQUENCE];
  const workflows = source.map((w) => {
    const d: DraftWorkflow = {
      id: uid(),
      name: w.name,
      states: w.states.map((s) => ({ id: uid(), label: s.name, done: s.done, key: s.key ?? '', color: s.color ?? '' })),
    };
    normalize(d);
    return d;
  });
  return { workflows, behavior: { ...(cfg.behavior ?? DEFAULT_BEHAVIOR) } };
}

// ---- operations ------------------------------------------------------------------

const allKeywords = (d: Draft) => new Set(d.workflows.flatMap((w) => w.states.map((s) => keywordOf(s.label))));

function freshName(d: Draft, base: string): string {
  const taken = allKeywords(d);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function addWorkflow(d: Draft): DraftWorkflow {
  const n = d.workflows.length + 1;
  const w: DraftWorkflow = {
    id: uid(),
    name: `Набор ${n}`,
    states: [
      { id: uid(), label: freshName(d, 'NEW'), done: false, key: '', color: '' },
      { id: uid(), label: freshName(d, 'DONE'), done: true, key: '', color: '' },
    ],
  };
  d.workflows.push(w);
  return w;
}

export function removeWorkflow(d: Draft, id: string) {
  d.workflows = d.workflows.filter((w) => w.id !== id);
}

export function moveWorkflow(d: Draft, id: string, dir: -1 | 1) {
  const i = d.workflows.findIndex((w) => w.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= d.workflows.length) return;
  [d.workflows[i], d.workflows[j]] = [d.workflows[j], d.workflows[i]];
}

export function addState(d: Draft, w: DraftWorkflow, done = false): DraftState {
  const s: DraftState = { id: uid(), label: freshName(d, done ? 'DONE' : 'STATE'), done, key: '', color: '' };
  w.states.push(s);
  normalize(w);
  return s;
}

export function removeState(w: DraftWorkflow, id: string) {
  w.states = w.states.filter((s) => s.id !== id);
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
    s.done = true; // last open state moves down over the separator
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
  w.states = w.states.filter((x) => x.id !== id);
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
}

// ---- validation -------------------------------------------------------------------

export function validate(d: Draft): Problem[] {
  const out: Problem[] = [];
  const names = new Map<string, string>();
  const owner = new Map<string, string>(); // keyword -> workflow name
  for (const w of d.workflows) {
    const wn = w.name.trim();
    if (!wn) out.push({ workflow: w.id, message: 'У набора должно быть название' });
    else if (names.has(wn)) out.push({ workflow: w.id, message: `Набор «${wn}» уже есть` });
    names.set(wn, w.id);

    if (!w.states.some((s) => !s.done)) out.push({ workflow: w.id, message: 'Нужно хотя бы одно незавершённое состояние' });
    const keys = new Map<string, string>();
    for (const s of w.states) {
      const kw = keywordOf(s.label);
      if (!kw) out.push({ workflow: w.id, state: s.id, message: 'Название состояния не может быть пустым' });
      else if (!KEYWORD.test(kw)) out.push({ workflow: w.id, state: s.id, message: 'Недопустимые символы: ( ) | :' });
      else if (owner.has(kw))
        out.push({ workflow: w.id, state: s.id, message: `«${kw}» уже есть в наборе «${owner.get(kw)}»: состояние принадлежит одному набору` });
      else owner.set(kw, wn || '…');
      if (s.key) {
        if ([...s.key].length !== 1) out.push({ workflow: w.id, state: s.id, message: 'Клавиша — одна буква' });
        else if (keys.has(s.key.toLowerCase())) out.push({ workflow: w.id, state: s.id, message: `Клавиша «${s.key}» уже занята` });
        keys.set(s.key.toLowerCase(), s.id);
      }
    }
  }
  return out;
}

// ---- output -----------------------------------------------------------------------

/** `#+TODO:` line equivalent of a workflow, for people who also use Emacs. */
export function orgLine(w: DraftWorkflow): string {
  const fmt = (s: DraftState) => keywordOf(s.label) + (s.key ? `(${s.key})` : '');
  const open = w.states.filter((s) => !s.done).map(fmt);
  const done = w.states.filter((s) => s.done).map(fmt);
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
  out.workflows = d.workflows.map((w) => ({
    name: w.name.trim(),
    states: w.states.map((s) => {
      const o: Record<string, unknown> = { name: keywordOf(s.label) };
      if (s.done) o.done = true;
      if (s.key) o.key = s.key;
      if (s.color) o.color = s.color;
      return o;
    }),
  }));
  const isDefault = d.behavior.closed === DEFAULT_BEHAVIOR.closed && d.behavior.logbook === DEFAULT_BEHAVIOR.logbook;
  if (!isDefault || oldBehavior !== undefined) out.behavior = { closedTimestamp: d.behavior.closed, logbook: d.behavior.logbook };
  return JSON.stringify(out, null, 2) + '\n';
}

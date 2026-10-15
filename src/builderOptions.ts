// What the agenda builder's pickers offer (tech sprint 4.2, from AgendaBuilder.svelte): the options of each kind of
// popover — fields, operators, statuses by set, tags, the folder as a tree, dates —, which of them is the current one,
// and a date typed in its form («ближайшие N дней…», «в диапазоне…»).

import { FIELDS, GROUPS, OPS, PRIORITIES, SORTS, inSources, statusKey, type Block, type Cond, type DateVal, type Field } from './agendas';
import { resolveWorkflow, toneFor, type ProjectConfig, type Workflow } from './org';
import { toneStyle } from './colors';
import { displayName } from './names';

export type Kind = 'add' | 'field' | 'op' | 'status' | 'date' | 'tag' | 'prio' | 'path' | 'sources' | 'group' | 'sort';
export type Opt = { id: string; label: string; head?: boolean; count?: string; tone?: string; depth?: number; dir?: boolean; hint?: string };
export type StatusSet = { name: string; states: { name: string; tone: string }[] };
export type TreeRow = { rel: string; dir: boolean; depth: number };

/** The popovers of a multiple choice: a click marks, the list stays open. */
export const MULTI: Kind[] = ['status', 'tag', 'path', 'sources'];
const norm = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е');
export const DATE_OPTS: { id: DateVal['kind'] | 'none'; label: string }[] = [
  { id: 'before', label: 'раньше сегодня' },
  { id: 'today', label: 'сегодня' },
  { id: 'tomorrow', label: 'завтра' },
  { id: 'next', label: 'ближайшие N дней…' },
  { id: 'range', label: 'в диапазоне…' },
  { id: 'none', label: 'не задано' },
];

/** The sets of statuses of the files the agenda reads (else the project's), each once, with the colour of each status. */
export function statusSets(files: readonly { name: string; wf: Workflow }[], sources: string[], config: ProjectConfig): StatusSet[] {
  const seen = new Map<string, StatusSet>();
  const add = (wf: Workflow) => {
    for (const s of wf.sequences ?? []) {
      if (!seen.has(s.name)) seen.set(s.name, { name: s.name, states: s.states.map((x) => ({ name: x.name, tone: toneStyle(toneFor(x.name, wf)) })) });
    }
  };
  for (const f of files) if (inSources(f.name, sources)) add(f.wf);
  if (!seen.size) add(resolveWorkflow('', '', config));
  return [...seen.values()];
}
/** Every tag of the files (theirs and their headings'), by name. */
export const allTagsOf = (files: readonly { filetags: string[]; headings: { tags: string[] }[] }[]) =>
  [...new Set(files.flatMap((f) => [...f.filetags, ...f.headings.flatMap((h) => h.tags)]))].sort((a, b) => a.localeCompare(b, 'ru'));

/** The notes folder as a tree: folders first, then files, each level by name. */
export function folderTree(folders: string[], files: string[]): TreeRow[] {
  const dirs = new Set(folders);
  const out: TreeRow[] = [];
  const children = (parent: string) => {
    const inside = (p: string) => (parent ? p.startsWith(parent + '/') && !p.slice(parent.length + 1).includes('/') : !p.includes('/'));
    const ds = [...dirs].filter(inside).sort((a, b) => a.localeCompare(b, 'ru'));
    const fs = files.filter(inside).sort((a, b) => a.localeCompare(b, 'ru'));
    const depth = parent ? parent.split('/').length : 0;
    for (const d of ds) {
      out.push({ rel: d, dir: true, depth });
      children(d);
    }
    for (const f of fs) out.push({ rel: f, dir: false, depth });
  };
  children('');
  return out;
}

/** The options of a popover; `field`: the condition's (for its operators), `filter`: what is typed in its field,
 *  `picked`: a multiple choice in progress. */
export function optionsFor(kind: Kind, field: Field | undefined, filter: string, picked: string[], d: { sets: StatusSet[]; tags: string[]; tree: TreeRow[] }): Opt[] {
  const q = norm(filter.trim());
  const ok = (s: string) => !q || norm(s).includes(q);
  switch (kind) {
    case 'add':
    case 'field':
      return FIELDS.map((f) => ({ id: f.id, label: f.label }));
    case 'op':
      return field ? OPS[field].map((o) => ({ id: o.id, label: o.label })) : [];
    case 'group':
      return GROUPS.map((g) => ({ id: g.id, label: g.label }));
    case 'sort':
      return SORTS.map((s) => ({ id: s.id, label: s.label }));
    case 'prio':
      return PRIORITIES.map((p) => ({ id: p, label: p }));
    case 'date':
      return DATE_OPTS.map((x) => ({ id: x.id, label: x.label }));
    case 'status': {
      const sets = d.sets;
      if (sets.length === 1) return sets[0].states.map((s) => ({ id: statusKey(sets[0].name, s.name), label: s.name, tone: s.tone }));
      const out: Opt[] = [];
      for (const set of sets) {
        const states = set.states.filter((s) => ok(s.name));
        if (!states.length) continue; // an empty group is hidden
        const n = set.states.filter((s) => picked.includes(statusKey(set.name, s.name))).length;
        out.push({ id: 'h:' + set.name, label: set.name.toLocaleUpperCase('ru'), head: true, count: `выбрано ${n} из ${set.states.length}` });
        for (const s of states) out.push({ id: statusKey(set.name, s.name), label: s.name, tone: s.tone });
      }
      return out;
    }
    case 'tag': {
      const out: Opt[] = [...new Set([...d.tags, ...picked])].filter(ok).map((t) => ({ id: t, label: t }));
      const typed = filter.trim().replace(/\s+/g, '_');
      if (typed && !out.some((o) => o.id === typed) && !/[:\s]/.test(typed)) out.push({ id: typed, label: `Добавить тег «${typed}»` });
      return out;
    }
    case 'path':
    case 'sources':
      return q
        ? d.tree.filter((t) => ok(t.rel)).map((t) => ({ id: t.rel, label: displayName(t.rel), dir: t.dir, depth: 0, hint: t.rel.includes('/') ? t.rel.slice(0, t.rel.lastIndexOf('/')) : '' }))
        : d.tree.map((t) => ({ id: t.rel, label: displayName(t.rel), dir: t.dir, depth: t.depth }));
  }
}

/** Is option `id` the current one (a single choice) or picked (a multiple one)? */
export function isChecked(kind: Kind, id: string, o: { multi: boolean; picked: string[]; cond?: Cond; block: Block }): boolean {
  if (o.multi) return o.picked.includes(id);
  const c = o.cond;
  switch (kind) {
    case 'field':
      return c?.field === id;
    case 'op':
      return c?.op === id;
    case 'group':
      return o.block.group === id;
    case 'sort':
      return o.block.sort === id;
    case 'prio':
      return c?.prio === id;
    case 'date':
      return c?.op === 'none' ? id === 'none' : c?.date?.kind === id;
  }
  return false;
}

/** The date of a form: «ближайшие N дней» (1…3650), or a range (its ends in order). Null: not filled in. */
export function dateOfForm(form: 'next' | 'range', n: string, from: string, to: string): DateVal | null {
  if (form === 'next') {
    const k = parseInt(n, 10);
    return k >= 1 ? { kind: 'next', n: Math.min(k, 3650) } : null;
  }
  if (!from || !to) return null;
  const [a, b] = from <= to ? [from, to] : [to, from];
  return { kind: 'range', from: a, to: b };
}

/** The popover that asks for a condition's value. */
export const valueKind = (f: Field): Kind => (f === 'scheduled' || f === 'deadline' ? 'date' : f === 'priority' ? 'prio' : (f as Kind));

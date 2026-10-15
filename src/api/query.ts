// `index.query` (tech sprint 3.1, from the host): the agenda's engine on a plugin's query.

import { store } from '../store.svelte';
import { runAgenda, statusKey, type Agenda, type Cond as CoreCond } from '../agendas';
import { DEFAULT_SEQUENCE } from '../org';
import type { HeadingInfo, Query } from './index';
import { fileOf, infoOf } from './refs';

/** The agenda's engine on a query: a keyword without its set means it in every set. */
export function query(q: Query): HeadingInfo[] {
  const sets = new Set<string>();
  for (const f of store.files) for (const s of f.wf.sequences ?? [DEFAULT_SEQUENCE]) sets.add(s.name);
  const conds: CoreCond[] = q.conds.map((c, i) => ({
    ...(c as CoreCond), id: 'q' + i,
    values: c.field === 'status' ? (c.values ?? []).flatMap((v) => (v.includes('\u001f') ? [v] : [...sets].map((s) => statusKey(s, v)))) : c.values,
  }));
  const a: Agenda = { id: 'q', name: 'q', sources: q.sources ?? [], blocks: [{ id: 'b', name: 'q', color: 'blue', conds, group: 'none', sort: q.sort ?? 'prio', limit: null }] };
  const [r] = runAgenda(a, store.agendaFiles, new Date(new Date().setHours(0, 0, 0, 0)));
  if (!r) throw new Error('условие запроса не закончено');
  return r.groups.flatMap((g) => g.tasks).flatMap((t) => {
    const f = fileOf(t.path);
    const h = f?.headings.find((x) => x.line === t.line);
    return f && h ? [infoOf(f, h)] : [];
  });
}

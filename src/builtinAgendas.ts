import type { Agenda } from './agendas';

// The agendas that come with the new interface's panel besides «Агенда» (ТЗ 45 §3.1): «Неделя», «Сегодня», «Все
// задачи» — plain agendas of blocks, as the builder makes, run by the same engine (agendas.ts runAgenda); read-only:
// not kept in config.json, not offered to edit or delete.

const D = (id: string, name: string, blocks: Agenda['blocks']): Agenda => ({ id, name, sources: [], blocks });
export const PRESETS: Agenda[] = [
  D('builtin:week', 'Неделя', [
    { id: 'w-late', name: 'Просрочено', color: 'red', conds: [{ id: 'c1', field: 'scheduled', op: 'eq', date: { kind: 'before' } }], group: 'none', sort: 'scheduled', limit: null },
    { id: 'w-due', name: 'Сроки недели', color: 'orange', conds: [{ id: 'c2', field: 'deadline', op: 'eq', date: { kind: 'next', n: 7 } }], group: 'none', sort: 'deadline', limit: null },
    { id: 'w-plan', name: 'Запланировано на неделю', color: 'blue', conds: [{ id: 'c3', field: 'scheduled', op: 'eq', date: { kind: 'next', n: 7 } }], group: 'day', sort: 'scheduled', limit: null },
  ]),
  D('builtin:today', 'Сегодня', [
    { id: 't-late', name: 'Просрочено', color: 'red', conds: [{ id: 'c1', field: 'scheduled', op: 'eq', date: { kind: 'before' } }], group: 'none', sort: 'scheduled', limit: null },
    { id: 't-due', name: 'Срок сегодня', color: 'orange', conds: [{ id: 'c2', field: 'deadline', op: 'eq', date: { kind: 'today' } }], group: 'none', sort: 'prio', limit: null },
    { id: 't-plan', name: 'Запланировано на сегодня', color: 'blue', conds: [{ id: 'c3', field: 'scheduled', op: 'eq', date: { kind: 'today' } }], group: 'none', sort: 'prio', limit: null },
  ]),
  D('builtin:all', 'Все задачи', [
    { id: 'a-all', name: 'Открытые задачи', color: 'gray', conds: [{ id: 'c1', field: 'done', op: 'no' }], group: 'file', sort: 'prio', limit: null },
  ]),
];
export const presetOf = (id: string | undefined) => (id ? PRESETS.find((a) => a.id === id) : undefined);
export const isPreset = (id: string | undefined) => !!presetOf(id);

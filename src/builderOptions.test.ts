import { describe, expect, it } from 'vitest';
import { allTagsOf, dateOfForm, folderTree, isChecked, optionsFor, statusSets, valueKind } from './builderOptions';
import { EMPTY_CONFIG, fromSequences } from './org';
import { statusKey, type Block, type Cond } from './agendas';

// Tech sprint 4.2: what the agenda builder's pickers offer, taken out of AgendaBuilder.svelte.

const tasks = fromSequences([{ name: 'Задачи', states: [{ name: 'TODO', done: false }, { name: 'DONE', done: true }] }], 0, 'default');
const goals = fromSequences([{ name: 'Цели', states: [{ name: 'ACTIVE', done: false }, { name: 'ACHIEVED', done: true }] }], 0, 'default');
const files = [
  { name: 'work.org', wf: tasks, filetags: ['работа'], headings: [{ tags: ['срочно'] }, { tags: [] }] },
  { name: 'goals.org', wf: goals, filetags: [], headings: [{ tags: ['цели', 'срочно'] }] },
];

describe('the pickers of the agenda builder', () => {
  it('the sets of statuses of the files the agenda reads, else of the project', () => {
    expect(statusSets(files, [], EMPTY_CONFIG).map((s) => s.name)).toEqual(['Задачи', 'Цели']); // every file
    expect(statusSets(files, ['goals.org'], EMPTY_CONFIG).map((s) => [s.name, s.states.map((x) => x.name)])).toEqual([['Цели', ['ACTIVE', 'ACHIEVED']]]);
    expect(statusSets(files, ['none.org'], EMPTY_CONFIG).length).toBeGreaterThan(0);
  });
  it('every tag once, by name; the folder as a tree, folders first', () => {
    expect(allTagsOf(files)).toEqual(['работа', 'срочно', 'цели']);
    expect(folderTree(['Работа', 'Работа/2026'], ['inbox.org', 'Работа/plan.org', 'Работа/2026/q4.org', 'Архив.org'])).toEqual([
      { rel: 'Работа', dir: true, depth: 0 },
      { rel: 'Работа/2026', dir: true, depth: 1 },
      { rel: 'Работа/2026/q4.org', dir: false, depth: 2 },
      { rel: 'Работа/plan.org', dir: false, depth: 1 },
      { rel: 'Архив.org', dir: false, depth: 0 },
      { rel: 'inbox.org', dir: false, depth: 0 },
    ]);
  });
  const d = { sets: statusSets(files, [], EMPTY_CONFIG), tags: allTagsOf(files), tree: folderTree(['Работа'], ['work.org', 'Работа/ёлка.org']) };
  it('statuses of several sets: a head per set with what is picked; the search hides an empty set', () => {
    const o = optionsFor('status', 'status', '', [statusKey('Задачи', 'TODO')], d);
    expect(o.map((x) => (x.head ? `[${x.label} ${x.count}]` : x.label))).toEqual(['[ЗАДАЧИ выбрано 1 из 2]', 'TODO', 'DONE', '[ЦЕЛИ выбрано 0 из 2]', 'ACTIVE', 'ACHIEVED']);
    expect(optionsFor('status', 'status', 'act', [], d).map((x) => x.label)).toEqual(['ЦЕЛИ', 'ACTIVE']);
  });
  it('a tag typed that is not there is offered to add (spaces become _); a path is found ё-blind with its folder', () => {
    expect(optionsFor('tag', 'tag', 'новый тег', [], d).map((x) => x.label)).toEqual(['Добавить тег «новый_тег»']);
    expect(optionsFor('tag', 'tag', 'сроч', [], d).map((x) => x.id)).toEqual(['срочно', 'сроч']); // the typed word itself is a new tag too
    expect(optionsFor('path', 'path', 'елка', [], d)).toEqual([{ id: 'Работа/ёлка.org', label: 'ёлка', dir: false, depth: 0, hint: 'Работа' }]);
    expect(optionsFor('op', 'scheduled', '', [], d).map((x) => x.id)).toEqual(['eq', 'before', 'after', 'none']);
  });
  it('the current option: a single choice by the condition or the block, a multiple one by what is picked', () => {
    const block = { group: 'file', sort: 'prio' } as Block;
    const cond = { field: 'scheduled', op: 'none' } as Cond;
    expect(isChecked('date', 'none', { multi: false, picked: [], cond, block })).toBe(true);
    expect(isChecked('date', 'today', { multi: false, picked: [], cond: { ...cond, op: 'eq', date: { kind: 'today' } }, block })).toBe(true);
    expect(isChecked('group', 'file', { multi: false, picked: [], block })).toBe(true);
    expect(isChecked('tag', 'x', { multi: true, picked: ['x'], block })).toBe(true);
  });
  it('a date typed in a form; the popover of a field', () => {
    expect(dateOfForm('next', '0', '', '')).toBeNull();
    expect(dateOfForm('next', '99999', '', '')).toEqual({ kind: 'next', n: 3650 });
    expect(dateOfForm('range', '', '2026-10-20', '2026-10-10')).toEqual({ kind: 'range', from: '2026-10-10', to: '2026-10-20' });
    expect(dateOfForm('range', '', '', '2026-10-10')).toBeNull();
    expect([valueKind('deadline'), valueKind('priority'), valueKind('tag')]).toEqual(['date', 'prio', 'tag']);
  });
});

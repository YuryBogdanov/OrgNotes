import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  incomplete, nameProblem, newAgenda, newBlock, newCond, query, readAgendas, runAgenda, summary, sameAgenda, cloneAgenda,
  setTouchSource, statusKey, withAgendas, tasksCount, type Agenda, type Block, type Cond, type Source,
} from './agendas';
import { DEFAULT_WORKFLOW, fromSequences, parseHeadings, type Workflow } from './org';

const TODAY = new Date(2026, 9, 11); // Sunday, 11 October 2026
const tasks: Workflow = fromSequences(
  [
    { name: 'Задачи', states: [{ name: 'TODO', done: false }, { name: 'NEXT', done: false }, { name: 'WAIT', done: false }, { name: 'DONE', done: true }] },
    { name: 'Встречи', states: [{ name: 'MEETING', done: false }, { name: 'FINISHED', done: true }] },
  ],
  0,
  'project',
);
const src = (name: string, text: string, wf = tasks): Source => ({ name, wf, headings: parseHeadings(text, wf), filetags: [] });
const FILES = [
  src('work.org', [
    '* Q4 2026 :q4:',
    '** TODO [#A] Подготовить бюджет 2027',
    '   SCHEDULED: <2026-10-11 Вс> DEADLINE: <2026-10-24 Сб>',
    '** NEXT Свести расходы',
    '   SCHEDULED: <2026-10-12 Пн 10:00>',
    '** TODO Ревизия целей :later:',
    '   SCHEDULED: <2026-10-06 Вт>',
    '** WAIT Ответ CTO по архитектуре',
    '** DONE Закрыть квартал',
    '   CLOSED: [2026-10-01 Чт]',
    '** MEETING Планёрка',
    '   SCHEDULED: <2026-10-11 Вс>',
  ].join('\n')),
  src('inbox.org', '* TODO Разобрать входящие\n  SCHEDULED: <2026-10-11 Вс>\n* Просто заметка\n'),
  src('Команда/Ёлка.org', '* TODO [#C] Ёлочные игрушки\n'),
];
const titles = (a: Agenda) => runAgenda(a, FILES, TODAY).map((r) => r.groups.flatMap((g) => g.tasks.map((t) => t.title)));
const one = (...conds: Partial<Cond>[]): Agenda => ({
  ...newAgenda(),
  blocks: [{ ...newBlock(), conds: conds.map((c) => ({ ...newCond(c.field!), ...c })) }],
});
const S = (n: string, set = 'Задачи') => statusKey(set, n);

describe('picking tasks', () => {
  it('an empty block shows every open task of every file: by priority, then date, then the notes’ order', () => {
    expect(titles(newAgenda())[0]).toEqual([
      'Подготовить бюджет 2027', // A
      'Ёлочные игрушки', // C
      'Ревизия целей', 'Планёрка', 'Разобрать входящие', 'Свести расходы', 'Ответ CTO по архитектуре',
    ]);
  });
  it('sources: a file or a folder with everything inside; none = all files', () => {
    expect(titles({ ...newAgenda(), sources: ['inbox.org'] })[0]).toEqual(['Разобрать входящие']);
    expect(titles({ ...newAgenda(), sources: ['Команда'] })[0]).toEqual(['Ёлочные игрушки']);
    expect(titles({ ...newAgenda(), sources: ['Удалено.org', 'inbox.org'] })[0]).toEqual(['Разобрать входящие']);
  });
  it('status: one of / not one of, done statuses only when asked for', () => {
    expect(titles(one({ field: 'status', values: [S('TODO'), S('NEXT')] }))[0]).toEqual(['Подготовить бюджет 2027', 'Ёлочные игрушки', 'Ревизия целей', 'Разобрать входящие', 'Свести расходы']);
    expect(titles(one({ field: 'status', op: 'notin', values: [S('TODO')] }))[0]).toEqual(['Планёрка', 'Свести расходы', 'Ответ CTO по архитектуре']);
    expect(titles(one({ field: 'status', values: [S('DONE')] }))[0]).toEqual(['Закрыть квартал']);
    // the same name in another set is another status
    expect(titles(one({ field: 'status', values: [S('MEETING', 'Задачи')] }))[0]).toEqual([]);
    expect(titles(one({ field: 'status', values: [S('MEETING', 'Встречи')] }))[0]).toEqual(['Планёрка']);
  });
  it('done: yes / no', () => {
    expect(titles(one({ field: 'done', op: 'yes' }))[0]).toEqual(['Закрыть квартал']);
    expect(titles(one({ field: 'done', op: 'no' }))[0]).toHaveLength(7);
  });
  it('dates: today, before today, tomorrow, next N days, a range, not set; a task without the date never passes', () => {
    const d = (date: Cond['date'], op = 'eq') => titles(one({ field: 'scheduled', op, date }))[0];
    expect(d({ kind: 'today' })).toEqual(['Подготовить бюджет 2027', 'Планёрка', 'Разобрать входящие']);
    expect(d({ kind: 'before' })).toEqual(['Ревизия целей']);
    expect(d({ kind: 'tomorrow' })).toEqual(['Свести расходы']);
    expect(d({ kind: 'next', n: 2 })).toEqual(['Подготовить бюджет 2027', 'Планёрка', 'Разобрать входящие', 'Свести расходы']);
    expect(d({ kind: 'range', from: '2026-10-01', to: '2026-10-07' })).toEqual(['Ревизия целей']);
    expect(d({ kind: 'today' }, 'before')).toEqual(['Ревизия целей']);
    expect(d({ kind: 'today' }, 'after')).toEqual(['Свести расходы']);
    expect(d(undefined, 'none')).toEqual(['Ёлочные игрушки', 'Ответ CTO по архитектуре']);
    expect(titles(one({ field: 'deadline', date: { kind: 'next', n: 14 } }))[0]).toEqual(['Подготовить бюджет 2027']);
  });
  it('tags count inherited ones; priority higher / lower / not set', () => {
    expect(titles(one({ field: 'tag', values: ['later'] }))[0]).toEqual(['Ревизия целей']);
    expect(titles(one({ field: 'tag', op: 'hasnot', values: ['q4'] }))[0]).toEqual(['Ёлочные игрушки', 'Разобрать входящие']);
    expect(titles(one({ field: 'priority', op: 'higher', prio: 'B' }))[0]).toEqual(['Подготовить бюджет 2027']);
    expect(titles(one({ field: 'priority', op: 'lower', prio: 'B' }))[0]).toEqual(['Ёлочные игрушки']);
    expect(titles(one({ field: 'priority', op: 'none' }))[0]).toHaveLength(5);
  });
  it('title: any case, «е» equals «ё»; path: in / not in a folder', () => {
    expect(titles(one({ field: 'title', text: 'ЕЛОЧ' }))[0]).toEqual(['Ёлочные игрушки']);
    expect(titles(one({ field: 'title', op: 'hasnot', text: 'бюджет' }))[0]).toHaveLength(6);
    expect(titles(one({ field: 'path', op: 'notin', values: ['work.org', 'Команда'] }))[0]).toEqual(['Разобрать входящие']);
  });
  it('all conditions must pass; an unfinished block is left out of the agenda', () => {
    const a = one({ field: 'status', values: [S('TODO')] }, { field: 'scheduled', date: { kind: 'today' } }, { field: 'tag', op: 'hasnot', values: ['later'] });
    expect(titles(a)).toEqual([['Подготовить бюджет 2027', 'Разобрать входящие']]);
    a.blocks.push({ ...newBlock(), conds: [newCond('status')] });
    expect(incomplete(a.blocks[1].conds[0])).toBe(true);
    expect(runAgenda(a, FILES, TODAY)).toHaveLength(1);
  });
  it('sort, limit, groups', () => {
    const b = (o: Partial<Block>): Agenda => ({ ...newAgenda(), blocks: [{ ...newBlock(), ...o }] });
    expect(titles(b({ sort: 'alpha', limit: 2 }))[0]).toEqual(['Ёлочные игрушки', 'Ответ CTO по архитектуре']);
    const r = runAgenda(b({ sort: 'scheduled', limit: 3 }), FILES, TODAY)[0];
    expect(r.total).toBe(7);
    expect(r.more).toBe(4);
    expect(r.groups[0].tasks.map((t) => t.title)).toEqual(['Ревизия целей', 'Подготовить бюджет 2027', 'Планёрка']);
    const g = runAgenda(b({ group: 'file' }), FILES, TODAY)[0].groups;
    expect(g.map((x) => x.title)).toEqual(['Ёлка', 'inbox', 'work']); // as in the navigator
    const days = runAgenda(b({ group: 'day', sort: 'scheduled' }), FILES, TODAY)[0].groups;
    expect(days.map((x) => x.title)).toEqual(['Вторник, 6 октября', 'Воскресенье, 11 октября', 'Понедельник, 12 октября', 'Без даты']);
    // the preview's cap: counted, but not shown
    expect(runAgenda(newAgenda(), FILES, TODAY, 2)[0]).toMatchObject({ total: 7, more: 5 });
  });
  it('built-in statuses (no sequences) still know their done words', () => {
    const f = [src('a.org', '* TODO a\n* DONE b\n', DEFAULT_WORKFLOW)];
    expect(runAgenda(one({ field: 'status', values: [S('DONE')] }), f, TODAY)[0].total).toBe(1);
  });
});

describe('words', () => {
  it('the query line and the collapsed summary', () => {
    const b: Block = {
      ...newBlock(),
      conds: [
        { ...newCond('status'), values: [S('TODO'), S('NEXT')] },
        { ...newCond('scheduled'), date: { kind: 'today' } },
        { ...newCond('tag'), op: 'hasnot', values: ['later'] },
      ],
    };
    expect(query(b)).toBe('status:(TODO NEXT) and scheduled:today and not tag:later');
    expect(summary(b)).toBe('статус: TODO, NEXT · запланировано: сегодня · тег: не содержит later');
    expect(summary({ ...newBlock(), conds: [{ ...newCond('scheduled'), date: { kind: 'before' } }], sort: 'age' })).toBe('запланировано: раньше сегодня · сортировка: по давности');
    expect(query({ ...newBlock(), conds: [{ ...newCond('deadline'), date: { kind: 'next', n: 14 } }, { ...newCond('done') }] })).toBe('deadline:today..+13d and done');
    expect(query(newBlock())).toBe('все задачи');
    expect(summary(newBlock())).toBe('все задачи');
    expect(tasksCount(1)).toBe('1 задача');
    expect(tasksCount(2)).toBe('2 задачи');
    expect(tasksCount(11)).toBe('11 задач');
  });
});

describe('saving', () => {
  it('names: not empty, not taken (any case), not a built-in one', () => {
    expect(nameProblem('  ', [])).toBe('Введите название агенды');
    expect(nameProblem('мой день', ['Мой день'])).toBe('Агенда с таким названием уже есть');
    expect(nameProblem('агенда', [])).toBe('Агенда с таким названием уже есть');
    expect(nameProblem('Мой день', ['Другая'])).toBeNull();
  });
  it('round trip through config.json keeps the other keys; junk is skipped', () => {
    const a = one({ field: 'status', values: [S('TODO')] }, { field: 'scheduled', date: { kind: 'range', from: '2026-10-01', to: '2026-10-31' } });
    a.name = 'Мой день';
    a.sources = ['work.org'];
    a.blocks[0].limit = 5;
    const raw = withAgendas('{"version":1,"workflows":[{"name":"X"}]}', [a]);
    const parsed = JSON.parse(raw);
    expect(parsed.workflows).toEqual([{ name: 'X' }]);
    const back = readAgendas(parsed.agendas);
    expect(back).toHaveLength(1);
    expect(sameAgenda(back[0], a)).toBe(true);
    expect(readAgendas([{ name: '' }, { name: 'B', blocks: [{ conds: [{ field: 'nope' }, { field: 'tag', op: 'zzz' }] }] }, { name: 'b' }])).toMatchObject([
      { name: 'B', blocks: [{ conds: [{ field: 'tag', op: 'has', values: [] }] }] },
    ]);
    expect(JSON.parse(withAgendas(raw, [])).agendas).toBeUndefined();
  });
  it('a clone is independent', () => {
    const a = newAgenda();
    const c = cloneAgenda(a);
    c.blocks[0].name = 'x';
    expect(a.blocks[0].name).toBe('Без названия');
    expect(sameAgenda(a, c)).toBe(false);
  });
});

describe('the condition «Касание» (ТЗ 40)', () => {
  // the touches of three tasks: 45 days ago, 30 days ago, today; the others not known
  const ago = (d: number) => new Date(2026, 9, 11 - d, 15, 0).getTime();
  const AT: Record<string, number> = { 'work.org:1': ago(45), 'work.org:3': ago(30), 'inbox.org:0': ago(0) };
  beforeAll(() => setTouchSource((f, l) => AT[f + ':' + l]));
  afterAll(() => setTouchSource(() => undefined));
  it('«давнее чем 30 дней»: 30 days or more; «за последние 7 дней»: today and the 6 days before; unknown in neither', () => {
    expect(titles(one({ field: 'touched', op: 'older', days: 30 }))).toEqual([['Подготовить бюджет 2027', 'Свести расходы']]);
    expect(titles(one({ field: 'touched', op: 'within', days: 7 }))).toEqual([['Разобрать входящие']]);
  });
  it('needs its days; written to config.json and read back; in words and in the query', () => {
    expect(incomplete({ ...newCond('touched') })).toBe(true);
    const a = one({ field: 'touched', op: 'older', days: 30 });
    const back = readAgendas(JSON.parse(withAgendas(null, [a])).agendas)[0];
    expect(back.blocks[0].conds[0]).toMatchObject({ field: 'touched', op: 'older', days: 30 });
    expect(summary(a.blocks[0])).toBe('касание: 30 дней');
    expect(summary(one({ field: 'touched', op: 'within', days: 2 }).blocks[0])).toBe('касание: за последние 2 дня');
    expect(query(a.blocks[0])).toBe('touched:>=30d');
  });
});

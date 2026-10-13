import { describe, expect, it } from 'vitest';
import { parseHeadings, DEFAULT_WORKFLOW } from './org';
import { doneOn, leftOn, nextWorkday, newId, openTasks, writeDay } from './endDay';
import { journalDays, lastDay, type TFile } from './today';

const file = (name: string, text: string): TFile => ({ name, path: '/n/' + name, text, wf: DEFAULT_WORKFLOW, headings: parseHeadings(text, DEFAULT_WORKFLOW) });
const DAY = new Date(2026, 9, 13); // Tuesday
const NOW = new Date(2026, 9, 13, 18, 42);
const E = { note: '- Дожать Аню\n- Глянуть цели', focus: [{ id: 'a1', title: 'Бюджет [Q4]' }], done: [{ id: 'd1', title: 'Ответил по оферу' }] };

describe('the day', () => {
  const w = file('w.org', [
    '* DONE Ответил по оферу', 'CLOSED: [2026-10-13 Вт 11:00]',
    '* DONE Вчерашнее', 'CLOSED: [2026-10-12 Пн 11:00]',
    '* TODO Написать Ане', 'SCHEDULED: <2026-10-13 Вт>',
    '* TODO Завтрашнее', 'SCHEDULED: <2026-10-14 Ср>',
    '* NEXT Без даты',
  ].join('\n'));
  it('done: closed on the day; left: open and scheduled for it; open: every open task', () => {
    expect(doneOn([w], DAY).map((t) => t.title)).toEqual(['Ответил по оферу']);
    expect(leftOn([w], DAY).map((t) => t.title)).toEqual(['Написать Ане']);
    expect(openTasks([w]).map((t) => t.title)).toEqual(['Написать Ане', 'Завтрашнее', 'Без даты']);
  });
  it('the next working day: Monday after Friday', () => {
    expect(nextWorkday(DAY).getDate()).toBe(14);
    expect(nextWorkday(new Date(2026, 9, 16)).getDate()).toBe(19);
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('the journal', () => {
  it('a new journal: the year, the month, the day and its three parts', () => {
    expect(writeDay('', DAY, E, NOW)).toBe([
      '* 2026', '** 2026-10 Октябрь', '*** 2026-10-13 Вт',
      '**** На завтра', ':PROPERTIES:', ':CREATED:  [2026-10-13 Вт 18:42]', ':END:', '- Дожать Аню', '- Глянуть цели',
      '**** Главное', '- [[id:a1][Бюджет (Q4)]]',
      '**** Сделано', '- [[id:d1][Ответил по оферу]]', '',
    ].join('\n'));
  });
  it('dates in order: a new day goes between, a new month and year after the earlier ones', () => {
    const j = '#+TITLE: Журнал\n\n* 2026\n** 2026-10 Октябрь\n*** 2026-10-09 Пт\n- руками\n*** 2026-10-20 Вт\n';
    const t = writeDay(j, DAY, { note: '', focus: [], done: E.done }, NOW);
    const days = parseHeadings(t, DEFAULT_WORKFLOW).filter((h) => h.level === 3).map((h) => h.title);
    expect(days).toEqual(['2026-10-09 Пт', '2026-10-13 Вт', '2026-10-20 Вт']);
    expect(t).toContain('*** 2026-10-09 Пт\n- руками\n*** 2026-10-13 Вт\n**** Сделано');
    const t2 = writeDay(t, new Date(2026, 11, 1), { note: 'x', focus: [], done: [] }, NOW);
    expect(parseHeadings(t2, DEFAULT_WORKFLOW).filter((h) => h.level === 2).map((h) => h.title)).toEqual(['2026-10 Октябрь', '2026-12 Декабрь']);
    const t3 = writeDay(t2, new Date(2025, 11, 31), { note: 'x', focus: [], done: [] }, NOW);
    expect(parseHeadings(t3, DEFAULT_WORKFLOW).filter((h) => h.level === 1).map((h) => h.title)).toEqual(['2025', '2026']);
    expect(t3.startsWith('#+TITLE: Журнал\n\n* 2025')).toBe(true);
  });
  it('again the same day: its parts are replaced, not doubled; one emptied goes; one written by hand stays', () => {
    const once = writeDay('', DAY, E, NOW);
    const withHand = once.replace('**** Главное', '**** Мысли\nсвоё\n**** Главное');
    const twice = writeDay(withHand, DAY, { note: '- Только это', focus: [], done: E.done }, new Date(2026, 9, 13, 19, 5));
    expect(twice.match(/\*\*\*\* На завтра/g)).toHaveLength(1);
    expect(twice).toContain(':CREATED:  [2026-10-13 Вт 19:05]\n:END:\n- Только это\n**** Мысли\nсвоё\n**** Сделано');
    expect(twice).not.toContain('Главное');
    const d = lastDay(journalDays(file('journal.org', twice)), new Date(2026, 9, 14))!;
    expect(d.note?.text).toBe('- Только это');
  });
});

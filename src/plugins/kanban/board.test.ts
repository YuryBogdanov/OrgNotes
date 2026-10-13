import { describe, expect, it } from 'vitest';
import { fromSequences, parseHeadings } from '../../org'; // the test may use the core (the boundary is for the plugin's code)
import { bestSet, boardFor, boardOf, countFor, countWords, headingsWord, matches, titleHtml, withBoard, type StatusSet } from './board';

const DEV: StatusSet = { name: 'Разработка', states: ['BACKLOG', 'TODO', 'DOING', 'REVIEW'].map((name) => ({ name, done: false })).concat(['DONE', 'CANCELLED'].map((name) => ({ name, done: true }))) };
const TASKS: StatusSet = { name: 'Задачи', states: [{ name: 'TODO', done: false }, { name: 'NEXT', done: false }, { name: 'WAIT', done: false }, { name: 'DONE', done: true }] };
const wf = fromSequences([DEV, TASKS].map((s) => ({ name: s.name, states: s.states })), 0, 'project');
const TEXT = [
  '#+TITLE: Платформа',
  '#+BOARD: Разработка',
  '',
  '* DOING [#A] Переезд в новый ДЦ [2/5]          :infra:dc:',
  'SCHEDULED: <2026-10-12 Пн>',
  '* TODO Обновить *Kafka* до 3.8             :infra:',
  '* TODO Нагрузочное тестирование',
  'DEADLINE: <2026-10-14 Ср>',
  '** TODO подзадача',
  '** DONE сделано',
  '- [X] раз',
  '- [ ] два',
  '* Просто заметка',
  '* NEXT Из другого набора',
  '* DONE Старое',
  'CLOSED: [2026-09-01 Вт 10:00]',
  '* DONE Свежее',
  'CLOSED: [2026-10-10 Сб 10:00]',
  '* DONE Без даты',
].join('\n');
const hs = parseHeadings(TEXT, wf);
const TODAY = new Date(2026, 9, 14);

describe('#+BOARD', () => {
  it('read from the header; written after the other #+ lines; changed and taken away', () => {
    expect(boardOf(TEXT)).toBe('Разработка');
    expect(boardOf('* x\n#+BOARD: Нет')).toBeNull();
    expect(withBoard('#+TITLE: П\n#+FILETAGS: :a:\n\n* TODO x', 'Задачи')).toBe('#+TITLE: П\n#+FILETAGS: :a:\n#+BOARD: Задачи\n\n* TODO x');
    expect(withBoard('* TODO x', 'Задачи')).toBe('#+BOARD: Задачи\n* TODO x');
    expect(withBoard(TEXT, 'Задачи').split('\n')[1]).toBe('#+BOARD: Задачи');
    expect(withBoard(TEXT, null).split('\n').slice(0, 2)).toEqual(['#+TITLE: Платформа', '']);
  });
});

describe('the board', () => {
  const b = boardFor(TEXT, hs, DEV, { doneDays: 14, today: TODAY });
  const col = (k: string) => b.columns.find((c) => c.keyword === k)!;
  it('columns in the order of the set; level-1 headings of its statuses, in the file\'s order', () => {
    expect(b.columns.map((c) => c.keyword)).toEqual(['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'DONE', 'CANCELLED']);
    expect(col('TODO').cards.map((c) => c.title)).toEqual(['Обновить *Kafka* до 3.8', 'Нагрузочное тестирование']);
    expect(b.off.map((o) => o.title)).toEqual(['Просто заметка', 'Из другого набора']);
  });
  it('a card: priority, tags, the date, the progress (the cookie; else checkboxes and tasks)', () => {
    const [dc] = col('DOING').cards;
    expect(dc).toMatchObject({ title: 'Переезд в новый ДЦ', priority: 'A', tags: ['infra', 'dc'], progress: '2/5', date: { text: '12 окт', late: false } });
    const load = col('TODO').cards[1];
    expect(load).toMatchObject({ date: { text: 'дедлайн 14 окт', late: true }, progress: '2/4' });
  });
  it('finished columns: closed in the last days, the ones without CLOSED always; the old counted', () => {
    expect(col('DONE').cards.map((c) => c.title)).toEqual(['Свежее', 'Без даты']);
    expect(col('DONE').older).toBe(1);
    expect(col('DONE').cards[0]).toMatchObject({ done: true, date: { text: '10 окт' } });
    expect(boardFor(TEXT, hs, DEV, { doneDays: 14, today: TODAY, showOld: new Set(['DONE']) }).columns[4].cards).toHaveLength(3);
    expect(boardFor(TEXT, hs, DEV, { doneDays: 0, today: TODAY }).columns[4].cards).toHaveLength(3);
  });
  it('the filter: words of the title and :tags:; the counts say how many of all', () => {
    expect(matches({ title: 'Обновить Kafka', tags: ['infra'] }, 'kafka')).toBe(true);
    expect(matches({ title: 'Обновить Kafka', tags: ['infra'] }, ':infra:')).toBe(true);
    expect(matches({ title: 'Обновить Kafka', tags: ['infra'] }, ':dc: kafka')).toBe(false);
    const f = boardFor(TEXT, hs, DEV, { filter: ':infra:', today: TODAY });
    expect(f.columns[1]).toMatchObject({ total: 2, matched: 1 });
  });
});

describe('the choice of a workflow', () => {
  it('how many headings each would take; the most first', () => {
    expect(countFor(hs, DEV)).toBe(6); // DOING, TODO ×2, DONE ×3
    expect(countFor(hs, TASKS)).toBe(6); // TODO ×2, NEXT, DONE ×3
    expect(bestSet(hs, [TASKS, DEV])!.name).toBe('Задачи'); // a tie: the first
    const more = parseHeadings(TEXT + '\n* REVIEW Ещё одна', wf);
    expect(bestSet(more, [TASKS, DEV])!.name).toBe('Разработка');
    expect([countWords(15, 18), countWords(0, 18), countWords(1, 21)]).toEqual(['15 из 18 заголовков', 'нет заголовков', '1 из 21 заголовка']);
    expect([headingsWord(1), headingsWord(3), headingsWord(12)]).toEqual(['1 заголовок', '3 заголовка', '12 заголовков']);
  });
  it('a title with its markup as HTML', () => {
    expect(titleHtml('Обновить *Kafka* до <3.8> [[id:x][план]]')).toBe('Обновить <b>Kafka</b> до &lt;3.8&gt; <span class="kb-link">план</span>');
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_SEQUENCE, fromSequences, parseHeadings } from './org';
import { byDay, dayShort, dayTitle, entriesIn, layoutEvents, monthSub, monthWeeks, sortDay, undated, weekDays, weekNumber, weekSub, type CalFile } from './calIndex';

const WF = fromSequences([DEFAULT_SEQUENCE], 0, 'project');
const file = (name: string, text: string): CalFile => ({ name, path: '/n/' + name, text, headings: parseHeadings(text, WF), wf: WF });
const WORK = file('work.org', `* Q4 2026
** TODO [#A] Подготовить бюджет 2027
SCHEDULED: <2026-10-14 Ср> DEADLINE: <2026-10-24 Сб>
** NEXT Свести расходы
SCHEDULED: <2026-10-12 Пн>
** WAIT Ответ CTO
SCHEDULED: <2026-10-16 Пт>
** DONE Собрать заявки
CLOSED: [2026-10-08 Чт 18:20] SCHEDULED: <2026-10-05 Пн>
** Синк с CTO <2026-10-14 Ср 11:00-12:30>
** Планёрка
<2026-10-12 Пн 10:00 +1w>
** Конференция
<2026-10-20 Вт>--<2026-10-22 Чт>
** TODO План найма
** TODO [#B] Без даты с приоритетом
`);
const F = (d: string) => new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

describe('entries', () => {
  const all = entriesIn([WORK], F('2026-10-01'), F('2026-10-31'));
  const on = (day: string) => sortDay(all.filter((e) => e.day === day), WF.open).map((e) => `${e.layer}${e.time ? ' ' + e.time : ''}${e.end ? '-' + e.end : ''} ${e.title}`);
  it('scheduled, deadline, events with time and length, the finished by CLOSED', () => {
    expect(on('2026-10-14')).toEqual(['event 11:00-12:30 Синк с CTO', 'task Подготовить бюджет 2027']);
    expect(on('2026-10-24')).toEqual(['deadline Подготовить бюджет 2027']);
    expect(on('2026-10-16')).toEqual(['wait Ответ CTO']);
    expect(on('2026-10-08')).toEqual(['done Собрать заявки']);
    expect(on('2026-10-05')).toEqual([]); // the finished one is on its CLOSED day only
  });
  it('a repeat unfolds inside the days shown, a range is on each of its days', () => {
    expect(all.filter((e) => e.title === 'Планёрка').map((e) => e.day)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
    expect(all.filter((e) => e.title === 'Конференция').map((e) => e.day)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
    expect(entriesIn([WORK], F('2026-10-21'), F('2026-10-21')).map((e) => e.title)).toEqual(['Конференция']);
  });
  it('the order of a day: events by time, deadlines, tasks by priority, the finished last', () => {
    const e = (layer: any, title: string, o: object = {}) => ({ layer, title, time: null, end: null, keyword: 'TODO', priority: null, day: 'x', file: '', path: '', line: 0, where: '', repeat: false, ...o });
    const s = sortDay([e('done', 'Г'), e('task', 'Б'), e('task', 'А', { priority: 'A' }), e('deadline', 'Срок'), e('event', 'Поздно', { time: '15:00' }), e('event', 'Рано', { time: '09:00' })], WF.open);
    expect(s.map((x) => x.title)).toEqual(['Рано', 'Поздно', 'Срок', 'А', 'Б', 'Г']);
    expect(byDay(all).get('2026-10-12')!.map((x) => x.title)).toEqual(['Планёрка', 'Свести расходы']);
  });
  it('where: the file and the headings above', () => {
    expect(all.find((e) => e.title === 'Свести расходы')!.where).toBe('work › Q4 2026');
  });
  it('«Без даты»: open tasks without a date, the prioritised first', () => {
    expect(undated([WORK]).map((u) => u.title)).toEqual(['Без даты с приоритетом', 'План найма']);
  });
});

describe('the grid', () => {
  it('a month in weeks, Monday first, the neighbour days included', () => {
    const w = monthWeeks(2026, 9);
    expect(w.length).toBe(5);
    expect(w[0][0]).toEqual(F('2026-09-28'));
    expect(w[4][6]).toEqual(F('2026-11-01'));
    expect(monthWeeks(2026, 1).length).toBe(4 + 1); // Feb 2026: 23 Feb … 1 Mar
  });
  it('a week, its number, the words', () => {
    expect(weekDays(F('2026-10-14')).map((d) => d.getDate())).toEqual([12, 13, 14, 15, 16, 17, 18]);
    expect(weekNumber(F('2026-10-14'))).toBe(42);
    expect(monthSub(F('2026-10-14'))).toBe('Четверг, 1 – суббота, 31 октября');
    expect(weekSub(weekDays(F('2026-10-14')))).toBe('12 – 18 октября 2026');
    expect(weekSub(weekDays(F('2026-10-01')))).toBe('28 сентября – 4 октября 2026');
    expect(dayTitle(F('2026-10-14'))).toBe('Среда, 14 октября');
    expect(dayShort(F('2026-10-16'))).toBe('Пт, 16 октября');
  });
  it('events over the hours: overlapping ones share the width', () => {
    const e = (title: string, time: string, end: string | null = null) => ({ layer: 'event' as const, title, time, end, keyword: null, priority: null, day: 'x', file: '', path: '', line: 0, where: '', repeat: false });
    const l = layoutEvents([e('A', '10:00', '11:30'), e('B', '11:00'), e('C', '13:00')]);
    expect(l.map((x) => [x.e.title, x.start, x.end, x.col, x.cols])).toEqual([['A', 600, 690, 0, 2], ['B', 660, 720, 1, 2], ['C', 780, 840, 0, 1]]);
  });
});

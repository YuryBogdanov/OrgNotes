import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, fromSequences, parseHeadings } from './org';
import { agePill, ageShort, closingStatus, deferDates, locate, nextOpen, reviewQueue, withDay, type ReviewItem } from './review';

const INBOX = [
  '#+TITLE: Inbox',
  '* TODO Новая',
  ':PROPERTIES:',
  ':CREATED: [2026-10-11 Sun 09:00]',
  ':END:',
  '* TODO Старая',
  ':PROPERTIES:',
  ':CREATED: [2026-10-02 Fri 11:05]',
  ':END:',
  'детали',
  '* TODO Без даты',
  '* DONE Готовая',
  ':PROPERTIES:',
  ':CREATED: [2026-10-01 Thu 10:00]',
  ':END:',
  '* TODO Отложенная',
  'SCHEDULED: <2026-10-14 Wed>',
  ':PROPERTIES:',
  ':CREATED: [2026-10-03 Sat 10:00]',
  ':END:',
  '* TODO Сегодняшняя',
  'SCHEDULED: <2026-10-11 Sun>',
  '',
].join('\n');
const NOW = new Date(2026, 9, 11, 14, 0);
const hs = parseHeadings(INBOX, DEFAULT_WORKFLOW);

describe('the queue', () => {
  it('open tasks, oldest first, without :CREATED: at the end; done and scheduled after today left out', () => {
    const q = reviewQueue(INBOX, hs, DEFAULT_WORKFLOW, '/n/inbox.org', 'old', NOW);
    expect(q.map((x) => x.title)).toEqual(['Старая', 'Новая', 'Без даты', 'Сегодняшняя']);
    expect(q[0]).toMatchObject({ path: '/n/inbox.org', line: 5, created: '[2026-10-02 Fri 11:05]', hasDetails: true, firstDetail: 'детали', keyword: 'TODO', result: null });
    expect(reviewQueue(INBOX, hs, DEFAULT_WORKFLOW, 'p', 'new', NOW).map((x) => x.title)).toEqual(['Новая', 'Старая', 'Без даты', 'Сегодняшняя']);
  });
  it('a task is found again by its :CREATED: (its title edited), else by its title, the nearest one', () => {
    const edited = INBOX.replace('* TODO Старая', '* TODO Старая, но правленая').replace('#+TITLE: Inbox', '#+TITLE: Inbox\nстрока');
    const h2 = parseHeadings(edited, DEFAULT_WORKFLOW);
    expect(locate(edited, h2, { line: 5, title: 'Старая', created: '[2026-10-02 Fri 11:05]' })?.title).toBe('Старая, но правленая');
    expect(locate(edited, h2, { line: 10, title: 'Без даты', created: null })?.line).toBe(11);
    expect(locate(edited, h2, { line: 1, title: 'Нет такой', created: null })).toBeUndefined();
  });
  it('the next card: the first not gone through after the current one, round to the start; none: -1', () => {
    const it = (r: ReviewItem['result']) => ({ result: r }) as ReviewItem;
    expect(nextOpen([it('done'), it(null), it('skip'), it(null)], 1)).toBe(3);
    expect(nextOpen([it(null), it('done'), it('skip')], 1)).toBe(0);
    expect(nextOpen([it('done'), it('skip')], 0)).toBe(-1);
  });
});

describe('dates and statuses', () => {
  it('«Отложить»: tomorrow, in 3 days, next Monday, the same day next month (the last day of a shorter one)', () => {
    expect(deferDates(NOW).map((d) => withDay(d.date))).toEqual(['Пн, 12 окт', 'Ср, 14 окт', 'Пн, 12 окт', 'Ср, 11 ноя']);
    expect(withDay(deferDates(new Date(2026, 0, 31)).at(-1)!.date)).toBe('Сб, 28 фев');
    expect(withDay(deferDates(new Date(2026, 9, 12)).at(2)!.date)).toBe('Пн, 19 окт'); // on a Monday: the next one
  });
  it('«Выполнено» / «Отменить»: the chosen status if the task’s set has it, else the set’s first / second done one', () => {
    const wf = fromSequences(
      [
        { name: 'Задачи', states: [{ name: 'TODO', done: false }, { name: 'DONE', done: true }, { name: 'CANCELLED', done: true }] },
        { name: 'Встречи', states: [{ name: 'MEETING', done: false }, { name: 'HELD', done: true }] },
      ],
      0, 'default',
    );
    expect(closingStatus(wf, 'TODO', 'done', 'DONE')).toBe('DONE');
    expect(closingStatus(wf, 'TODO', 'cancel', 'CANCELLED')).toBe('CANCELLED');
    expect(closingStatus(wf, 'TODO', 'done', 'GONE')).toBe('DONE'); // renamed or deleted in Settings
    expect(closingStatus(wf, 'MEETING', 'done', 'DONE')).toBe('HELD');
    expect(closingStatus(wf, 'MEETING', 'cancel', 'CANCELLED')).toBeNull();
  });
  it('ages', () => {
    expect(agePill('[2026-10-02 Fri 11:05]', NOW)).toBe('9 дней в Inbox · создана 2 окт');
    expect(agePill('[2026-10-10 Sat]', NOW)).toBe('1 день в Inbox · создана 10 окт');
    expect(agePill(null, NOW)).toBe('');
    expect(ageShort('[2026-10-11 Sun 09:30]', NOW)).toBe('4 ч');
    expect(ageShort('[2026-10-10 Sat 09:30]', NOW)).toBe('вчера');
    expect(ageShort('[2026-09-29 Tue]', NOW)).toBe('12 дн');
  });
});

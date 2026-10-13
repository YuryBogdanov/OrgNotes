import { describe, expect, it } from 'vitest';
import { DEFAULT_CAL, entryLines, insertEntry, moveEntry, moveStamp, readCal } from './edit';

const RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const D = (s: string) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));

describe('moving', () => {
  it('a stamp: the day and its name, the time kept or set, the length kept, the repeater kept', () => {
    expect(moveStamp('<2026-10-14 Ср>', D('2026-10-20'), RU)).toBe('<2026-10-20 Вт>');
    expect(moveStamp('<2026-10-14 Ср 10:00-11:30 +1w>', D('2026-10-16'), RU)).toBe('<2026-10-16 Пт 10:00-11:30 +1w>');
    expect(moveStamp('<2026-10-14 Ср 10:00-11:30>', D('2026-10-16'), RU, '14:00')).toBe('<2026-10-16 Пт 14:00-15:30>');
    expect(moveStamp('<2026-10-14 Ср>', D('2026-10-16'), RU, '09:15')).toBe('<2026-10-16 Пт 09:15>');
  });
  const T = '* Q4\n** TODO Бюджет\n   SCHEDULED: <2026-10-14 Ср> DEADLINE: <2026-10-24 Сб>\n** Синк <2026-10-14 Ср 11:00>\n** Планёрка\n<2026-10-12 Пн 10:00 +1w>\n** TODO Без даты\n';
  it('a task: its SCHEDULED; its DEADLINE stays unless asked to move by as many days', () => {
    expect(moveEntry(T, 1, 'task', D('2026-10-20'), RU, { keepDeadline: true })).toContain('   SCHEDULED: <2026-10-20 Вт> DEADLINE: <2026-10-24 Сб>');
    expect(moveEntry(T, 1, 'task', D('2026-10-20'), RU, { keepDeadline: false })).toContain('SCHEDULED: <2026-10-20 Вт> DEADLINE: <2026-10-30 Пт>');
  });
  it('a deadline: its DEADLINE only', () => {
    expect(moveEntry(T, 1, 'deadline', D('2026-10-31'), RU)).toContain('SCHEDULED: <2026-10-14 Ср> DEADLINE: <2026-10-31 Сб>');
  });
  it('an event: the stamp in the title or under it; a time from the week', () => {
    expect(moveEntry(T, 3, 'event', D('2026-10-15'), RU, { time: '15:00' })).toContain('** Синк <2026-10-15 Чт 15:00>');
    expect(moveEntry(T, 4, 'event', D('2026-10-13'), RU)).toContain('** Планёрка\n<2026-10-13 Вт 10:00 +1w>');
  });
  it('a task without a date: SCHEDULED is added', () => {
    expect(moveEntry(T, 6, 'undated', D('2026-10-22'), RU)).toContain('** TODO Без даты\nSCHEDULED: <2026-10-22 Чт>');
    expect(moveEntry(T, 6, 'undated', D('2026-10-22'), RU, { time: '09:00' })).toContain('SCHEDULED: <2026-10-22 Чт 09:00>');
  });
});

describe('making', () => {
  const e = { kind: 'task' as const, title: 'Купить  подарок', status: 'TODO', date: D('2026-10-16'), time: null, minutes: 60, dateKind: 'SCHEDULED' as const };
  it('a task with SCHEDULED, DEADLINE or a plain date; an event with its length', () => {
    expect(entryLines(e, 2, RU)).toEqual(['** TODO Купить подарок', 'SCHEDULED: <2026-10-16 Пт>']);
    expect(entryLines({ ...e, dateKind: 'DEADLINE' }, 1, RU)).toEqual(['* TODO Купить подарок', 'DEADLINE: <2026-10-16 Пт>']);
    expect(entryLines({ ...e, dateKind: 'plain' }, 1, RU)).toEqual(['* TODO Купить подарок', '<2026-10-16 Пт>']);
    expect(entryLines({ ...e, kind: 'event', status: null, title: 'Синк', time: '10:00', minutes: 90 }, 2, RU)).toEqual(['** Синк', '<2026-10-16 Пт 10:00-11:30>']);
  });
  it('under a heading: at its end, before the next level-1 heading; made when missing', () => {
    const t = '* Календарь\n** Старое\nтекст\n\n* Другое\n';
    const r = insertEntry(t, 'Календарь', e, RU);
    expect(r.text).toBe('* Календарь\n** Старое\nтекст\n** TODO Купить подарок\nSCHEDULED: <2026-10-16 Пт>\n\n* Другое\n');
    expect(r.text.split('\n')[r.line]).toBe('** TODO Купить подарок');
    const m = insertEntry('* A\n', 'Встречи', { ...e, kind: 'event', status: null, title: 'Синк' }, RU);
    expect(m.text).toBe('* A\n\n* Встречи\n** Синк\n<2026-10-16 Пт>\n');
    expect(m.text.split('\n')[m.line]).toBe('** Синк');
  });
  it('no heading: at the top or the end of the file, as the Inbox', () => {
    expect(insertEntry('#+TITLE: inbox\n* TODO Старая\n', null, e, RU, 'top').text).toBe('#+TITLE: inbox\n* TODO Купить подарок\nSCHEDULED: <2026-10-16 Пт>\n\n* TODO Старая\n');
    const r = insertEntry('* TODO Старая\n', null, e, RU, 'end');
    expect(r.text).toBe('* TODO Старая\n\n* TODO Купить подарок\nSCHEDULED: <2026-10-16 Пт>\n');
    expect(r.text.split('\n')[r.line]).toBe('* TODO Купить подарок');
  });
});

describe('moving, the edge cases', () => {
  it('a range keeps its length; a WAIT with a stamp moves as an event; a deadline-only task gets SCHEDULED first', () => {
    expect(moveEntry('* Отпуск <2026-10-14 Ср>--<2026-10-16 Пт>\n', 0, 'event', D('2026-10-20'), RU)).toBe('* Отпуск <2026-10-20 Вт>--<2026-10-22 Чт>\n');
    expect(moveEntry('* WAIT Ответ\n<2026-10-14 Ср>\n', 0, 'wait', D('2026-10-15'), RU)).toBe('* WAIT Ответ\n<2026-10-15 Чт>\n');
    expect(moveEntry('* TODO X\n  DEADLINE: <2026-10-24 Сб>\n', 0, 'undated', D('2026-10-15'), RU)).toBe('* TODO X\n  SCHEDULED: <2026-10-15 Чт> DEADLINE: <2026-10-24 Сб>\n');
  });
});

describe('settings', () => {
  it('read with defaults, bad values dropped', () => {
    expect(readCal(undefined)).toEqual(DEFAULT_CAL);
    const c = readCal({ pick: 'ask', taskFile: 'work.org', minutes: 45, from: 9, to: 8, view: 'week', weekends: false });
    expect([c.pick, c.taskFile, c.minutes, c.from, c.to, c.view, c.weekends]).toEqual(['ask', 'work.org', 60, 9, 20, 'week', false]);
  });
});

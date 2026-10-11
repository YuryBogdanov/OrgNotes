import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';
import { busyDays, isoDay, longDate, monthGrid, relWords, shiftDate, stampText } from './calendar';

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

describe('the calendar', () => {
  it('a day, a week, a month (the last day when short), a year', () => {
    expect(isoDay(shiftDate(D(2026, 10, 31), 'day', 1))).toBe('2026-11-01');
    expect(isoDay(shiftDate(D(2026, 10, 11), 'week', -1))).toBe('2026-10-04');
    expect(isoDay(shiftDate(D(2026, 1, 31), 'month', 1))).toBe('2026-02-28');
    expect(isoDay(shiftDate(D(2026, 12, 15), 'month', 1))).toBe('2027-01-15');
    expect(isoDay(shiftDate(D(2024, 2, 29), 'year', 1))).toBe('2025-02-28');
  });
  it('a month’s grid starts on Monday, other months’ days empty', () => {
    const g = monthGrid(2026, 9); // October 2026: starts on a Thursday
    expect(g[0].map((d) => d?.getDate() ?? null)).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(g.at(-1)!.filter(Boolean).at(-1)!.getDate()).toBe(31);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it('the words: the full date, how far, what will be written (time and repeat kept)', () => {
    const now = D(2026, 10, 11);
    expect(longDate(D(2026, 10, 21))).toBe('Среда, 21 октября 2026');
    expect(relWords(D(2026, 10, 21), now)).toBe('через 10 дней');
    expect(relWords(D(2026, 10, 12), now)).toBe('завтра');
    expect(relWords(D(2026, 10, 8), now)).toBe('3 дня назад');
    expect(relWords(D(2026, 10, 11), now)).toBe('сегодня');
    expect(stampText(D(2026, 10, 21), RU)).toBe('<2026-10-21 Ср>');
    expect(stampText(D(2026, 10, 21), RU, '<2026-10-14 Ср 10:00 +1w>')).toBe('<2026-10-21 Ср 10:00 +1w>');
  });
  it('days with tasks: open ones only; a deadline wins', () => {
    const t = '* TODO A\nSCHEDULED: <2026-10-14 Wed>\n* TODO B\nDEADLINE: <2026-10-14 Wed>\n* DONE C\nSCHEDULED: <2026-10-20 Tue>\n* NEXT D\nSCHEDULED: <2026-10-21 Wed>\n';
    const m = busyDays([{ headings: parseHeadings(t, DEFAULT_WORKFLOW), wf: DEFAULT_WORKFLOW }]);
    expect([...m.entries()]).toEqual([['2026-10-14', 'deadline'], ['2026-10-21', 'task']]);
  });
});

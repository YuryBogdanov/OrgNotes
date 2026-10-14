import { describe, expect, it } from 'vitest';
import { appendTask, parseDate, setPlanning, setTags, splitTags } from './edits';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';

const now = new Date(2026, 9, 10, 15, 30); // Sat 10 Oct 2026
const ymd = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null);
const hs = (t: string) => parseHeadings(t, DEFAULT_WORKFLOW);

describe('typed dates', () => {
  it('reads words, shifts and weekdays', () => {
    expect(ymd(parseDate('сегодня', now))).toBe('2026-10-10');
    expect(ymd(parseDate('Завтра', now))).toBe('2026-10-11');
    expect(ymd(parseDate('+3д', now))).toBe('2026-10-13');
    expect(ymd(parseDate('+2н', now))).toBe('2026-10-24');
    expect(ymd(parseDate('+1м', now))).toBe('2026-11-10');
    expect(ymd(parseDate('пт', now))).toBe('2026-10-16');
    expect(ymd(parseDate('сб', now))).toBe('2026-10-10'); // today counts
    expect(ymd(parseDate('понедельник', now))).toBe('2026-10-12');
  });
  it('reads calendar dates; a day without a year is the next to come', () => {
    expect(ymd(parseDate('14 окт', now))).toBe('2026-10-14');
    expect(ymd(parseDate('14 октября', now))).toBe('2026-10-14');
    expect(ymd(parseDate('3 янв', now))).toBe('2027-1-3');
    expect(ymd(parseDate('14.10', now))).toBe('2026-10-14');
    expect(ymd(parseDate('1.10.27', now))).toBe('2027-10-1');
    expect(ymd(parseDate('2026-12-31', now))).toBe('2026-12-31');
    expect(ymd(parseDate('5', now))).toBe('2026-11-5');
    expect(ymd(parseDate('20', now))).toBe('2026-10-20');
  });
  it('rejects what is not a date', () => {
    expect(parseDate('31.02', now)).toBeNull();
    expect(parseDate('купить молоко', now)).toBeNull();
    expect(parseDate('', now)).toBeNull();
  });
});

describe('planning lines', () => {
  const t = '* TODO Бюджет\nтекст\n';
  it('adds, changes and removes SCHEDULED and DEADLINE', () => {
    let x = setPlanning(t, hs(t)[0], 'SCHEDULED', new Date(2026, 9, 14));
    expect(x).toBe('* TODO Бюджет\nSCHEDULED: <2026-10-14 Ср>\nтекст\n');
    x = setPlanning(x, hs(x)[0], 'DEADLINE', new Date(2026, 9, 24));
    expect(x).toBe('* TODO Бюджет\nSCHEDULED: <2026-10-14 Ср> DEADLINE: <2026-10-24 Сб>\nтекст\n');
    x = setPlanning(x, hs(x)[0], 'SCHEDULED', null);
    expect(x).toBe('* TODO Бюджет\nDEADLINE: <2026-10-24 Сб>\nтекст\n');
    x = setPlanning(x, hs(x)[0], 'DEADLINE', null);
    expect(x).toBe(t);
  });
  it('keeps the time, the repeater, the indentation and English weekday names', () => {
    const r = '** TODO Синк\n   SCHEDULED: <2026-10-12 Mon 10:00 +1w>\n';
    expect(setPlanning(r, hs(r)[0], 'SCHEDULED', new Date(2026, 9, 19))).toBe('** TODO Синк\n   SCHEDULED: <2026-10-19 Mon 10:00 +1w>\n');
  });
});

describe('tags', () => {
  it('replaces or removes the tags at the end of the line', () => {
    const t = '* TODO Бюджет   :budget:finance:\n';
    expect(setTags(t, hs(t)[0], ['q4'])).toBe('* TODO Бюджет :q4:\n');
    expect(setTags(t, hs(t)[0], [])).toBe('* TODO Бюджет\n');
    expect(setTags('* Идея\n', hs('* Идея\n')[0], ['a', 'b'])).toBe('* Идея :a:b:\n');
    expect(splitTags(' budget, finance #q4 budget')).toEqual(['budget', 'finance', 'q4']);
  });
});

describe('new task', () => {
  it('appends a task at the end', () => {
    expect(appendTask('* Q4\n\n', 'TODO')).toEqual({ text: '* Q4\n* TODO \n', line: 1 });
    expect(appendTask('', 'NEW')).toEqual({ text: '* NEW \n', line: 0 });
  });
});

describe('a reschedule in the journal (ТЗ 36)', () => {
  const at = new Date(2026, 9, 14, 9, 5);
  it('a SCHEDULED moved to another day is noted on top of :LOGBOOK: (after the properties), as Org does', () => {
    const t = '* TODO A\nSCHEDULED: <2026-10-12 Пн>\n:PROPERTIES:\n:ID: x\n:END:\n:LOGBOOK:\n- State "TODO" from "" [2026-10-10 Сб 10:00]\n:END:\n';
    const x = setPlanning(t, hs(t)[0], 'SCHEDULED', new Date(2026, 9, 15), at);
    expect(x).toBe('* TODO A\nSCHEDULED: <2026-10-15 Чт>\n:PROPERTIES:\n:ID: x\n:END:\n:LOGBOOK:\n- Rescheduled from "<2026-10-12 Пн>" on [2026-10-14 Wed 09:05]\n- State "TODO" from "" [2026-10-10 Сб 10:00]\n:END:\n');
  });
  it('no note: without the journal, a first date, the same day, a removed date, a deadline', () => {
    const t = '* TODO A\nSCHEDULED: <2026-10-12 Пн>\n';
    expect(setPlanning(t, hs(t)[0], 'SCHEDULED', new Date(2026, 9, 15))).not.toContain('LOGBOOK');
    expect(setPlanning('* TODO A\n', hs('* TODO A\n')[0], 'SCHEDULED', new Date(2026, 9, 15), at)).not.toContain('LOGBOOK');
    expect(setPlanning(t, hs(t)[0], 'SCHEDULED', new Date(2026, 9, 12), at)).not.toContain('LOGBOOK');
    expect(setPlanning(t, hs(t)[0], 'SCHEDULED', null, at)).not.toContain('LOGBOOK');
    expect(setPlanning(t, hs(t)[0], 'DEADLINE', new Date(2026, 9, 20), at)).not.toContain('LOGBOOK');
  });
});

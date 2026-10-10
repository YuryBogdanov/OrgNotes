import { describe, expect, it } from 'vitest';
import { appendTask, parseDate, refile, setPlanning, setTags, splitTags } from './edits';
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

describe('refile and new task', () => {
  it('moves the subtree to the end of the other file as a top-level heading', () => {
    const src = '* Q4\n** TODO Бюджет\nтекст\n*** DONE Заявки\n** Найм\n';
    const h = hs(src)[1];
    const r = refile(src, h, '* Архив\n\n');
    expect(r.src).toBe('* Q4\n** Найм\n');
    expect(r.dst).toBe('* Архив\n* TODO Бюджет\nтекст\n** DONE Заявки\n');
    expect(refile(src, h, '').dst).toBe('* TODO Бюджет\nтекст\n** DONE Заявки\n');
  });
  it('appends a task at the end', () => {
    expect(appendTask('* Q4\n\n', 'TODO')).toEqual({ text: '* Q4\n* TODO \n', line: 1 });
    expect(appendTask('', 'NEW')).toEqual({ text: '* NEW \n', line: 0 });
  });
});

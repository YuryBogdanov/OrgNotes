import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';
import { headingKeys, initialTouch, reconcileFile, subtreeText, type TouchRecords } from './touch';

// ТЗ 40.1: the rules of a touch (§2.1), of a key (§2.3), of a first date (§2.4).

const read = (text: string) => ({ lines: text.split('\n'), hs: parseHeadings(text, DEFAULT_WORKFLOW) });
const T0 = new Date(2026, 9, 1).getTime();
const T1 = new Date(2026, 9, 16, 11, 20).getTime();
const MIDTERM = [
  '* TODO Миграция биллинга',
  ':LOGBOOK:',
  '- Note taken on [2026-10-02 Чт 11:20] \\\\',
  '  ждём бизнес',
  ':END:',
  'Описание',
  '** NEXT Черновик',
  '* Найм в команду',
  'Вакансия',
].join('\n');

/** The records of a text read at T0 (no history), then of another version at T1. */
function twice(a: string, b: string, file = 'Midterm.org', mode: 'change' | 'open' = 'change') {
  const r0 = read(a);
  const first = reconcileFile(file, r0.lines, r0.hs, {}, {}, T0, 'open').records;
  const r1 = read(b);
  return { first, next: reconcileFile(file, r1.lines, r1.hs, first, {}, T1, mode) };
}
const atOf = (rs: TouchRecords, title: string) => Object.entries(rs).find(([k]) => k.endsWith(title))![1];

describe('what is a touch', () => {
  it('a change of the subtree touches the heading and its ancestors, not the others', () => {
    const { next } = twice(MIDTERM, MIDTERM.replace('** NEXT Черновик', '** DONE Черновик'));
    expect(atOf(next.records, '› Черновик').at).toBe(T1);
    expect(atOf(next.records, '› Миграция биллинга').at).toBe(T1); // the child is part of it
    expect(atOf(next.records, '› Найм в команду').approx).toBe(true); // untouched: its first date stays
  });
  it('spaces at the ends of lines and blank lines are not a touch', () => {
    const { next } = twice(MIDTERM, MIDTERM.replace('Описание', 'Описание   \n\n'));
    expect(atOf(next.records, '› Миграция биллинга').approx).toBe(true);
  });
  it('the order of siblings is not a touch of either', () => {
    const [a, b] = [MIDTERM.slice(0, MIDTERM.indexOf('* Найм')), MIDTERM.slice(MIDTERM.indexOf('* Найм'))];
    const { next } = twice(MIDTERM, b + '\n' + a.trimEnd());
    expect(atOf(next.records, '› Найм в команду').approx).toBe(true);
    expect(atOf(next.records, '› Миграция биллинга').approx).toBe(true);
  });
});

describe('how a heading is known', () => {
  it('by :ID:, else by the file and the chain of titles; twins get «#2»', () => {
    const { hs } = read('* A\n:PROPERTIES:\n:ID: x1\n:END:\n* B\n** C\n* B\n');
    expect(headingKeys('f.org', hs)).toEqual(['id:x1', 'f.org › B', 'f.org › B › C', 'f.org › B #2']);
  });
  it('moved to another file unchanged (a refile): the history goes along, even under another level', () => {
    const src = read(MIDTERM);
    const first = reconcileFile('Midterm.org', src.lines, src.hs, {}, {}, T0, 'open').records;
    const dst = read('* Архив\n' + MIDTERM.split('\n').slice(0, 7).map((l) => (l.startsWith('*') ? '*' + l : l)).join('\n'));
    const moved = Object.fromEntries(Object.entries(first).filter(([k]) => k.includes('Миграция') ));
    const got = reconcileFile('Archive.org', dst.lines, dst.hs, {}, moved, T1, 'change').records;
    expect(atOf(got, '› Миграция биллинга')).toMatchObject({ approx: true, at: atOf(first, '› Миграция биллинга').at });
    expect(atOf(got, '› Архив').at).toBe(T1); // new here, made now
  });
  it('a new bare heading like one in another file is new, not moved from there', () => {
    const other = read('* TODO Позвонить\n');
    const there = reconcileFile('Work.org', other.lines, other.hs, {}, {}, T0, 'open').records;
    const here = read(MIDTERM + '\n* TODO Позвонить');
    const got = reconcileFile('Midterm.org', here.lines, here.hs, there, {}, T1, 'change').records;
    expect(atOf(got, 'Midterm.org › Позвонить')).toMatchObject({ at: T1, approx: false });
  });
  it('renamed in place (the same line, the same body): touched, its old key gone', () => {
    const { next } = twice(MIDTERM, MIDTERM.replace('Найм в команду', 'Найм в платформу'));
    expect(atOf(next.records, '› Найм в платформу')).toMatchObject({ at: T1, approx: false });
    expect(next.gone).toEqual([]);
    expect(Object.keys(next.records).some((k) => k.endsWith('Найм в команду'))).toBe(false);
  });
  it('a heading deleted: its key is gone', () => {
    const { next } = twice(MIDTERM, MIDTERM.slice(0, MIDTERM.indexOf('* Найм')));
    expect(next.gone).toEqual(['Midterm.org › Найм в команду']);
  });
});

describe('the first dates', () => {
  it('the latest entry of :LOGBOOK: in the subtree, else CLOSED, else the file', () => {
    const { lines, hs } = read(MIDTERM + '\n* DONE Готово\nCLOSED: [2026-09-20 Вс 10:00]\n');
    expect(initialTouch(lines, hs[0], T1)).toEqual({ at: new Date(2026, 9, 2, 11, 20).getTime(), src: 'logbook' });
    expect(initialTouch(lines, hs[3], T1)).toEqual({ at: new Date(2026, 8, 20, 10, 0).getTime(), src: 'closed' });
    expect(initialTouch(lines, hs[2], T1)).toEqual({ at: T1, src: 'file' });
  });
  it('a heading made while the app is open gets its exact date; on opening, a date from the file', () => {
    const add = MIDTERM + '\n* Новое';
    expect(atOf(twice(MIDTERM, add).next.records, '› Новое')).toMatchObject({ at: T1, approx: false });
    expect(atOf(twice(MIDTERM, add, 'Midterm.org', 'open').next.records, '› Новое')).toMatchObject({ at: T1, approx: true, src: 'file' });
  });
  it('the subtree as compared: relative stars, no blank lines, no spaces at the ends', () => {
    const { lines, hs } = read('* A\n** B  \n\n*** C\n');
    expect(subtreeText(lines, hs[1])).toBe('* B\n** C');
  });
});

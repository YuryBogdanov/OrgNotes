import { describe, expect, it } from 'vitest';
import { parseHeadings } from '@panopticon/api/org';
import { DEFAULTS, grouped, longIn, readDay, readSettings, shown, dueWords, ageWords, approxWords, mattersWord, type Matter } from './long';

// ТЗ 40 §1, §4.1, §4.5: which headings are long matters, their day to look, their group and tone.

const WF = { open: ['TODO', 'WAIT'], done: ['DONE'] };
const hs = (t: string) => parseHeadings(t, WF);
const TODAY = new Date(2026, 9, 16, 11, 0);
const m = (o: Partial<Matter>): Matter => ({ key: 'k', path: 'Midterm.org', line: 0, title: 'Дело', keyword: null, note: null, waiting: null, nextReview: null, ...o });

describe('long matters', () => {
  const MID = ['* WAIT Миграция', '** TODO Подзадача', '* DONE Закрытое', '* Без статуса', '* Старое :ARCHIVE:', '** В архиве :long:', ''].join('\n');
  it('by place: the level of the file, not done, not archived; without a status too', () => {
    expect(longIn('Midterm.org', hs(MID), WF.done, DEFAULTS.sources).map((h) => h.title)).toEqual(['Миграция', 'Без статуса']);
  });
  it('by tag: its own tag only, not one inherited; inside another long one both are there', () => {
    const t = ['* Проект :long:', '** Задача', '** Подпроект :long:', '* Дело', ''].join('\n');
    expect(longIn('work.org', hs(t), WF.done, [{ kind: 'tag', tag: 'long' }]).map((h) => h.title)).toEqual(['Проект', 'Подпроект']);
  });
  it('a heading under two sources is there once; an archive file has none', () => {
    const t = '* Миграция :long:\n';
    expect(longIn('Midterm.org', hs(t), WF.done, DEFAULTS.sources)).toHaveLength(1);
    expect(longIn('Midterm.org_archive', hs(t), WF.done, DEFAULTS.sources)).toHaveLength(0);
  });
});

describe('the settings', () => {
  it('the defaults: Midterm.org level 1, the tag long, 14 days, WAIT, the block on «Сегодня»', () => {
    expect(readSettings(undefined)).toEqual(DEFAULTS);
  });
  it('wrong values give way to the defaults; no sources is a choice', () => {
    expect(readSettings({ sources: [{ kind: 'file', file: 'a.org', level: 9 }, { kind: 'tag', tag: ':x:' }, { kind: '?' }], norm: -3 })).toEqual({
      ...DEFAULTS,
      sources: [{ kind: 'file', file: 'a.org', level: 3 }, { kind: 'tag', tag: 'x' }],
    });
    expect(readSettings({ sources: [] }).sources).toEqual([]);
  });
});

describe('the day to look and the groups', () => {
  it('the touch and the norm; :NEXT_REVIEW: wins', () => {
    const s = shown(m({ touched: { at: new Date(2026, 8, 23, 18, 0), approx: false } }), TODAY, 14);
    expect(s).toMatchObject({ age: 23, left: -9, group: 'due', tone: 'late' });
    expect(dueWords(s)).toBe('просрочено 9 дн.');
    const r = shown(m({ touched: { at: new Date(2026, 8, 23), approx: false }, nextReview: readDay('[2026-10-21 Ср]') }), TODAY, 14);
    expect(r).toMatchObject({ left: 5, group: 'ok', tone: 'calm' });
    expect(dueWords(r)).toBe('21 окт');
  });
  it('waiting until its day; past it — «Пора проверить»', () => {
    expect(shown(m({ touched: { at: TODAY, approx: false }, waiting: 'бизнес' }), TODAY, 14).group).toBe('waiting');
    expect(shown(m({ touched: { at: new Date(2026, 8, 1), approx: false }, waiting: 'бизнес' }), TODAY, 14).group).toBe('due');
  });
  it('the tone: yellow with less than 30% of the norm left', () => {
    expect(shown(m({ touched: { at: new Date(2026, 9, 6), approx: false } }), TODAY, 14)).toMatchObject({ left: 4, tone: 'soon' });
    expect(shown(m({ touched: { at: new Date(2026, 9, 10), approx: false } }), TODAY, 14)).toMatchObject({ left: 8, tone: 'calm' });
  });
  it('the most overdue first; the words of an approximate date', () => {
    const rows = [
      { m: m({ title: 'Б', touched: { at: new Date(2026, 8, 20), approx: false } }) },
      { m: m({ title: 'А', touched: { at: new Date(2026, 7, 1), approx: true, src: 'logbook' } }) },
      { m: m({ title: 'В', touched: { at: TODAY, approx: false } }) },
    ].map((r) => ({ ...r, s: shown(r.m, TODAY, 14) }));
    const g = grouped(rows);
    expect(g.due.map((r) => r.m.title)).toEqual(['А', 'Б']);
    expect(g.ok.map((r) => r.m.title)).toEqual(['В']);
    expect(ageWords(rows[1].s, rows[1].m)).toBe('≈ 76 дн.');
    expect(approxWords(rows[1].m)).toBe('Примерно: по записи от 1 авг в :LOGBOOK:');
    expect(approxWords(m({ touched: { at: TODAY, approx: true, src: 'file' } }))).toBe('Примерно: по дате изменения файла');
  });
  it('unknown touch: no age, no day, «В норме»', () => {
    expect(shown(m({}), TODAY, 14)).toMatchObject({ age: null, due: null, group: 'ok' });
    expect(mattersWord(14)).toBe('14 дел');
    expect(mattersWord(21)).toBe('21 дело');
    expect(mattersWord(3)).toBe('3 дела');
  });
});

import { describe, expect, it } from 'vitest';
import { blocksIn, cookieIn, deadlineState, drawerName, emphasisIn, listItem, parseStamp, planningIn, relLabel, stampLabel, stampsIn, tableCells, tableRoles, toggleBox } from './rich';

const NOW = new Date(2026, 9, 11, 14, 0);

describe('dates', () => {
  it('a stamp with its time and repeat; another year shows the year', () => {
    const s = parseStamp('<2026-10-12 Пн 10:00 +1w>')!;
    expect(stampLabel(s, NOW)).toBe('Пн, 12 окт, 10:00 · каждую неделю');
    expect(stampLabel(parseStamp('[2026-10-08 Чт 18:20]')!, NOW)).toBe('Чт, 8 окт, 18:20');
    expect(stampLabel(parseStamp('<2027-01-05 Tue>')!, NOW)).toBe('Вт, 5 янв 2027');
    expect(stampLabel(parseStamp('<2026-10-14 Wed 09:00-10:30 .+2d>')!, NOW)).toBe('Ср, 14 окт, 09:00–10:30 · каждые 2 дня');
    expect(parseStamp('<2026-13-40>')).toBeNull();
    expect(parseStamp('<2026-10-14 Wed]')).toBeNull();
  });
  it('relative words and how urgent a deadline is', () => {
    expect(relLabel(new Date(2026, 9, 11), NOW)).toBe('сегодня');
    expect(relLabel(new Date(2026, 9, 12), NOW)).toBe('завтра');
    expect(relLabel(new Date(2026, 9, 14), NOW)).toBe('через 3 дн');
    expect(relLabel(new Date(2026, 9, 9), NOW)).toBe('2 дн назад');
    expect(deadlineState(new Date(2026, 9, 9), NOW)).toEqual({ level: 'over', rel: 'просрочен на 2 дн' });
    expect(deadlineState(new Date(2026, 9, 14), NOW).level).toBe('near');
    expect(deadlineState(new Date(2026, 9, 24), NOW)).toEqual({ level: 'far', rel: 'через 13 дн' });
  });
  it('planning keywords with their stamps; stamps elsewhere in a line', () => {
    const p = planningIn('   DEADLINE: <2026-10-24 Сб> SCHEDULED: <2026-10-14 Ср>');
    expect(p.map((x) => [x.kind, x.from, x.to])).toEqual([['DEADLINE', 3, 28], ['SCHEDULED', 29, 55]]);
    expect(planningIn('текст SCHEDULED: <2026-10-14>')).toEqual([]);
    expect(stampsIn('встреча <2026-10-14 Ср> и [2026-10-01 Чт]').map((x) => [x.from, x.to, x.stamp.active])).toEqual([[8, 23, true], [26, 41, false]]);
  });
});

describe('a line', () => {
  it('emphasis by Org’s rules; not inside links or dates, not across words with a space at the edge', () => {
    const t = 'Свести *пяти команд* и /курсив/, =budget.xlsx= ~v~ _под_ +зач+';
    expect(emphasisIn(t).map((e) => [e.kind, t.slice(e.inner.from, e.inner.to)])).toEqual([['b', 'пяти команд'], ['i', 'курсив'], ['code', 'budget.xlsx'], ['code', 'v'], ['u', 'под'], ['s', 'зач']]);
    expect(emphasisIn('a * b * c')).toEqual([]);
    expect(emphasisIn('путь /a/b/ тут', [{ from: 5, to: 10 }])).toEqual([]);
    expect(emphasisIn('2*3*4')).toEqual([]);
  });
  it('list items, bullets and checkboxes', () => {
    expect(listItem('  - [X] инфраструктура')).toMatchObject({ indent: 2, bullet: { from: 2, to: 3 }, box: { from: 4, to: 7, state: 'X' } });
    expect(listItem('- [ ] найм')?.box?.state).toBe(' ');
    expect(listItem('+ пункт')).toMatchObject({ bullet: { from: 0, to: 1 }, box: null });
    expect(listItem('1. первый')).toMatchObject({ ordered: true });
    expect(listItem('-----')).toBeNull();
    expect(listItem('текст')).toBeNull();
  });
  it('tables: the header above the first rule, the rule, the rows', () => {
    expect(tableRoles(['| a | b |', '|---+---|', '| 1 | 2 |', 'текст', '| x |'])).toEqual(['head', 'rule', 'row', null, 'row']);
  });
  it('a checkbox ticked: its line and the parent’s cookie counted again', () => {
    const lines = ['** NEXT Свести расходы [1/3]', '- [X] инфраструктура', '- [ ] найм', '- [ ] обучение', '** Дальше'];
    const out = toggleBox(lines, 2, 0, (i) => i === 0 || i === 4);
    expect(out).toEqual([{ line: 2, text: '- [X] найм' }, { line: 0, text: '** NEXT Свести расходы [2/3]' }]);
    expect(toggleBox(['* A [50%]', '- [X] a', '- [ ] b'], 1, 0, (i) => i === 0)[1].text).toBe('* A [0%]');
    expect(cookieIn('* A [2/5]')).toMatchObject({ done: 2, total: 5, pct: false });
    expect(drawerName('PROPERTIES')).toBe('Свойства');
    expect(drawerName('LOGBOOK')).toBe('Журнал');
    expect(drawerName('NOTES')).toBe('NOTES');
  });
});

describe('blocks and table cells (ТЗ 42.7)', () => {
  it('blocks with their kind and language; one not closed runs to the end', () => {
    const t = ['text', '#+BEGIN_SRC python', 'print(1)', '#+END_SRC', '#+begin_quote', 'Цитата', '#+end_quote', '#+BEGIN_EXAMPLE', 'x'];
    expect(blocksIn(t)).toEqual([
      { begin: 1, end: 3, kind: 'SRC', lang: 'python' },
      { begin: 4, end: 6, kind: 'QUOTE', lang: '' },
      { begin: 7, end: 8, kind: 'EXAMPLE', lang: '' },
    ]);
  });
  it('the cells of a row, trimmed; an empty one kept', () => {
    expect(tableCells('| Срок | Кто |  |')).toEqual(['Срок', 'Кто', '']);
    expect(tableCells('  |a|b')).toEqual(['a', 'b']);
  });
});

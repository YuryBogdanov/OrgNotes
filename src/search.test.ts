import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';
import { findAll, fold, fragment, nearest, searchFile, summary } from './search';

const T = ['* Q4 2026', '** TODO Подготовить бюджет 2027 :budget:', '   Свести заявки: Бюджет на ёлку.', '*** Бюджетный план', '#+BEGIN_SRC', '* бюджет в блоке', '#+END_SRC', ''].join('\n');
const hs = parseHeadings(T, DEFAULT_WORKFLOW);
const o = { cs: false, word: false };

describe('in a file', () => {
  it('case and «ё» folded, positions kept; «Aa» and «Слово»', () => {
    expect(fold('Ёлка ЁЖ', false)).toBe('елка еж');
    expect(findAll('Бюджет бюджетный БЮДЖЕТ', 'бюджет', o)).toEqual([0, 7, 17]);
    expect(findAll('Бюджет бюджетный БЮДЖЕТ', 'бюджет', { cs: true, word: false })).toEqual([7]);
    expect(findAll('Бюджет бюджетный БЮДЖЕТ', 'бюджет', { cs: false, word: true })).toEqual([0, 17]);
    expect(findAll('на ёлку', 'елку', o)).toEqual([3]);
    expect(findAll('aaaa', 'aa', o)).toEqual([0, 2]);
    expect(findAll('x', '', o)).toEqual([]);
  });
  it('the first match from the caret down, round to the start', () => {
    expect(nearest([5, 20, 40], 21)).toBe(2);
    expect(nearest([5, 20, 40], 41)).toBe(0);
    expect(nearest([], 3)).toBe(-1);
  });
  it('a fragment around a match, cut with «…»', () => {
    const long = 'а'.repeat(100) + 'бюджет' + 'в'.repeat(100);
    const f = fragment(long, 100, 6);
    expect(f.match).toBe('бюджет');
    expect(f.pre.startsWith('…') && f.post.endsWith('…')).toBe(true);
    expect((f.pre + f.match + f.post).length).toBeLessThanOrEqual(82);
    expect(fragment('короткая строка', 0, 8)).toEqual({ pre: '', match: 'короткая', post: ' строка' });
  });
});

describe('in every file', () => {
  it('hits with the heading path and line; a heading shown without stars, its status apart; «Заголовки» / «Текст»', () => {
    const all = searchFile(T, hs, 'бюджет', o, 'all');
    expect(all.map((h) => [h.line, h.heading, h.keyword, h.where, h.pre + h.match + h.post])).toEqual([
      [1, true, 'TODO', 'Q4 2026', 'Подготовить бюджет 2027 :budget:'],
      [2, false, null, 'Q4 2026 › Подготовить бюджет 2027', 'Свести заявки: Бюджет на ёлку.'],
      [3, true, null, 'Q4 2026 › Подготовить бюджет 2027', 'Бюджетный план'],
      [5, false, null, 'Q4 2026 › Подготовить бюджет 2027 › Бюджетный план', '* бюджет в блоке'], // in a block: text, not a heading
    ]);
    expect(searchFile(T, hs, 'бюджет', o, 'headings').map((h) => h.line)).toEqual([1, 3]);
    expect(searchFile(T, hs, 'бюджет', o, 'text').map((h) => h.line)).toEqual([2, 5]);
    expect(searchFile(T, hs, 'бюджет', o, 'all', 2)).toHaveLength(2);
    expect(summary(14, 4)).toBe('14 совпадений в 4 файлах');
    expect(summary(1, 1)).toBe('1 совпадение в 1 файле');
  });
});

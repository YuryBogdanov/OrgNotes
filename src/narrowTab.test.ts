import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';
import { narrowRangeOf, narrowTarget } from './narrowTab';

// ТЗ 42 §5.8: which lines a narrowed tab shows.

const T = ['* Роадмап', 'текст', '* Переезд хранилища', '** Бенчмарк', 'детали', '* Готово', ''].join('\n');
const hs = (t: string) => parseHeadings(t, DEFAULT_WORKFLOW);

describe('narrowing a tab', () => {
  it('the heading under the caret, its subtree', () => {
    const n = narrowTarget(hs(T), 4)!;
    expect(n).toEqual({ line: 3, title: 'Бенчмарк' });
    expect(narrowRangeOf(hs(T), narrowTarget(hs(T), 2))).toEqual({ line: 2, end: 5, path: ['Переезд хранилища'], title: 'Переезд хранилища' });
    expect(narrowTarget(hs('пролог\n* A\n'), 0)).toBeNull();
  });
  it('lines added above: found by its title; gone — null', () => {
    const moved = 'новая строка\n' + T;
    expect(narrowRangeOf(hs(moved), { line: 2, title: 'Переезд хранилища' })?.line).toBe(3);
    expect(narrowRangeOf(hs(T.replace('* Переезд хранилища\n', '')), { line: 2, title: 'Переезд хранилища' })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW } from './org';
import { statusChoices } from './headingChoices';
import { tagRows } from './tags';

describe('a heading\'s choices (ТЗ 44 §3.2, §3.3)', () => {
  it('the statuses of its set: the open ones, then the done; the current marked', () => {
    const c = statusChoices(DEFAULT_WORKFLOW, 'NEXT');
    expect(c.open.map((s) => s.name)).toContain('NEXT');
    expect(c.open.every((s) => !s.done)).toBe(true);
    expect(c.done.every((s) => s.done)).toBe(true);
    expect([...c.open, ...c.done].filter((s) => s.current).map((s) => s.name)).toEqual(['NEXT']);
  });
  it('the tags offered: not on the heading, by substring, «Создать» for a new name', () => {
    const list = [{ tag: 'budget', n: 3 }, { tag: 'okr', n: 2 }, { tag: 'hr', n: 1 }];
    expect(tagRows(list, ['okr'], '')).toEqual([{ tag: 'budget', n: 3, create: false }, { tag: 'hr', n: 1, create: false }]);
    expect(tagRows(list, [], 'bu')).toEqual([{ tag: 'budget', n: 3, create: false }, { tag: 'bu', n: 0, create: true }]);
    expect(tagRows(list, [], ':budget:').map((r) => r.create)).toEqual([false]);
  });
});

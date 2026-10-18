import { describe, expect, it } from 'vitest';
import { facetCounts, noFilters, passes, type Facet } from './searchFilters';

const all: Facet[] = [
  { file: 'a', status: 'TODO', tags: ['work'] },
  { file: 'a', status: '', tags: ['work', 'q4'] },
  { file: 'b', status: 'NEXT', tags: ['q4'] },
  { file: 'b', status: 'TODO', tags: [] },
];
describe('the filters of the results (ТЗ 53 §4)', () => {
  it('none: all pass; a file off drops its matches; statuses ИЛИ; tags И', () => {
    const f = noFilters();
    expect(all.filter((x) => passes(x, f))).toHaveLength(4);
    f.off.add('a');
    expect(all.filter((x) => passes(x, f)).map((x) => x.file)).toEqual(['b', 'b']);
    const g = noFilters();
    g.status = new Set(['TODO', 'NEXT']);
    expect(all.filter((x) => passes(x, g))).toHaveLength(3);
    const h = noFilters();
    h.tags = new Set(['work', 'q4']);
    expect(all.filter((x) => passes(x, h))).toHaveLength(1);
  });
  it('a filter\'s numbers are counted over the others, not itself', () => {
    const f = noFilters();
    f.status = new Set(['TODO']);
    const c = facetCounts(all, f);
    expect(c.shown).toBe(2);
    expect(Object.fromEntries(c.status)).toEqual({ TODO: 2, '': 1, NEXT: 1 }); // all, its own not applied
    expect(Object.fromEntries(c.files)).toEqual({ a: 1, b: 1 }); // TODO only
    expect(Object.fromEntries(c.tags)).toEqual({ work: 1 });
  });
});

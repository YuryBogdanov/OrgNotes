import { describe, expect, it } from 'vitest';
import { insertHeading, listEnter, parseHeadings, stampText, weekdayNames, workflow } from './org';

// @panopticon/api/org (ТЗ 27 §2.1): what a plugin with its own structure in a file works with, without the core
describe('the Org library of the plugins', () => {
  it('parses with the keywords of index.workflow, inserts a subtree, writes a stamp, goes on a list', () => {
    const wf = workflow({ open: ['IDEA'], done: ['SHIPPED'] });
    const t = '* Q4\n** IDEA Мысль\n';
    const hs = parseHeadings(t, wf);
    expect(hs.map((h) => [h.level, h.keyword, h.title])).toEqual([[1, null, 'Q4'], [2, 'IDEA', 'Мысль']]);
    expect(insertHeading(t, { under: hs[0], position: 'last' }, '* SHIPPED Готово')).toBe('* Q4\n** IDEA Мысль\n** SHIPPED Готово\n');
    expect(stampText(new Date(2026, 9, 15), weekdayNames(''))).toBe('<2026-10-15 Чт>');
    expect(listEnter('- раз', 5)).toEqual({ value: '- раз\n- ', caret: 8 });
  });
});

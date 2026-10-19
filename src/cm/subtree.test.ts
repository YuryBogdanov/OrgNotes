import { describe, expect, it } from 'vitest';
import { subtreeOf } from './subtree';

describe('the subtree of a heading (ТЗ 56 §4)', () => {
  it('down to the next heading of its level or higher; its blank end left out; not a heading — none', () => {
    const l = ['* A', 'text', '** B', 'b', '', '* C', '** D'];
    expect(subtreeOf(l, 0)).toEqual([0, 3]);
    expect(subtreeOf(l, 2)).toEqual([2, 3]);
    expect(subtreeOf(l, 6)).toEqual([6, 6]);
    expect(subtreeOf(l, 1)).toBeNull();
  });
});

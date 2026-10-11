import { describe, expect, it } from 'vitest';
import { MAX_INDENT, bodyIndent, starShift } from './orgIndent';

describe('structural view: how far things move', () => {
  const on = { oneStar: true, indent: true, step: 2 };
  it('one star: the star by (N−1) × step, the text under it by that plus «* »', () => {
    expect([1, 2, 3, 4].map((n) => starShift(n, on))).toEqual([0, 2, 4, 6]);
    expect([0, 1, 2, 3, 4].map((n) => bodyIndent(n, on))).toEqual([0, 2, 4, 6, 8]); // 0: before the first heading
    expect(bodyIndent(3, { ...on, step: 4 })).toBe(10);
  });
  it('never more than 16 characters', () => {
    expect(bodyIndent(8, on)).toBe(16);
    expect(bodyIndent(20, on)).toBe(MAX_INDENT);
    expect(starShift(20, on)).toBe(MAX_INDENT - 2);
  });
  it('all stars shown: the text by (N−1) × step plus the stars and the space; text not moved: nothing', () => {
    expect(bodyIndent(3, { ...on, oneStar: false })).toBe(4 + 4);
    expect(bodyIndent(3, { ...on, indent: false })).toBe(0);
  });
});

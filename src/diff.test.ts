import { describe, expect, it } from 'vitest';
import { compare, diffLines } from './diff';

const sig = (a: string, b: string) => diffLines(a.split('\n'), b.split('\n')).map((o) => o.kind + o.text).join('|');

describe('line diff', () => {
  it('finds changed, added and removed lines', () => {
    expect(sig('a\nb\nc', 'a\nb\nc')).toBe(' a| b| c');
    expect(sig('a\nb\nc', 'a\nB\nc')).toBe(' a|-b|+B| c');
    expect(sig('a\nc', 'a\nb\nc')).toBe(' a|+b| c');
    expect(sig('a\nb\nc', 'a\nc')).toBe(' a|-b| c');
    expect(sig('', 'x')).toBe('-|+x');
  });
  it('numbers − lines by the disk file, the others by my version', () => {
    const ops = diffLines(['x', 'old', 'y'], ['x', 'new', 'y', 'z']);
    expect(ops.map((o) => [o.kind, o.a ?? null, o.b ?? null])).toEqual([[' ', 1, 1], ['-', 2, null], ['+', null, 2], [' ', 3, 3], ['+', null, 4]]);
  });
});

describe('the comparison', () => {
  const lines = (n: number, f = (i: number) => `l${i}`) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n');
  it('counts fragments, not lines, and keeps three lines of context', () => {
    const disk = lines(20);
    const mine = lines(20, (i) => (i === 5 || i === 6 ? `L${i}` : i === 15 ? 'L15' : `l${i}`));
    const { rows, fragments } = compare(disk, mine);
    expect(fragments).toBe(2);
    expect(rows.map((r) => (r.kind === 'gap' ? `…${r.n}` : r.kind + r.n))).toEqual([
      '…1', ' 2', ' 3', ' 4', '-5', '-6', '+5', '+6', ' 7', ' 8', ' 9', '…2', ' 12', ' 13', ' 14', '-15', '+15', ' 16', ' 17', ' 18', '…2',
    ]);
  });
  it('shows nothing to fold when the files are short', () => {
    const { rows, fragments } = compare('a\nb', 'a\nc');
    expect(fragments).toBe(1);
    expect(rows.some((r) => r.kind === 'gap')).toBe(false);
  });
});

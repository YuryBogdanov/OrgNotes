import { describe, expect, it } from 'vitest';
import { TOKENS } from './tokens';
import { BUILTIN, NEXT_THEME } from '../themes';

// ТЗ 42 §9: the contrast of the tokens in both appearances — the text of a file (ink2) 7:1, the secondary (ink3)
// 4.5:1, `lampink` on the background and on `lampsoft` 4.5:1. The colours with alpha are laid on what is under them.

type RGB = [number, number, number];
const parse = (c: string): [RGB, number] => {
  const m = /^rgba\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)$/.exec(c.replace(/\s/g, ''));
  if (m) return [[+m[1], +m[2], +m[3]], +m[4]];
  const n = parseInt(c.slice(1, 7), 16);
  return [[(n >> 16) & 255, (n >> 8) & 255, n & 255], 1];
};
const over = (c: string, under: RGB): RGB => {
  const [rgb, a] = parse(c);
  return rgb.map((v, i) => v * a + under[i] * (1 - a)) as RGB;
};
const lum = (c: RGB) => {
  const ch = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const ratio = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe.each(['light', 'dark'] as const)('the tokens: %s', (a) => {
  const t = TOKENS[a];
  const bg = parse(t.bg)[0];
  const soft = over(t.lampsoft, bg);
  it('the text 7:1, the secondary 4.5:1', () => {
    expect(ratio(over(t.ink, bg), bg)).toBeGreaterThanOrEqual(7);
    expect(ratio(over(t.ink2, bg), bg)).toBeGreaterThanOrEqual(7);
    expect(ratio(over(t.ink3, bg), bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('lampink on the background and on lampsoft 4.5:1', () => {
    expect(ratio(over(t.lampink, bg), bg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(over(t.lampink, soft), soft)).toBeGreaterThanOrEqual(4.5);
  });
  it('«Синька» is a built-in theme of this appearance, its ground the tokens\' one', () => {
    const th = BUILTIN.find((x) => x.name === NEXT_THEME[a])!;
    expect(th.appearance).toBe(a);
    expect(th.colors.bg).toBe(t.bg);
  });
});

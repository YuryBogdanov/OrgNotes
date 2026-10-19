import { describe, expect, it } from 'vitest';
import { TOKENS } from './tokens';
import { BUILTIN, NEXT_THEME } from '../themes';

/** The tokens the concept had before ТЗ 57 (written out): «Бумага» and «Синька» derive these, ±2 per channel when
 *  laid on the ground. */
const WAS = {
  light: {
    bg: '#f8f6f0', side: '#efece4',
    ink: '#15243a', ink2: 'rgba(21,36,58,.77)', ink3: 'rgba(21,36,58,.63)',
    rule: 'rgba(25,55,105,.14)',
    lamp: '#e3aa3c', lampink: '#8a5f0e', onlamp: '#231803', lampsoft: 'rgba(227,170,60,.17)', lampline: 'rgba(176,124,20,.55)',
    todo: '#c4432f', next: '#1f5fbf', wait: '#a2700c', done: '#2f7d4f', plug: '#7a3fc4',
    chip: 'rgba(25,55,105,.06)', chip2: 'rgba(25,55,105,.1)', field: '#ffffff', card: '#ffffff', segon: '#ffffff',
    grid: 'rgba(30,90,180,.06)', panel: 'rgba(239,236,228,.75)', track: 'rgba(25,55,105,.09)', dim: 'rgba(240,238,232,.6)',
    popshadow: '0 24px 60px rgba(30,40,70,.22)',
  },
  dark: {
    bg: '#101c2c', side: '#0c1522',
    ink: '#e6edf6', ink2: 'rgba(222,232,246,.68)', ink3: 'rgba(214,228,246,.52)',
    rule: 'rgba(200,220,245,.12)',
    lamp: '#f2c66d', lampink: '#f2c66d', onlamp: '#1a1405', lampsoft: 'rgba(242,198,109,.13)', lampline: 'rgba(242,198,109,.5)',
    todo: '#ff8f7e', next: '#8ab8ff', wait: '#f2c66d', done: '#8fd6a6', plug: '#c9a2ff',
    chip: 'rgba(255,255,255,.06)', chip2: 'rgba(255,255,255,.1)', field: 'rgba(0,0,0,.25)', card: '#17263a', segon: 'rgba(255,255,255,.12)',
    grid: 'rgba(190,215,250,.035)', panel: 'rgba(12,21,34,.6)', track: 'rgba(255,255,255,.07)', dim: 'rgba(5,10,20,.55)',
    popshadow: '0 24px 60px rgba(0,0,0,.5)',
  },
} as const;

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
  it('derived from «Бумага» / «Синька»: the values the concept had, ±2 per channel on the ground', () => {
    const was: Record<string, string> = WAS[a];
    expect(Object.keys(t).sort()).toEqual(Object.keys(was).sort());
    const bg = parse(was.bg)[0];
    const colorOf = (v: string) => /rgba\([^)]*\)|#[0-9a-f]{6}/i.exec(v)![0];
    for (const k of Object.keys(was)) {
      const x = over(colorOf(was[k]), bg);
      const y = over(colorOf(t[k]), bg);
      expect(Math.max(...x.map((v, i) => Math.abs(v - y[i]))), k).toBeLessThanOrEqual(2);
    }
  });
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

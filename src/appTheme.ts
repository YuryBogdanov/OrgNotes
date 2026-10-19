// The theme of the whole app (ТЗ 57): a few base colours — the ground, the text, the accent — the eight named colours
// and some details; the new interface's tokens (next/tokens.ts) and the editor's colours (ThemeColors, ТЗ 25) are
// derived from them, so any theme is whole. Light or dark is not a field: it is the ground's luminance.

import type { Named, ThemeColors } from './themes';

export interface AppTheme {
  name: string;
  source: 'builtin' | 'own' | { plugin: string };
  base: { bg: string; ink: string; accent: string };
  palette: Record<Named, string>;
  details: {
    /** Its own colour of the sidebar; none — derived. */
    side?: string;
    grid: 'none' | 'quiet' | 'visible';
    /** The headings in the text's colour, or by their levels. */
    headings: 'ink' | 'levels';
    levels?: [string, string, string, string];
  };
  fonts: { title: string; text: string; ui: string; mono: string };
}

// ---- colour arithmetic: `#rrggbb`, channels 0…255 ---------------------------------------------------------------

export type RGB = [number, number, number];
export const rgbOf = (hex: string): RGB => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const h2 = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
export const hexOf = (c: RGB) => '#' + c.map(h2).join('');
/** `a` with `b` mixed in at `k` (0…1). */
export const mix = (a: string, b: string, k: number) => hexOf(rgbOf(a).map((v, i) => v + (rgbOf(b)[i] - v) * k) as RGB);
/** A CSS colour with alpha. */
export const alpha = (hex: string, a: number) => `rgba(${rgbOf(hex).join(',')},${+a.toFixed(3)})`;

export const luminance = (hex: string) => {
  const ch = rgbOf(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
export const contrastOf = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** A theme is dark when its ground is (§1). */
export const isDarkTheme = (t: AppTheme) => luminance(t.base.bg) < 0.2;

type HSV = [number, number, number];
function hsvOf(hex: string): HSV {
  const [r, g, b] = rgbOf(hex).map((x) => x / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}
function fromHsv([h, s, v]: HSV): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return hexOf([f(5) * 255, f(3) * 255, f(1) * 255]);
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** The colour's hue with its saturation and value scaled: the cool lines of a light theme are its text, brighter
 *  and more saturated; a dark theme's secondary text is its text a little more saturated. */
export const shade = (hex: string, s: number, v: number) => {
  const [h, ss, vv] = hsvOf(hex);
  return fromHsv([h, clamp(ss * s), clamp(vv * v)]);
};

// ---- the tokens (§2) ---------------------------------------------------------------------------------------------

export type Tokens = Record<string, string>;

/** `lampink`: the accent darkened (a light theme) or lightened (a dark one) by steps till it reads on the ground and
 *  on `lampsoft` at 4.5:1. */
function lampInk(t: AppTheme, dark: boolean): string {
  const { bg, accent } = t.base;
  const soft = mix(bg, accent, dark ? 0.13 : 0.17);
  let c = accent;
  for (let i = 0; i < 40 && Math.min(contrastOf(c, bg), contrastOf(c, soft)) < 4.5; i++) c = dark ? mix(c, '#ffffff', 0.08) : shade(c, 1.034, 0.92);
  return c;
}

export function deriveTokens(t: AppTheme): Tokens {
  const { bg, ink, accent } = t.base;
  const p = t.palette;
  const dark = isDarkTheme(t);
  const status = { todo: p.red, next: p.blue, wait: p.yellow, done: p.green, plug: p.purple };
  if (!dark) {
    const side = t.details.side ?? shade(mix(bg, ink, 0.03), 1.25, 0.99);
    const line = shade(ink, 1.19, 1.81); // the rules and the chips: the text's hue, brighter
    const grid = shade(ink, 1.3, 3.08);
    return {
      bg, side, ink, ink2: alpha(ink, 0.77), ink3: alpha(ink, 0.63), rule: alpha(line, 0.14),
      lamp: accent, lampink: lampInk(t, false), onlamp: shade(accent, 1.24, 0.153), lampsoft: alpha(accent, 0.17), lampline: alpha(shade(accent, 1.2, 0.775), 0.55),
      ...status,
      chip: alpha(line, 0.06), chip2: alpha(line, 0.1), field: mix(bg, '#ffffff', 0.9), card: mix(bg, '#ffffff', 0.9), segon: mix(bg, '#ffffff', 0.9),
      grid: alpha(grid, { none: 0, quiet: 0.06, visible: 0.1 }[t.details.grid]), panel: alpha(side, 0.75), track: alpha(line, 0.09),
      dim: alpha(mix(bg, ink, 0.035), 0.6), popshadow: `0 24px 60px ${alpha(shade(ink, 1.1, 1.3), 0.22)}`,
    };
  }
  const side = t.details.side ?? shade(bg, 1.02, 0.77);
  return {
    bg, side, ink, ink2: alpha(shade(ink, 1.5, 1), 0.68), ink3: alpha(shade(ink, 2, 1), 0.52), rule: alpha(shade(ink, 2.8, 0.995), 0.12),
    lamp: accent, lampink: lampInk(t, true), onlamp: shade(accent, 1.47, 0.107), lampsoft: alpha(accent, 0.13), lampline: alpha(accent, 0.5),
    ...status,
    chip: 'rgba(255,255,255,.06)', chip2: 'rgba(255,255,255,.1)', field: 'rgba(0,0,0,.25)', card: shade(bg, 0.95, 1.32), segon: 'rgba(255,255,255,.12)',
    grid: alpha(shade(ink, 3.7, 1.015), { none: 0, quiet: 0.035, visible: 0.06 }[t.details.grid]), panel: alpha(side, 0.6), track: 'rgba(255,255,255,.07)',
    dim: alpha(shade(side, 1.16, 0.59), 0.55), popshadow: '0 24px 60px rgba(0,0,0,.5)',
  };
}

// ---- the editor's colours (§2.3): the editor of both shells and the old interface ---------------------------------

/** A CSS colour (`#hex` or `rgba(…)`) laid on a ground: opaque `#rrggbb`. */
export function over(c: string, ground: string): string {
  const m = /^rgba\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)$/.exec(c.replace(/\s/g, ''));
  if (!m) return c.slice(0, 7);
  const a = +m[4];
  const g = rgbOf(ground);
  return hexOf([+m[1], +m[2], +m[3]].map((v, i) => v * a + g[i] * (1 - a)) as RGB);
}

export function editorColors(t: AppTheme): ThemeColors {
  const tk = deriveTokens(t);
  const { bg, ink, accent } = t.base;
  const dark = isDarkTheme(t);
  const dim = over(tk.ink3, bg);
  const lv = t.details.headings === 'levels' && t.details.levels ? t.details.levels : [ink, ink, ink, ink];
  return {
    bg, fg: ink, dim, meta: dim, tag: dim,
    cursor: accent, curLine: accent + (dark ? '21' : '2b'), selection: accent + (dark ? '4d' : '5c'),
    link: tk.lampink, date: t.palette.blue, code: mix(ink, bg, dark ? 0.33 : 0.23),
    h1: lv[0], h2: lv[1], h3: lv[2], h4: lv[3],
    palette: { ...t.palette },
  };
}

// ---- the built-in themes ------------------------------------------------------------------------------------------

/** The fonts by default (§6). */
export const DEFAULT_FONTS: AppTheme['fonts'] = { title: 'Yeseva One', text: 'Cormorant Garamond', ui: 'system', mono: 'IBM Plex Mono' };

/** «Бумага» and «Синька» (ТЗ 42 §3.2): the new interface's light and dark, the tokens they had before (tokens.test). */
export const PAPER: AppTheme = {
  name: 'Бумага', source: 'builtin',
  base: { bg: '#f8f6f0', ink: '#15243a', accent: '#e3aa3c' },
  palette: { red: '#c4432f', orange: '#a8541b', yellow: '#a2700c', green: '#2f7d4f', teal: '#1f7a78', blue: '#1f5fbf', purple: '#7a3fc4', gray: '#69727d' },
  details: { side: '#efece4', grid: 'quiet', headings: 'ink' },
  fonts: { ...DEFAULT_FONTS },
};
export const BLUEPRINT: AppTheme = {
  name: 'Синька', source: 'builtin',
  base: { bg: '#101c2c', ink: '#e6edf6', accent: '#f2c66d' },
  palette: { red: '#ff8f7e', orange: '#f0a868', yellow: '#f2c66d', green: '#8fd6a6', teal: '#7fd4cf', blue: '#8ab8ff', purple: '#c9a2ff', gray: '#a3adbb' },
  details: { side: '#0c1522', grid: 'quiet', headings: 'ink' },
  fonts: { ...DEFAULT_FONTS },
};
export const APP_BUILTIN: AppTheme[] = [PAPER, BLUEPRINT];

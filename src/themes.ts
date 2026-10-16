// Editor themes (ТЗ 25): sets of colours for the text editor only, one chosen for the light appearance and one for
// the dark. A theme also gives the shade of each of the eight named colours that statuses and tags use, so they
// suit any theme. The rest of the app keeps its own light and dark tokens (app.css).

export type Appearance = 'light' | 'dark';
export type AppearanceChoice = 'system' | Appearance;

/** The named colours of statuses and tags, in the order of the palette. */
export const NAMED = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'gray'] as const;
export type Named = (typeof NAMED)[number];
export const NAMED_RU: Record<Named, string> = {
  red: 'Красный', orange: 'Оранжевый', yellow: 'Жёлтый', green: 'Зелёный', teal: 'Голубой', blue: 'Синий', purple: 'Фиолетовый', gray: 'Серый',
};

export interface ThemeColors {
  bg: string; fg: string; dim: string;
  curLine: string; selection: string; cursor: string; // #rrggbbaa for the two lines: the selection shows on the current line
  h1: string; h2: string; h3: string; h4: string;
  h5?: string; h6?: string; h7?: string; h8?: string; h9?: string; // missing: as level 4
  date: string; tag: string; link: string; meta: string; code: string;
  palette: Record<Named, string>;
}
export interface Theme {
  name: string;
  appearance: Appearance;
  builtin: boolean;
  basedOn?: string;
  /** A plugin's theme (its id): chosen and copied as a built-in one, gone when the plugin is off. */
  plugin?: string;
  colors: ThemeColors;
}

const T = (name: string, appearance: Appearance, colors: ThemeColors): Theme => ({ name, appearance, builtin: true, colors });

// The Panopticon themes are the colours the editor had before themes (app.css) — the core's; the themes laid out from
// the Emacs ones (Leuven, Solarized, Modus, Nord, Gruvbox, Dracula) are a plugin of data, src/plugins/theme-pack
// (roadmap 1.4).
export const BUILTIN: Theme[] = [
  T('Panopticon светлая', 'light', {
    bg: '#ffffff', fg: '#1d1d1f', dim: '#6e6e76', curLine: '#0a64d60d', selection: '#0a64d642', cursor: '#0a64d6',
    h1: '#0a58c2', h2: '#0b7a6f', h3: '#a4510a', h4: '#a4510a',
    date: '#a3187a', tag: '#4a4a52', link: '#0a58c2', meta: '#6e6e76', code: '#a3187a',
    palette: { red: '#c4262e', orange: '#935300', yellow: '#7d6400', green: '#1d7f3a', teal: '#0b7a6f', blue: '#0a58c2', purple: '#7a3fc4', gray: '#5f5f66' },
  }),
  T('Panopticon тёмная', 'dark', {
    bg: '#1e1e22', fg: '#ececef', dim: '#9a9aa5', curLine: '#6cb4ff12', selection: '#0a84ff73', cursor: '#6cb4ff',
    h1: '#6cb4ff', h2: '#5fd3c2', h3: '#f0a45d', h4: '#f0a45d',
    date: '#f58ad4', tag: '#c9c9d2', link: '#6cb4ff', meta: '#9a9aa5', code: '#f58ad4',
    palette: { red: '#ff7b80', orange: '#f0b04d', yellow: '#e8d26a', green: '#6fd58a', teal: '#5fd3c2', blue: '#6cb4ff', purple: '#c39bff', gray: '#a9a9b3' },
  }),
  // «Синька» (ТЗ 42 §3.2): the new interface's «бумага» and «синька» — the default there, a choice here; the colours
  // of its tokens (next/tokens.ts) made opaque on the background
  T('Синька — светлая', 'light', {
    bg: '#f8f6f0', fg: '#15243a', dim: '#69727d', curLine: '#e3aa3c2b', selection: '#e3aa3c5c', cursor: '#e3aa3c',
    h1: '#15243a', h2: '#15243a', h3: '#15243a', h4: '#15243a',
    date: '#1f5fbf', tag: '#69727d', link: '#8a5f0e', meta: '#69727d', code: '#495464',
    palette: { red: '#c4432f', orange: '#a2700c', yellow: '#8a6a0a', green: '#2f7d4f', teal: '#1f7a78', blue: '#1f5fbf', purple: '#7a3fc4', gray: '#69727d' },
  }),
  T('Синька — тёмная', 'dark', {
    bg: '#101c2c', fg: '#e6edf6', dim: '#778495', curLine: '#f2c66d21', selection: '#f2c66d4d', cursor: '#f2c66d',
    h1: '#e6edf6', h2: '#e6edf6', h3: '#e6edf6', h4: '#e6edf6',
    date: '#8ab8ff', tag: '#778495', link: '#f2c66d', meta: '#778495', code: '#9ca7b5',
    palette: { red: '#ff8f7e', orange: '#f0a868', yellow: '#f2c66d', green: '#8fd6a6', teal: '#7fd4cf', blue: '#8ab8ff', purple: '#c9a2ff', gray: '#a3adbb' },
  }),
];
export const DEFAULT_THEME: Record<Appearance, string> = { light: 'Panopticon светлая', dark: 'Panopticon тёмная' };
/** The new interface's themes by default (ТЗ 42 §3.2), till one is chosen. */
export const NEXT_THEME: Record<Appearance, string> = { light: 'Синька — светлая', dark: 'Синька — тёмная' };
export const builtinFor = (a: Appearance) => BUILTIN.find((t) => t.name === DEFAULT_THEME[a])!;

/** A heading level's colour: 5…9 as level 4 unless set; deeper than 9 as 9. */
export function levelColor(c: ThemeColors, level: number): string {
  const n = Math.max(1, Math.min(9, level));
  if (n <= 4) return c[`h${n}` as 'h1'];
  for (let i = n; i > 4; i--) {
    const v = c[`h${i}` as 'h5'];
    if (v) return v;
  }
  return c.h4;
}

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
/** The theme's background is dark: ⌘F's yellow is softer on it. */
export const isDarkBg = (c: ThemeColors) => lum(c.bg) < 0.18;

/** The CSS variables of a theme: `--ed-*` for the editor and `--p-*` for the named colours. */
export function themeVars(c: ThemeColors): string {
  const v: [string, string][] = [
    ['ed-bg', c.bg], ['ed-fg', c.fg], ['ed-dim', c.dim], ['ed-cur', c.curLine], ['ed-sel', c.selection], ['ed-caret', c.cursor],
    ...Array.from({ length: 9 }, (_, i): [string, string] => [`ed-h${i + 1}`, levelColor(c, i + 1)]),
    ['ed-date', c.date], ['ed-tag', c.tag], ['ed-link', c.link], ['ed-meta', c.meta], ['ed-code', c.code],
    ['ed-hl', isDarkBg(c) ? 'rgba(255, 214, 10, 0.28)' : 'rgba(255, 204, 0, 0.38)'],
    ...NAMED.map((n): [string, string] => [`p-${n}`, c.palette[n]]),
  ];
  return v.map(([k, x]) => `--${k}:${x};`).join('');
}

// ---- the named colours of the settings (statuses, agenda blocks) --------------------------------------------------

/** The colours before themes, to read old settings: pink and any hex become the nearest named colour. */
const OLD: Record<string, string> = {
  gray: '#5f5f66', red: '#c4262e', orange: '#935300', green: '#1d7f3a', teal: '#0b7a6f', blue: '#0a58c2', purple: '#7a3fc4', pink: '#a3187a',
};
const rgbOf = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** The nearest named colour of a hex (in the light Panopticon palette, by a weighted RGB distance). */
export function nearestNamed(hex: string): Named {
  const [r, g, b] = rgbOf(hex);
  const pal = builtinFor('light').colors.palette;
  let best: Named = 'gray';
  let d = Infinity;
  for (const n of NAMED) {
    const [r2, g2, b2] = rgbOf(pal[n]);
    const rm = (r + r2) / 2;
    const x = (2 + rm / 256) * (r - r2) ** 2 + 4 * (g - g2) ** 2 + (2 + (255 - rm) / 256) * (b - b2) ** 2;
    if (x < d) {
      d = x;
      best = n;
    }
  }
  return best;
}
/** A colour of the settings as one of the eight: named stays, the old pink and a hex go to the nearest. */
export function asNamed(c: unknown): Named | undefined {
  if (typeof c !== 'string') return undefined;
  if ((NAMED as readonly string[]).includes(c)) return c as Named;
  if (OLD[c]) return nearestNamed(OLD[c]);
  if (/^#[0-9a-f]{6}$/i.test(c)) return nearestNamed(c);
  return undefined;
}

// ---- own themes: the file format of ТЗ 25 §4 ----------------------------------------------------------------------

const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const KEYS = ['bg', 'fg', 'dim', 'curLine', 'selection', 'cursor', 'h1', 'h2', 'h3', 'h4', 'date', 'tag', 'link', 'meta', 'code'] as const;
const DEEP = ['h5', 'h6', 'h7', 'h8', 'h9'] as const;
/** `#rgb` → `#rrggbb`, lower case. */
const full = (c: string) => (c.length === 4 ? '#' + [...c.slice(1)].map((x) => x + x).join('') : c).toLowerCase();

/** A theme from its file: unknown keys ignored, missing colours from the Panopticon theme of its appearance; null
 *  when it is not a Panopticon theme at all. */
export function parseTheme(text: string): Theme | null {
  let v: any;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object' || v.format !== 'panopticon-theme' || typeof v.name !== 'string' || !v.name.trim()) return null;
  const c = v.colors && typeof v.colors === 'object' ? v.colors : {};
  const ok = (x: unknown): x is string => typeof x === 'string' && COLOR.test(x);
  const appearance: Appearance = v.appearance === 'dark' || v.appearance === 'light' ? v.appearance : ok(c.bg) && lum(full(c.bg)) < 0.18 ? 'dark' : 'light';
  const base = builtinFor(appearance).colors;
  const colors: ThemeColors = { ...base, palette: { ...base.palette } };
  for (const k of KEYS) if (ok(c[k])) colors[k] = full(c[k]);
  for (const k of DEEP) if (ok(c[k])) colors[k] = full(c[k]);
  for (const n of NAMED) if (ok(c.palette?.[n])) colors.palette[n] = full(c.palette[n]);
  return { name: v.name.trim().slice(0, 80), appearance, builtin: false, basedOn: typeof v.basedOn === 'string' ? v.basedOn : undefined, colors };
}
/** The file text of a theme. */
export function themeJson(t: Theme): string {
  const colors: Record<string, unknown> = {};
  for (const k of KEYS) colors[k] = t.colors[k];
  for (const k of DEEP) if (t.colors[k]) colors[k] = t.colors[k];
  colors.palette = { ...t.colors.palette };
  return JSON.stringify({ format: 'panopticon-theme', version: 1, name: t.name, appearance: t.appearance, ...(t.basedOn ? { basedOn: t.basedOn } : {}), colors }, null, 2) + '\n';
}
/** The file of an own theme: its name with the characters a file name cannot have replaced. */
export const themeFile = (name: string) => name.replace(/[/\\:]/g, '-').replace(/^\.+/, '').trim() + '.json';
/** A name no other theme has: «<name>», else «<name> (2)», «<name> (3)»… */
export function uniqueName(name: string, taken: string[]): string {
  const low = new Set(taken.map((x) => themeFile(x).toLowerCase()));
  if (!low.has(themeFile(name).toLowerCase())) return name;
  const base = name.replace(/ \(\d+\)$/, '');
  for (let i = 2; ; i++) if (!low.has(themeFile(`${base} (${i})`).toLowerCase())) return `${base} (${i})`;
}
/** A copy of a theme to make one's own: «Nord — моя», based on the theme copied. */
export function copyOf(t: Theme, taken: string[]): Theme {
  const name = uniqueName(t.builtin ? `${t.name} — моя` : t.name, taken);
  return { name, appearance: t.appearance, builtin: false, basedOn: t.builtin ? t.name : (t.basedOn ?? t.name), colors: { ...t.colors, palette: { ...t.colors.palette } } };
}

// ---- the theme editor (ТЗ 25 §2.5): colours that read badly on the theme's background -------------------------------

const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
export type ColorKey = Exclude<keyof ThemeColors, 'palette'> | `palette.${Named}`;
/** Text colours whose contrast with the background is below the norm: 4.5:1 for text, 3:1 for headings. The deep
 *  levels count only when set (an inherited one is level 4). */
export function lowContrast(c: ThemeColors): Map<ColorKey, number> {
  const out = new Map<ColorKey, number>();
  const check = (k: ColorKey, v: string | undefined, min: number) => {
    if (!v) return;
    const r = ratio(v, c.bg);
    if (r < min) out.set(k, r);
  };
  for (const k of ['fg', 'dim', 'date', 'tag', 'link', 'meta', 'code'] as const) check(k, c[k], 4.5);
  for (const k of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9'] as const) check(k, c[k], 3);
  for (const n of NAMED) check(`palette.${n}`, c.palette[n], 4.5);
  return out;
}
/** «3,1:1» */
export const ratioWords = (r: number) => `${(Math.floor(r * 10) / 10).toFixed(1).replace('.', ',')}:1`;

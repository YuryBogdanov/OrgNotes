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
  colors: ThemeColors;
}

const T = (name: string, appearance: Appearance, colors: ThemeColors): Theme => ({ name, appearance, builtin: true, colors });

// The Panopticon themes are the colours the editor had before themes (app.css); the others are laid out from the
// palettes of the original Emacs themes onto these tokens.
export const BUILTIN: Theme[] = [
  T('Panopticon светлая', 'light', {
    bg: '#ffffff', fg: '#1d1d1f', dim: '#6e6e76', curLine: '#0a64d60d', selection: '#0a64d642', cursor: '#0a64d6',
    h1: '#0a58c2', h2: '#0b7a6f', h3: '#a4510a', h4: '#a4510a',
    date: '#a3187a', tag: '#4a4a52', link: '#0a58c2', meta: '#6e6e76', code: '#a3187a',
    palette: { red: '#c4262e', orange: '#935300', yellow: '#7d6400', green: '#1d7f3a', teal: '#0b7a6f', blue: '#0a58c2', purple: '#7a3fc4', gray: '#5f5f66' },
  }),
  T('Leuven', 'light', {
    bg: '#ffffff', fg: '#333333', dim: '#8d8d84', curLine: '#ffffd7b3', selection: '#bbddff99', cursor: '#21bdff',
    h1: '#3c3c3c', h2: '#123555', h3: '#005522', h4: '#ea6300', h5: '#e3258d', h6: '#0077cc', h7: '#2eae2c', h8: '#fd8008',
    date: '#3a81c3', tag: '#9a9fa4', link: '#006699', meta: '#8d8d84', code: '#006400',
    palette: { red: '#d0372d', orange: '#ea6300', yellow: '#9e7c00', green: '#50a14f', teal: '#0e8a8a', blue: '#0077cc', purple: '#8e44ad', gray: '#8d8d84' },
  }),
  T('Solarized Light', 'light', {
    bg: '#fdf6e3', fg: '#586e75', dim: '#93a1a1', curLine: '#eee8d5', selection: '#93a1a14d', cursor: '#657b83',
    h1: '#cb4b16', h2: '#859900', h3: '#268bd2', h4: '#b58900', h5: '#2aa198', h6: '#859900', h7: '#dc322f', h8: '#268bd2',
    date: '#6c71c4', tag: '#93a1a1', link: '#268bd2', meta: '#93a1a1', code: '#2aa198',
    palette: { red: '#dc322f', orange: '#cb4b16', yellow: '#b58900', green: '#859900', teal: '#2aa198', blue: '#268bd2', purple: '#6c71c4', gray: '#93a1a1' },
  }),
  T('Modus Operandi', 'light', {
    bg: '#ffffff', fg: '#000000', dim: '#595959', curLine: '#dae5ec99', selection: '#bcbcbc99', cursor: '#000000',
    h1: '#000000', h2: '#193668', h3: '#721045', h4: '#624416', h5: '#61756c', h6: '#7f0000', h7: '#3f578f', h8: '#595959',
    date: '#00538b', tag: '#6c4f00', link: '#3548cf', meta: '#595959', code: '#005f5f',
    palette: { red: '#a60000', orange: '#884900', yellow: '#6f5500', green: '#006800', teal: '#005e8b', blue: '#0031a9', purple: '#721045', gray: '#595959' },
  }),
  T('Panopticon тёмная', 'dark', {
    bg: '#1e1e22', fg: '#ececef', dim: '#9a9aa5', curLine: '#6cb4ff12', selection: '#0a84ff73', cursor: '#6cb4ff',
    h1: '#6cb4ff', h2: '#5fd3c2', h3: '#f0a45d', h4: '#f0a45d',
    date: '#f58ad4', tag: '#c9c9d2', link: '#6cb4ff', meta: '#9a9aa5', code: '#f58ad4',
    palette: { red: '#ff7b80', orange: '#f0b04d', yellow: '#e8d26a', green: '#6fd58a', teal: '#5fd3c2', blue: '#6cb4ff', purple: '#c39bff', gray: '#a9a9b3' },
  }),
  T('Nord', 'dark', {
    bg: '#2e3440', fg: '#d8dee9', dim: '#7b88a1', curLine: '#3b4252cc', selection: '#4c566acc', cursor: '#d8dee9',
    h1: '#88c0d0', h2: '#81a1c1', h3: '#b48ead', h4: '#8fbcbb',
    date: '#ebcb8b', tag: '#81a1c1', link: '#88c0d0', meta: '#7b88a1', code: '#8fbcbb',
    palette: { red: '#bf616a', orange: '#d08770', yellow: '#ebcb8b', green: '#a3be8c', teal: '#88c0d0', blue: '#81a1c1', purple: '#b48ead', gray: '#7b88a1' },
  }),
  T('Gruvbox Dark', 'dark', {
    bg: '#282828', fg: '#ebdbb2', dim: '#928374', curLine: '#3c3836cc', selection: '#665c54cc', cursor: '#ebdbb2',
    h1: '#fabd2f', h2: '#83a598', h3: '#8ec07c', h4: '#d3869b', h5: '#fe8019', h6: '#b8bb26', h7: '#fb4934', h8: '#83a598',
    date: '#d3869b', tag: '#83a598', link: '#83a598', meta: '#928374', code: '#8ec07c',
    palette: { red: '#fb4934', orange: '#fe8019', yellow: '#fabd2f', green: '#b8bb26', teal: '#8ec07c', blue: '#83a598', purple: '#d3869b', gray: '#a89984' },
  }),
  T('Dracula', 'dark', {
    bg: '#282a36', fg: '#f8f8f2', dim: '#6272a4', curLine: '#44475a99', selection: '#6272a499', cursor: '#f8f8f2',
    h1: '#ff79c6', h2: '#bd93f9', h3: '#8be9fd', h4: '#f1fa8c', h5: '#50fa7b', h6: '#ffb86c',
    date: '#f1fa8c', tag: '#8be9fd', link: '#8be9fd', meta: '#6272a4', code: '#50fa7b',
    palette: { red: '#ff5555', orange: '#ffb86c', yellow: '#f1fa8c', green: '#50fa7b', teal: '#8be9fd', blue: '#82aaff', purple: '#bd93f9', gray: '#8a93b8' },
  }),
  T('Modus Vivendi', 'dark', {
    bg: '#000000', fg: '#ffffff', dim: '#989898', curLine: '#2f3849', selection: '#5a5a5ab3', cursor: '#ffffff',
    h1: '#ffffff', h2: '#c6daff', h3: '#feacd0', h4: '#d0bc00', h5: '#88ca9f', h6: '#ff9580', h7: '#9ac8ff', h8: '#989898',
    date: '#79a8ff', tag: '#d0bc00', link: '#79a8ff', meta: '#989898', code: '#00d3d0',
    palette: { red: '#ff5f59', orange: '#fec43f', yellow: '#d0bc00', green: '#44bc44', teal: '#00d3d0', blue: '#2fafff', purple: '#b6a0ff', gray: '#989898' },
  }),
];
export const DEFAULT_THEME: Record<Appearance, string> = { light: 'Panopticon светлая', dark: 'Panopticon тёмная' };
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

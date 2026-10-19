// Themes (ТЗ 25, ТЗ 57): one chosen for the light appearance and one for the dark. Since ТЗ 57 a theme is the app's
// whole (`app`: appTheme.ts — the ground, the text, the accent, the palette, details, fonts); its editor colours
// (`colors`, ТЗ 25) are derived from that, or — a theme of the old format, its own file not changed yet — its file's
// own, the app's theme read from them (`fromV1`, §4). A theme also gives the shade of each of the eight named colours
// that statuses and tags use, so they suit any theme.

import { BLUEPRINT, DEFAULT_FONTS, PAPER, contrastOf, editorColors, isDarkTheme, type AppTheme } from './appTheme';

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
  /** Light or dark by its ground (ТЗ 57 §1). */
  appearance: Appearance;
  builtin: boolean;
  basedOn?: string;
  /** A plugin's theme (its id): chosen and copied as a built-in one, gone when the plugin is off. */
  plugin?: string;
  /** The editor's colours: derived from `app` (v2), or the old format's own (v1). */
  colors: ThemeColors;
  /** The theme of the whole app (ТЗ 57). */
  app: AppTheme;
  /** 2: the format of ТЗ 57 (`colors` derived); missing — the old one, written back as it was till it is changed. */
  v?: 2;
}

/** The app's theme of a theme of the old format (ТЗ 57 §4): the ground, the text, the accent the cursor (the link
 *  when the cursor is the text's colour, as Dracula's), the palette, the headings by levels when they differ. */
export function fromV1(name: string, c: ThemeColors, source: AppTheme['source']): AppTheme {
  const accent = contrastOf(c.cursor.slice(0, 7), c.fg.slice(0, 7)) < 1.6 ? c.link : c.cursor;
  const lv: [string, string, string, string] = [c.h1, c.h2, c.h3, c.h4];
  const levels = new Set(lv).size > 1;
  return {
    name, source,
    base: { bg: c.bg.slice(0, 7), ink: c.fg.slice(0, 7), accent: accent.slice(0, 7) },
    palette: { ...c.palette },
    details: { grid: 'quiet', headings: levels ? 'levels' : 'ink', ...(levels ? { levels: lv } : {}) },
    fonts: { ...DEFAULT_FONTS },
  };
}
/** A theme of the format of ТЗ 57: its editor colours derived. */
export function fromApp(app: AppTheme, o: { builtin?: boolean; plugin?: string; basedOn?: string } = {}): Theme {
  return { name: app.name, appearance: isDarkTheme(app) ? 'dark' : 'light', builtin: !!o.builtin, ...(o.plugin ? { plugin: o.plugin } : {}), ...(o.basedOn ? { basedOn: o.basedOn } : {}), colors: editorColors(app), app, v: 2 };
}

const T = (name: string, appearance: Appearance, colors: ThemeColors): Theme => ({ name, appearance, builtin: true, colors, app: fromV1(name, colors, 'builtin') });

// The Panopticon themes are the colours the editor had before themes (app.css) — the core's; the themes laid out from
// the Emacs ones (Leuven, Solarized, Modus, Nord, Gruvbox, Dracula) are a plugin of data, src/plugins/theme-pack
// (roadmap 1.4).
export const BUILTIN: Theme[] = [
  // the editor's colours before themes (app.css), «Panopticon светлая / тёмная» till ТЗ 57
  T('Классическая светлая', 'light', {
    bg: '#ffffff', fg: '#1d1d1f', dim: '#6e6e76', curLine: '#0a64d60d', selection: '#0a64d642', cursor: '#0a64d6',
    h1: '#0a58c2', h2: '#0b7a6f', h3: '#a4510a', h4: '#a4510a',
    date: '#a3187a', tag: '#4a4a52', link: '#0a58c2', meta: '#6e6e76', code: '#a3187a',
    palette: { red: '#c4262e', orange: '#935300', yellow: '#7d6400', green: '#1d7f3a', teal: '#0b7a6f', blue: '#0a58c2', purple: '#7a3fc4', gray: '#5f5f66' },
  }),
  T('Классическая тёмная', 'dark', {
    bg: '#1e1e22', fg: '#ececef', dim: '#9a9aa5', curLine: '#6cb4ff12', selection: '#0a84ff73', cursor: '#6cb4ff',
    h1: '#6cb4ff', h2: '#5fd3c2', h3: '#f0a45d', h4: '#f0a45d',
    date: '#f58ad4', tag: '#c9c9d2', link: '#6cb4ff', meta: '#9a9aa5', code: '#f58ad4',
    palette: { red: '#ff7b80', orange: '#f0b04d', yellow: '#e8d26a', green: '#6fd58a', teal: '#5fd3c2', blue: '#6cb4ff', purple: '#c39bff', gray: '#a9a9b3' },
  }),
  // the new interface's «Бумага» and «Синька» (ТЗ 42 §3.2), the default there; till ТЗ 57 «Синька — светлая / тёмная»
  fromApp(PAPER, { builtin: true }),
  fromApp(BLUEPRINT, { builtin: true }),
];
export const DEFAULT_THEME: Record<Appearance, string> = { light: 'Классическая светлая', dark: 'Классическая тёмная' };
/** The new interface's themes by default (ТЗ 42 §3.2), till one is chosen. */
export const NEXT_THEME: Record<Appearance, string> = { light: 'Бумага', dark: 'Синька' };
/** The built-in themes' names before ТЗ 57: a choice kept on this Mac, a theme based on one. */
const RENAMED: Record<string, string> = { 'Panopticon светлая': 'Классическая светлая', 'Panopticon тёмная': 'Классическая тёмная', 'Синька — светлая': 'Бумага', 'Синька — тёмная': 'Синька' };
export const themeAlias = (name: string) => RENAMED[name] ?? name;
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

/** A theme from its file: the format of ТЗ 57 (`"v": 2`) or the old one (ТЗ 25); unknown keys ignored, missing
 *  colours from the built-in theme of its appearance; null when it is not a Panopticon theme at all. */
export function parseTheme(text: string): Theme | null {
  let v: any;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object' || v.format !== 'panopticon-theme' || typeof v.name !== 'string' || !v.name.trim()) return null;
  const name = v.name.trim().slice(0, 80);
  const basedOn = typeof v.basedOn === 'string' ? themeAlias(v.basedOn) : undefined;
  const ok = (x: unknown): x is string => typeof x === 'string' && COLOR.test(x);
  const hex = (x: unknown, or: string) => (ok(x) ? full(x).slice(0, 7) : or);
  if (v.v === 2) {
    const b = v.base && typeof v.base === 'object' ? v.base : {};
    const like = ok(b.bg) && lum(full(b.bg)) < 0.2 ? BLUEPRINT : PAPER;
    const d = v.details && typeof v.details === 'object' ? v.details : {};
    const f = v.fonts && typeof v.fonts === 'object' ? v.fonts : {};
    const font = (x: unknown, or: string) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 80) : or);
    const levels = Array.isArray(d.levels) && d.levels.length === 4 && d.levels.every(ok) ? (d.levels.map((x: string) => full(x).slice(0, 7)) as [string, string, string, string]) : undefined;
    const app: AppTheme = {
      name, source: 'own',
      base: { bg: hex(b.bg, like.base.bg), ink: hex(b.ink, like.base.ink), accent: hex(b.accent, like.base.accent) },
      palette: Object.fromEntries(NAMED.map((n) => [n, hex(v.palette?.[n], like.palette[n])])) as Record<Named, string>,
      details: {
        ...(ok(d.side) ? { side: full(d.side).slice(0, 7) } : {}),
        grid: d.grid === 'none' || d.grid === 'visible' ? d.grid : 'quiet',
        headings: d.headings === 'levels' && levels ? 'levels' : 'ink',
        ...(levels ? { levels } : {}),
      },
      fonts: { title: font(f.title, DEFAULT_FONTS.title), text: font(f.text, DEFAULT_FONTS.text), ui: font(f.ui, DEFAULT_FONTS.ui), mono: font(f.mono, DEFAULT_FONTS.mono) },
    };
    return fromApp(app, { basedOn });
  }
  const c = v.colors && typeof v.colors === 'object' ? v.colors : {};
  const appearance: Appearance = v.appearance === 'dark' || v.appearance === 'light' ? v.appearance : ok(c.bg) && lum(full(c.bg)) < 0.18 ? 'dark' : 'light';
  const base = builtinFor(appearance).colors;
  const colors: ThemeColors = { ...base, palette: { ...base.palette } };
  for (const k of KEYS) if (ok(c[k])) colors[k] = full(c[k]);
  for (const k of DEEP) if (ok(c[k])) colors[k] = full(c[k]);
  for (const n of NAMED) if (ok(c.palette?.[n])) colors.palette[n] = full(c.palette[n]);
  return { name, appearance, builtin: false, basedOn, colors, app: fromV1(name, colors, 'own') };
}
/** The file text of a theme: in its own format (the old one stays old till the new editor changes it). */
export function themeJson(t: Theme): string {
  const based = t.basedOn ? { basedOn: t.basedOn } : {};
  if (t.v === 2) {
    const a = t.app;
    return JSON.stringify({ format: 'panopticon-theme', v: 2, name: t.name, ...based, base: a.base, palette: a.palette, details: a.details, fonts: a.fonts }, null, 2) + '\n';
  }
  const colors: Record<string, unknown> = {};
  for (const k of KEYS) colors[k] = t.colors[k];
  for (const k of DEEP) if (t.colors[k]) colors[k] = t.colors[k];
  colors.palette = { ...t.colors.palette };
  return JSON.stringify({ format: 'panopticon-theme', version: 1, name: t.name, appearance: t.appearance, ...based, colors }, null, 2) + '\n';
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
  const app: AppTheme = { ...t.app, name, source: 'own', base: { ...t.app.base }, palette: { ...t.app.palette }, details: { ...t.app.details }, fonts: { ...t.app.fonts } };
  return { name, appearance: t.appearance, builtin: false, basedOn: t.builtin ? t.name : (t.basedOn ?? t.name), colors: { ...t.colors, palette: { ...t.colors.palette } }, app, ...(t.v ? { v: t.v } : {}) };
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

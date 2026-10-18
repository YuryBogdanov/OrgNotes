// The compatibility layer (ТЗ 43 §5): the old interface's CSS variables (app.css) given by the new tokens, so an old
// screen, a plugin's panel or tab, a bridged sheet draws in the new colours with its own layout and fonts. Each
// variable app.css defines has its line here (compat.test.ts): a new one there must say what it is here.

import { BUILTIN, NEXT_THEME, type Appearance } from '../themes';
import { FONTS } from './tokens';

/** An old variable → a value in the new tokens. `null`: the same name in both, inherited as it is. */
export const COMPAT: Record<string, string | null> = {
  // grounds
  bg: null,
  side: null,
  'side-bg': 'var(--side)',
  bar: 'var(--side)',
  'bar-bg': 'var(--side)',
  stage: 'var(--dim)',
  // text and lines
  fg: 'var(--ink)',
  fg2: 'var(--ink2)',
  fg3: 'var(--ink3)',
  line: 'var(--rule)',
  h1: 'var(--ink)',
  h2: 'var(--ink)',
  h3: 'var(--ink)',
  // controls
  field: 'var(--chip)',
  pop: 'var(--card)',
  segon: null,
  knob: '#fff',
  // the accent: the lamp — its ink for text, links and frames, itself for filled buttons
  acc: 'var(--lampink)',
  onacc: 'var(--onlamp)',
  pacc: 'var(--lamp)',
  onpacc: 'var(--onlamp)',
  link: 'var(--lampink)',
  sel: 'var(--lampsoft)',
  cur: 'var(--lampsoft)',
  'cur-line': 'var(--lampsoft)',
  hl: 'var(--lampsoft)',
  hlCur: 'var(--lamp)',
  hlCurFg: 'var(--onlamp)',
  'sel-text': 'var(--lampsoft)',
  'sel-text-blur': 'var(--chip)',
  note: 'var(--lampsoft)',
  noteLine: 'var(--lampline)',
  noteAcc: 'var(--lampink)',
  // statuses
  todo: null,
  next: null,
  wait: null,
  done: null,
  danger: 'var(--todo)',
  'on-danger': 'var(--onlamp)',
  ts: 'var(--next)',
  purple: 'var(--plug)',
  // tags
  tagbg: 'var(--chip)',
  tagfg: 'var(--ink2)',
  tagdot: 'var(--ink3)',
  // shadows and dims
  shadow: '0 1px 2px rgba(0,0,0,.18)', // a segment's knob, as the mockups'
  'dlg-shadow': 'var(--popshadow)',
  scrim: 'var(--dim)',
  'dlg-scrim': 'var(--dim)',
  // fonts
  ui: FONTS.ui,
  mono: FONTS.mono,
  // the new interface's own for the plugins' screens (ТЗ 47 §0): the titles in Yeseva One, the kickers and figures in
  // IBM Plex Mono — not in app.css: an old screen has none (`var(--font-display, …)` falls back there)
  'font-display': FONTS.title,
  'font-mono': FONTS.mono,
};

/** The named colours (`--p-red` … `--p-gray`) of «Синька» in this appearance (ТЗ 42 §3.2). */
export const compatPalette = (a: Appearance) => BUILTIN.find((t) => t.name === NEXT_THEME[a])!.colors.palette;

/** The layer's variables for an appearance: an inline style. `--font-text` — the font of the file's text as the
 *  editor has it (the settings' choice, the window's `--text`): the board's cards, a canvas's nodes (ТЗ 49 §7). */
export const compatVars = (a: Appearance) =>
  [
    '--font-text:var(--text)',
    ...Object.entries(COMPAT).flatMap(([k, v]) => (v === null ? [] : [`--${k}:${v}`])),
    ...Object.entries(compatPalette(a)).map(([k, v]) => `--p-${k}:${v}`),
  ].join(';');

/** The old names inside the new editor: its tooltips (the tags offered, a folded match, a line's link) are drawn by
 *  app.css with them. Not `--field` and `--shadow` (the new editor's own), nor the named colours: those are the
 *  editor theme's there. */
export const editorCompatVars = () =>
  Object.entries(COMPAT)
    .flatMap(([k, v]) => (v === null || k === 'field' || k === 'shadow' ? [] : [`--${k}:${v}`]))
    .join(';');

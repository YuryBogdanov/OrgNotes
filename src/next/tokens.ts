// The tokens of the new interface (ТЗ 42 §3.1): the concept's palette (`PAL` of the mockups «Концепт UI»), light
// «бумага» and dark «синька», switched with the appearance. CSS variables on the root of `src/next/`.
//
// Changed from the mockups for contrast (§9: the text 7:1, the secondary 4.5:1, `lampink` on `lampsoft` 4.5:1):
// light `ink2` 70% → 77%, `ink3` 46% → 63%, `lampink` #97680f → #8a5f0e; dark `ink3` 44% → 52%.

import type { Appearance } from '../themes';

export type Tokens = Record<string, string>;

export const TOKENS: Record<Appearance, Tokens> = {
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
};

/** The variables for an appearance: the mockups' names (`--bg`, `--ink`, `--lamp`…). The old interface's names are the
 *  compatibility layer's (compat.ts), around anything old only (ТЗ 43 §5). */
export const tokenVars = (a: Appearance) => Object.entries(TOKENS[a]).map(([k, v]) => `--${k}:${v}`).join(';');

/** The fonts (§3.3): bundled, no network. */
export const FONTS = {
  ui: "-apple-system, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif",
  text: "'Cormorant Garamond', Georgia, serif",
  title: "'Yeseva One', Georgia, serif",
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
};

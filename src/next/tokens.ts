// The tokens of the new interface (ТЗ 42 §3.1): the mockups' names (`--bg`, `--ink`, `--lamp`…) as CSS variables on
// the root of `src/next/`. Since ТЗ 57 they are derived from the app's theme (appTheme.ts `deriveTokens`); «Бумага»
// and «Синька» give the values the concept had (tokens.test.ts).

import type { Appearance } from '../themes';
import { BLUEPRINT, PAPER, deriveTokens, type Tokens } from '../appTheme';

export { deriveTokens, type Tokens };

export const TOKENS: Record<Appearance, Tokens> = { light: deriveTokens(PAPER), dark: deriveTokens(BLUEPRINT) };

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

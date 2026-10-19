// The tokens of the new interface (ТЗ 42 §3.1): the mockups' names (`--bg`, `--ink`, `--lamp`…) as CSS variables on
// the root of `src/next/`. Since ТЗ 57 they are derived from the app's theme (appTheme.ts `deriveTokens`); «Бумага»
// and «Синька» give the values the concept had (tokens.test.ts).

import type { Appearance } from '../themes';
import { BLUEPRINT, PAPER, deriveTokens, type AppTheme, type Tokens } from '../appTheme';

export { deriveTokens, type Tokens };

export const TOKENS: Record<Appearance, Tokens> = { light: deriveTokens(PAPER), dark: deriveTokens(BLUEPRINT) };

const cache = new WeakMap<AppTheme, string>();
/** The variables of a theme: the mockups' names (`--bg`, `--ink`, `--lamp`…). The old interface's names are the
 *  compatibility layer's (compat.ts), around anything old only (ТЗ 43 §5). */
export function tokenVars(t: AppTheme): string {
  let v = cache.get(t);
  if (!v) cache.set(t, (v = Object.entries(deriveTokens(t)).map(([k, x]) => `--${k}:${x}`).join(';')));
  return v;
}

/** The fonts (§3.3): bundled, no network. */
export const FONTS = {
  ui: "-apple-system, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif",
  text: "'Cormorant Garamond', Georgia, serif",
  title: "'Yeseva One', Georgia, serif",
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
};

const BUNDLED: Record<string, string> = { 'Yeseva One': FONTS.title, 'Cormorant Garamond': FONTS.text, 'IBM Plex Mono': FONTS.mono, system: FONTS.ui };
/** A font the Mac does not have gives way to the role's own by default (ТЗ 57 §7). */
const FALLBACK: Record<keyof AppTheme['fonts'], string> = { title: FONTS.title, text: FONTS.text, ui: FONTS.ui, mono: FONTS.mono };
/** A theme's font as CSS (ТЗ 57 §6): the bundled ones with their stacks, «system» the interface's, any other by its
 *  family name with the role's default after it. */
export const fontCss = (name: string, role: keyof AppTheme['fonts']) => BUNDLED[name] ?? `'${name.replace(/['\\]/g, '')}', ${FALLBACK[role]}`;

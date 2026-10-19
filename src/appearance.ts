// The appearance of the app (ТЗ 25): «Системное», «Светлое» or «Тёмное», and the editor theme of each. Both kept
// on this Mac (localStorage, as the shortcuts). Applied before the first paint (main.ts) and on every change
// (App.svelte): `data-appearance` on the root switches the tokens of app.css, a <style> holds the theme's variables,
// and the native window takes the same appearance (its vibrancy and title bar).

import { BUILTIN, DEFAULT_THEME, NEXT_THEME, builtinFor, parseTheme, themeAlias, themeJson, themeVars, type Appearance, type AppearanceChoice, type Theme } from './themes';
import { nextOn } from './uiFlag';

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* no storage */
  }
};

export const readChoice = (): AppearanceChoice => {
  const v = get('appearance');
  return v === 'light' || v === 'dark' ? v : 'system';
};
export const saveChoice = (c: AppearanceChoice) => set('appearance', c);
/** The theme of each appearance: the one chosen, else the default of the shell (the new interface: «Синька»). */
/** The themes by default of this shell: the new interface's «Бумага» / «Синька», the old one's «Классическая»; the
 *  windows over other programs follow the same flag (ТЗ 52 §1). */
export const defaultThemes = () => (nextOn() ? NEXT_THEME : DEFAULT_THEME);
export const readThemeNames = (): Record<Appearance, string> => {
  const def = defaultThemes();
  // the built-in themes renamed by ТЗ 57 («Синька — светлая» → «Бумага»…) are read by their new names
  return { light: themeAlias(get('theme:light') || def.light), dark: themeAlias(get('theme:dark') || def.dark) };
};
export const saveThemeName = (a: Appearance, name: string) => set('theme:' + a, name);

export const systemDark = () => {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
};
export const effective = (c: AppearanceChoice, dark = systemDark()): Appearance => (c === 'system' ? (dark ? 'dark' : 'light') : c);

/** A theme by name among `themes` for the place of an appearance — any theme, light or dark (ТЗ 57 §3); the
 *  shell's default of that place when it is gone. */
export function themeNamed(name: string, a: Appearance, themes: Theme[] = BUILTIN): Theme {
  const n = themeAlias(name);
  return themes.find((t) => t.name === n) ?? themes.find((t) => t.name === defaultThemes()[a]) ?? builtinFor(a);
}

let styleEl: HTMLStyleElement | null = null;
let windowLook: Appearance | null = null;
/** Put the appearance and the theme on the page (and the native window). `a` is the place in effect; the page and
 *  the window take the theme's own light or dark (ТЗ 57 §3: Dracula in the light place is dark). */
export function applyAppearance(_choice: AppearanceChoice, a: Appearance, theme: Theme) {
  const root = document.documentElement;
  const look = theme.appearance;
  if (root.dataset.appearance !== look) root.dataset.appearance = look;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'editor-theme';
    document.head.appendChild(styleEl);
  }
  const css = `:root{${themeVars(theme.colors)}}`;
  if (styleEl.textContent !== css) {
    styleEl.textContent = css;
    // an own theme or a plugin's comes after the first paint: kept here, it shows from the start next time
    if (!BUILTIN.some((b) => b.name === theme.name)) set('theme:last:' + a, themeJson(theme));
  }
  if (windowLook !== look && '__TAURI_INTERNALS__' in window) {
    windowLook = look;
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(look))
      .catch(() => {});
  }
}

/** The own theme last applied for an appearance, if it is `name` (until the own themes are read from disk). */
export function cachedTheme(a: Appearance, name: string): Theme | null {
  const t = parseTheme(get('theme:last:' + a) ?? '');
  return t && t.name === themeAlias(name) ? t : null;
}

/** The theme of an appearance's place as this Mac keeps it: the built-in by name, else the one last applied (the
 *  windows over other programs, the first paint). */
export const storedTheme = (a: Appearance): Theme => {
  const name = readThemeNames()[a];
  return cachedTheme(a, name) ?? themeNamed(name, a);
};
/** Before the first paint: the stored choice with the built-in themes (own themes come with the store). */
export function applyStored() {
  const c = readChoice();
  const a = effective(c);
  applyAppearance(c, a, storedTheme(a));
}

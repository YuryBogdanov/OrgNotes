// The appearance of the app (ТЗ 25): «Системное», «Светлое» or «Тёмное», and the editor theme of each. Both kept
// on this Mac (localStorage, as the shortcuts). Applied before the first paint (main.ts) and on every change
// (App.svelte): `data-appearance` on the root switches the tokens of app.css, a <style> holds the theme's variables,
// and the native window takes the same appearance (its vibrancy and title bar).

import { BUILTIN, DEFAULT_THEME, builtinFor, parseTheme, themeJson, themeVars, type Appearance, type AppearanceChoice, type Theme } from './themes';

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
export const readThemeNames = (): Record<Appearance, string> => ({
  light: get('theme:light') || DEFAULT_THEME.light,
  dark: get('theme:dark') || DEFAULT_THEME.dark,
});
export const saveThemeName = (a: Appearance, name: string) => set('theme:' + a, name);

export const systemDark = () => {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
};
export const effective = (c: AppearanceChoice, dark = systemDark()): Appearance => (c === 'system' ? (dark ? 'dark' : 'light') : c);

/** A theme by name among `themes` for an appearance; the built-in Panopticon one when it is gone. */
export function themeNamed(name: string, a: Appearance, themes: Theme[] = BUILTIN): Theme {
  return themes.find((t) => t.name === name && t.appearance === a) ?? builtinFor(a);
}

let styleEl: HTMLStyleElement | null = null;
let windowChoice: AppearanceChoice | null = null;
/** Put the appearance and the theme on the page (and the native window). */
export function applyAppearance(choice: AppearanceChoice, a: Appearance, theme: Theme) {
  const root = document.documentElement;
  if (root.dataset.appearance !== a) root.dataset.appearance = a;
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
  if (windowChoice !== choice && '__TAURI_INTERNALS__' in window) {
    windowChoice = choice;
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(choice === 'system' ? null : choice))
      .catch(() => {});
  }
}

/** The own theme last applied for an appearance, if it is `name` (until the own themes are read from disk). */
export function cachedTheme(a: Appearance, name: string): Theme | null {
  const t = parseTheme(get('theme:last:' + a) ?? '');
  return t && t.name === name && t.appearance === a ? t : null;
}

/** Before the first paint: the stored choice with the built-in themes (own themes come with the store). */
export function applyStored() {
  const c = readChoice();
  const a = effective(c);
  const name = readThemeNames()[a];
  applyAppearance(c, a, cachedTheme(a, name) ?? themeNamed(name, a));
}

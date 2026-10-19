// The fonts a theme may take (ТЗ 57 §6): the bundled ones, then the families installed on this Mac (Rust
// `font_families`, by NSFontManager), read once when a font's menu first opens. What the text font in effect is.

import { invoke, isTauri } from '../tauri';
import { nextPrefs } from '../nextPrefs.svelte';
import type { Theme } from '../themes';
import type { AppTheme } from '../appTheme';

export interface FontFamily {
  name: string;
  /** It covers Cyrillic: if not, the menu says «нет кириллицы» (it may still be chosen). */
  cyr: boolean;
}
/** The bundled ones: no network, every one with Cyrillic. «system» is the interface's own. */
export const BUNDLED_FONTS: { name: string; label: string }[] = [
  { name: 'Yeseva One', label: 'Yeseva One' },
  { name: 'Cormorant Garamond', label: 'Cormorant Garamond' },
  { name: 'IBM Plex Mono', label: 'IBM Plex Mono' },
  { name: 'system', label: 'Системный' },
];
export const fontLabel = (name: string) => BUNDLED_FONTS.find((f) => f.name === name)?.label ?? name;

export const fontList = $state<{ list: FontFamily[]; loaded: boolean }>({ list: [], loaded: false });
let asked = false;
export async function loadFonts() {
  if (asked) return;
  asked = true;
  try {
    const raw = isTauri ? await invoke<string>('font_families') : '[]';
    const v = JSON.parse(raw) as FontFamily[];
    fontList.list = v.filter((f) => typeof f?.name === 'string' && !BUNDLED_FONTS.some((b) => b.name === f.name));
  } catch {
    fontList.list = [];
  }
  fontList.loaded = true;
}

/** The text font in effect: the theme's; a built-in theme keeps the old «Шрифт текста» of ТЗ 42 (system or mono)
 *  of one who had chosen it, till a font is chosen anew. */
export function textFontOf(t: Theme): string {
  if (t.builtin && nextPrefs.font !== 'serif') return nextPrefs.font === 'mono' ? 'IBM Plex Mono' : 'system';
  return t.app.fonts.text;
}
/** The editor's sizes for a text font (editor.css `data-font`): Cormorant's own, a monospace's, the others'. */
export const fontKind = (name: string): 'serif' | 'system' | 'mono' => (name === 'Cormorant Garamond' ? 'serif' : /mono|menlo|courier|consol/i.test(name) ? 'mono' : 'system');
export type FontRole = keyof AppTheme['fonts'];

// «Настройки → Оформление» (ТЗ 25; tech sprint 2.1, from the store): the appearance of the app and the editor theme
// of each, on this Mac — the built-in themes, the plugins' ones and the own ones (`themes/*.json`). The store forwards
// to it.

import { cachedTheme, effective, readChoice, readThemeNames, saveChoice, saveThemeName, systemDark as isSystemDark, themeNamed } from './appearance';
import { BUILTIN, DEFAULT_THEME, builtinFor, copyOf, parseTheme, themeFile, themeJson, uniqueName, type Appearance, type AppearanceChoice, type Theme } from './themes';
import { notify } from './notify.svelte';

const isTauri = '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

class Themes {
  appearanceChoice = $state<AppearanceChoice>(readChoice());
  /** macOS is dark (for «Системное»); followed while the app runs. */
  systemDark = $state(isSystemDark());
  themeNames = $state<Record<Appearance, string>>(readThemeNames());
  /** Own themes: `themes/*.json` in the app's config folder (ТЗ 25 §4). */
  ownThemes = $state.raw<Theme[]>([]);
  /** Every theme to choose from: the built-in ones, then the own ones by name. */
  get themes(): Theme[] {
    return [...BUILTIN, ...this.pluginThemes, ...this.ownThemes];
  }
  /** The plugins' themes (roadmap 1.4: the Emacs ones are the plugin «theme-pack»), in the order they came. */
  pluginThemes = $state.raw<Theme[]>([]);
  /** The plugins have been started: till then a chosen plugin's theme is the one cached at the last run. */
  pluginsReady = $state(false);
  addThemes(plugin: string, list: Theme[]) {
    const names = new Set([...BUILTIN, ...this.pluginThemes].map((t) => t.name));
    const mine = list.filter((t) => !names.has(t.name) && !!names.add(t.name)).map((t) => ({ ...t, builtin: true, plugin }));
    this.pluginThemes = [...this.pluginThemes, ...mine];
    this.ownThemes = this.ownThemes.filter((t) => !mine.some((m) => m.name === t.name));
    return () => void (this.pluginThemes = this.pluginThemes.filter((t) => t.plugin !== plugin));
  }
  /** A chosen theme that is gone (its plugin turned off) gives way to Panopticon of its appearance. */
  resetMissingThemes() {
    if (!this.themesRead) return;
    for (const a of ['light', 'dark'] as const) if (!this.themes.some((t) => t.name === this.themeNames[a] && t.appearance === a)) this.setThemeName(a, DEFAULT_THEME[a]);
  }
  /** The own themes have been read (till then a chosen own theme is the one cached at the last run). */
  themesRead = $state(false);
  async loadThemes() {
    if (!isTauri) return void (this.themesRead = true);
    const texts = await invoke<string[]>('list_themes').catch(() => [] as string[]);
    const seen = new Set<string>();
    this.ownThemes = texts
      .map(parseTheme)
      .filter((t): t is Theme => !!t && ![...BUILTIN, ...this.pluginThemes].some((b) => b.name === t.name) && !seen.has(t.name) && !!seen.add(t.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    this.themesRead = true;
  }
  private async saveTheme(t: Theme): Promise<boolean> {
    try {
      if (isTauri) await invoke('write_theme', { file: themeFile(t.name), text: themeJson(t) });
      return true;
    } catch (e) {
      notify.say('Не удалось сохранить тему: ' + e);
      return false;
    }
  }
  private putTheme(t: Theme, replace?: string) {
    this.ownThemes = [...this.ownThemes.filter((x) => x.name !== t.name && x.name !== replace), t].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }
  /** «+ Новая тема», «Дублировать», editing a built-in one: an own copy, saved and chosen for its appearance. */
  async copyTheme(t: Theme): Promise<Theme | null> {
    const c = copyOf(t, this.themes.map((x) => x.name));
    if (!(await this.saveTheme(c))) return null;
    this.putTheme(c);
    this.setThemeName(c.appearance, c.name);
    return c;
  }
  /** «Переименовать»: the file follows the name; a taken name gets «(2)». Null: nothing to do. */
  async renameTheme(t: Theme, to: string): Promise<string | null> {
    const name = to.trim().slice(0, 80);
    if (t.builtin || !name || name === t.name) return null;
    const n = uniqueName(name, this.themes.filter((x) => x.name !== t.name).map((x) => x.name));
    const next = { ...t, name: n };
    if (!(await this.saveTheme(next))) return null;
    if (themeFile(n) !== themeFile(t.name) && isTauri) await invoke('delete_theme', { file: themeFile(t.name) }).catch(() => {});
    this.putTheme(next, t.name);
    for (const a of ['light', 'dark'] as const) if (this.themeNames[a] === t.name) this.setThemeName(a, n);
    if (this.themeEditing === t.name) this.themeEditing = n;
    return n;
  }
  /** The theme open in the theme editor (ТЗ 25 §2), inside «Настройки → Оформление»; null: the section itself. */
  themeEditing = $state<string | null>(null);
  /** «Редактировать»: a built-in theme gets an own copy («<тема> — моя») first; the theme is chosen and opened. */
  async editTheme(t: Theme) {
    const own = t.builtin ? await this.copyTheme(t) : t;
    if (!own) return;
    this.setThemeName(own.appearance, own.name);
    this.themeEditing = own.name;
  }
  private themeTimer: ReturnType<typeof setTimeout> | undefined;
  /** A colour changed in the editor: shown at once everywhere, written to its file a moment later. */
  setThemeColors(name: string, colors: Theme['colors']) {
    const t = this.ownThemes.find((x) => x.name === name);
    if (!t) return;
    const next = { ...t, colors };
    this.putTheme(next);
    clearTimeout(this.themeTimer);
    this.themeTimer = setTimeout(() => void this.saveTheme(next), 300);
  }
  /** «Сбросить»: the colours of the theme it is based on (else of Panopticon of its appearance). */
  resetTheme(name: string) {
    const t = this.ownThemes.find((x) => x.name === name);
    if (!t) return;
    const base = this.themes.find((x) => x.name === t.basedOn && x.appearance === t.appearance && x.name !== t.name) ?? builtinFor(t.appearance);
    this.setThemeColors(name, { ...base.colors, palette: { ...base.colors.palette } });
  }
  /** «Удалить» (own themes only): a chosen one gives way to the built-in Panopticon theme of its appearance. */
  async deleteTheme(t: Theme) {
    if (t.builtin) return;
    try {
      if (isTauri) await invoke('delete_theme', { file: themeFile(t.name) });
    } catch (e) {
      return notify.say('Не удалось удалить тему: ' + e);
    }
    this.ownThemes = this.ownThemes.filter((x) => x.name !== t.name);
    for (const a of ['light', 'dark'] as const) if (this.themeNames[a] === t.name) this.setThemeName(a, DEFAULT_THEME[a]);
    if (this.themeEditing === t.name) this.themeEditing = null;
  }
  /** «Экспорт…»: the theme's file where the system save panel says. */
  async exportTheme(t: Theme) {
    if (!isTauri) return;
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ title: 'Экспорт темы', defaultPath: themeFile(t.name), filters: [{ name: 'Тема Panopticon', extensions: ['json'] }] });
    if (!path) return;
    try {
      await invoke('export_text', { path, text: themeJson({ ...t, builtin: false }) });
      notify.note(`Тема «${t.name}» сохранена`);
    } catch (e) {
      notify.say('Не удалось сохранить тему: ' + e);
    }
  }
  /** «Импорт…»: a theme file of this format becomes an own theme (a taken name gets «(2)»). */
  async importTheme() {
    if (!isTauri) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ title: 'Импорт темы', multiple: false, directory: false, filters: [{ name: 'Тема Panopticon', extensions: ['json'] }] });
    if (typeof path !== 'string') return;
    let t: Theme | null = null;
    try {
      t = parseTheme(await invoke<string>('import_text', { path }));
    } catch (e) {
      return notify.say('Не удалось прочитать файл: ' + e);
    }
    if (!t) return notify.say('Это не тема Panopticon: нужен файл .json с "format": "panopticon-theme"');
    const it = { ...t, name: uniqueName(t.name, this.themes.map((x) => x.name)) };
    if (!(await this.saveTheme(it))) return;
    this.putTheme(it);
    notify.note(`Тема «${it.name}» добавлена — ${it.appearance === 'dark' ? 'для тёмного оформления' : 'для светлого оформления'}`);
  }
  get appearance(): Appearance {
    return effective(this.appearanceChoice, this.systemDark);
  }
  themeFor(a: Appearance): Theme {
    const name = this.themeNames[a];
    if ((!this.themesRead || !this.pluginsReady) && !this.themes.some((t) => t.name === name)) return cachedTheme(a, name) ?? themeNamed(name, a);
    return themeNamed(name, a, this.themes);
  }
  /** The editor theme in effect now. */
  get theme(): Theme {
    return this.themeFor(this.appearance);
  }
  setAppearance(c: AppearanceChoice) {
    this.appearanceChoice = c;
    saveChoice(c);
  }
  setThemeName(a: Appearance, name: string) {
    this.themeNames = { ...this.themeNames, [a]: name };
    saveThemeName(a, name);
  }
}

export const themes = new Themes();

// The view preferences of this Mac (tech sprint 2.1, from the store): what the window shows and how the editor draws
// the text. Kept in localStorage; the other window hears a change through the storage event. The store forwards to it.

import { DEFAULT_LEVELS, type LevelView } from './orgIndent';
import { lsGet, lsSet } from './storage';

function readLevels(): LevelView {
  try {
    const v = JSON.parse(lsGet('editor:levels') ?? 'null');
    if (v && typeof v === 'object') {
      return {
        oneStar: typeof v.oneStar === 'boolean' ? v.oneStar : DEFAULT_LEVELS.oneStar,
        indent: typeof v.indent === 'boolean' ? v.indent : DEFAULT_LEVELS.indent,
        step: Number.isInteger(v.step) && v.step >= 1 && v.step <= 4 ? v.step : DEFAULT_LEVELS.step,
      };
    }
  } catch {
    /* unreadable: the defaults */
  }
  return { ...DEFAULT_LEVELS };
}

class Prefs {
  showNav = $state(true);
  showInspector = $state(true);
  /** "Показывать заголовки в навигаторе" (Настройки → Основные): a view preference of this Mac, off by default. */
  navHeadings = $state(lsGet('nav:headings') === '1');
  setNavHeadings(on: boolean) {
    this.navHeadings = on;
    lsSet('nav:headings', on ? '1' : '0'); // the main window hears it through the storage event
  }
  /** «Уровни заголовков» (Настройки → Основные, a view preference of this Mac): one star per level, text by level. */
  levels = $state<LevelView>(readLevels());
  /** The widths of the navigator and the inspector (dragged by their edges). */
  navW = $state(248);
  inspW = $state(272);
  /** «Оформленный текст»: the editor draws the file like org-modern; with it, its line numbers (this Mac). */
  rich = $state(lsGet('editor:rich') === '1');
  richNumbers = $state(lsGet('editor:richNumbers') === '1');
  setRich(on: boolean) {
    this.rich = on;
    lsSet('editor:rich', on ? '1' : '0'); // the other window hears it through the storage event
  }
  setRichNumbers(on: boolean) {
    this.richNumbers = on;
    lsSet('editor:richNumbers', on ? '1' : '0');
  }
  /** «Ссылки на заголовки» (ТЗ 35): by :ID: (added to the heading) or by the title (the file does not change). */
  linkFormat = $state<'id' | 'title'>(lsGet('editor:links') === 'title' ? 'title' : 'id');
  setLinkFormat(f: 'id' | 'title') {
    this.linkFormat = f;
    lsSet('editor:links', f);
  }
  /** Drawers folded when a file opens and when the app adds one (a preference of this Mac). */
  foldDrawers = $state(lsGet('editor:drawers') !== '0');
  setFoldDrawers(on: boolean) {
    this.foldDrawers = on;
    lsSet('editor:drawers', on ? '1' : '0'); // the other window hears it through the storage event
  }
  setLevels(l: Partial<LevelView>) {
    this.levels = { ...this.levels, ...l, step: Math.max(1, Math.min(4, Math.round(l.step ?? this.levels.step))) };
    lsSet('editor:levels', JSON.stringify(this.levels)); // the other window hears it through the storage event
  }
  /** «Вид › Структурный вид»: both switches on or off at once, to see the file as it is without the settings. */
  toggleStructure() {
    const on = !(this.levels.oneStar || this.levels.indent);
    this.setLevels({ oneStar: on, indent: on });
  }
  /** The inspector's tab, remembered for the window. */
  inspectorTab = $state<'task' | 'outline'>(lsGet('inspector:tab') === 'outline' ? 'outline' : 'task');
  setInspectorTab(t: 'task' | 'outline') {
    this.inspectorTab = t;
    lsSet('inspector:tab', t);
  }
  /** «Aa» and «Слово», shared by both searches (this Mac). */
  findCase = $state(lsGet('find:cs') === '1');
  findWord = $state(lsGet('find:word') === '1');
  setFindOpts(o: { cs?: boolean; word?: boolean }) {
    if (o.cs !== undefined) {
      this.findCase = o.cs;
      lsSet('find:cs', o.cs ? '1' : '0');
    }
    if (o.word !== undefined) {
      this.findWord = o.word;
      lsSet('find:word', o.word ? '1' : '0');
    }
  }
}

export const prefs = new Prefs();

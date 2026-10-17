// The new interface's own preferences on this Mac (ТЗ 42 §7, §10): the column «Структура» (on by default; ⌥⌘0), the
// font of the text and the width of its column in «Оформление». Outside `next/`: «Настройки → Основные →
// Экспериментальное» of the shared settings shows them.

import { lsGet, lsSet } from './storage';

export type TextFont = 'serif' | 'system' | 'mono';
export type TextWidth = 'narrow' | 'medium' | 'wide' | 'full';

export const TEXT_FONTS: { id: TextFont; name: string }[] = [
  { id: 'serif', name: 'Cormorant Garamond' },
  { id: 'system', name: 'Системный' },
  { id: 'mono', name: 'Моноширинный' },
];
export const TEXT_WIDTHS: { id: TextWidth; name: string; px: number | null }[] = [
  { id: 'narrow', name: 'Узкая', px: 620 },
  { id: 'medium', name: 'Средняя', px: 700 },
  { id: 'wide', name: 'Широкая', px: 860 },
  { id: 'full', name: 'Во всю ширину', px: null },
];

const pick = <T extends string>(v: string | null, ids: { id: T }[], dflt: T): T => ids.find((x) => x.id === v)?.id ?? dflt;

class NextPrefs {
  structure = $state(lsGet('next:structure') !== '0');
  font = $state<TextFont>(pick(lsGet('next:font'), TEXT_FONTS, 'serif'));
  width = $state<TextWidth>(pick(lsGet('next:width'), TEXT_WIDTHS, 'medium'));
  /** «Структура» and «Связи» folded (ТЗ 44 §10): one for every file. */
  structFolded = $state(lsGet('next:structFolded') === '1');
  linksFolded = $state(lsGet('next:linksFolded') === '1');
  toggleStructFolded() {
    this.structFolded = !this.structFolded;
    lsSet('next:structFolded', this.structFolded ? '1' : '0');
  }
  toggleLinksFolded() {
    this.linksFolded = !this.linksFolded;
    lsSet('next:linksFolded', this.linksFolded ? '1' : '0');
  }
  setStructure(on: boolean) {
    this.structure = on;
    lsSet('next:structure', on ? '1' : '0');
  }
  setFont(f: TextFont) {
    this.font = f;
    lsSet('next:font', f);
  }
  setWidth(w: TextWidth) {
    this.width = w;
    lsSet('next:width', w);
  }
  /** The column's max width as CSS: «Во всю ширину» — the whole area. */
  get col() {
    const px = TEXT_WIDTHS.find((x) => x.id === this.width)?.px;
    return px ? `${px}px` : '100%';
  }
}
export const nextPrefs = new NextPrefs();

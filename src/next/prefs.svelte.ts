// The new interface's own preferences on this Mac (ТЗ 42 §7, §10): the column «Структура» (on by default; ⌥⌘0).

import { lsGet, lsSet } from '../storage';

class NextPrefs {
  structure = $state(lsGet('next:structure') !== '0');
  setStructure(on: boolean) {
    this.structure = on;
    lsSet('next:structure', on ? '1' : '0');
  }
}
export const nextPrefs = new NextPrefs();

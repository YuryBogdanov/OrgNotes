// The names of the file tabs (ТЗ 44 §11): the file's name without `.org`, as the old interface has it; two or more
// open tabs with the same name — after each, in grey, the nearest folder that tells them apart («Ольга Петрова —
// Безопасность»); the nearest the same, the next one up; a file in the root — «корень».

import { displayName } from '../names';

export interface TabName {
  name: string;
  /** The folder that tells it from a tab of the same name; '' — none needed. */
  hint: string;
}

const ROOT = 'корень';

/** The names for the paths of the open tabs (relative to the notes folder), in their order. */
export function tabNames(rels: string[]): TabName[] {
  const names = rels.map((r) => displayName(r));
  // each path's folders, the nearest first; past the top — «корень»
  const folders = rels.map((r) => r.split('/').slice(0, -1).reverse());
  const at = (k: number, i: number) => folders[k][i] ?? ROOT;
  return rels.map((r, k) => {
    const same = names.flatMap((n, j) => (j !== k && n === names[k] && rels[j] !== r ? [j] : []));
    if (!same.length) return { name: names[k], hint: '' };
    const deepest = Math.max(folders[k].length, ...same.map((j) => folders[j].length));
    for (let i = 0; i <= deepest; i++) if (same.every((j) => at(j, i) !== at(k, i))) return { name: names[k], hint: at(k, i) };
    return { name: names[k], hint: folders[k][0] ?? ROOT };
  });
}

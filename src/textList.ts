// Lists in a plain text field, as in the editor (the goal form, ТЗ 23): ↩ in an item makes the next item, ↩ in an
// empty item leaves the list, ⇥ / ⇧⇥ move the item in and out. Pure: the text and the caret in, the same out.

export interface Edit {
  value: string;
  caret: number;
}
const ITEM = /^(\s*)([-+]|\d+[.)]) (.*)$/;
const lineAt = (v: string, at: number) => {
  const from = v.lastIndexOf('\n', at - 1) + 1;
  const end = v.indexOf('\n', at);
  return { from, to: end < 0 ? v.length : end };
};

/** ↩: null if the line is not an item (a plain new line then). */
export function listEnter(value: string, caret: number): Edit | null {
  const { from, to } = lineAt(value, caret);
  const m = ITEM.exec(value.slice(from, to));
  if (!m) return null;
  if (!m[3].trim() && caret === to) {
    // an empty item: the marker goes, the list is left
    return { value: value.slice(0, from) + value.slice(to), caret: from };
  }
  const num = /^\d+/.exec(m[2]);
  const marker = num ? `${+num[0] + 1}${m[2].slice(-1)}` : m[2];
  const ins = '\n' + m[1] + marker + ' ';
  return { value: value.slice(0, caret) + ins + value.slice(caret), caret: caret + ins.length };
}

/** ⇥ (+1) / ⇧⇥ (−1): the line moved in or out by two spaces; null if there is nothing to move out. */
export function listIndent(value: string, caret: number, dir: 1 | -1): Edit | null {
  const { from } = lineAt(value, caret);
  if (dir > 0) return { value: value.slice(0, from) + '  ' + value.slice(from), caret: caret + 2 };
  const sp = /^ {1,2}/.exec(value.slice(from))?.[0].length ?? 0;
  if (!sp) return null;
  return { value: value.slice(0, from) + value.slice(from + sp), caret: Math.max(from, caret - sp) };
}

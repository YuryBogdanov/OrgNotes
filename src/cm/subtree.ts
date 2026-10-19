// The subtree of one heading marked (the file beside a list, ТЗ 56 §4): a bar of the lamp left of its lines, from the
// heading down to the next heading of its level or higher. It follows the text as it is edited.

import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/** The lines of the subtree of the heading at `line` (0-based, the last one inclusive); null — not a heading. */
export function subtreeOf(lines: string[], line: number): [number, number] | null {
  const m = /^(\*+)\s/.exec(lines[line] ?? '');
  if (!m) return null;
  const lvl = m[1].length;
  let last = line;
  for (let i = line + 1; i < lines.length; i++) {
    const h = /^(\*+)\s/.exec(lines[i]);
    if (h && h[1].length <= lvl) break;
    last = i;
  }
  while (last > line && !lines[last].trim()) last--; // the blank lines at its end are not its
  return [line, last];
}

export function subtreeBar(line: number) {
  const build = (view: EditorView): DecorationSet => {
    const doc = view.state.doc;
    const b = new RangeSetBuilder<Decoration>();
    if (line < 0 || line >= doc.lines) return b.finish();
    const lines: string[] = [];
    for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);
    const r = subtreeOf(lines, line);
    if (!r) return b.finish();
    for (let i = r[0]; i <= r[1]; i++) b.add(doc.line(i + 1).from, doc.line(i + 1).from, Decoration.line({ class: 'cm-sub' + (i === r[0] ? ' top' : '') + (i === r[1] ? ' last' : '') }));
    return b.finish();
  };
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (p) => p.decorations },
  );
}

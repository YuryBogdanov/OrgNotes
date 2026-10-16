// The current section of the new interface's «Оформление» (ТЗ 42 §5.1): a bar of the lamp left of the text, as high
// as the heading the caret is under and its body (up to its first subheading or the next heading).

import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { headingSet } from './doc';

function build(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const heads = headingSet(doc);
  const caret = doc.lineAt(view.state.selection.main.head).number - 1;
  let top = -1;
  for (let i = caret; i >= 0; i--)
    if (heads.has(i)) {
      top = i;
      break;
    }
  const b = new RangeSetBuilder<Decoration>();
  if (top < 0) return b.finish();
  let last = top;
  while (last + 1 < doc.lines && !heads.has(last + 1)) last++;
  // the blank lines at the end of the body are not the section's
  while (last > top && !doc.line(last + 1).text.trim()) last--;
  for (let i = top; i <= last; i++) b.add(doc.line(i + 1).from, doc.line(i + 1).from, Decoration.line({ class: 'cm-n-sec' + (i === top ? ' top' : '') + (i === last ? ' last' : '') }));
  return b.finish();
}

export const sectionBar = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet) this.decorations = build(u.view);
    }
  },
  { decorations: (p) => p.decorations },
);

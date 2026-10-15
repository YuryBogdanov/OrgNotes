// A note at the end of a line (tech sprint 4.3, from Editor.svelte): a word of the app after a line of the file
// («Открыто из агенды» and the like), not part of the text.

import { Decoration, EditorView, WidgetType } from '@codemirror/view';

class NoteWidget extends WidgetType {
  text: string;
  constructor(text: string) {
    super();
    this.text = text;
  }
  eq(o: NoteWidget) {
    return o.text === this.text;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-line-note';
    s.textContent = this.text;
    return s;
  }
}

export const noteExt = (n: { line: number; text: string } | null) =>
  n ? EditorView.decorations.compute([], (st) => (n.line + 1 > st.doc.lines ? Decoration.none : Decoration.set([Decoration.widget({ widget: new NoteWidget(n.text), side: 1 }).range(st.doc.line(n.line + 1).to)]))) : [];

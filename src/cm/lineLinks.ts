// The plugins' links at the end of a line («Открыть доску ⌥⌘B», ТЗ 33; tech sprint 4.3, from Editor.svelte).

import { StateEffect, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { lineLinks, onLineLinks } from '../lineLinks';

class LinkWidget extends WidgetType {
  label: string;
  owner: number;
  line: number;
  constructor(label: string, owner: number, line: number) {
    super();
    this.label = label;
    this.owner = owner;
    this.line = line;
  }
  eq(o: LinkWidget) {
    return o.label === this.label && o.owner === this.owner && o.line === this.line;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-line-link';
    s.textContent = this.label;
    s.dataset.lineLink = this.owner + ':' + this.line;
    return s;
  }
  ignoreEvent() {
    return false;
  }
}
const linksChanged = StateEffect.define<null>();
function lineLinkDecos(v: EditorView): DecorationSet {
  const all = lineLinks();
  if (!all.length) return Decoration.none;
  const out: Range<Decoration>[] = [];
  for (const r of v.visibleRanges)
    for (let pos = r.from; pos <= r.to; ) {
      const ln = v.state.doc.lineAt(pos);
      all.forEach((l, i) => {
        const label = l.label(ln.text, ln.number - 1);
        if (label) out.push(Decoration.widget({ widget: new LinkWidget(label, i, ln.number - 1), side: 1 }).range(ln.to));
      });
      pos = ln.to + 1;
    }
  return Decoration.set(out, true);
}
/** The links, and a click on one runs it for the file at `path()` (the editor's file, read at the click). */
export const lineLinkExt = (path: () => string) => [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      stop: () => void;
      constructor(v: EditorView) {
        this.decorations = lineLinkDecos(v);
        this.stop = onLineLinks(() => queueMicrotask(() => v.dispatch({ effects: linksChanged.of(null) })));
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.transactions.some((t) => t.effects.some((e) => e.is(linksChanged)))) this.decorations = lineLinkDecos(u.view);
      }
      destroy() {
        this.stop();
      }
    },
    { decorations: (p) => p.decorations },
  ),
  EditorView.domEventHandlers({
    mousedown(e) {
      const el = (e.target as HTMLElement).closest?.('[data-line-link]') as HTMLElement | null;
      if (!el || e.button !== 0) return false;
      e.preventDefault();
      const [i, line] = el.dataset.lineLink!.split(':').map(Number);
      lineLinks()[i]?.run(path(), line);
      return true;
    },
  }),
];

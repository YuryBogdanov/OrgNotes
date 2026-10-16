// ⌘F in the editor: the matches of the query in the whole file, the current one, their highlight, «N в свёрнутом»
// on folded headings and drawers, and ticks along the scroll bar. The bar itself is the pane's (`FindBar.svelte`).

import { StateEffect, StateField, type Extension, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from '@codemirror/view';
import { foldState, foldedRanges } from '@codemirror/language';
import { findRanges, nearest, replacementOf, type FindOpts } from './search';
import { isolateHistory } from '@codemirror/commands';

export interface FindQuery extends FindOpts {
  q: string;
  show: boolean; // highlighted (the bar is open); ⌘G with the bar closed moves without it
  at?: number | null; // make the match starting here the current one (a jump from the global search)
}
export interface Found {
  q: string;
  starts: number[];
  ends: number[]; // a regular expression's matches have their own lengths (ТЗ 42 §5.7)
  len: number;
  cur: number; // index into starts, −1: none
  show: boolean;
  wrapped: boolean; // the last step went round the end
}
export const setFind = StateEffect.define<FindQuery | null>();
export const moveFind = StateEffect.define<1 | -1>();

const docText = new WeakMap<Text, string>();
const textOf = (doc: Text) => {
  let t = docText.get(doc);
  if (t === undefined) docText.set(doc, (t = doc.toString()));
  return t;
};

export const findField = StateField.define<(Found & FindOpts) | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) {
      if (e.is(setFind)) {
        const f = e.value;
        if (!f) return null;
        const rs = findRanges(textOf(tr.newDoc), f.q, f);
        const starts = rs.map((r) => r.from);
        const cur = f.at != null && starts.includes(f.at) ? starts.indexOf(f.at) : nearest(starts, tr.state.selection.main.from);
        v = { q: f.q, cs: f.cs, word: f.word, re: f.re, show: f.show, starts, ends: rs.map((r) => r.to), len: f.q.length, cur, wrapped: false };
      } else if (e.is(moveFind) && v && v.starts.length) {
        const n = v.starts.length;
        const next = (v.cur + e.value + n) % n;
        v = { ...v, cur: next, wrapped: (e.value > 0 && next < v.cur) || (e.value < 0 && next > v.cur) };
      }
    }
    if (v && tr.docChanged) {
      // the text changed: the matches again, the current one nearest to where it was
      const was = v.cur >= 0 ? tr.changes.mapPos(v.starts[v.cur]) : tr.state.selection.main.from;
      const rs = findRanges(textOf(tr.newDoc), v.q, v);
      const starts = rs.map((r) => r.from);
      v = { ...v, starts, ends: rs.map((r) => r.to), cur: nearest(starts, was), wrapped: false };
    }
    return v;
  },
});

class Badge extends WidgetType {
  constructor(readonly n: number) {
    super();
  }
  eq(o: Badge) {
    return o.n === this.n;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-find-folded';
    s.textContent = `${this.n} в свёрнутом`;
    return s;
  }
}

const marks = EditorView.decorations.compute([findField, foldState, 'selection'], (state) => {
  const f = state.field(findField);
  if (!f || !f.show || !f.starts.length) return Decoration.none;
  const out: Range<Decoration>[] = [];
  // a match inside the selection is marked too: its yellow would hide the selection under it
  const inSel = (a: number, b: number) => state.selection.ranges.some((r) => !r.empty && r.from < b && r.to > a);
  f.starts.forEach((s, i) => {
    const cls = (i === f.cur ? 'cm-find cm-find-cur' : 'cm-find') + (inSel(s, f.ends[i]) ? ' cm-find-sel' : '');
    out.push(Decoration.mark({ class: cls }).range(s, f.ends[i]));
  });
  // folded: how many matches each hides
  let outer = -1; // a fold inside a folded one is not shown: only the outer one gets a badge
  foldedRanges(state).between(0, state.doc.length, (a, b) => {
    if (a < outer) return;
    outer = b;
    let n = 0;
    for (const s of f.starts) if (s > a && s < b) n++;
    if (n) out.push(Decoration.widget({ widget: new Badge(n), side: 1 }).range(a));
  });
  out.sort((x, y) => x.from - y.from || x.value.startSide - y.value.startSide);
  return Decoration.set(out, true);
});

/** Yellow ticks along the scroll bar where the matches are. */
const ticks = ViewPlugin.fromClass(
  class {
    el: HTMLDivElement;
    last = '';
    constructor(readonly view: EditorView) {
      this.el = document.createElement('div');
      this.el.className = 'cm-find-ticks';
      this.el.setAttribute('aria-hidden', 'true');
      view.dom.appendChild(this.el);
      this.draw();
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.startState.field(findField) !== u.state.field(findField)) this.draw();
    }
    draw() {
      const f = this.view.state.field(findField);
      const doc = this.view.state.doc;
      const lines = f && f.show ? [...new Set(f.starts.map((s) => doc.lineAt(s).number))] : [];
      const key = lines.join(',') + '|' + (f?.cur ?? -1);
      if (key === this.last) return;
      this.last = key;
      this.el.replaceChildren(
        ...lines.slice(0, 2000).map((n) => {
          const t = document.createElement('span');
          t.style.top = `${((n - 1) / Math.max(1, doc.lines)) * 100}%`;
          if (f && f.cur >= 0 && doc.lineAt(f.starts[f.cur]).number === n) t.className = 'cur';
          return t;
        }),
      );
    }
    destroy() {
      this.el.remove();
    }
  },
);

export const findExtension: Extension = [findField, marks, ticks];

/** The info the bar shows: «2 из 6», how many are folded away. */
export function foundInfo(view: EditorView) {
  const f = view.state.field(findField, false);
  if (!f) return null;
  // each match once, even under a folded drawer inside a folded heading
  const hidden = new Set<number>();
  foldedRanges(view.state).between(0, view.state.doc.length, (a, b) => {
    for (const s of f.starts) if (s > a && s < b) hidden.add(s);
  });
  const folded = hidden.size;
  return { total: f.starts.length, cur: f.cur, folded, wrapped: f.wrapped };
}

/** «Заменить» / «Все» (ТЗ 42 §5.7): the current match, or every match of the file, by `text` — one edit, one step of
 *  ⌘Z; inside folded drawers and hidden markup too (the text is the file's). The current one: the next becomes
 *  current. How many were replaced. */
export function replaceFound(view: EditorView, text: string, all: boolean): number {
  const f = view.state.field(findField, false);
  if (!f || !f.starts.length || (!all && f.cur < 0)) return 0;
  const at = all ? f.starts.map((_, i) => i) : [f.cur];
  const changes = at.map((i) => ({ from: f.starts[i], to: f.ends[i], insert: replacementOf(view.state.sliceDoc(f.starts[i], f.ends[i]), f.q, f, text) }));
  view.dispatch({ changes, userEvent: 'input.replace', annotations: isolateHistory.of('full'), scrollIntoView: !all });
  return changes.length;
}

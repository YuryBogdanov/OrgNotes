// Narrowing the editor to one subtree (a card of a review, the mini window; tech sprint 4.3, from Editor.svelte): the
// rest is hidden and cannot be changed by the user; the shown lines follow the changes.

import { EditorState, StateEffect, StateField, Transaction, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

/** The shown part: from the start of the first line to the end of the last non-blank one — but never above `keep`
 *  (the caret, the end shown already): blank lines typed here stay while the card is open (fix to ТЗ 18, Enter). */
export function narrowRange(doc: Text, n: { line: number; end: number; keep?: number }) {
  let last = Math.min(n.end, doc.lines) - 1;
  const floor = n.keep !== undefined ? Math.min(last, doc.lineAt(Math.min(n.keep, doc.length)).number - 1) : n.line;
  while (last > Math.max(n.line, floor) && doc.line(last + 1).text.trim() === '') last--;
  return { from: doc.line(Math.min(n.line + 1, doc.lines)).from, to: doc.line(Math.max(last, n.line) + 1).to };
}
const hiddenOutside = (st: EditorState, r: { from: number; to: number } | null) => {
  if (!r) return Decoration.none;
  const out: Range<Decoration>[] = [];
  if (r.from > 0) out.push(Decoration.replace({ block: true }).range(0, r.from - 1));
  if (r.to < st.doc.length) out.push(Decoration.replace({ block: true }).range(r.to + 1, st.doc.length));
  return Decoration.set(out);
};
/** The heading's lines again (it grew or moved by a change from elsewhere: the mini window, ТЗ 31). */
export const setNarrow = StateEffect.define<{ line: number; end: number; keep?: number }>();
/** The editor narrowed to lines `line`…`end`; `onnarrow`: the lines shown after a change (by the user or not). The
 *  field holds the shown range. */
export function narrowing(n: { line: number; end: number }, onnarrow: (from: number, to: number, byUser: boolean) => void) {
  const field = StateField.define<{ from: number; to: number }>({
    create: (st) => narrowRange(st.doc, n),
    update: (r, tr) => {
      const reset = tr.effects.find((e) => e.is(setNarrow));
      if (reset) return narrowRange(tr.state.doc, reset.value as { line: number; end: number; keep?: number });
      // typing at either edge stays inside
      return tr.docChanged ? { from: tr.changes.mapPos(r.from, -1), to: tr.changes.mapPos(r.to, 1) } : r;
    },
  });
  return {
    field,
    ext: [
    field,
    EditorView.decorations.compute([field], (st) => hiddenOutside(st, st.field(field))),
    EditorView.atomicRanges.of((v) => hiddenOutside(v.state, v.state.field(field))),
    // the user cannot change what is hidden (the app's own patches, from disk or other tabs, still go through)
    EditorState.changeFilter.of((tr) => {
      if (!tr.annotation(Transaction.userEvent)) return true;
      const r = tr.startState.field(field);
      const len = tr.startState.doc.length;
      return [0, Math.max(0, r.from - 1), Math.min(len, r.to + 1), len];
    }),
    EditorView.updateListener.of((u) => {
      if (!u.docChanged) return;
      const r = u.state.field(field);
      onnarrow(u.state.doc.lineAt(r.from).number - 1, u.state.doc.lineAt(r.to).number - 1, u.transactions.some((tr) => !!tr.annotation(Transaction.userEvent)));
    }),
    ],
  };
}

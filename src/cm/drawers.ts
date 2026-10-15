// Folds of the editor (tech sprint 4.3, from Editor.svelte): headings asked to be folded, drawers — all of them when
// a file opens, a new one the app adds, one on Tab —, and folds left on drawers that are not drawers any more.

import { EditorState, MapMode, StateEffect, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { foldEffect, foldable, foldedRanges, unfoldEffect } from '@codemirror/language';
import type { DrawerRange } from '../org';
import { drawerFold, drawerMap, headingSet } from './doc';

/** Fold these heading lines (a card of goals: «Отметки», shown on the right). */
export function foldLines(v: EditorView, lines: number[]) {
  // in order: CodeMirror takes ranges sorted (nested folds come after their parent's in `foldedRanges`)
  const effects = [...new Set(lines)].sort((a, b) => a - b).flatMap((l) => {
    if (l + 1 > v.state.doc.lines) return [];
    const ln = v.state.doc.line(l + 1);
    const r = foldable(v.state, ln.from, ln.to);
    return r ? [foldEffect.of(r)] : [];
  });
  if (effects.length) v.dispatch({ effects });
}

/** Fold every drawer of the document (a file just opened). */
export function foldAllDrawers(v: EditorView, on: boolean) {
  if (!on) return;
  const effects = [...drawerMap(v.state.doc).values()].map((d) => foldEffect.of(drawerFold(v.state.doc, d)));
  if (effects.length) v.dispatch({ effects });
}
// what the user types, pastes, deletes or undoes: a drawer made this way stays open
const BY_HAND = ['input.type', 'input.paste', 'input.drop', 'input.complete', 'delete', 'undo', 'redo'];
/** A drawer the app adds (Inbox, a status with LOGBOOK, a file changed on disk) comes folded. */
export const foldNewDrawers = (on: () => boolean) =>
  EditorState.transactionExtender.of((tr: Transaction) => {
    if (!on() || !tr.docChanged || BY_HAND.some((e) => tr.isUserEvent(e))) return null;
    const before = new Set<number>();
    for (const d of drawerMap(tr.startState.doc).values()) {
      const at = tr.changes.mapPos(tr.startState.doc.line(d.start + 1).from, 1, MapMode.TrackDel);
      if (at !== null) before.add(at);
    }
    const effects: StateEffect<unknown>[] = [];
    for (const d of drawerMap(tr.newDoc).values())
      if (!before.has(tr.newDoc.line(d.start + 1).from)) effects.push(foldEffect.of(drawerFold(tr.newDoc, d)));
    return effects.length ? { effects } : null;
  });
/** Tab on a drawer's first line: fold or open it; the caret goes to that line, so the next Tab finds it again. */
export function toggleDrawer(v: EditorView, d: DrawerRange) {
  const r = drawerFold(v.state.doc, d);
  let folded = false;
  foldedRanges(v.state).between(r.from, r.from, (a, b) => {
    if (a === r.from && b === r.to) folded = true;
  });
  const head = v.state.selection.main.head;
  v.dispatch({ effects: (folded ? unfoldEffect : foldEffect).of(r), selection: head > r.from ? { anchor: r.from } : undefined });
  return true;
}
/** Folds on drawers that are not drawers any more (an :END: gone): taken away, the text shows. */
export function dropStaleFolds(v: EditorView) {
  const doc = v.state.doc;
  const heads = headingSet(doc);
  const drawersHere = drawerMap(doc);
  const stale: { from: number; to: number }[] = [];
  foldedRanges(v.state).between(0, doc.length, (from, to) => {
    const line = doc.lineAt(from);
    if (line.to !== from || heads.has(line.number - 1)) return;
    const d = drawersHere.get(line.number - 1);
    if (!d || drawerFold(doc, d).to !== to) stale.push({ from, to });
  });
  if (stale.length) queueMicrotask(() => v.dispatch({ effects: stale.map((r) => unfoldEffect.of(r)) }));
}

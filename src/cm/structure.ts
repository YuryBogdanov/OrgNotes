// Org's structure in the editor (tech sprint 4.3, from Editor.svelte): a command's result applied, a new heading or
// list item (M-RET), S-Tab's cycle of what is shown, and what a fold of a heading or a drawer covers.

import { EditorView } from '@codemirror/view';
import { foldEffect, foldService, foldable, foldedRanges, unfoldEffect } from '@codemirror/language';
import type { Workflow } from '../org';
import { foldTargets, insertHeading, insertItem, isHeadingLine, newTaskState, nextCycleState, type Result } from '../outline';
import { HEAD, drawerFold, drawerMap, headingSet } from './doc';

export const cycleState = new WeakMap<EditorView, number>(); // S-Tab position per editor, absent = everything open

export const apply = (v: EditorView, r: Result) => {
  v.dispatch({ changes: r.changes, selection: { anchor: r.caret }, scrollIntoView: true, userEvent: 'input' });
  cycleState.delete(v);
  return true;
};
export const sel = (v: EditorView) => v.state.selection.main;
/** Apply a command result; a heading-line command that cannot move still consumes the key. */
export const run = (v: EditorView, r: Result | null) => (r ? apply(v, r) : true);
export const onHeading = (v: EditorView) => sel(v).empty && isHeadingLine(v.state.doc.toString(), sel(v).head);

export const isFolded = (v: EditorView, lineTo: number) => {
  let folded = false;
  foldedRanges(v.state).between(lineTo, lineTo, (from) => {
    if (from === lineTo) folded = true;
  });
  return folded;
};

/** M-RET / M-S-RET: new heading at the current level. */
export const newHeading = (v: EditorView, todo: boolean, words: Workflow) => {
  const head = sel(v).head;
  // in a list: a new item (with a checkbox for ⌥⇧↩), as Org's M-RET / M-S-RET there
  const item = insertItem(v.state.doc.toString(), head, { box: todo });
  if (item) return apply(v, item);
  const line = v.state.doc.lineAt(head);
  return apply(v, insertHeading(v.state.doc.toString(), head, { todo: todo ? newTaskState(words) : undefined, folded: isFolded(v, line.to) }));
};

/** S-Tab: everything folded, then level 1 open, level 2 open, ... all open, then folded again. */
export const cycleVisibility = (v: EditorView) => {
  const text = v.state.doc.toString();
  const { max } = foldTargets(text, 0);
  if (max === 0) return false; // no headings
  const state = nextCycleState(cycleState.get(v), max);
  cycleState.set(v, state);
  const targets = foldTargets(text, state).lines;
  const effects = [] as ReturnType<typeof foldEffect.of>[];
  const heads = headingSet(v.state.doc);
  // only the headings' folds: drawers keep theirs (as org-cycle-hide-drawers)
  foldedRanges(v.state).between(0, v.state.doc.length, (from, to) => {
    if (heads.has(v.state.doc.lineAt(from).number - 1)) effects.push(unfoldEffect.of({ from, to }));
  });
  const fold: { from: number; to: number }[] = [];
  for (const ln of targets) {
    const l = v.state.doc.line(ln + 1);
    const r = foldable(v.state, l.from, l.to);
    if (r) {
      effects.push(foldEffect.of(r));
      fold.push(r);
    }
  }
  // the caret must not end up inside hidden text: put it on the outermost folded heading
  const head = sel(v).head;
  const hiding = fold.filter((r) => head > r.from && head <= r.to).sort((a, b) => a.from - b.from)[0];
  v.dispatch({ effects, selection: hiding ? { anchor: hiding.from } : undefined, scrollIntoView: true });
  return true;
};

export const orgFold = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  const heads = headingSet(state.doc);
  if (!heads.has(line.number - 1)) {
    const d = drawerMap(state.doc).get(line.number - 1);
    return d ? drawerFold(state.doc, d) : null;
  }
  const m = HEAD.exec(line.text)!;
  let end = line.to;
  let content = false; // a heading followed only by blank lines has nothing to fold
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const l = state.doc.line(n);
    const mm = heads.has(n - 1) ? HEAD.exec(l.text) : null;
    if (mm && mm[1].length <= m[1].length) break;
    if (l.text.trim() !== '') content = true;
    end = l.to;
  }
  return content && end > line.to ? { from: line.to, to: end } : null;
});

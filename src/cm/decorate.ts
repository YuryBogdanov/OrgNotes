// The marks of Org in the plain editor (tech sprint 4.3, from Editor.svelte): heading levels, statuses in their
// colours, priorities, cookies, tags, planning words, drawers, #+ lines, tables, timestamps; links shown by their
// description unless the caret is on them (`atomic`: the hidden parts, skipped by the caret).

import { RangeSetBuilder, type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view';
import { toneFor, type Workflow } from '../org';
import { toneStyle } from '../colors';
import { HEAD, headingSet, linksIn } from './doc';

export function decorate(v: EditorView, words: Workflow): { all: DecorationSet; atomic: DecorationSet } {
  const items: Range<Decoration>[] = [];
  const hidden: Range<Decoration>[] = [];
  const open = new Set(words.open);
  const done = new Set(words.done);
  const heads = headingSet(v.state.doc);
  const mark = (from: number, to: number, cls: string) => items.push(Decoration.mark({ class: cls }).range(from, to));
  for (const { from, to } of v.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = v.state.doc.lineAt(pos);
      const t = line.text;
      const hm = heads.has(line.number - 1) ? HEAD.exec(t) : null;
      if (hm) {
        const lvl = Math.min(hm[1].length, 9); // deeper than 9: as 9
        items.push(Decoration.line({ class: 'cm-h' + lvl }).range(line.from));
        let i = hm[0].length;
        const w = /^(\S+)/.exec(t.slice(i));
        if (w && (open.has(w[1]) || done.has(w[1]))) {
          items.push(
            Decoration.mark({ class: 'cm-kw tone', attributes: { style: toneStyle(toneFor(w[1], words)) } }).range(line.from + i, line.from + i + w[1].length),
          );
          i += w[1].length;
          if (done.has(w[1])) items.push(Decoration.line({ class: 'cm-doneline' }).range(line.from));
        }
        const pr = /^\s+(\[#[A-Z]\])/.exec(t.slice(i));
        if (pr) mark(line.from + i + pr[0].length - pr[1].length, line.from + i + pr[0].length, 'cm-prio');
        const ck = /\[\d+\/\d+\]|\[\d+%\]/.exec(t);
        if (ck) mark(line.from + ck.index, line.from + ck.index + ck[0].length, 'cm-cookie');
        const tg = /\s(:(?:[^\s:]+:)+)\s*$/.exec(t);
        if (tg) mark(line.from + tg.index + 1, line.from + tg.index + 1 + tg[1].length, 'cm-tags');
      } else {
        const pl = /^\s*((?:SCHEDULED|DEADLINE|CLOSED):)/.exec(t);
        if (pl) {
          for (const m of t.matchAll(/(SCHEDULED|DEADLINE|CLOSED):/g)) mark(line.from + m.index!, line.from + m.index! + m[0].length, 'cm-plan');
        }
        if (/^\s*:[A-Za-z_]+:/.test(t)) {
          const m = /:[A-Za-z_]+:/.exec(t)!;
          mark(line.from + m.index, line.from + m.index + m[0].length, 'cm-drawer');
        }
        if (/^#\+/.test(t)) {
          const m = /^#\+\w+:/.exec(t);
          if (m) mark(line.from, line.from + m[0].length, 'cm-meta');
        }
        if (/^\s*\|/.test(t)) {
          if (/^\s*\|[-+]+\|?\s*$/.test(t)) mark(line.from, line.to, 'cm-tablesep');
        }
      }
      for (const m of t.matchAll(/[<[]\d{4}-\d{2}-\d{2}[^>\]\n]*[>\]]/g)) mark(line.from + m.index!, line.from + m.index! + m[0].length, 'cm-ts');
      if (line.to + 1 > to) break;
      pos = line.to + 1;
    }
  }
  // links: show only the description (like org-link-descriptive) unless the cursor is on the link
  const sel = v.state.selection.main;
  const hide = (a: number, b: number) => {
    if (b <= a) return;
    const r = Decoration.replace({}).range(a, b);
    items.push(r);
    hidden.push(r);
  };
  for (const l of linksIn(v.state.doc)) {
    if (!v.visibleRanges.some((r) => l.to >= r.from && l.from <= r.to)) continue;
    const oneLine = v.state.doc.lineAt(l.from).number === v.state.doc.lineAt(l.to).number;
    if (l.format === 'bracket' && oneLine) {
      const a = l.descFrom ?? l.from + 2;
      const b = l.descTo ?? l.to - 2;
      mark(a, b, 'cm-link');
      if (sel.from <= l.to && sel.to >= l.from) {
        mark(l.from, a, 'cm-linkmark');
        mark(b, l.to, 'cm-linkmark');
      } else {
        hide(l.from, a);
        hide(b, l.to);
      }
    } else {
      mark(l.from, l.to, 'cm-link');
    }
  }
  // builder needs ordering by position (line decorations first at equal position)
  const build = (rs: Range<Decoration>[]) => {
    rs.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
    const b = new RangeSetBuilder<Decoration>();
    for (const r of rs) b.add(r.from, r.to, r.value);
    return b.finish();
  };
  return { all: build(items), atomic: build(hidden) };
}

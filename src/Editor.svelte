<script module lang="ts">
  /** The reveals applied, by the editor's key: an editor made again for a tab shown again (another tab was in
   *  front) must not apply its old reveal again — the caret would be centred, the scroll lost. */
  const revealed = new Map<string, number>();
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { Compartment, EditorState, MapMode, RangeSetBuilder, StateEffect, StateField, Transaction, type Range } from '@codemirror/state';
  import { Decoration, EditorView, ViewPlugin, WidgetType, hoverTooltip, placeholder as cmPlaceholder, drawSelection, scrollPastEnd, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, type DecorationSet, type ViewUpdate } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands';
  import { codeFolding, foldEffect, foldGutter, foldKeymap, foldService, foldable, foldedRanges, toggleFold, unfoldEffect } from '@codemirror/language';
  import { drawerRanges, headingLines, toneFor, type DrawerRange, type Workflow } from './org';
  import { toneStyle } from './colors';
  import { extractLinks, type OrgLink } from './links';
  import { changeStatusAt, cyclePriority, foldTargets, insertHeading, isHeadingLine, moveSubtree, newTaskState, nextCycleState, rotateStatus, rotateWorkflow, shiftHeading, shiftSubtree, insertItem, type Result } from './outline';
  import type { Text } from '@codemirror/state';
  import { lineLinks, onLineLinks } from './lineLinks';
  import { DEFAULT_LEVELS, orgIndent, type LevelView } from './orgIndent';
  import { orgRich, type RichPick } from './orgRich';
  import { findExtension, findField, foundInfo, moveFind, setFind, type FindQuery } from './findView';
  import { registerEditor } from './editorKeys';
  import { clipTarget, linkHooks, linkPaste } from './linkEdit';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import TagPop from './TagPop.svelte';
  import { tagsState } from './tagsState.svelte';
  import { lineTags, withTags } from './tags';
  import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';

  let { text, fileKey, path = '', wf, reveal, initial, initialTop, ontop, initialFolds, onfolds, hint = '', resetOn = 0, levels = DEFAULT_LEVELS, drawers = true, narrow = null, folded = [], lineNote = null, rich = false, richNumbers = false, gutter = true, onrich, find = null, onfound, onapi, onnarrow, onchange, oncursor, onfollow }: {
    path?: string; // the file's name in the folder: what a plugin's link at the end of a line is run with (ТЗ 33)
    levels?: LevelView; // «Структурный вид»: one star per level, text moved by level
    drawers?: boolean; // drawers folded when a file opens and when the app adds one (:PROPERTIES:, :LOGBOOK:)
    gutter?: boolean; // the line numbers and the fold markers on the left (none in the mini window, ТЗ 31)
    rich?: boolean; // «Оформленный текст»: drawn like org-modern (implies the structural view)
    richNumbers?: boolean; // line numbers while drawn
    onrich?: (p: RichPick) => void; // a click on a status, a priority or a date that asks for a choice
    find?: (FindQuery & { go: number; dir: 1 | -1 }) | null; // ⌘F: the query; a new `go` steps to the next / previous match
    onfound?: (info: { total: number; cur: number; folded: number; wrapped: boolean } | null) => void;
    onapi?: (api: { selection: () => string }) => void; // what the pane asks of the editor (⌘F, ⌘E take the selection)
    // «Разбор Inbox»: only these lines of the file are shown and edited (as org-narrow-to-subtree); `end` exclusive
    narrow?: { line: number; end: number } | null;
    folded?: number[]; // heading lines folded when the editor opens («Отметки» on a card of goals)
    lineNote?: { line: number; text: string } | null; // a grey note at the end of a line («2 — справа»)
    onnarrow?: (line: number, last: number, typed: boolean) => void; // where the shown lines are now (they move with edits); typed: by the user here
    hint?: string; // grey placeholder in an empty document
    resetOn?: number; // bumped when the text was silently reloaded from disk: the undo history starts over
    text: string; fileKey: string; wf: Workflow;
    reveal: { line: number; n: number; focus?: boolean; col?: number } | null | undefined;
    initial?: { line: number; col: number }; // where the caret of this tab was (restored when the tab is shown)
    initialTop?: number; // the first line that was in view (the scroll comes back with the tab)
    ontop?: (line: number) => void; // the first line in view, after a scroll
    initialFolds?: number[]; // the headings folded when the tab was last shown (their lines)
    onfolds?: (lines: number[]) => void; // the headings folded now, after a fold or an unfold
    onchange: (t: string) => void;
    oncursor: (line: number, col: number) => void;
    onfollow: (link: OrgLink) => void;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let lastKey = '';
  let lastReveal = 0;
  let lastReset = 0;
  const undo = new Compartment();
  const structure = new Compartment(); // switching the view is not an edit: no undo step, no unsaved mark
  let lastLevels = '';
  const numbers = new Compartment(); // line numbers: off while drawn, unless asked for
  const note = new Compartment();
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
  // ---- the plugins' links at the end of a line («Открыть доску ⌥⌘B», ТЗ 33) ----
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
  const lineLinkExt = () => [
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
        lineLinks()[i]?.run(path, line);
        return true;
      },
    }),
  ];
  const noteExt = (n: { line: number; text: string } | null) =>
    n ? EditorView.decorations.compute([], (st) => (n.line + 1 > st.doc.lines ? Decoration.none : Decoration.set([Decoration.widget({ widget: new NoteWidget(n.text), side: 1 }).range(st.doc.line(n.line + 1).to)]))) : [];

  const HEAD = /^(\*+)\s/;
  // heading lines per document version; ignores `* x` inside #+BEGIN_…/#+END_… blocks
  const cache = new WeakMap<Text, Set<number>>();
  const headingSet = (doc: Text) => {
    let s = cache.get(doc);
    if (!s) cache.set(doc, (s = headingLines(doc.toString().split('\n'))));
    return s;
  };

  // drawers per document version, by the line (0-based) they start on
  const drawerCache = new WeakMap<Text, Map<number, DrawerRange>>();
  const drawerMap = (doc: Text) => {
    let m = drawerCache.get(doc);
    if (!m) drawerCache.set(doc, (m = new Map(drawerRanges(doc.toString().split('\n')).map((d) => [d.start, d]))));
    return m;
  };
  /** The folded range of a drawer: from the end of its first line to the end of its :END: line. */
  const drawerFold = (doc: Text, d: DrawerRange) => ({ from: doc.line(d.start + 1).to, to: doc.line(d.end + 1).to });
  let drawersOn = true; // read by the editor's extensions, which outlive a render
  $effect.pre(() => {
    drawersOn = drawers;
  });
  /** Fold these heading lines (a card of goals: «Отметки», shown on the right). */
  function foldLines(v: EditorView, lines: number[]) {
    // in order: CodeMirror takes ranges sorted (nested folds come after their parent's in `foldedRanges`)
    const effects = [...new Set(lines)].sort((a, b) => a - b).flatMap((l) => {
      if (l + 1 > v.state.doc.lines) return [];
      const ln = v.state.doc.line(l + 1);
      const r = foldable(v.state, ln.from, ln.to);
      return r ? [foldEffect.of(r)] : [];
    });
    if (effects.length) v.dispatch({ effects });
  }
  $effect(() => {
    const n = lineNote;
    view?.dispatch({ effects: note.reconfigure(noteExt(n)) });
  });
  /** Fold every drawer of the document (a file just opened). */
  function foldAllDrawers(v: EditorView) {
    if (!drawersOn) return;
    const effects = [...drawerMap(v.state.doc).values()].map((d) => foldEffect.of(drawerFold(v.state.doc, d)));
    if (effects.length) v.dispatch({ effects });
  }
  // what the user types, pastes, deletes or undoes: a drawer made this way stays open
  const BY_HAND = ['input.type', 'input.paste', 'input.drop', 'input.complete', 'delete', 'undo', 'redo'];
  /** A drawer the app adds (Inbox, a status with LOGBOOK, a file changed on disk) comes folded. */
  const foldNewDrawers = EditorState.transactionExtender.of((tr: Transaction) => {
    if (!drawersOn || !tr.docChanged || BY_HAND.some((e) => tr.isUserEvent(e))) return null;
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
  function toggleDrawer(v: EditorView, d: DrawerRange) {
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
  function dropStaleFolds(v: EditorView) {
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

  const linkCache = new WeakMap<Text, OrgLink[]>();
  const linksIn = (doc: Text) => {
    let l = linkCache.get(doc);
    if (!l) linkCache.set(doc, (l = extractLinks(doc.toString())));
    return l;
  };
  const linkAt = (doc: Text, pos: number) => linksIn(doc).find((l) => pos >= l.from && pos <= l.to);

  // ---- Org structure commands -------------------------------------------------------
  const cycleState = new WeakMap<EditorView, number>(); // S-Tab position per editor, absent = everything open

  const apply = (v: EditorView, r: Result) => {
    v.dispatch({ changes: r.changes, selection: { anchor: r.caret }, scrollIntoView: true, userEvent: 'input' });
    cycleState.delete(v);
    return true;
  };
  const sel = (v: EditorView) => v.state.selection.main;
  /** Apply a command result; a heading-line command that cannot move still consumes the key. */
  const run = (v: EditorView, r: Result | null) => (r ? apply(v, r) : true);
  const onHeading = (v: EditorView) => sel(v).empty && isHeadingLine(v.state.doc.toString(), sel(v).head);

  const isFolded = (v: EditorView, lineTo: number) => {
    let folded = false;
    foldedRanges(v.state).between(lineTo, lineTo, (from) => {
      if (from === lineTo) folded = true;
    });
    return folded;
  };

  /** M-RET / M-S-RET: new heading at the current level. */
  const newHeading = (v: EditorView, todo: boolean, words: Workflow) => {
    const head = sel(v).head;
    // in a list: a new item (with a checkbox for ⌥⇧↩), as Org's M-RET / M-S-RET there
    const item = insertItem(v.state.doc.toString(), head, { box: todo });
    if (item) return apply(v, item);
    const line = v.state.doc.lineAt(head);
    return apply(v, insertHeading(v.state.doc.toString(), head, { todo: todo ? newTaskState(words) : undefined, folded: isFolded(v, line.to) }));
  };

  /** S-Tab: everything folded, then level 1 open, level 2 open, ... all open, then folded again. */
  const cycleVisibility = (v: EditorView) => {
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

  const orgFold = foldService.of((state, lineStart) => {
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

  function decorate(v: EditorView, words: Workflow): { all: DecorationSet; atomic: DecorationSet } {
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
        for (const m of t.matchAll(/[<\[]\d{4}-\d{2}-\d{2}[^>\]\n]*[>\]]/g)) mark(line.from + m.index!, line.from + m.index! + m[0].length, 'cm-ts');
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

  // ---- the look: the structural view, or «Оформленный текст» (which includes it) ----------------------------
  const viewKey = () => JSON.stringify([levels, rich, richNumbers]);
  const numbersExt = () => (!gutter || (rich && !richNumbers) ? [] : lineNumbers());
  function structureExt(words: Workflow) {
    if (!rich) return orgIndent(levels, headingSet);
    return orgRich({
      wf: words, heads: headingSet, drawers: drawerMap,
      links: (doc) => linksIn(doc).map((l) => ({ from: l.from, to: l.to })),
      onPick: (p) => onrich?.(p),
      onTag: (t) => tagsState.open([t]),
    });
  }

  // ---- narrowing to one subtree ----------------------------------------------------------------------
  /** The shown part: from the start of the first line to the end of the last non-blank one — but never above `keep`
   *  (the caret, the end shown already): blank lines typed here stay while the card is open (fix to ТЗ 18, Enter). */
  function narrowRange(doc: Text, n: { line: number; end: number; keep?: number }) {
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
  const setNarrow = StateEffect.define<{ line: number; end: number; keep?: number }>();
  let narrowField: StateField<{ from: number; to: number }> | null = null;
  function narrowing(n: { line: number; end: number }) {
    const field = StateField.define<{ from: number; to: number }>({
      create: (st) => narrowRange(st.doc, n),
      update: (r, tr) => {
        const reset = tr.effects.find((e) => e.is(setNarrow));
        if (reset) return narrowRange(tr.state.doc, reset.value as { line: number; end: number; keep?: number });
        // typing at either edge stays inside
        return tr.docChanged ? { from: tr.changes.mapPos(r.from, -1), to: tr.changes.mapPos(r.to, 1) } : r;
      },
    });
    narrowField = field;
    return [
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
        onnarrow?.(u.state.doc.lineAt(r.from).number - 1, u.state.doc.lineAt(r.to).number - 1, u.transactions.some((tr) => !!tr.annotation(Transaction.userEvent)));
      }),
    ];
  }

  /** `cm-has-selection` on the editor while something is selected: the current line is not marked then. Through
   *  the editor's attributes: CodeMirror rewrites its own classes (on focus, say) and would drop one set by hand. */
  const selectionClass = EditorView.editorAttributes.compute(['selection'], (s): Record<string, string> => (s.selection.main.empty ? {} : { class: 'cm-has-selection' }));

  // ---- the commands the keys run (ids of keys.ts) ------------------------------------------------------------
  let curWords = {} as Workflow; // the statuses of the document shown: the newest, a status added in the settings too
  $effect.pre(() => {
    curWords = wf;
  });
  const docText = (v: EditorView) => v.state.doc.toString();
  const status = (v: EditorView, f: (w: Workflow, k: string | null) => string | null) => onHeading(v) && run(v, changeStatusAt(docText(v), sel(v).head, f, curWords));
  const shift = (v: EditorView, d: -1 | 1) => onHeading(v) && run(v, shiftHeading(docText(v), sel(v).head, d));
  const shiftTree = (v: EditorView, d: -1 | 1) => onHeading(v) && run(v, shiftSubtree(docText(v), sel(v).head, d));
  const commands: Record<string, (v: EditorView, line?: number) => boolean> = {
    newHeading: (v) => newHeading(v, false, curWords),
    newTask: (v) => newHeading(v, true, curWords),
    // heading lines only, so Option+arrows keep moving by word inside text (as in Org on a Mac)
    promote: (v) => shift(v, -1),
    demote: (v) => shift(v, 1),
    promoteTree: (v) => shiftTree(v, -1),
    demoteTree: (v) => shiftTree(v, 1),
    subtreeUp: (v) => onHeading(v) && run(v, moveSubtree(docText(v), sel(v).head, -1)),
    subtreeDown: (v) => onHeading(v) && run(v, moveSubtree(docText(v), sel(v).head, 1)),
    prioUp: (v) => onHeading(v) && run(v, cyclePriority(docText(v), sel(v).head, 'up', curWords)),
    prioDown: (v) => onHeading(v) && run(v, cyclePriority(docText(v), sel(v).head, 'down', curWords)),
    // statuses: inside the workflow, and between workflows (heading lines only)
    statusNext: (v) => status(v, (w, k) => rotateStatus(w, k, 'next')),
    statusPrev: (v) => status(v, (w, k) => rotateStatus(w, k, 'prev')),
    wfNext: (v) => status(v, (w, k) => rotateWorkflow(w, k, 'next')),
    wfPrev: (v) => status(v, (w, k) => rotateWorkflow(w, k, 'prev')),
    cycleVisibility: (v) => cycleVisibility(v),
    fold: (v) => {
      // the visible line: after an arrow the caret may sit at the end of a folded drawer, on its hidden :END:
      const l = v.state.doc.lineAt(v.lineBlockAt(v.state.selection.main.head).from);
      cycleState.delete(v);
      if (headingSet(v.state.doc).has(l.number - 1)) return toggleFold(v); // a heading: its subtree
      const d = drawerMap(v.state.doc).get(l.number - 1);
      return d ? toggleDrawer(v, d) : false; // the first line of a drawer: that drawer only
    },
    // ⌃C L: the link to the heading the caret is in (above the first one — to the file), ТЗ 35
    copyLink: (v) => linkHooks.copyHeading(path, v.state.doc.lineAt(v.state.selection.main.head).number - 1),
    // ⌃C Q: the heading's tags in a field with the folder's tags (ТЗ 38 §6)
    tags: (v, line?: number) => {
      const l = line !== undefined && line >= 0 && line < v.state.doc.lines ? v.state.doc.line(line + 1) : v.state.doc.lineAt(v.state.selection.main.head);
      if (!headLine(l.text)) return false;
      openTagPop(v, l.number);
      return true;
    },
    // ⌥⇧⌘V: the clipboard's text in place of the selection, never a link
    pasteText: (v) => {
      void linkHooks.readClip().then((t) => {
        if (!t) return;
        const r = v.state.selection.main;
        v.dispatch({ changes: { from: r.from, to: r.to, insert: t }, selection: { anchor: r.from + t.length }, userEvent: 'input.paste', scrollIntoView: true });
      });
      return true;
    },
    // ⌃C ⌃L: the palette «Ссылка на»; ⌥⌘K: the same for the link under the caret (its label stays), ТЗ 35
    insertLink: (v) => (pickLink(v, null), true),
    editLink: (v) => {
      const l = linkAt(v.state.doc, v.state.selection.main.head);
      if (!l) return false;
      pickLink(v, l);
      return true;
    },
    followLink: (v) => {
      const l = linkAt(v.state.doc, v.state.selection.main.head);
      if (!l) return false;
      onfollow(l);
      return true;
    },
  };

  // ---- links (ТЗ 35): the palette «Ссылка на», the editor's menu, the tooltip over a link ---------------------------
  /** The palette «Ссылка на»: the link goes in place of the selection (its label) or of the link `l` (its label kept). */
  function pickLink(v: EditorView, l: OrgLink | null) {
    const s = v.state.selection.main;
    const text = v.state.sliceDoc(s.from, s.to);
    const sel = !l && text && !/\n|\[\[|\]\]/.test(text) ? text : '';
    const at = l ? { from: l.from, to: l.to } : { from: s.from, to: s.to };
    const len = v.state.doc.length;
    linkHooks.pick({
      path, sel, edit: l ? { label: l.desc ?? null } : null,
      apply: (insert) => {
        if (v.state.doc.length !== len) return; // the text changed meanwhile
        v.dispatch({ changes: { ...at, insert }, selection: { anchor: at.from + insert.length }, userEvent: 'input', scrollIntoView: true });
        v.focus();
      },
    });
  }
  /** Put text in place of the selection (the menu's «Вставить»: a link on a selection, as ⌘V does). */
  function insertText(v: EditorView, t: string, asLink: boolean) {
    const s = v.state.selection.main;
    const r = asLink ? linkPaste(v.state.doc.toString(), s.from, s.to, t, linkHooks.rel(path)) : null;
    if (r) {
      v.dispatch({ changes: { from: r.from, to: r.to, insert: r.insert }, selection: { anchor: r.caret }, userEvent: 'input.paste', scrollIntoView: true });
      linkHooks.pasted();
    } else v.dispatch({ changes: { from: s.from, to: s.to, insert: t }, selection: { anchor: s.from + t.length }, userEvent: 'input.paste', scrollIntoView: true });
    v.focus();
  }
  const copyText = (t: string) => void navigator.clipboard?.writeText(t).catch(() => {});
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  /** Right click (⌃-click): inside the selection it stays, elsewhere the caret goes there; then the menu of §4. */
  async function openMenu(e: MouseEvent, v: EditorView) {
    const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
    let s = v.state.selection.main;
    if (pos != null && (s.empty || pos < s.from || pos > s.to)) {
      v.dispatch({ selection: { anchor: pos } });
      s = v.state.selection.main;
    }
    const clip = await linkHooks.readClip();
    const text = v.state.sliceDoc(s.from, s.to);
    const target = clip ? clipTarget(clip) : null;
    const key = (id: string) => linkHooks.key(id) || undefined;
    const l = linkAt(v.state.doc, s.head);
    const short = (t: string) => (t.length > 46 ? t.slice(0, 45) + '…' : t);
    const heading = linkHooks.headingAt(path, v.state.doc.lineAt(s.head).number - 1);
    const items: MenuItem[] = [];
    if (l) {
      items.push(
        { label: 'Открыть ссылку', shortcut: key('followLink'), action: () => onfollow(l) },
        { label: 'Изменить ссылку…', shortcut: key('editLink'), action: () => pickLink(v, l) },
        { label: 'Копировать адрес', action: () => copyText(l.raw) },
        { label: 'Убрать ссылку', action: () => v.dispatch({ changes: { from: l.from, to: l.to, insert: l.desc ?? l.raw }, userEvent: 'input' }) },
        'sep',
      );
    }
    if (!s.empty) {
      items.push(
        { label: 'Вырезать', shortcut: '⌘X', action: () => (copyText(text), v.dispatch({ changes: { from: s.from, to: s.to }, userEvent: 'delete.cut' })) },
        { label: 'Копировать', shortcut: '⌘C', action: () => copyText(text) },
        { label: 'Вставить', shortcut: '⌘V', disabled: !clip, action: () => insertText(v, clip, true) },
        'sep',
      );
      if (target && !text.includes('\n')) items.push({ label: 'Сделать ссылкой из буфера', shortcut: '⌘V', detail: short(target), action: () => insertText(v, clip, true) });
      items.push({ label: 'Ссылка на заголовок…', shortcut: key('insertLink'), action: () => pickLink(v, null) });
      if (clip) items.push({ label: 'Вставить как текст', shortcut: key('pasteText'), action: () => insertText(v, clip, false) });
    } else {
      items.push(
        { label: 'Вставить', shortcut: '⌘V', disabled: !clip, action: () => insertText(v, clip, false) },
        'sep',
        { label: 'Вставить ссылку на заголовок…', shortcut: key('insertLink'), action: () => pickLink(v, null) },
      );
    }
    if (heading) {
      if (!s.empty) items.push('sep');
      items.push({ label: 'Копировать ссылку на заголовок', shortcut: key('copyLink'), detail: `«${heading}»`, action: () => linkHooks.copyHeading(path, v.state.doc.lineAt(s.head).number - 1) });
    }
    const hl = v.state.doc.lineAt(s.head);
    if (s.empty && headLine(hl.text)) items.push({ label: 'Теги…', shortcut: key('tags'), action: () => openTagPop(v, hl.number) });
    menu = { x: e.clientX, y: e.clientY, items };
  }
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  const headLine = (t: string) => /^\*+\s/.test(t);
  // ---- «Теги заголовка» (ТЗ 38 §6): each change in the line at once, kept out of the undo history; on closing, the
  // whole change is put in as one step — one ⌘Z per opening ----------------------------------------------------------
  let tagPop = $state<{ v: EditorView; line: number; orig: string; tags: string[]; x: number; y: number } | null>(null);
  function openTagPop(v: EditorView, lineNo: number) {
    const l = v.state.doc.line(lineNo);
    const { tags, at } = lineTags(l.text);
    const c = v.coordsAtPos(l.from + Math.min(at, l.length)) ?? v.coordsAtPos(l.to);
    if (!c) return;
    tagPop = { v, line: lineNo, orig: l.text, tags, x: Math.round(c.left), y: Math.round(c.bottom + 6) };
  }
  function tagsChanged(tags: string[]) {
    const p = tagPop;
    if (!p) return;
    const l = p.v.state.doc.line(p.line);
    p.v.dispatch({ changes: { from: l.from, to: l.to, insert: withTags(l.text, tags) }, annotations: Transaction.addToHistory.of(false) });
    tagPop = { ...p, tags };
  }
  function closeTagPop() {
    const p = tagPop;
    tagPop = null;
    if (!p) return;
    const l = p.v.state.doc.line(p.line);
    if (l.text !== p.orig) {
      const now = l.text;
      p.v.dispatch({ changes: { from: l.from, to: l.to, insert: p.orig }, annotations: Transaction.addToHistory.of(false) });
      const back = p.v.state.doc.line(p.line);
      p.v.dispatch({ changes: { from: back.from, to: back.to, insert: now }, annotations: isolateHistory.of('full'), userEvent: 'input' });
    }
    p.v.focus();
  }

  // ---- typing tags in a heading's line: after « :» the folder's tags are offered (ТЗ 38 §6) --------------------------
  function tagSource(ctx: CompletionContext) {
    const line = ctx.state.doc.lineAt(ctx.pos);
    if (!headLine(line.text) || line.text.slice(ctx.pos - line.from).trim()) return null;
    const before = line.text.slice(0, ctx.pos - line.from);
    const m = /\s:((?:[^\s:]+:)*)([^\s:]*)$/u.exec(before);
    if (!m || (!ctx.explicit && !m[2] && !before.endsWith(':'))) return null;
    const have = new Set(m[1].split(':').filter(Boolean).map((t) => t.toLowerCase()));
    return {
      from: ctx.pos - m[2].length,
      options: tagsState.list.filter((t) => !have.has(t.tag.toLowerCase())).map((t) => ({ label: t.tag, detail: String(t.n), apply: t.tag + ':', type: 'tag', boost: Math.min(99, t.n) })),
      validFor: /^[\p{L}\p{N}_@#%]*$/u,
    };
  }
  const tagComplete = autocompletion({ override: [tagSource], icons: false, closeOnBlur: true, tooltipClass: () => 'cm-tag-complete' });

  /** ⌘-click on a tag of a heading (in plain text): the tag under the pointer. */
  function tagAt(v: EditorView, pos: number): string | null {
    const l = v.state.doc.lineAt(pos);
    if (!headLine(l.text)) return null;
    const { tags, at } = lineTags(l.text);
    let p = l.from + at + 1;
    for (const t of tags) {
      if (pos >= p - 1 && pos <= p + t.length) return t;
      p += t.length + 1;
    }
    return null;
  }
  /** Over a link for ~400 ms: where it goes, and how to open it. */
  const linkTip = hoverTooltip(
    (v, pos) => {
      const l = linkAt(v.state.doc, pos);
      if (!l) return null;
      return {
        pos: l.from, end: l.to, above: false,
        create: () => {
          const d = linkHooks.describe(l, path);
          const dom = document.createElement('div');
          dom.className = 'cm-linktip';
          const a = document.createElement('span');
          a.className = d.missing ? 'lt-t lt-miss' : 'lt-t';
          a.textContent = d.text;
          const b = document.createElement('span');
          b.className = 'lt-h';
          const open = linkHooks.key('followLink');
          const change = linkHooks.key('editLink');
          b.textContent = `⌘-клик${open ? ` или ${open}` : ''} — открыть${change ? ` · ${change} — изменить` : ''}`;
          dom.append(a, b);
          return { dom };
        },
      };
    },
    { hoverTime: 400 },
  );

  function makeState(doc: string, words: Workflow) {
    curWords = words;
    const plugin = ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        atomic: DecorationSet;
        constructor(v: EditorView) {
          const d = decorate(v, words);
          this.decorations = d.all;
          this.atomic = d.atomic;
        }
        update(u: ViewUpdate) {
          if (u.docChanged || u.viewportChanged || u.selectionSet) {
            const d = decorate(u.view, words);
            this.decorations = d.all;
            this.atomic = d.atomic;
          }
        }
      },
      { decorations: (p) => p.decorations },
    );
    return EditorState.create({
      doc,
      extensions: [
        numbers.of(numbersExt()), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(),
        ...(narrow ? narrowing(narrow) : [scrollPastEnd()]), // the last line can be scrolled up to the top, as in Xcode (room below, not lines in the file)
        undo.of(history()), orgFold, foldNewDrawers, findExtension,
        codeFolding({
          placeholderDOM: (_v, onclick) => {
            const el = document.createElement('span');
            el.className = 'cm-foldPlaceholder';
            el.textContent = '…';
            el.title = 'Свёрнуто — Tab или клик, чтобы развернуть';
            el.setAttribute('aria-label', 'Свёрнуто');
            el.onclick = onclick;
            return el;
          },
        }),
        ...(gutter ? [foldGutter()] : []), plugin, ...lineLinkExt(), selectionClass, note.of(noteExt(lineNote)), structure.of(structureExt(words)),
        ...(hint ? [cmPlaceholder(hint)] : []),
        EditorView.atomicRanges.of((v) => v.plugin(plugin)?.atomic ?? Decoration.none),
        linkTip,
        // the tab keeps its folded headings (S-Tab, ⇥): shown again, it comes back folded as it was
        EditorView.updateListener.of((u) => {
          // a fold changed, or an edit moved the lines of the folds
          if (!onfolds || (!u.docChanged && foldedRanges(u.state) === foldedRanges(u.startState))) return;
          onfolds(foldedHeadings(u.state));
        }),
        EditorView.domEventHandlers({
          contextmenu(e, v) {
            e.preventDefault();
            void openMenu(e, v);
            return true;
          },
          // ⌘V on a selection with a link in the clipboard: the selection becomes its label (ТЗ 35)
          paste(e, v) {
            const clip = e.clipboardData?.getData('text/plain') ?? '';
            const s = v.state.selection.main;
            const r = linkPaste(v.state.doc.toString(), s.from, s.to, clip, linkHooks.rel(path));
            if (!r) return false;
            e.preventDefault();
            v.dispatch({ changes: { from: r.from, to: r.to, insert: r.insert }, selection: { anchor: r.caret }, userEvent: 'input.paste', scrollIntoView: true });
            linkHooks.pasted();
            return true;
          },
          mousedown(e, v) {
            // ⌘-click on a tag of a heading: its tab «Тег» (ТЗ 38)
            if ((e.metaKey || e.ctrlKey) && (e.target as HTMLElement).closest?.('.cm-tags')) {
              const at = v.posAtCoords({ x: e.clientX, y: e.clientY });
              const t = at == null ? null : tagAt(v, at);
              if (t) {
                e.preventDefault();
                tagsState.open([t]);
                return true;
              }
            }
            // ⌘-click follows a link; drawn as «Оформленный текст», a plain click on it does (ТЗ 32)
            const plain = e.button === 0 && !e.shiftKey && !e.altKey && v.dom.classList.contains('cm-rich') && !!(e.target as HTMLElement).closest?.('.cm-link');
            if (!(e.metaKey || e.ctrlKey || plain)) return false;
            const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
            const l = pos == null ? undefined : linkAt(v.state.doc, pos);
            if (!l) return false;
            e.preventDefault();
            onfollow(l);
            return true;
          },
        }),
        EditorView.lineWrapping,
        tagComplete,
        // the configurable keys are run by the window's handler (editorKeys.ts); here only the fixed ones
        keymap.of([
          ...foldKeymap, ...historyKeymap, ...defaultKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onchange(u.state.doc.toString());
            dropStaleFolds(u.view);
          }
          if (u.startState.field(findField, false) !== u.state.field(findField, false) || u.transactions.some((tr) => tr.effects.length)) onfound?.(foundInfo(u.view));
          if (u.selectionSet || u.docChanged) {
            const h = u.state.selection.main.head;
            const l = u.state.doc.lineAt(h);
            oncursor(l.number - 1, h - l.from + 1);
          }
        }),
      ],
    });
  }

  /** Put the caret where the tab had it and bring it into view, without taking the focus. */
  function restoreCaret() {
    if (!view || !initial) return;
    const doc = view.state.doc;
    const ln = doc.line(Math.min(initial.line + 1, doc.lines));
    const pos = Math.min(ln.from + Math.max(0, initial.col - 1), ln.to);
    // the scroll as it was (the caret may be out of view); without one, the caret in the middle
    const top = initialTop !== undefined && initialTop > 0 ? doc.line(Math.min(initialTop + 1, doc.lines)).from : -1;
    view.dispatch({ selection: { anchor: pos }, effects: top >= 0 ? EditorView.scrollIntoView(top, { y: 'start' }) : EditorView.scrollIntoView(pos, { y: 'center' }) });
  }
  /** The headings folded now (a heading's fold starts on its line; drawers are left out: they fold by themselves). */
  function foldedHeadings(st: EditorState): number[] {
    const heads = headingSet(st.doc);
    const out: number[] = [];
    foldedRanges(st).between(0, st.doc.length, (from) => {
      const l = st.doc.lineAt(from).number - 1;
      if (heads.has(l)) out.push(l);
    });
    return out.sort((a, b) => a - b);
  }
  /** The first line in view, told after a scroll (once a frame). */
  let topFrame = 0;
  function scrolled() {
    if (!ontop || topFrame) return;
    topFrame = requestAnimationFrame(() => {
      topFrame = 0;
      const v = view;
      if (!v) return;
      const b = v.lineBlockAtHeight(v.scrollDOM.scrollTop - v.documentPadding.top + 1);
      ontop?.(v.state.doc.lineAt(b.from).number - 1);
    });
  }

  onMount(() => {
    view = new EditorView({ state: makeState(text, wf), parent: host });
    foldAllDrawers(view);
    foldLines(view, folded);
    lastKey = fileKey;
    lastLevels = viewKey();
    lastReset = resetOn;
    if (initialFolds?.length) foldLines(view, initialFolds);
    restoreCaret(); // a pending reveal, if any, is applied right after by its own effect
    view.scrollDOM.addEventListener('scroll', scrolled, { passive: true });
    onapi?.({
      selection: () => {
        const v = view;
        if (!v) return '';
        const r = v.state.selection.main;
        return v.state.sliceDoc(r.from, r.to);
      },
    });
    const v = view;
    const unregister = registerEditor(v.dom, { run: (id, line) => commands[id]?.(v, line) ?? false, onHeading: () => onHeading(v) });
    return () => {
      unregister();
      cancelAnimationFrame(topFrame);
      v.scrollDOM.removeEventListener('scroll', scrolled);
      v.destroy();
    };
  });

  $effect(() => {
    const t = text, k = fileKey, w = wf, r = resetOn;
    if (!view) return;
    if (k !== lastKey) {
      lastKey = k;
      lastReset = r;
      view.setState(makeState(t, w));
      foldAllDrawers(view);
      if (initialFolds?.length) foldLines(view, initialFolds);
      restoreCaret();
    } else if (r !== lastReset) {
      // reloaded from disk (no edits here): the caret keeps its line and column, the scroll stays, and ⌘Z
      // must not bring the old text back over the new file
      lastReset = r;
      const sel = view.state.selection.main;
      const line = view.state.doc.lineAt(sel.head);
      const col = sel.head - line.from;
      const top = view.scrollDOM.scrollTop;
      patchTo(view, t); // the unchanged parts keep their folds; drawers new on disk come folded
      const doc = view.state.doc;
      const ln = doc.line(Math.min(line.number, doc.lines));
      view.dispatch({ selection: { anchor: Math.min(ln.from + col, ln.to) }, effects: undo.reconfigure([]) });
      view.dispatch({ effects: undo.reconfigure(history()) });
      view.scrollDOM.scrollTop = top;
    } else {
      patchTo(view, t);
    }
  });

  /** Bring the document to `t` with the smallest change, so cursor, folds and undo history survive. */
  function patchTo(view: EditorView, t: string) {
    const cur = view.state.doc.toString();
    if (cur !== t) {
      let a = 0;
      const max = Math.min(cur.length, t.length);
      while (a < max && cur[a] === t[a]) a++;
      let b = 0;
      while (b < max - a && cur[cur.length - 1 - b] === t[t.length - 1 - b]) b++;
      // The change replaces [a, cur.length - b). Positions inside it would be mapped to its start, which
      // for a big rewrite means "top of the file": keep the cursor on the same line and column instead.
      const sel = view.state.selection.main;
      const inside = sel.head > a && sel.head < cur.length - b;
      const line = view.state.doc.lineAt(sel.head);
      const col = sel.head - line.from;
      // a change from outside the editor (a feature's edit, the disk): one step of its own in the undo history,
      // never merged with the typing around it
      view.dispatch({ changes: { from: a, to: cur.length - b, insert: t.slice(a, t.length - b) }, annotations: isolateHistory.of('full') });
      if (inside) {
        const doc = view.state.doc;
        const ln = doc.line(Math.min(line.number, doc.lines));
        view.dispatch({ selection: { anchor: Math.min(ln.from + col, ln.to) } });
      }
    }
  }

  // the heading's lines as the file has them now: a line added under it from elsewhere is shown (only when the
  // editor and the file agree: never against what is being typed)
  $effect(() => {
    const n = narrow;
    const t = text;
    if (!view || !n || !narrowField || view.state.doc.toString() !== t) return;
    // the caret's line and the lines shown already stay: Enter at the end makes a line that is not cut off
    const now = view.state.field(narrowField);
    const keep = Math.max(now.to, view.state.selection.main.head);
    const want = narrowRange(view.state.doc, { ...n, keep });
    if (want.from !== now.from || want.to !== now.to) view.dispatch({ effects: setNarrow.of({ line: n.line, end: n.end, keep }) });
  });

  $effect(() => {
    const k = viewKey();
    if (!view || k === lastLevels) return;
    lastLevels = k;
    view.dispatch({ effects: [structure.reconfigure(structureExt(wf)), numbers.reconfigure(numbersExt())] });
  });

  // ---- ⌘F: the query to the find field; a step selects the match and brings it to the upper third ----------
  let lastFind = '';
  let lastGo = 0;
  function toMatch(v: EditorView, select: boolean) {
    const f = v.state.field(findField, false);
    if (!f || f.cur < 0) return;
    const s = f.starts[f.cur];
    const scroll = EditorView.scrollIntoView(s, { y: 'start', yMargin: Math.round(v.scrollDOM.clientHeight / 3) });
    // «select.search»: a user's caret, so a drawn line («Оформленный текст») shows its text; a fold over it opens
    v.dispatch(select ? { selection: { anchor: s, head: s + f.len }, effects: scroll, userEvent: 'select.search' } : { effects: scroll });
  }
  $effect(() => {
    const f = find;
    const k = fileKey;
    if (!view) return;
    if (!f || !f.q) {
      if (view.state.field(findField, false)) {
        const st = view.state.field(findField)!;
        const s = st.cur >= 0 && st.show ? st.starts[st.cur] : null;
        // closing: the caret stays on the current match
        view.dispatch({ effects: setFind.of(null), ...(s !== null ? { selection: { anchor: s, head: s + st.len } } : {}) });
      }
      lastFind = '';
      return;
    }
    const key = JSON.stringify([k, f.q, f.cs, f.word, f.show, f.at ?? null]);
    if (key !== lastFind) {
      lastFind = key;
      // ↩ right after typing (before the pause ran out) comes with the new query: it selects the first match
      const stepped = f.go !== lastGo;
      lastGo = f.go;
      view.dispatch({ effects: setFind.of(f) });
      toMatch(view, f.at != null || stepped);
    } else if (f.go !== lastGo) {
      lastGo = f.go;
      view.dispatch({ effects: moveFind.of(f.dir) });
      toMatch(view, true);
    }
  });

  $effect(() => {
    const r = reveal;
    if (!view || !r || r.n === lastReveal || revealed.get(fileKey) === r.n) return;
    lastReveal = r.n;
    revealed.set(fileKey, r.n);
    const ln = Math.min(r.line + 1, view.state.doc.lines);
    const line = view.state.doc.line(ln);
    const pos = line.from + Math.min(r.col ?? 0, line.length); // a new task puts the caret after its keyword
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    if (r.focus !== false) view.focus(); // a task opened from the agenda keeps the focus in the agenda
  });
</script>

<div class="host" bind:this={host}></div>
{#if tagPop}<TagPop tags={tagPop.tags} x={tagPop.x} y={tagPop.y} onchange={tagsChanged} onclose={closeTagPop} />{/if}
{#if menu}<div use:portal><ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} width={300} tall /></div>{/if}

<style>
  .host { height: 100%; min-height: 0; overflow: hidden; }
</style>

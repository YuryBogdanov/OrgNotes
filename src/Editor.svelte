<script lang="ts">
  import { onMount } from 'svelte';
  import { Compartment, EditorState, MapMode, RangeSetBuilder, StateField, Transaction, type Range, type StateEffect } from '@codemirror/state';
  import { Decoration, EditorView, ViewPlugin, placeholder as cmPlaceholder, drawSelection, scrollPastEnd, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, type DecorationSet, type ViewUpdate } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { codeFolding, foldEffect, foldGutter, foldKeymap, foldService, foldable, foldedRanges, toggleFold, unfoldEffect } from '@codemirror/language';
  import { drawerRanges, headingLines, toneFor, type DrawerRange, type Workflow } from './org';
  import { toneStyle } from './colors';
  import { extractLinks, type OrgLink } from './links';
  import { changeStatusAt, cyclePriority, foldTargets, insertHeading, isHeadingLine, moveSubtree, newTaskState, nextCycleState, rotateStatus, rotateWorkflow, shiftSubtree, type Result } from './outline';
  import type { Text } from '@codemirror/state';
  import { DEFAULT_LEVELS, orgIndent, type LevelView } from './orgIndent';
  import { orgRich, type RichPick } from './orgRich';
  import { findExtension, findField, foundInfo, moveFind, setFind, type FindQuery } from './findView';
  import { registerEditor } from './editorKeys';

  let { text, fileKey, wf, reveal, initial, hint = '', resetOn = 0, levels = DEFAULT_LEVELS, drawers = true, narrow = null, rich = false, richNumbers = false, onrich, find = null, onfound, onapi, onnarrow, onchange, oncursor, onfollow }: {
    levels?: LevelView; // «Структурный вид»: one star per level, text moved by level
    drawers?: boolean; // drawers folded when a file opens and when the app adds one (:PROPERTIES:, :LOGBOOK:)
    rich?: boolean; // «Оформленный текст»: drawn like org-modern (implies the structural view)
    richNumbers?: boolean; // line numbers while drawn
    onrich?: (p: RichPick) => void; // a click on a status, a priority or a date that asks for a choice
    find?: (FindQuery & { go: number; dir: 1 | -1 }) | null; // ⌘F: the query; a new `go` steps to the next / previous match
    onfound?: (info: { total: number; cur: number; folded: number; wrapped: boolean } | null) => void;
    onapi?: (api: { selection: () => string }) => void; // what the pane asks of the editor (⌘F, ⌘E take the selection)
    // «Разбор Inbox»: only these lines of the file are shown and edited (as org-narrow-to-subtree); `end` exclusive
    narrow?: { line: number; end: number } | null;
    onnarrow?: (line: number, last: number) => void; // where the shown lines are now (they move with edits)
    hint?: string; // grey placeholder in an empty document
    resetOn?: number; // bumped when the text was silently reloaded from disk: the undo history starts over
    text: string; fileKey: string; wf: Workflow;
    reveal: { line: number; n: number; focus?: boolean; col?: number } | null | undefined;
    initial?: { line: number; col: number }; // where the caret of this tab was (restored when the tab is shown)
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
          const lvl = Math.min(hm[1].length, 3);
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
  const numbersExt = () => (rich && !richNumbers ? [] : lineNumbers());
  function structureExt(words: Workflow) {
    if (!rich) return orgIndent(levels, headingSet);
    return orgRich({
      wf: words, heads: headingSet, drawers: drawerMap,
      links: (doc) => linksIn(doc).map((l) => ({ from: l.from, to: l.to })),
      onPick: (p) => onrich?.(p),
    });
  }

  // ---- narrowing to one subtree ----------------------------------------------------------------------
  /** The shown part: from the start of the first line to the end of the last non-blank one. */
  function narrowRange(doc: Text, n: { line: number; end: number }) {
    let last = Math.min(n.end, doc.lines) - 1;
    while (last > n.line && doc.line(last + 1).text.trim() === '') last--;
    return { from: doc.line(Math.min(n.line + 1, doc.lines)).from, to: doc.line(Math.max(last, n.line) + 1).to };
  }
  const hiddenOutside = (st: EditorState, r: { from: number; to: number } | null) => {
    if (!r) return Decoration.none;
    const out: Range<Decoration>[] = [];
    if (r.from > 0) out.push(Decoration.replace({ block: true }).range(0, r.from - 1));
    if (r.to < st.doc.length) out.push(Decoration.replace({ block: true }).range(r.to + 1, st.doc.length));
    return Decoration.set(out);
  };
  function narrowing(n: { line: number; end: number }) {
    const field = StateField.define<{ from: number; to: number }>({
      create: (st) => narrowRange(st.doc, n),
      // typing at either edge stays inside
      update: (r, tr) => (tr.docChanged ? { from: tr.changes.mapPos(r.from, -1), to: tr.changes.mapPos(r.to, 1) } : r),
    });
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
        onnarrow?.(u.state.doc.lineAt(r.from).number - 1, u.state.doc.lineAt(r.to).number - 1);
      }),
    ];
  }

  // ---- the commands the keys run (ids of keys.ts) ------------------------------------------------------------
  let curWords = {} as Workflow; // the statuses of the document shown: the newest, a status added in the settings too
  $effect.pre(() => {
    curWords = wf;
  });
  const docText = (v: EditorView) => v.state.doc.toString();
  const status = (v: EditorView, f: (w: Workflow, k: string | null) => string | null) => onHeading(v) && run(v, changeStatusAt(docText(v), sel(v).head, f, curWords));
  const shift = (v: EditorView, d: -1 | 1) => onHeading(v) && run(v, shiftSubtree(docText(v), sel(v).head, d));
  const commands: Record<string, (v: EditorView) => boolean> = {
    newHeading: (v) => newHeading(v, false, curWords),
    newTask: (v) => newHeading(v, true, curWords),
    // heading lines only, so Option+arrows keep moving by word inside text (as in Org on a Mac)
    promote: (v) => shift(v, -1),
    demote: (v) => shift(v, 1),
    promoteTree: (v) => shift(v, -1),
    demoteTree: (v) => shift(v, 1),
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
    followLink: (v) => {
      const l = linkAt(v.state.doc, v.state.selection.main.head);
      if (!l) return false;
      onfollow(l);
      return true;
    },
  };

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
        foldGutter(), plugin, structure.of(structureExt(words)),
        ...(hint ? [cmPlaceholder(hint)] : []),
        EditorView.atomicRanges.of((v) => v.plugin(plugin)?.atomic ?? Decoration.none),
        EditorView.domEventHandlers({
          mousedown(e, v) {
            if (!(e.metaKey || e.ctrlKey)) return false;
            const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
            const l = pos == null ? undefined : linkAt(v.state.doc, pos);
            if (!l) return false;
            e.preventDefault();
            onfollow(l);
            return true;
          },
        }),
        EditorView.lineWrapping,
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
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
  }

  onMount(() => {
    view = new EditorView({ state: makeState(text, wf), parent: host });
    foldAllDrawers(view);
    lastKey = fileKey;
    lastLevels = viewKey();
    lastReset = resetOn;
    restoreCaret(); // a pending reveal, if any, is applied right after by its own effect
    onapi?.({
      selection: () => {
        const v = view;
        if (!v) return '';
        const r = v.state.selection.main;
        return v.state.sliceDoc(r.from, r.to);
      },
    });
    const v = view;
    const unregister = registerEditor(v.dom, { run: (id) => commands[id]?.(v) ?? false, onHeading: () => onHeading(v) });
    return () => {
      unregister();
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
      view.dispatch({ changes: { from: a, to: cur.length - b, insert: t.slice(a, t.length - b) } });
      if (inside) {
        const doc = view.state.doc;
        const ln = doc.line(Math.min(line.number, doc.lines));
        view.dispatch({ selection: { anchor: Math.min(ln.from + col, ln.to) } });
      }
    }
  }

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
    if (!view || !r || r.n === lastReveal) return;
    lastReveal = r.n;
    const ln = Math.min(r.line + 1, view.state.doc.lines);
    const line = view.state.doc.line(ln);
    const pos = line.from + Math.min(r.col ?? 0, line.length); // a new task puts the caret after its keyword
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    if (r.focus !== false) view.focus(); // a task opened from the agenda keeps the focus in the agenda
  });
</script>

<div class="host" bind:this={host}></div>

<style>
  .host { height: 100%; min-height: 0; overflow: hidden; }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState, Prec, RangeSetBuilder, type Range } from '@codemirror/state';
  import { Decoration, EditorView, ViewPlugin, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, type DecorationSet, type ViewUpdate } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { foldEffect, foldGutter, foldKeymap, foldService, foldable, foldedRanges, toggleFold, unfoldEffect } from '@codemirror/language';
  import { headingLines, kwTone, type Workflow } from './org';
  import { extractLinks, type OrgLink } from './links';
  import { cyclePriority, foldTargets, insertHeading, isHeadingLine, moveSubtree, newTaskState, nextCycleState, shiftSubtree, type Result } from './outline';
  import type { Text } from '@codemirror/state';

  let { text, fileKey, wf, reveal, onchange, oncursor, onfollow }: {
    text: string; fileKey: string; wf: Workflow;
    reveal: { line: number; n: number } | null;
    onchange: (t: string) => void;
    oncursor: (line: number, col: number) => void;
    onfollow: (link: OrgLink) => void;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let lastKey = '';
  let lastReveal = 0;

  const HEAD = /^(\*+)\s/;
  // heading lines per document version; ignores `* x` inside #+BEGIN_…/#+END_… blocks
  const cache = new WeakMap<Text, Set<number>>();
  const headingSet = (doc: Text) => {
    let s = cache.get(doc);
    if (!s) cache.set(doc, (s = headingLines(doc.toString().split('\n'))));
    return s;
  };

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
    foldedRanges(v.state).between(0, v.state.doc.length, (from, to) => {
      effects.push(unfoldEffect.of({ from, to }));
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
    if (!heads.has(line.number - 1)) return null;
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
              Decoration.mark({ class: 'cm-kw', attributes: { style: `color:var(${kwTone(w[1], words)})` } }).range(line.from + i, line.from + i + w[1].length),
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

  function makeState(doc: string, words: Workflow) {
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
        lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(),
        history(), orgFold, foldGutter(), plugin,
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
        Prec.high(
          keymap.of([
            { key: 'Alt-Enter', run: (v) => newHeading(v, false, words) },
            { key: 'Alt-Shift-Enter', run: (v) => newHeading(v, true, words) },
            // heading lines only, so Option+arrows keep moving by word inside text (as in Org on a Mac)
            { key: 'Alt-ArrowLeft', run: (v) => onHeading(v) && run(v, shiftSubtree(v.state.doc.toString(), sel(v).head, -1)) },
            { key: 'Alt-ArrowRight', run: (v) => onHeading(v) && run(v, shiftSubtree(v.state.doc.toString(), sel(v).head, 1)) },
            { key: 'Alt-Shift-ArrowLeft', run: (v) => onHeading(v) && run(v, shiftSubtree(v.state.doc.toString(), sel(v).head, -1)) },
            { key: 'Alt-Shift-ArrowRight', run: (v) => onHeading(v) && run(v, shiftSubtree(v.state.doc.toString(), sel(v).head, 1)) },
            { key: 'Alt-ArrowUp', run: (v) => onHeading(v) && run(v, moveSubtree(v.state.doc.toString(), sel(v).head, -1)) },
            { key: 'Alt-ArrowDown', run: (v) => onHeading(v) && run(v, moveSubtree(v.state.doc.toString(), sel(v).head, 1)) },
            { key: 'Shift-ArrowUp', run: (v) => onHeading(v) && run(v, cyclePriority(v.state.doc.toString(), sel(v).head, 'up', words)) },
            { key: 'Shift-ArrowDown', run: (v) => onHeading(v) && run(v, cyclePriority(v.state.doc.toString(), sel(v).head, 'down', words)) },
            { key: 'Shift-Tab', run: cycleVisibility },
          ]),
        ),
        keymap.of([
          { key: 'Mod-Enter', run: (v) => {
              const l = linkAt(v.state.doc, v.state.selection.main.head);
              if (!l) return false;
              onfollow(l);
              return true;
            } },
          { key: 'Tab', run: (v) => {
              const l = v.state.doc.lineAt(v.state.selection.main.head);
              cycleState.delete(v);
              return headingSet(v.state.doc).has(l.number - 1) ? toggleFold(v) : false;
            } },
          ...foldKeymap, ...historyKeymap, ...defaultKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onchange(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) {
            const h = u.state.selection.main.head;
            const l = u.state.doc.lineAt(h);
            oncursor(l.number - 1, h - l.from + 1);
          }
        }),
      ],
    });
  }

  onMount(() => {
    view = new EditorView({ state: makeState(text, wf), parent: host });
    lastKey = fileKey;
    return () => view?.destroy();
  });

  $effect(() => {
    const t = text, k = fileKey, w = wf;
    if (!view) return;
    if (k !== lastKey) {
      lastKey = k;
      view.setState(makeState(t, w));
    } else {
      const cur = view.state.doc.toString();
      if (cur !== t) {
        // minimal diff, so cursor, folds and undo history survive external patches
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
  });

  $effect(() => {
    const r = reveal;
    if (!view || !r || r.n === lastReveal) return;
    lastReveal = r.n;
    const ln = Math.min(r.line + 1, view.state.doc.lines);
    const pos = view.state.doc.line(ln).from;
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    view.focus();
  });
</script>

<div class="host" bind:this={host}></div>

<style>
  .host { height: 100%; min-height: 0; overflow: hidden; }
</style>

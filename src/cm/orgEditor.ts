// The Org editor without its component (ТЗ 42 §2, from Editor.svelte): the CodeMirror state and its extensions, the
// commands the keys run, the menu's items, the tags' popover, the links — and how the document follows the file
// (the disk, a feature's edit), the look, ⌘F, a reveal. The old interface's Editor.svelte and the new one's
// next/Editor.svelte each wrap one: they give the props and draw the menu and the popover it asks for.

import { Compartment, EditorState, StateField, Transaction } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, hoverTooltip, tooltips, placeholder as cmPlaceholder, drawSelection, scrollPastEnd, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { codeFolding, foldGutter, foldKeymap, foldedRanges, toggleFold } from '@codemirror/language';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import type { Workflow } from '../org';
import type { OrgLink } from '../links';
import type { MenuItem } from '../ContextMenu.svelte';
import { changeStatusAt, cyclePriority, moveSubtree, rotateStatus, rotateWorkflow, shiftHeading, shiftSubtree, type Result } from '../outline';
import { DEFAULT_LEVELS, orgIndent, type LevelView } from '../orgIndent';
import { orgRich, refont, type RichPick } from '../orgRich';
import { findExtension, findField, foundInfo, moveFind, replaceFound, setFind, type FindQuery } from '../findView';
import { registerEditor } from '../editorKeys';
import { clipTarget, linkHooks, linkPaste } from '../linkEdit';
import { openNote } from '../noteReq.svelte';
import { isArchive } from '../names';
import { headingActionsFor } from '../headingActions.svelte';
import { tagsState } from '../tagsState.svelte';
import { lineTags, withTags } from '../tags';
import { drawerMap, headingSet, linkAt, linksIn } from './doc';
import { noteExt } from './lineNote';
import { lineLinkExt } from './lineLinks';
import { dropStaleFolds, foldAllDrawers, foldLines, foldNewDrawers, toggleDrawer } from './drawers';
import { cycleState, cycleVisibility, newHeading, onHeading, orgFold, run, sel } from './structure';
import { decorate } from './decorate';
import { narrowRange, narrowing, setNarrow } from './narrow';
import { sectionBar } from './section';
import { hitMark, subtreeBar } from './subtree';
import { linkCard } from './linkCard';

/** What the wrapping component gives: the file and how it is shown, and what the editor tells back. */
export interface EditorProps {
  text: string;
  fileKey: string;
  wf: Workflow;
  path?: string; // the file's name in the folder: what a plugin's link at the end of a line is run with (ТЗ 33)
  reveal: { line: number; n: number; focus?: boolean; col?: number; top?: number } | null | undefined; // `top`: this line in the upper third (the file beside a list)
  initial?: { line: number; col: number }; // where the caret of this tab was (restored when the tab is shown)
  initialTop?: number; // the first line that was in view (the scroll comes back with the tab)
  initialFolds?: number[]; // the headings folded when the tab was last shown (their lines)
  hint?: string; // grey placeholder in an empty document
  resetOn?: number; // bumped when the text was silently reloaded from disk: the undo history starts over
  levels?: LevelView; // «Структурный вид»: one star per level, text moved by level
  drawers?: boolean; // drawers folded when a file opens and when the app adds one (:PROPERTIES:, :LOGBOOK:)
  narrow?: { line: number; end: number } | null; // only these lines of the file are shown and edited; `end` exclusive
  folded?: number[]; // heading lines folded when the editor opens («Отметки» on a card of goals)
  lineNote?: { line: number; text: string } | null; // a grey note at the end of a line («2 — справа»)
  rich?: boolean; // «Оформленный текст»: drawn like org-modern (implies the structural view)
  richNumbers?: boolean; // line numbers while drawn
  gutter?: boolean; // the line numbers and the fold markers on the left (none in the mini window, ТЗ 31)
  find?: (FindQuery & { go: number; dir: 1 | -1; rep?: { text: string; all: boolean; n: number } | null }) | null; // a new `rep.n` replaces (ТЗ 42 §5.7)
  onreplaced?: (n: number) => void; // how many matches the last «Заменить» / «Все» replaced
  /** The new interface (ТЗ 42 §5): its «Оформление» (orgRich `next`, the current section's bar). */
  next?: boolean;
  /** Above the document's title in the new «Оформление»: «Midterm.org · изменён 2 мин назад». */
  eyebrow?: () => string | null;
  /** The new interface's font and width of the text (ТЗ 42 §10): a change measures the text again. */
  look?: string; // ⌘F: the query; a new `go` steps to the next / previous match
  ontop?: (line: number) => void; // the first line in view, after a scroll
  onfolds?: (lines: number[]) => void; // the headings folded now, after a fold or an unfold
  onrich?: (p: RichPick) => void; // a click on a status, a priority or a date that asks for a choice
  onfound?: (info: { total: number; cur: number; folded: number; wrapped: boolean } | null) => void;
  onapi?: (api: { selection: () => string }) => void; // what the pane asks of the editor (⌘F, ⌘E take the selection)
  onnarrow?: (line: number, last: number, typed: boolean) => void; // where the shown lines are now; typed: by the user here
  onchange: (t: string) => void;
  oncursor: (line: number, col: number) => void;
  onfollow: (link: OrgLink) => void;
  /** ⌃X N S at this line, ⌃X N W (ТЗ 42 §5.8): the tab narrows or shows the whole file again; none — the keys go on. */
  onnarrowTo?: (line: number) => void;
  /** The new interface's menu of a heading (ТЗ 44 §3.1), given what the editor does itself; the old menu otherwise. */
  headingMenu?: (l: { path: string; line: number; tags: () => void; note: () => void; narrow?: () => void; remove: () => void }) => MenuItem[];
  onwiden?: () => void;
  /** The subtree of the heading at this line marked by a bar of the lamp (the file beside a list, ТЗ 56 §4). */
  mark?: number | null;
  /** A search's match shown on the lamp (the file beside the results, ТЗ 56 §4). */
  hit?: { line: number; col: number; len: number } | null;
}
/** What the editor asks its component to draw. */
export interface EditorUi {
  /** The editor's menu at a point of the window. */
  menu(x: number, y: number, items: MenuItem[]): void;
  /** The heading's tags in a field (⌃C Q), null: closed. */
  tags(p: { tags: string[]; x: number; y: number } | null): void;
}

/** The reveals applied, by the editor's key: an editor made again for a tab shown again (another tab was in front)
 *  must not apply its old reveal again — the caret would be centred, the scroll lost. */
const revealed = new Map<string, number>();
const headLine = (t: string) => /^\*+\s/.test(t);
const copyText = (t: string) => void navigator.clipboard?.writeText(t).catch(() => {});

/** `cm-has-selection` on the editor while something is selected: the current line is not marked then. Through the
 *  editor's attributes: CodeMirror rewrites its own classes (on focus, say) and would drop one set by hand. */
const selectionClass = EditorView.editorAttributes.compute(['selection'], (s): Record<string, string> => (s.selection.main.empty ? {} : { class: 'cm-has-selection' }));

/** The marks of the file beside (ТЗ 56 §4): the heading's subtree, a search's match. */
const markKey = (p: EditorProps) => JSON.stringify([p.mark ?? null, p.hit ?? null]);
const markExt = (p: EditorProps) => [...(p.mark === undefined || p.mark === null ? [] : [subtreeBar(p.mark)]), ...(p.hit ? [hitMark(p.hit)] : [])];

export class OrgEditor {
  readonly view: EditorView;
  private p: EditorProps;
  private ui: EditorUi;
  private lastKey = '';
  private lastReveal = 0;
  private lastReset = 0;
  private lastLevels = '';
  private lastNote: EditorProps['lineNote'] = null;
  private lastFind = '';
  private lastGo = 0;
  private lastRep = 0;
  private topFrame = 0;
  private readonly undo = new Compartment();
  private readonly structure = new Compartment(); // switching the view is not an edit: no undo step, no unsaved mark
  private readonly numbers = new Compartment(); // line numbers: off while drawn, unless asked for
  private readonly note = new Compartment();
  private readonly markC = new Compartment();
  private lastMark = ''; // set in the constructor's state: the subtree's line and the match, as a key
  private narrowField: StateField<{ from: number; to: number }> | null = null;
  /** The statuses of the document shown: the newest, a status added in the settings too. */
  private words: Workflow;
  private unregister: () => void;
  private tagPop: { v: EditorView; line: number; orig: string; tags: string[]; x: number; y: number } | null = null;

  constructor(host: HTMLElement, p: EditorProps, ui: EditorUi) {
    this.p = p;
    this.ui = ui;
    this.words = p.wf;
    this.lastNote = p.lineNote ?? null;
    this.lastMark = markKey(p);
    const view = (this.view = new EditorView({ state: this.makeState(p.text, p.wf), parent: host }));
    foldAllDrawers(view, this.drawersOn);
    foldLines(view, p.folded ?? []);
    this.lastKey = p.fileKey;
    this.lastLevels = this.viewKey();
    this.lastReset = p.resetOn ?? 0;
    if (p.initialFolds?.length) foldLines(view, p.initialFolds);
    this.restoreCaret(); // a pending reveal, if any, is applied right after by `update`
    view.scrollDOM.addEventListener('scroll', this.scrolled, { passive: true });
    p.onapi?.({
      selection: () => {
        const r = view.state.selection.main;
        return view.state.sliceDoc(r.from, r.to);
      },
    });
    this.unregister = registerEditor(view.dom, {
      run: (id, line) => this.commands[id]?.(view, line) ?? false,
      onHeading: () => onHeading(view),
      lines: () => {
        const r = view.state.selection.main;
        if (r.empty) return null;
        const a = view.state.doc.lineAt(r.from).number - 1;
        // a selection ending at a line's start does not take that line
        const end = view.state.doc.lineAt(r.to);
        const b = end.number - 1 - (r.to === end.from && r.to > r.from ? 1 : 0);
        return [a, Math.max(a, b)];
      },
    });
  }
  destroy() {
    this.unregister();
    cancelAnimationFrame(this.topFrame);
    this.view.scrollDOM.removeEventListener('scroll', this.scrolled);
    this.view.destroy();
  }
  private get drawersOn() {
    return this.p.drawers ?? true; // read by the extensions, which outlive a render
  }
  private get path() {
    return this.p.path ?? '';
  }

  /** The props now: the document follows the file, the look, the find, a reveal (in this order, as the component's
   *  effects ran). Each step does nothing when its part did not change. */
  update(p: EditorProps) {
    this.p = p;
    this.words = p.wf;
    if (p.lineNote !== this.lastNote) {
      this.lastNote = p.lineNote ?? null;
      this.view.dispatch({ effects: this.note.reconfigure(noteExt(p.lineNote ?? null)) });
    }
    if (markKey(p) !== this.lastMark) {
      this.lastMark = markKey(p);
      this.view.dispatch({ effects: this.markC.reconfigure(markExt(p)) });
    }
    this.syncText();
    this.syncNarrow();
    this.syncLook();
    this.syncFind();
    this.syncReveal();
  }

  // ---- the look: the structural view, or «Оформленный текст» (which includes it) ----------------------------------
  private viewKey = () => JSON.stringify([this.p.levels ?? DEFAULT_LEVELS, !!this.p.rich, !!this.p.richNumbers]);
  private numbersExt = () => (!(this.p.gutter ?? true) || (this.p.rich && !this.p.richNumbers) ? [] : lineNumbers());
  private structureExt(words: Workflow) {
    if (!this.p.rich) return orgIndent(this.p.levels ?? DEFAULT_LEVELS, headingSet);
    const rich = orgRich({
      wf: words, heads: headingSet, drawers: drawerMap,
      links: (doc) => linksIn(doc).map((l) => ({ from: l.from, to: l.to })),
      onPick: (pick) => this.p.onrich?.(pick),
      onTag: (t) => tagsState.open([t]),
      ...(this.p.next ? { next: { eyebrow: () => this.p.eyebrow?.() ?? null } } : {}),
    });
    return this.p.next ? [rich, sectionBar] : rich;
  }
  private lastLook: string | undefined;
  private syncLook() {
    if (this.p.look !== this.lastLook) {
      const first = this.lastLook === undefined;
      this.lastLook = this.p.look;
      // after the frame: the new CSS is on by then
      if (!first) requestAnimationFrame(() => this.view.dom.isConnected && refont(this.view));
    }
    const k = this.viewKey();
    if (k === this.lastLevels) return;
    this.lastLevels = k;
    this.view.dispatch({ effects: [this.structure.reconfigure(this.structureExt(this.p.wf)), this.numbers.reconfigure(this.numbersExt())] });
  }

  // ---- narrowing to one subtree ----------------------------------------------------------------------------------
  private narrowExt(n: { line: number; end: number }) {
    const nw = narrowing(n, (a, b, byUser) => this.p.onnarrow?.(a, b, byUser));
    this.narrowField = nw.field;
    return nw.ext;
  }
  /** The heading's lines as the file has them now: a line added under it from elsewhere is shown (only when the
   *  editor and the file agree: never against what is being typed). */
  private syncNarrow() {
    const n = this.p.narrow;
    const view = this.view;
    if (!n || !this.narrowField || view.state.doc.toString() !== this.p.text) return;
    // the caret's line and the lines shown already stay: Enter at the end makes a line that is not cut off
    const now = view.state.field(this.narrowField);
    const keep = Math.max(now.to, view.state.selection.main.head);
    const want = narrowRange(view.state.doc, { ...n, keep });
    if (want.from !== now.from || want.to !== now.to) view.dispatch({ effects: setNarrow.of({ line: n.line, end: n.end, keep }) });
  }

  // ---- the commands the keys run (ids of keys.ts) ----------------------------------------------------------------
  private docText = (v: EditorView) => v.state.doc.toString();
  /** The heading the caret is on, as a position on its line: also when the caret sits after a folded heading's
   *  «…», inside its hidden subtree (a click at the end of the line puts it there) — the heading seen (fix #310: else
   *  ⌥↓ moved the hidden last line and broke the subtree). Null: not on a heading. */
  private headAt = (v: EditorView): number | null => {
    if (onHeading(v)) return sel(v).head;
    if (!sel(v).empty) return null;
    const from = v.lineBlockAt(sel(v).head).from;
    const n = v.state.doc.lineAt(from).number - 1;
    return from !== v.state.doc.lineAt(sel(v).head).from && headingSet(v.state.doc).has(n) ? v.state.doc.line(n + 1).to : null;
  };
  private onHead = (v: EditorView, f: (pos: number) => Result | null) => {
    const at = this.headAt(v);
    return at !== null && run(v, f(at));
  };
  private status = (v: EditorView, f: (w: Workflow, k: string | null) => string | null) => this.onHead(v, (at) => changeStatusAt(this.docText(v), at, f, this.words));
  private shift = (v: EditorView, d: -1 | 1) => this.onHead(v, (at) => shiftHeading(this.docText(v), at, d));
  private shiftTree = (v: EditorView, d: -1 | 1) => this.onHead(v, (at) => shiftSubtree(this.docText(v), at, d));
  readonly commands: Record<string, (v: EditorView, line?: number) => boolean> = {
    newHeading: (v) => newHeading(v, false, this.words),
    newTask: (v) => newHeading(v, true, this.words),
    // heading lines only, so Option+arrows keep moving by word inside text (as in Org on a Mac)
    promote: (v) => this.shift(v, -1),
    demote: (v) => this.shift(v, 1),
    promoteTree: (v) => this.shiftTree(v, -1),
    demoteTree: (v) => this.shiftTree(v, 1),
    subtreeUp: (v) => this.onHead(v, (at) => moveSubtree(this.docText(v), at, -1)),
    subtreeDown: (v) => this.onHead(v, (at) => moveSubtree(this.docText(v), at, 1)),
    prioUp: (v) => this.onHead(v, (at) => cyclePriority(this.docText(v), at, 'up', this.words)),
    prioDown: (v) => this.onHead(v, (at) => cyclePriority(this.docText(v), at, 'down', this.words)),
    // statuses: inside the workflow, and between workflows (heading lines only)
    statusNext: (v) => this.status(v, (w, k) => rotateStatus(w, k, 'next')),
    statusPrev: (v) => this.status(v, (w, k) => rotateStatus(w, k, 'prev')),
    wfNext: (v) => this.status(v, (w, k) => rotateWorkflow(w, k, 'next')),
    wfPrev: (v) => this.status(v, (w, k) => rotateWorkflow(w, k, 'prev')),
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
    copyLink: (v) => linkHooks.copyHeading(this.path, v.state.doc.lineAt(v.state.selection.main.head).number - 1),
    // ⌃C Q: the heading's tags in a field with the folder's tags (ТЗ 38 §6)
    tags: (v, line?: number) => {
      const l = line !== undefined && line >= 0 && line < v.state.doc.lines ? v.state.doc.line(line + 1) : v.state.doc.lineAt(v.state.selection.main.head);
      if (!headLine(l.text)) return false;
      this.openTagPop(v, l.number);
      return true;
    },
    // ⌃C ⌃Z: a note into the heading's :LOGBOOK: (ТЗ 40 §3), for the heading the caret is in
    addNote: (v, line?: number) => {
      const at = line !== undefined && line >= 0 && line < v.state.doc.lines ? line : this.headingAbove(v);
      if (at < 0) return false;
      this.noteAt(v, at);
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
    insertLink: (v) => (this.pickLink(v, null), true),
    editLink: (v) => {
      const l = linkAt(v.state.doc, v.state.selection.main.head);
      if (!l) return false;
      this.pickLink(v, l);
      return true;
    },
    narrow: (v, line?: number) => {
      if (!this.p.onnarrowTo || (line === undefined && this.headingAbove(v) < 0)) return false;
      this.p.onnarrowTo(line ?? v.state.doc.lineAt(v.state.selection.main.head).number - 1);
      return true;
    },
    widen: () => {
      if (!this.p.onwiden || !this.p.narrow) return false;
      this.p.onwiden();
      return true;
    },
    followLink: (v) => {
      const l = linkAt(v.state.doc, v.state.selection.main.head);
      if (!l) return false;
      this.p.onfollow(l);
      return true;
    },
  };

  // ---- links (ТЗ 35): the palette «Ссылка на», the editor's menu, the tooltip over a link ---------------------------
  /** The palette «Ссылка на»: the link goes in place of the selection (its label) or of the link `l` (its label kept). */
  private pickLink(v: EditorView, l: OrgLink | null) {
    const s = v.state.selection.main;
    const text = v.state.sliceDoc(s.from, s.to);
    const sel = !l && text && !/\n|\[\[|\]\]/.test(text) ? text : '';
    const at = l ? { from: l.from, to: l.to } : { from: s.from, to: s.to };
    const len = v.state.doc.length;
    linkHooks.pick({
      path: this.path, sel, edit: l ? { label: l.desc ?? null } : null,
      apply: (insert) => {
        if (v.state.doc.length !== len) return; // the text changed meanwhile
        v.dispatch({ changes: { ...at, insert }, selection: { anchor: at.from + insert.length }, userEvent: 'input', scrollIntoView: true });
        v.focus();
      },
    });
  }
  /** Put text in place of the selection (the menu's «Вставить»: a link on a selection, as ⌘V does). */
  private insertText(v: EditorView, t: string, asLink: boolean) {
    const s = v.state.selection.main;
    const r = asLink ? linkPaste(v.state.doc.toString(), s.from, s.to, t, linkHooks.rel(this.path)) : null;
    if (r) {
      v.dispatch({ changes: { from: r.from, to: r.to, insert: r.insert }, selection: { anchor: r.caret }, userEvent: 'input.paste', scrollIntoView: true });
      linkHooks.pasted();
    } else v.dispatch({ changes: { from: s.from, to: s.to, insert: t }, selection: { anchor: s.from + t.length }, userEvent: 'input.paste', scrollIntoView: true });
    v.focus();
  }
  /** «Удалить заголовок» (ТЗ 44 §3.1): the heading with its subtree, one step of ⌘Z. */
  private removeHeading(v: EditorView, n: number) {
    const doc = v.state.doc;
    const head = doc.line(n);
    const level = /^\*+/.exec(head.text)![0].length;
    let last = n;
    while (last < doc.lines) {
      const m = /^(\*+)\s/.exec(doc.line(last + 1).text);
      if (m && m[1].length <= level) break;
      last++;
    }
    const to = last < doc.lines ? doc.line(last + 1).from : doc.length;
    v.dispatch({ changes: { from: head.from, to }, selection: { anchor: head.from }, userEvent: 'delete', scrollIntoView: true });
    v.focus();
  }
  /** Right click (⌃-click): inside the selection it stays, elsewhere the caret goes there; then the menu of §4. */
  private async openMenu(e: MouseEvent, v: EditorView) {
    const path = this.path;
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
        { label: 'Открыть ссылку', shortcut: key('followLink'), action: () => this.p.onfollow(l) },
        { label: 'Изменить ссылку…', shortcut: key('editLink'), action: () => this.pickLink(v, l) },
        { label: 'Копировать адрес', action: () => copyText(l.raw) },
        { label: 'Убрать ссылку', action: () => v.dispatch({ changes: { from: l.from, to: l.to, insert: l.desc ?? l.raw }, userEvent: 'input' }) },
        'sep',
      );
    }
    if (!s.empty) {
      items.push(
        { label: 'Вырезать', shortcut: '⌘X', action: () => (copyText(text), v.dispatch({ changes: { from: s.from, to: s.to }, userEvent: 'delete.cut' })) },
        { label: 'Копировать', shortcut: '⌘C', action: () => copyText(text) },
        { label: 'Вставить', shortcut: '⌘V', disabled: !clip, action: () => this.insertText(v, clip, true) },
        'sep',
      );
      if (target && !text.includes('\n')) items.push({ label: 'Сделать ссылкой из буфера', shortcut: '⌘V', detail: short(target), action: () => this.insertText(v, clip, true) });
      items.push({ label: 'Ссылка на заголовок…', shortcut: key('insertLink'), action: () => this.pickLink(v, null) });
      if (clip) items.push({ label: 'Вставить как текст', shortcut: key('pasteText'), action: () => this.insertText(v, clip, false) });
    } else {
      items.push(
        { label: 'Вставить', shortcut: '⌘V', disabled: !clip, action: () => this.insertText(v, clip, false) },
        'sep',
        { label: 'Вставить ссылку на заголовок…', shortcut: key('insertLink'), action: () => this.pickLink(v, null) },
      );
    }
    const hl = v.state.doc.lineAt(s.head);
    // the new interface: the heading's own menu first, the editing's after it
    if (this.p.headingMenu && s.empty && headLine(hl.text)) {
      const n = hl.number;
      const own = this.p.headingMenu({
        path, line: n - 1, tags: () => this.openTagPop(v, n), note: () => this.noteAt(v, n - 1),
        ...(this.p.onnarrowTo && !this.p.narrow ? { narrow: () => this.p.onnarrowTo!(n - 1) } : {}),
        remove: () => this.removeHeading(v, n),
      });
      return this.ui.menu(e.clientX, e.clientY, [...own, 'sep', ...items.filter((it, i) => !(it === 'sep' && (i === 0 || items[i - 1] === 'sep')))]);
    }
    if (heading) {
      if (!s.empty) items.push('sep');
      items.push({ label: 'Копировать ссылку на заголовок', shortcut: key('copyLink'), detail: `«${heading}»`, action: () => linkHooks.copyHeading(path, v.state.doc.lineAt(s.head).number - 1) });
    }
    if (s.empty && headLine(hl.text)) {
      items.push({ label: 'Теги…', shortcut: key('tags'), action: () => this.openTagPop(v, hl.number) });
      items.push({ label: 'Добавить заметку…', shortcut: key('addNote'), action: () => this.noteAt(v, hl.number - 1) });
      if (this.p.onnarrowTo && !this.p.narrow) items.push({ label: 'Сузить до заголовка', shortcut: key('narrow'), action: () => this.p.onnarrowTo!(hl.number - 1) });
      if (!isArchive(path)) items.push({ label: 'В архив', shortcut: key('archive'), action: () => linkHooks.archive(path, hl.number - 1) });
      // the plugins' items on a heading (ТЗ 39)
      const more = headingActionsFor(path, hl.number - 1);
      if (more.length) items.push('sep', ...more.map((a): MenuItem => ({ label: a.label, action: () => a.run(path, hl.number - 1) })));
    }
    this.ui.menu(e.clientX, e.clientY, items);
  }

  /** The line of the heading the caret is in (-1 above the first one). */
  private headingAbove(v: EditorView) {
    for (let n = v.state.doc.lineAt(v.state.selection.main.head).number; n >= 1; n--) if (headLine(v.state.doc.line(n).text)) return n - 1;
    return -1;
  }
  private noteAt(v: EditorView, line: number) {
    const l = v.state.doc.line(line + 1);
    const c = v.coordsAtPos(l.from + Math.min(l.length, /^\*+\s*/.exec(l.text)![0].length));
    openNote(this.path, line, c ? { x: c.left, y: c.bottom + 6 } : undefined, () => v.focus());
  }

  // ---- «Теги заголовка» (ТЗ 38 §6): each change in the line at once, kept out of the undo history; on closing, the
  // whole change is put in as one step — one ⌘Z per opening ----------------------------------------------------------
  private openTagPop(v: EditorView, lineNo: number) {
    const l = v.state.doc.line(lineNo);
    const { tags, at } = lineTags(l.text);
    const c = v.coordsAtPos(l.from + Math.min(at, l.length)) ?? v.coordsAtPos(l.to);
    if (!c) return;
    this.tagPop = { v, line: lineNo, orig: l.text, tags, x: Math.round(c.left), y: Math.round(c.bottom + 6) };
    this.ui.tags({ tags, x: this.tagPop.x, y: this.tagPop.y });
  }
  /** The popover's tags changed. */
  tagsChanged = (tags: string[]) => {
    const p = this.tagPop;
    if (!p) return;
    const l = p.v.state.doc.line(p.line);
    p.v.dispatch({ changes: { from: l.from, to: l.to, insert: withTags(l.text, tags) }, annotations: Transaction.addToHistory.of(false) });
    this.tagPop = { ...p, tags };
    this.ui.tags({ tags, x: p.x, y: p.y });
  };
  /** The popover closed. */
  closeTagPop = () => {
    const p = this.tagPop;
    this.tagPop = null;
    this.ui.tags(null);
    if (!p) return;
    const l = p.v.state.doc.line(p.line);
    if (l.text !== p.orig) {
      const now = l.text;
      p.v.dispatch({ changes: { from: l.from, to: l.to, insert: p.orig }, annotations: Transaction.addToHistory.of(false) });
      const back = p.v.state.doc.line(p.line);
      p.v.dispatch({ changes: { from: back.from, to: back.to, insert: now }, annotations: isolateHistory.of('full'), userEvent: 'input' });
    }
    p.v.focus();
  };

  // ---- typing tags in a heading's line: after « :» the folder's tags are offered (ТЗ 38 §6) --------------------------
  private tagSource = (ctx: CompletionContext) => {
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
  };

  /** ⌘-click on a tag of a heading (in plain text): the tag under the pointer. */
  private tagAt(v: EditorView, pos: number): string | null {
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
  private linkTip = hoverTooltip(
    (v, pos) => {
      const l = linkAt(v.state.doc, pos);
      if (!l) return null;
      return {
        pos: l.from, end: l.to, above: false,
        create: () => {
          const d = linkHooks.describe(l, this.path);
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

  /** The new interface (ТЗ 42 §5.6): over a link for half a second, the card of what it goes to. */
  private linkCardTip = hoverTooltip(
    (v, pos) => {
      const l = linkAt(v.state.doc, pos);
      if (!l) return null;
      return {
        pos: l.from, end: l.to, above: false,
        create: () => ({ dom: linkCard(linkHooks.preview(l, this.path), () => this.pickLink(v, l)) }),
      };
    },
    { hoverTime: 500 },
  );

  private makeState(doc: string, words: Workflow) {
    this.words = words;
    const p = this.p;
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
      { decorations: (x) => x.decorations },
    );
    const gutter = p.gutter ?? true;
    return EditorState.create({
      doc,
      extensions: [
        this.numbers.of(this.numbersExt()), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(),
        ...(p.narrow ? this.narrowExt(p.narrow) : [scrollPastEnd()]), // the last line can be scrolled up to the top, as in Xcode (room below, not lines in the file)
        this.undo.of(history()), orgFold, foldNewDrawers(() => this.drawersOn), findExtension,
        codeFolding({
          // the new interface's «Исходник» (ТЗ 42 §6): a folded drawer says how many lines it holds, «⋯ 3»
          preparePlaceholder: (st, range) => {
            if (!p.next) return null;
            const head = st.doc.lineAt(range.from);
            if (!/^\s*:[A-Za-z0-9_-]+:\s*$/.test(head.text)) return null;
            return Math.max(0, st.doc.lineAt(range.to).number - head.number - 1);
          },
          placeholderDOM: (_v, onclick, n: number | null) => {
            const el = document.createElement('span');
            el.className = 'cm-foldPlaceholder';
            el.textContent = typeof n === 'number' ? `⋯ ${n}` : '…';
            el.title = 'Свёрнуто — Tab или клик, чтобы развернуть';
            el.setAttribute('aria-label', 'Свёрнуто');
            el.onclick = onclick;
            return el;
          },
        }),
        ...(gutter ? [foldGutter()] : []), plugin, ...lineLinkExt(() => this.path), selectionClass, this.note.of(noteExt(p.lineNote ?? null)), this.markC.of(markExt(p)), this.structure.of(this.structureExt(words)),
        ...(p.hint ? [cmPlaceholder(p.hint)] : []),
        EditorView.atomicRanges.of((v) => v.plugin(plugin)?.atomic ?? Decoration.none),
        p.next ? this.linkCardTip : this.linkTip,
        // the card stays within the text's area: the column «Структура» to the right would cover it
        p.next
          ? tooltips({
              tooltipSpace: (v) => {
                // the scroller runs under «Структура» (§7.1): its right padding is the column's
                const r = v.scrollDOM.getBoundingClientRect();
                return { top: r.top, left: r.left, bottom: r.bottom, right: r.right - parseFloat(getComputedStyle(v.scrollDOM).paddingRight || '0') };
              },
            })
          : [],
        // the tab keeps its folded headings (S-Tab, ⇥): shown again, it comes back folded as it was
        EditorView.updateListener.of((u) => {
          // a fold changed, or an edit moved the lines of the folds
          if (!this.p.onfolds || (!u.docChanged && foldedRanges(u.state) === foldedRanges(u.startState))) return;
          this.p.onfolds(foldedHeadings(u.state));
        }),
        EditorView.domEventHandlers({
          contextmenu: (e, v) => {
            e.preventDefault();
            void this.openMenu(e, v);
            return true;
          },
          // ⌘V on a selection with a link in the clipboard: the selection becomes its label (ТЗ 35)
          paste: (e, v) => {
            const clip = e.clipboardData?.getData('text/plain') ?? '';
            const s = v.state.selection.main;
            const r = linkPaste(v.state.doc.toString(), s.from, s.to, clip, linkHooks.rel(this.path));
            if (!r) return false;
            e.preventDefault();
            v.dispatch({ changes: { from: r.from, to: r.to, insert: r.insert }, selection: { anchor: r.caret }, userEvent: 'input.paste', scrollIntoView: true });
            linkHooks.pasted();
            return true;
          },
          mousedown: (e, v) => {
            // ⌘-click on a tag of a heading: its tab «Тег» (ТЗ 38)
            if ((e.metaKey || e.ctrlKey) && (e.target as HTMLElement).closest?.('.cm-tags')) {
              const at = v.posAtCoords({ x: e.clientX, y: e.clientY });
              const t = at == null ? null : this.tagAt(v, at);
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
            this.p.onfollow(l);
            return true;
          },
        }),
        EditorView.lineWrapping,
        autocompletion({ override: [this.tagSource], icons: false, closeOnBlur: true, tooltipClass: () => 'cm-tag-complete' }),
        // the configurable keys are run by the window's handler (editorKeys.ts); here only the fixed ones
        // ⌘Z right after a step over several files (a move, «В архив»): their other files go back along (false: the
        // history's own undo runs after it)
        keymap.of([{ key: 'Mod-z', run: (v) => (linkHooks.undoAlong(this.path, v.state.doc.toString()), false) }]),
        keymap.of([...foldKeymap, ...historyKeymap, ...defaultKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            this.p.onchange(u.state.doc.toString());
            dropStaleFolds(u.view);
          }
          if (u.startState.field(findField, false) !== u.state.field(findField, false) || u.transactions.some((tr) => tr.effects.length)) this.p.onfound?.(foundInfo(u.view));
          if (u.selectionSet || u.docChanged) {
            const h = u.state.selection.main.head;
            const l = u.state.doc.lineAt(h);
            this.p.oncursor(l.number - 1, h - l.from + 1);
          }
        }),
      ],
    });
  }

  /** Put the caret where the tab had it and bring it into view, without taking the focus. */
  private restoreCaret() {
    const { initial, initialTop } = this.p;
    if (!initial) return;
    const doc = this.view.state.doc;
    const ln = doc.line(Math.min(initial.line + 1, doc.lines));
    const pos = Math.min(ln.from + Math.max(0, initial.col - 1), ln.to);
    // the scroll as it was (the caret may be out of view); without one, the caret in the middle
    const top = initialTop !== undefined && initialTop > 0 ? doc.line(Math.min(initialTop + 1, doc.lines)).from : -1;
    this.view.dispatch({ selection: { anchor: pos }, effects: top >= 0 ? EditorView.scrollIntoView(top, { y: 'start' }) : EditorView.scrollIntoView(pos, { y: 'center' }) });
  }
  /** The first line in view, told after a scroll (once a frame). */
  private scrolled = () => {
    if (!this.p.ontop || this.topFrame) return;
    this.topFrame = requestAnimationFrame(() => {
      this.topFrame = 0;
      const v = this.view;
      const b = v.lineBlockAtHeight(v.scrollDOM.scrollTop - v.documentPadding.top + 1);
      this.p.ontop?.(v.state.doc.lineAt(b.from).number - 1);
    });
  };

  /** Another file (its key), the same file reloaded from the disk, or an edit from elsewhere. */
  private syncText() {
    const { text: t, fileKey: k, wf: w } = this.p;
    const r = this.p.resetOn ?? 0;
    const view = this.view;
    if (k !== this.lastKey) {
      this.lastKey = k;
      this.lastReset = r;
      view.setState(this.makeState(t, w));
      foldAllDrawers(view, this.drawersOn);
      if (this.p.initialFolds?.length) foldLines(view, this.p.initialFolds);
      this.restoreCaret();
    } else if (r !== this.lastReset) {
      // reloaded from disk (no edits here): the caret keeps its line and column, the scroll stays, and ⌘Z must not
      // bring the old text back over the new file
      this.lastReset = r;
      const s = view.state.selection.main;
      const line = view.state.doc.lineAt(s.head);
      const col = s.head - line.from;
      const top = view.scrollDOM.scrollTop;
      patchTo(view, t); // the unchanged parts keep their folds; drawers new on disk come folded
      const doc = view.state.doc;
      const ln = doc.line(Math.min(line.number, doc.lines));
      view.dispatch({ selection: { anchor: Math.min(ln.from + col, ln.to) }, effects: this.undo.reconfigure([]) });
      view.dispatch({ effects: this.undo.reconfigure(history()) });
      view.scrollDOM.scrollTop = top;
    } else {
      patchTo(view, t);
    }
  }

  // ---- ⌘F: the query to the find field; a step selects the match and brings it to the upper third ----------------
  private toMatch(v: EditorView, select: boolean) {
    const f = v.state.field(findField, false);
    if (!f || f.cur < 0) return;
    const s = f.starts[f.cur];
    const scroll = EditorView.scrollIntoView(s, { y: 'start', yMargin: Math.round(v.scrollDOM.clientHeight / 3) });
    // «select.search»: a user's caret, so a drawn line («Оформленный текст») shows its text; a fold over it opens
    v.dispatch(select ? { selection: { anchor: s, head: f.ends[f.cur] }, effects: scroll, userEvent: 'select.search' } : { effects: scroll });
  }
  private syncFind() {
    const f = this.p.find;
    const k = this.p.fileKey;
    const view = this.view;
    if (!f || !f.q) {
      if (view.state.field(findField, false)) {
        const st = view.state.field(findField)!;
        const s = st.cur >= 0 && st.show ? st.starts[st.cur] : null;
        // closing: the caret stays on the current match
        view.dispatch({ effects: setFind.of(null), ...(s !== null ? { selection: { anchor: s, head: st.ends[st.cur] } } : {}) });
      }
      this.lastFind = '';
      return;
    }
    const key = JSON.stringify([k, f.q, f.cs, f.word, !!f.re, f.show, f.at ?? null]);
    if (key !== this.lastFind) {
      this.lastFind = key;
      // ↩ right after typing (before the pause ran out) comes with the new query: it selects the first match
      const stepped = f.go !== this.lastGo;
      this.lastGo = f.go;
      view.dispatch({ effects: setFind.of(f) });
      this.toMatch(view, f.at != null || stepped);
    } else if (f.go !== this.lastGo) {
      this.lastGo = f.go;
      view.dispatch({ effects: moveFind.of(f.dir) });
      this.toMatch(view, true);
    }
    // «Заменить»: the current match, then the next one is current; «Все»: every match, one step of ⌘Z
    if (f.rep && f.rep.n !== this.lastRep) {
      this.lastRep = f.rep.n;
      const n = replaceFound(view, f.rep.text, f.rep.all);
      if (n && !f.rep.all) this.toMatch(view, true);
      this.p.onreplaced?.(n);
    }
  }

  private syncReveal() {
    const r = this.p.reveal;
    const key = this.p.fileKey;
    const view = this.view;
    if (!r || r.n === this.lastReveal || revealed.get(key) === r.n) return;
    this.lastReveal = r.n;
    revealed.set(key, r.n);
    const ln = Math.min(r.line + 1, view.state.doc.lines);
    const line = view.state.doc.line(ln);
    const pos = line.from + Math.min(r.col ?? 0, line.length); // a new task puts the caret after its keyword
    // `top`: that line in the upper third (the file beside a list), else the caret in the middle
    const at = r.top !== undefined ? view.state.doc.line(Math.min(r.top + 1, view.state.doc.lines)).from : pos;
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(at, r.top !== undefined ? { y: 'start', yMargin: Math.round(view.scrollDOM.clientHeight / 4) } : { y: 'center' }) });
    if (r.focus !== false) view.focus(); // a task opened from the agenda keeps the focus in the agenda
  }
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

/** Bring the document to `t` with the smallest change, so cursor, folds and undo history survive. */
export function patchTo(view: EditorView, t: string) {
  const cur = view.state.doc.toString();
  if (cur === t) return;
  let a = 0;
  const max = Math.min(cur.length, t.length);
  while (a < max && cur[a] === t[a]) a++;
  let b = 0;
  while (b < max - a && cur[cur.length - 1 - b] === t[t.length - 1 - b]) b++;
  // The change replaces [a, cur.length - b). Positions inside it would be mapped to its start, which for a big
  // rewrite means "top of the file": keep the cursor on the same line and column instead.
  const s = view.state.selection.main;
  const inside = s.head > a && s.head < cur.length - b;
  const line = view.state.doc.lineAt(s.head);
  const col = s.head - line.from;
  // a change from outside the editor (a feature's edit, the disk): one step of its own in the undo history, never
  // merged with the typing around it
  view.dispatch({ changes: { from: a, to: cur.length - b, insert: t.slice(a, t.length - b) }, annotations: isolateHistory.of('full') });
  if (inside) {
    const doc = view.state.doc;
    const ln = doc.line(Math.min(line.number, doc.lines));
    view.dispatch({ selection: { anchor: Math.min(ln.from + col, ln.to) } });
  }
}

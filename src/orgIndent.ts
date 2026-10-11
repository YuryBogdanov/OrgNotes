// «Структурный вид» of the editor, like org-indent + org-hide-leading-stars in Emacs: a heading shows one star,
// moved right by its level, and the text under it lines up with the heading's text. Only looks: the file keeps all
// its stars and spaces, so copying, search, undo and saving see the real text.

import { Prec, RangeSetBuilder, type Extension, type Text } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view';

export interface LevelView {
  oneStar: boolean; // «Одна звёздочка на уровень»
  indent: boolean; // «Сдвигать текст по уровню»
  step: number; // «Шаг отступа», characters per level (1–4)
}
export const DEFAULT_LEVELS: LevelView = { oneStar: true, indent: true, step: 2 };
/** No line is moved right by more than this many characters: deep trees must not push text off the edge. */
export const MAX_INDENT = 16;

/** The headings of a document: their line indices (0-based, ascending) and levels. */
interface Outline {
  lines: number[];
  levels: number[];
}
const outlines = new WeakMap<Text, Outline>();
function outlineOf(doc: Text, heads: Set<number>): Outline {
  let o = outlines.get(doc);
  if (!o) {
    const lines = [...heads].sort((a, b) => a - b);
    o = { lines, levels: lines.map((i) => /^\*+/.exec(doc.line(i + 1).text)![0].length) };
    outlines.set(doc, o);
  }
  return o;
}
/** The level of the nearest heading at or above a line; 0 before the first heading. */
function levelAt(o: Outline, line: number): number {
  let lo = 0;
  let hi = o.lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (o.lines[mid] <= line) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? 0 : o.levels[found];
}

/** How far (in characters) the visible star of a level-N heading moves right. */
export const starShift = (level: number, v: LevelView) => Math.min((level - 1) * v.step, MAX_INDENT - 2);
/** How far the text under a level-N heading moves right: to where the heading's own text starts. */
export function bodyIndent(level: number, v: LevelView): number {
  if (level < 1 || !v.indent) return 0;
  // one star: the star's place plus "* "; all stars shown: the level's step plus the stars and the space
  const n = v.oneStar ? starShift(level, v) + 2 : (level - 1) * v.step + level + 1;
  return Math.min(n, MAX_INDENT);
}

/**
 * The mark drawn for a heading's stars. A widget of its own (not the `*` of the text), so that a later setting can
 * draw ◉ ○ ✸ … per level instead.
 */
class Marker extends WidgetType {
  constructor(readonly level: number) {
    super();
  }
  eq(o: Marker) {
    return o.level === this.level;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-org-marker';
    // the line's text in the page stays the file's (find in page, reading aloud): the other stars are there, unseen
    if (this.level > 1) {
      const lead = document.createElement('span');
      lead.className = 'cm-org-lead';
      lead.textContent = '*'.repeat(this.level - 1);
      s.appendChild(lead);
    }
    s.appendChild(document.createTextNode('*'));
    return s;
  }
  ignoreEvent() {
    return false;
  }
}

const BASE = 6; // CodeMirror's own left padding of a line, px
const lineStyle = (pad: number, hang = 0) =>
  Decoration.line({ attributes: { style: `padding-left: calc(${BASE}px + ${pad}ch)${hang ? `; text-indent: -${hang}ch` : ''}` } });

/**
 * The extension for one setting of the view. `heads` gives the heading lines of a document (shared with the rest of
 * the editor, which already keeps them per version of the text).
 */
export function orgIndent(v: LevelView, heads: (doc: Text) => Set<number>): Extension {
  if (!v.oneStar && !v.indent) return [];
  const build = (view: EditorView) => {
    const doc = view.state.doc;
    const hs = heads(doc);
    const o = outlineOf(doc, hs);
    const all = new RangeSetBuilder<Decoration>();
    const atomic = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to; ) {
        const line = doc.lineAt(pos);
        const i = line.number - 1;
        if (hs.has(i)) {
          const n = /^\*+/.exec(line.text)![0].length;
          if (v.oneStar) {
            // hanging indent: a long heading wraps under its text, not under its star
            all.add(line.from, line.from, lineStyle(starShift(n, v) + 2, 2));
            const hide = Decoration.replace({ widget: new Marker(n) });
            all.add(line.from, line.from + n, hide);
            atomic.add(line.from, line.from + n, hide);
          }
        } else {
          const pad = bodyIndent(levelAt(o, i), v);
          if (pad) all.add(line.from, line.from, lineStyle(pad));
        }
        pos = line.to + 1;
      }
    }
    return { all: all.finish(), atomic: atomic.finish() };
  };
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      atomic: DecorationSet;
      constructor(view: EditorView) {
        ({ all: this.decorations, atomic: this.atomic } = build(view));
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) ({ all: this.decorations, atomic: this.atomic } = build(u.view));
      }
    },
    { decorations: (p) => p.decorations },
  );
  const ext: Extension[] = [plugin, EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none)];
  if (v.oneStar) ext.push(Prec.high(keymap.of([{ key: 'Backspace', run: (view) => levelDown(view, heads) }])));
  return ext;
}

/**
 * Backspace at the start of a heading's text (or right after its star): one level up — one star less; on level 1
 * the line becomes plain text ("* " goes). Without this the star would just be deleted with the hidden ones.
 */
export function levelDown(view: EditorView, heads: (doc: Text) => Set<number>): boolean {
  const s = view.state.selection.main;
  if (!s.empty || view.state.selection.ranges.length > 1) return false;
  const line = view.state.doc.lineAt(s.head);
  if (!heads(view.state.doc).has(line.number - 1)) return false;
  const n = /^\*+/.exec(line.text)![0].length;
  const at = s.head - line.from;
  if (at !== n && at !== n + 1) return false;
  const changes = n > 1 ? { from: line.from, to: line.from + 1 } : { from: line.from, to: line.from + Math.min(2, line.length) };
  view.dispatch({ changes, userEvent: 'delete.backward', scrollIntoView: true });
  return true;
}

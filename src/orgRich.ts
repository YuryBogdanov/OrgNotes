// «Оформленный текст» of the editor (like org-modern in Emacs): headings bigger with a level dot, statuses,
// priorities and tags as capsules, dates as chips, emphasis without its marks, real checkboxes, tables as a grid.
// Only looks: the file keeps every character. The lines the selection touches show their real text.

import { Prec, StateEffect, StateField, type Extension, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language';
import { toneFor, type DrawerRange, type Workflow } from './org';
import { toneStyle } from './colors';
import { levelAt, levelDown, outlineOf } from './orgIndent';
import { blocksIn, cookieIn, deadlineState, drawerName, emphasisIn, listItem, planningIn, relLabel, stampLabel, stampsIn, tableCells, tableRoles, toggleBox, type Block, type Span, type Stamp } from './rich';

/** A click on a drawn element that asks for a choice (the editor's owner shows the menu). */
export interface RichPick {
  kind: 'status' | 'priority' | 'date';
  line: number; // the heading's line (0-based)
  rect: DOMRect;
  keyword?: string | null;
  priority?: string | null;
  date?: 'SCHEDULED' | 'DEADLINE';
  value?: Date;
}
export interface RichDeps {
  wf: Workflow;
  heads: (doc: Text) => Set<number>;
  drawers: (doc: Text) => Map<number, DrawerRange>;
  links: (doc: Text) => Span[];
  onPick: (p: RichPick) => void;
  /** A click on a tag's capsule: its tab «Тег» (ТЗ 38). */
  onTag?: (tag: string) => void;
  /** The new interface's look (ТЗ 42 §5): no level dot, a level is (N−1)×22 px; tags as `:dev:` after the text; a
   *  cookie as a chip; a folded drawer as «⋯ 3 свойства»; the caret's line keeps its font and size and shows its
   *  markup small and monospaced; an unfolded drawer a block; above the title, `eyebrow` («Midterm.org · изменён…»). */
  next?: { eyebrow?: () => string | null };
}

const MAX_LEVEL = 6;
const STEP = 22; // px per level
const HANG = 18; // px left for the level dot before a heading's text
const indentOf = (level: number, next = false) => (level < 1 ? 0 : (Math.min(level, MAX_LEVEL) - 1) * STEP + (next ? 0 : HANG));

const ICON = {
  sched: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3',
  dead: 'M5 17V3M5 4h10l-2 3 2 3H5',
  closed: 'M4.5 10.5l3.5 3.5 7.5-8',
  open: 'M7 5l5 5-5 5',
};
const svg = (d: string, size = 13) => {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, String(v));
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d);
  s.appendChild(p);
  return s;
};
/** Clicks on a drawn element: no caret move (the line stays drawn), then the action. */
function clickable(el: HTMLElement, label: string, run: (el: HTMLElement) => void) {
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', label);
  el.classList.add('cm-r-click');
  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    run(el);
  });
}

// ---- widgets ----------------------------------------------------------------------------------------------

/** A row of a table in the new interface (§5.3): its cells in the widths of the table's columns, the head bolder. */
class TableRow extends WidgetType {
  constructor(readonly cells: string[], readonly widths: number[], readonly head: boolean) {
    super();
  }
  eq(o: TableRow) {
    return o.head === this.head && o.cells.join('\u0000') === this.cells.join('\u0000') && o.widths.join() === this.widths.join();
  }
  /** A click on a row puts the caret in it: the row shows its text (§5.3). */
  ignoreEvent() {
    return false;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-n-trow' + (this.head ? ' head' : '');
    this.widths.forEach((w, k) => {
      const c = document.createElement('span');
      c.className = 'cm-n-cell';
      c.style.width = w + 'px';
      c.textContent = this.cells[k] ?? '';
      s.appendChild(c);
    });
    return s;
  }
}
let measureCtx: CanvasRenderingContext2D | null = null;
/** The cells' font: the text's of the new interface («Шрифт текста», ТЗ 42 §10), its sizes as in editor.css. */
let cellFont = "500 17px 'Cormorant Garamond', Georgia, serif";
function readCellFont(view: EditorView) {
  const fam = getComputedStyle(view.dom).getPropertyValue('--text').trim();
  if (fam) cellFont = fam.includes('Cormorant') ? `500 17px ${fam}` : `400 13.5px ${fam}`;
}
/** The widths of a table's columns, measured in the fonts of its head and its cells; padding included. */
function columnWidths(rows: { cells: string[]; head: boolean }[]): number[] {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const n = Math.max(0, ...rows.map((r) => r.cells.length));
  const out = Array.from({ length: n }, () => 0);
  for (const r of rows) {
    if (measureCtx) measureCtx.font = r.head ? '600 14px -apple-system, system-ui, sans-serif' : cellFont;
    r.cells.forEach((c, k) => (out[k] = Math.max(out[k], Math.ceil(measureCtx ? measureCtx.measureText(c).width : c.length * 8))));
  }
  return out.map((w) => Math.min(360, w + 24));
}
/** The tables of a document as the new interface draws them: each line's row, the widths of its table. */
let tableDrawCache = new WeakMap<Text, Map<number, { cells: string[]; widths: number[]; head: boolean; first: boolean; last: boolean }>>();
function tableRowsOf(doc: Text) {
  let m = tableDrawCache.get(doc);
  if (m) return m;
  m = new Map();
  const roles = tablesOf(doc);
  for (let i = 0; i < roles.length; ) {
    if (!roles[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < roles.length && roles[j]) j++;
    const rows: { i: number; cells: string[]; head: boolean }[] = [];
    for (let k = i; k < j; k++) if (roles[k] !== 'rule') rows.push({ i: k, cells: tableCells(doc.line(k + 1).text), head: roles[k] === 'head' });
    const widths = columnWidths(rows);
    rows.forEach((r, n) => m!.set(r.i, { cells: r.cells, widths, head: r.head, first: n === 0, last: n === rows.length - 1 }));
    i = j;
  }
  tableDrawCache.set(doc, m);
  return m;
}
/** The fonts came: the tables are measured again (the effect makes the drawing run again). */
const remeasure = () => (tableDrawCache = new WeakMap());
const fontsCame = StateEffect.define<null>();
/** The new interface's font or width changed (ТЗ 42 §10): the tables measured again, the lines' heights too. */
export function refont(view: EditorView) {
  readCellFont(view);
  remeasure();
  view.dispatch({ effects: fontsCame.of(null) });
  view.requestMeasure();
}
const blockCacheN = new WeakMap<Text, Map<number, { b: Block; role: 'begin' | 'end' | 'body'; first: boolean; last: boolean }>>();
/** Each line of a block with its role (§5.3): the fences, the body's first and last line. */
function blockRolesOf(doc: Text) {
  let m = blockCacheN.get(doc);
  if (m) return m;
  m = new Map();
  const lines: string[] = [];
  for (let k = 1; k <= doc.lines; k++) lines.push(doc.line(k).text);
  for (const b of blocksIn(lines)) {
    m.set(b.begin, { b, role: 'begin', first: false, last: false });
    for (let k = b.begin + 1; k < b.end; k++) m.set(k, { b, role: 'body', first: k === b.begin + 1, last: k === b.end - 1 });
    if (b.end > b.begin) m.set(b.end, { b, role: 'end', first: false, last: false });
  }
  blockCacheN.set(doc, m);
  return m;
}


class Dot extends WidgetType {
  constructor(readonly level: number) {
    super();
  }
  eq(o: Dot) {
    return o.level === this.level;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-r-dot cm-r-dot' + Math.min(this.level, 4);
    s.setAttribute('aria-hidden', 'true');
    return s;
  }
}
class Cap extends WidgetType {
  constructor(readonly text: string, readonly cls: string, readonly style = '', readonly pick?: (el: HTMLElement, view: EditorView) => void, readonly label = '') {
    super();
  }
  eq(o: Cap) {
    return o.text === this.text && o.cls === this.cls && o.style === this.style && o.label === this.label;
  }
  toDOM(view: EditorView) {
    const s = document.createElement('span');
    s.className = 'cm-r-cap ' + this.cls;
    if (this.style) s.setAttribute('style', this.style);
    s.textContent = this.text;
    if (this.pick) clickable(s, this.label, (el) => this.pick!(el, view));
    return s;
  }
}
/** Tags, one capsule each (at the right end of a heading). */
class Tags extends WidgetType {
  constructor(readonly tags: string[], readonly right: boolean, readonly onTag?: (tag: string) => void, readonly colons = false) {
    super();
  }
  eq(o: Tags) {
    return o.tags.join(':') === this.tags.join(':') && o.right === this.right && o.colons === this.colons;
  }
  toDOM() {
    const s = document.createElement('span');
    if (this.colons) {
      // the new interface: after the heading's text, as the file has them — `:dev:ops:`
      s.className = 'cm-r-tags colons';
      s.append(':');
      for (const t of this.tags) {
        const c = document.createElement('span');
        c.className = 'cm-r-tagn';
        c.textContent = t;
        c.dataset.tag = t;
        if (this.onTag) clickable(c, `Тег ${t}`, () => this.onTag!(t));
        s.append(c, ':');
      }
      return s;
    }
    s.className = 'cm-r-tags' + (this.right ? ' right' : '');
    for (const t of this.tags) {
      const c = document.createElement('span');
      c.className = 'cm-r-cap tag';
      c.textContent = t;
      c.dataset.tag = t;
      if (this.onTag) clickable(c, `Тег ${t}`, () => this.onTag!(t));
      s.appendChild(c);
    }
    return s;
  }
}
class Bar extends WidgetType {
  constructor(readonly done: number, readonly total: number, readonly pct: boolean) {
    super();
  }
  eq(o: Bar) {
    return o.done === this.done && o.total === this.total && o.pct === this.pct;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-r-bar';
    const track = document.createElement('span');
    track.className = 'cm-r-track';
    const fill = document.createElement('span');
    const share = this.total ? Math.min(1, this.done / this.total) : 0;
    fill.style.width = Math.round(share * 100) + '%';
    track.appendChild(fill);
    s.append(track, document.createTextNode(this.pct ? `${this.done}%` : `${this.done}/${this.total}`));
    return s;
  }
}
class Chip extends WidgetType {
  constructor(readonly text: string, readonly rel: string, readonly cls: string, readonly icon: string, readonly pick?: (el: HTMLElement, view: EditorView) => void, readonly label = '') {
    super();
  }
  eq(o: Chip) {
    return o.text === this.text && o.rel === this.rel && o.cls === this.cls && o.icon === this.icon;
  }
  toDOM(view: EditorView) {
    const s = document.createElement('span');
    s.className = 'cm-r-chip ' + this.cls;
    if (this.icon) s.appendChild(svg(this.icon));
    const t = document.createElement('span');
    t.className = 'cm-r-ct';
    t.textContent = this.text;
    s.appendChild(t);
    if (this.rel) {
      const r = document.createElement('span');
      r.className = 'cm-r-rel';
      r.textContent = this.rel;
      s.appendChild(r);
    }
    if (this.pick) clickable(s, this.label, (el) => this.pick!(el, view));
    return s;
  }
}
class Box extends WidgetType {
  constructor(readonly state: ' ' | 'X' | '-', readonly line: number, readonly deps: RichDeps) {
    super();
  }
  eq(o: Box) {
    return o.state === this.state && o.line === this.line;
  }
  toDOM(view: EditorView) {
    const s = document.createElement('span');
    s.className = 'cm-r-box' + (this.state === 'X' ? ' on' : this.state === '-' ? ' part' : '');
    if (this.state === 'X') s.appendChild(svg('M4.5 10.5l3.5 3.5 7.5-8', 10));
    clickable(s, this.state === 'X' ? 'Снять отметку' : 'Отметить', () => toggleAt(view, this.line, this.deps));
    return s;
  }
}
class Bullet extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-r-bullet';
    s.textContent = '•';
    return s;
  }
}

/** A checkbox ticked from its drawn box: the line, and the cookie of the heading above. */
function toggleAt(view: EditorView, line: number, deps: RichDeps) {
  const doc = view.state.doc;
  const heads = deps.heads(doc);
  let head: number | null = null;
  for (let i = line - 1; i >= 0; i--) if (heads.has(i)) {
    head = i;
    break;
  }
  const lines = doc.toString().split('\n');
  const out = toggleBox(lines, line, head, (i) => heads.has(i));
  view.dispatch({ changes: out.map((o) => ({ from: doc.line(o.line + 1).from, to: doc.line(o.line + 1).to, insert: o.text })), userEvent: 'input' });
}

// ---- building ---------------------------------------------------------------------------------------------

const blockCache = new WeakMap<Text, Set<number>>();
/** Lines inside #+BEGIN_… / #+END_… (both included): nothing is drawn there. */
function blockLines(doc: Text): Set<number> {
  let s = blockCache.get(doc);
  if (s) return s;
  s = new Set<number>();
  let end: RegExp | null = null;
  for (let i = 0; i < doc.lines; i++) {
    const t = doc.line(i + 1).text;
    if (end) {
      s.add(i);
      if (end.test(t)) end = null;
    } else {
      const b = /^\s*#\+BEGIN_(\w+)/i.exec(t);
      if (b) {
        end = new RegExp(`^\\s*#\\+END_${b[1]}\\b`, 'i');
        s.add(i);
      }
    }
  }
  blockCache.set(doc, s);
  return s;
}
const tableCache = new WeakMap<Text, ('head' | 'rule' | 'row' | null)[]>();
const tablesOf = (doc: Text) => {
  let t = tableCache.get(doc);
  if (!t) tableCache.set(doc, (t = tableRoles(doc.toString().split('\n'))));
  return t;
};

const today = () => new Date().toDateString();

/** The caret was put by the user (keys, a click, typing): only then its line shows the real text. Opening a file
 *  or a jump from elsewhere leaves every line drawn. */
const BY_USER = ['select', 'input', 'delete', 'undo', 'redo', 'move'];
const userCaret = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => (tr.selection ? BY_USER.some((e) => tr.isUserEvent(e)) : v),
});

function build(view: EditorView, deps: RichDeps): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const heads = deps.heads(doc);
  const outline = outlineOf(doc, heads);
  const blocks = blockLines(doc);
  const drawers = deps.drawers(doc);
  const tables = tablesOf(doc);
  const now = new Date();
  // the lines the selection touches show their real text
  const raw = new Set<number>();
  if (state.field(userCaret, false)) for (const r of state.selection.ranges) for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) raw.add(n - 1);
  const folded = new Set<number>();
  foldedRanges(state).between(0, doc.length, (from) => {
    folded.add(doc.lineAt(from).number - 1);
  });
  const open = new Set(deps.wf.open);
  const done = new Set(deps.wf.done);
  const nx = !!deps.next;
  const ind = (level: number) => indentOf(level, nx);
  // the new interface: the lines of an unfolded drawer, drawn as one block (§5.5)
  const drawerLines = new Map<number, 'head' | 'body' | 'end'>();
  if (nx)
    for (const [start, dr] of drawers) {
      if (folded.has(start)) continue;
      for (let k = start; k <= dr.end; k++) drawerLines.set(k, k === start ? 'head' : k === dr.end ? 'end' : 'body');
    }
  const out: Range<Decoration>[] = [];
  const line = (from: number, cls: string, style = '') => out.push(Decoration.line({ class: cls, attributes: style ? { style } : undefined }).range(from));
  const hide = (from: number, to: number, widget?: WidgetType) => {
    if (to > from || widget) out.push((widget ? Decoration.replace({ widget }) : Decoration.replace({})).range(from, to));
  };
  const mark = (from: number, to: number, cls: string, attrs?: Record<string, string>) => {
    if (to > from) out.push(Decoration.mark({ class: cls, attributes: attrs }).range(from, to));
  };
  const linksAll = deps.links(doc);
  const pickDate = (lineNo: number, kind: 'SCHEDULED' | 'DEADLINE', value: Date) => (el: HTMLElement) => {
    const head = headingOf(lineNo);
    if (head !== null) deps.onPick({ kind: 'date', line: head, date: kind, value, rect: el.getBoundingClientRect() });
  };
  const headingOf = (lineNo: number) => {
    for (let i = lineNo; i >= 0; i--) if (heads.has(i)) return i;
    return null;
  };
  const chipFor = (s: Stamp, kind: 'SCHEDULED' | 'DEADLINE' | 'CLOSED' | null, lineNo: number) => {
    if (kind === 'CLOSED') return new Chip('Закрыто ' + stampLabel(s, now, false), '', 'closed', ICON.closed);
    if (kind === 'DEADLINE') {
      const st = deadlineState(s.date, now);
      return new Chip('Дедлайн · ' + stampLabel(s, now), st.rel, 'dead ' + st.level, ICON.dead, pickDate(lineNo, 'DEADLINE', s.date), 'Дедлайн: ' + stampLabel(s, now));
    }
    if (kind === 'SCHEDULED') return new Chip(stampLabel(s, now), relLabel(s.date, now), 'sched', ICON.sched, pickDate(lineNo, 'SCHEDULED', s.date), 'Запланировано: ' + stampLabel(s, now));
    return new Chip(stampLabel(s, now), s.active ? relLabel(s.date, now) : '', s.active ? 'sched' : 'plain', '');
  };

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const ln = doc.lineAt(pos);
      pos = ln.to + 1;
      const i = ln.number - 1;
      const t = ln.text;
      const isRaw = raw.has(i);
      if (heads.has(i)) {
        const m = /^(\*+)(\s+)/.exec(t)!;
        const n = m[1].length;
        const kw = /^(\S+)/.exec(t.slice(m[0].length))?.[1];
        const isKw = !!kw && (open.has(kw) || done.has(kw));
        line(ln.from, `cm-r-h cm-r-h${Math.min(n, 4)}${isKw && done.has(kw!) ? ' cm-r-hdone' : ''}`, `padding-left: calc(6px + ${ind(n)}px)`);
        if (isRaw) {
          // the new interface: the same font and size, the markup small and monospaced, the status in its colour
          if (nx) {
            mark(ln.from, ln.from + m[0].length, 'cm-n-mk');
            if (isKw) mark(ln.from + m[0].length, ln.from + m[0].length + kw!.length, 'cm-n-kw', { style: toneStyle(toneFor(kw!, deps.wf)) });
            const rest = m[0].length + (isKw ? kw!.length : 0);
            const pr = /^\s+\[#[A-Z]\]/.exec(t.slice(rest));
            if (pr) mark(ln.from + rest, ln.from + rest + pr[0].length, 'cm-n-mk');
            const ck = cookieIn(t);
            if (ck) mark(ln.from + ck.from, ln.from + ck.to, 'cm-n-mk');
            const tt = /\s(:(?:[^\s:]+:)+)\s*$/.exec(t);
            if (tt) mark(ln.from + tt.index + 1, ln.to, 'cm-n-mk');
          }
          continue;
        }
        hide(ln.from, ln.from + m[0].length, nx ? undefined : new Dot(n));
        let at = m[0].length;
        if (isKw) {
          const style = toneStyle(toneFor(kw!, deps.wf));
          out.push(Decoration.mark({ class: 'cm-r-cap cm-r-status tone-chip', attributes: { style, 'data-rich-status': String(i), role: 'button', 'aria-label': 'Статус: ' + kw } }).range(ln.from + at, ln.from + at + kw!.length));
          at += kw!.length;
        }
        const pr = /^\s+\[#([A-Z])\]/.exec(t.slice(at));
        if (pr) {
          const p = pr[1];
          hide(ln.from + at + pr[0].length - 4, ln.from + at + pr[0].length, new Cap(p, 'prio', '', (el) => deps.onPick({ kind: 'priority', line: i, priority: p, rect: el.getBoundingClientRect() }), 'Приоритет: ' + p));
        }
        const c = cookieIn(t);
        if (c) hide(ln.from + c.from, ln.from + c.to, nx ? new Chip(c.pct ? `${c.done}%` : `${c.done}/${c.total}`, '', 'cookie', '') : new Bar(c.done, c.total, c.pct));
        const tg = /\s(:(?:[^\s:]+:)+)\s*$/.exec(t);
        if (tg) {
          const tags = tg[1].split(':').filter(Boolean);
          hide(ln.from + tg.index, ln.to, new Tags(tags, !nx, deps.onTag, nx));
        }
        continue;
      }
      const level = levelAt(outline, i);
      const pad = ind(level);
      const inBlock = blocks.has(i);
      // the new interface: a block on a chip (SRC, EXAMPLE monospaced, its language right; QUOTE italic with a bar);
      // its fences thin lines, their text shown only on the caret's (§5.3)
      if (inBlock && nx) {
        const r = blockRolesOf(doc).get(i);
        if (r) {
          const kind = r.b.kind.toLowerCase();
          const attrs: Record<string, string> = pad ? { style: `padding-left: calc(6px + ${pad}px)` } : {};
          if (r.role === 'body' && r.first && r.b.lang && r.b.kind === 'SRC') attrs['data-lang'] = r.b.lang;
          const cls = r.role === 'body' ? `cm-n-bline ${kind}${r.first ? ' first' : ''}${r.last ? ' last' : ''}` : `cm-n-bfence ${r.role} ${kind}${isRaw ? ' raw' : ''}`;
          out.push(Decoration.line({ class: cls, attributes: attrs }).range(ln.from));
          if (r.role !== 'body' && !isRaw) hide(ln.from, ln.to);
          continue;
        }
      }
      if (inBlock) {
        if (pad) line(ln.from, 'cm-r-text', `padding-left: calc(6px + ${pad}px)`);
        continue;
      }
      // the document's title and tags
      const title = /^#\+TITLE:\s*/i.exec(t);
      if (title && i < (outline.lines[0] ?? Infinity)) {
        const eyebrow = nx ? deps.next?.eyebrow?.() : null;
        if (eyebrow) out.push(Decoration.line({ class: 'cm-r-title', attributes: { 'data-eyebrow': eyebrow } }).range(ln.from));
        else line(ln.from, 'cm-r-title');
        if (!isRaw) hide(ln.from, ln.from + title[0].length);
        continue;
      }
      const ftags = /^#\+FILETAGS:\s*/i.exec(t);
      if (ftags) {
        line(ln.from, 'cm-r-ftags');
        if (!isRaw) {
          const tags = t.slice(ftags[0].length).split(':').map((x) => x.trim()).filter(Boolean);
          hide(ln.from, ln.to, new Tags(tags, false, deps.onTag));
        }
        continue;
      }
      // a drawer: folded, a quiet «› Свойства» (the new interface: «⋯ 3 свойства», «⋯ журнал · 3»)
      const dr = drawers.get(i);
      if (dr && folded.has(i)) {
        line(ln.from, 'cm-r-text cm-r-drawer', pad ? `padding-left: calc(6px + ${pad}px)` : '');
        if (!isRaw) {
          const name = /:([^:]+):/.exec(t)![1];
          const fold = { from: ln.to, to: doc.line(dr.end + 1).to };
          const label = nx ? drawerChip(name, dr, doc) : drawerName(name);
          hide(ln.from, ln.to, new Chip(label, '', 'drawer', nx ? '' : ICON.open, (_el, v) => v.dispatch({ effects: unfoldEffect.of(fold) }), 'Развернуть ' + drawerName(name)));
        }
        continue;
      }
      // the new interface: an unfolded drawer is a block; a click on its first line folds it (§5.5)
      const dl = drawerLines.get(i);
      if (dl) {
        const attrs: Record<string, string> = pad ? { style: `padding-left: calc(6px + ${pad}px)` } : {};
        if (dl === 'end') attrs['data-hint'] = '⌃C ⌃X D — свернуть';
        out.push(Decoration.line({ class: 'cm-r-dline ' + dl, attributes: attrs }).range(ln.from));
        continue;
      }
      const role = tables[i];
      // the new interface: a table framed, its columns in one width, the head on a chip; the rule line gone (§5.3)
      if (nx && role) {
        if (role === 'rule') {
          line(ln.from, 'cm-n-trule' + (isRaw ? ' raw' : ''), pad ? `padding-left: calc(6px + ${pad}px)` : '');
          if (!isRaw) hide(ln.from, ln.to);
          continue;
        }
        const r = tableRowsOf(doc).get(i);
        line(ln.from, `cm-n-tline ${role}${r?.first ? ' first' : ''}${r?.last ? ' last' : ''}${isRaw ? ' raw' : ''}`, pad ? `padding-left: calc(6px + ${pad}px)` : '');
        if (!isRaw && r) hide(ln.from, ln.to, new TableRow(r.cells, r.widths, r.head));
        continue;
      }
      if (role === 'rule') {
        line(ln.from, 'cm-r-trule');
        continue;
      }
      const plan = planningIn(t);
      line(ln.from, `cm-r-text${plan.length ? ' cm-r-plan' : ''}${role === 'head' ? ' cm-r-thead' : role ? ' cm-r-trow' : ''}`, pad ? `padding-left: calc(6px + ${pad}px)` : '');
      if (isRaw) {
        if (nx && !role) rawMarks(t, ln.from, mark);
        continue;
      }
      if (role) {
        // a line between cells; none at the edges of the table
        const pipes: number[] = [];
        for (let k = t.indexOf('|'); k >= 0; k = t.indexOf('|', k + 1)) pipes.push(k);
        pipes.forEach((k, n) => mark(ln.from + k, ln.from + k + 1, n === 0 || (n === pipes.length - 1 && !t.slice(k + 1).trim()) ? 'cm-r-pipe edge' : 'cm-r-pipe'));
        continue;
      }
      // dates: planning keywords with their stamps, then other stamps
      const taken: Span[] = linksAll.filter((l) => l.from < ln.to && l.to > ln.from).map((l) => ({ from: l.from - ln.from, to: l.to - ln.from }));
      for (const p of plan) {
        hide(ln.from + p.from, ln.from + p.to, chipFor(p.stamp, p.kind, i));
        taken.push(p);
      }
      for (const s of stampsIn(t)) {
        if (taken.some((x) => s.from < x.to && s.to > x.from)) continue;
        hide(ln.from + s.from, ln.from + s.to, chipFor(s.stamp, null, i));
        taken.push(s);
      }
      // lists: a real checkbox, a dot for «-» and «+»
      const li = listItem(t);
      if (li) {
        if (li.box) {
          hide(ln.from + li.bullet.from, ln.from + li.box.to + (t[li.box.to] === ' ' ? 1 : 0), new Box(li.box.state, i, deps));
          if (li.box.state === 'X') mark(ln.from + li.box.to, ln.to, 'cm-r-checked');
          taken.push({ from: li.bullet.from, to: li.box.to });
        } else if (!li.ordered) {
          hide(ln.from + li.bullet.from, ln.from + li.bullet.to, new Bullet());
          taken.push(li.bullet);
        }
      }
      for (const e of emphasisIn(t, taken)) {
        hide(ln.from + e.from, ln.from + e.inner.from);
        mark(ln.from + e.inner.from, ln.from + e.inner.to, 'cm-r-' + e.kind);
        hide(ln.from + e.inner.to, ln.from + e.to);
      }
    }
  }
  out.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(out, true);
}

/** The new interface's caret line (§5.4): its markup — planning, stamps, emphasis marks — small
 *  and monospaced, the text as drawn. */
function rawMarks(t: string, from: number, mark: (a: number, b: number, cls: string) => void) {
  const mk = (a: number, b: number) => mark(from + a, from + b, 'cm-n-mk');
  const taken: Span[] = [];
  for (const p of planningIn(t)) {
    mk(p.from, p.to);
    taken.push(p);
  }
  for (const s of stampsIn(t)) if (!taken.some((x) => s.from < x.to && s.to > x.from)) (mk(s.from, s.to), taken.push(s));
  // a link's brackets: decorate.ts marks them (`cm-linkmark`) on the caret's line; no emphasis inside a link
  for (const m of t.matchAll(/\[\[[^\]]*\](?:\[[^\]]*\])?\]/g)) taken.push({ from: m.index!, to: m.index! + m[0].length });
  for (const e of emphasisIn(t, taken)) {
    mk(e.from, e.inner.from);
    mk(e.inner.to, e.to);
  }
}
const plural = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
/** A folded drawer in the new interface: «⋯ 3 свойства», «⋯ журнал · 3», «⋯ ИМЯ». */
function drawerChip(name: string, dr: DrawerRange, doc: Text): string {
  const up = name.toUpperCase();
  const body: string[] = [];
  for (let k = dr.start + 1; k < dr.end; k++) body.push(doc.line(k + 1).text);
  if (up === 'PROPERTIES') {
    const n = body.filter((x) => /^\s*:[^:\s]+:/.test(x)).length;
    return `⋯ ${n} ${plural(n, 'свойство', 'свойства', 'свойств')}`;
  }
  if (up === 'LOGBOOK') return `⋯ журнал · ${body.filter((x) => /^\s*(-\s|CLOCK:)/.test(x)).length}`;
  return `⋯ ${up}`;
}

/** The extension: the drawing, clicks on statuses, Backspace at a heading's start one level up, the day's change. */
export function orgRich(deps: RichDeps): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      day = today();
      timer: ReturnType<typeof setInterval>;
      constructor(readonly view: EditorView) {
        if (deps.next) readCellFont(view);
        this.decorations = build(view, deps);
        // the new interface's tables are measured in its fonts: again once they are loaded
        if (deps.next)
          void document.fonts?.ready.then(() => {
            readCellFont(view);
            remeasure();
            if (view.dom.isConnected) view.dispatch({ effects: fontsCame.of(null) });
          });
        // «завтра» becomes «сегодня» at midnight (and after a sleep)
        this.timer = setInterval(() => {
          if (this.day !== today()) view.dispatch({});
        }, 60_000);
      }
      update(u: ViewUpdate) {
        const dayGone = this.day !== today();
        if (u.docChanged || u.viewportChanged || u.selectionSet || dayGone || u.transactions.some((tr) => tr.effects.length)) {
          this.day = today();
          this.decorations = build(u.view, deps);
        }
      }
      destroy() {
        clearInterval(this.timer);
      }
    },
    { decorations: (p) => p.decorations },
  );
  return [
    userCaret,
    plugin,
    EditorView.editorAttributes.of({ class: 'cm-rich' }),
    EditorView.domEventHandlers({
      mousedown(e, view) {
        // the new interface: a click on an unfolded drawer's first line folds it (§5.5)
        const dh = deps.next ? ((e.target as HTMLElement).closest?.('.cm-r-dline.head') as HTMLElement | null) : null;
        if (dh && e.button === 0) {
          const pos = view.posAtDOM(dh);
          const l = view.state.doc.lineAt(pos);
          const dr = deps.drawers(view.state.doc).get(l.number - 1);
          if (dr) {
            e.preventDefault();
            view.dispatch({ effects: foldEffect.of({ from: l.to, to: view.state.doc.line(dr.end + 1).to }) });
            return true;
          }
        }
        const el = (e.target as HTMLElement).closest?.('[data-rich-status]') as HTMLElement | null;
        if (!el || e.button !== 0) return false;
        e.preventDefault();
        const i = +el.dataset.richStatus!;
        deps.onPick({ kind: 'status', line: i, keyword: el.textContent, rect: el.getBoundingClientRect() });
        view.focus();
        return true;
      },
    }),
    Prec.high(keymap.of([{ key: 'Backspace', run: (view) => levelDown(view, deps.heads) }])),
  ];
}


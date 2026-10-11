// «Оформленный текст» of the editor (like org-modern in Emacs): headings bigger with a level dot, statuses,
// priorities and tags as capsules, dates as chips, emphasis without its marks, real checkboxes, tables as a grid.
// Only looks: the file keeps every character. The lines the selection touches show their real text.

import { Prec, StateField, type Extension, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { foldedRanges, unfoldEffect } from '@codemirror/language';
import { toneFor, type DrawerRange, type Workflow } from './org';
import { toneStyle } from './colors';
import { levelAt, levelDown, outlineOf } from './orgIndent';
import { cookieIn, deadlineState, drawerName, emphasisIn, listItem, planningIn, relLabel, stampLabel, stampsIn, tableRoles, toggleBox, type Span, type Stamp } from './rich';

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
}

const MAX_LEVEL = 6;
const STEP = 22; // px per level
const HANG = 18; // px left for the level dot before a heading's text
const indentOf = (level: number) => (level < 1 ? 0 : (Math.min(level, MAX_LEVEL) - 1) * STEP + HANG);

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
  constructor(readonly tags: string[], readonly right: boolean) {
    super();
  }
  eq(o: Tags) {
    return o.tags.join(':') === this.tags.join(':') && o.right === this.right;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-r-tags' + (this.right ? ' right' : '');
    for (const t of this.tags) {
      const c = document.createElement('span');
      c.className = 'cm-r-cap tag';
      c.textContent = t;
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
        line(ln.from, `cm-r-h cm-r-h${Math.min(n, 4)}${isKw && done.has(kw!) ? ' cm-r-hdone' : ''}`, `padding-left: calc(6px + ${indentOf(n)}px)`);
        if (isRaw) continue;
        hide(ln.from, ln.from + m[0].length, new Dot(n));
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
        if (c) hide(ln.from + c.from, ln.from + c.to, new Bar(c.done, c.total, c.pct));
        const tg = /\s(:(?:[^\s:]+:)+)\s*$/.exec(t);
        if (tg) {
          const tags = tg[1].split(':').filter(Boolean);
          hide(ln.from + tg.index, ln.to, new Tags(tags, true));
        }
        continue;
      }
      const level = levelAt(outline, i);
      const pad = indentOf(level);
      const inBlock = blocks.has(i);
      if (inBlock) {
        if (pad) line(ln.from, 'cm-r-text', `padding-left: calc(6px + ${pad}px)`);
        continue;
      }
      // the document's title and tags
      const title = /^#\+TITLE:\s*/i.exec(t);
      if (title && i < (outline.lines[0] ?? Infinity)) {
        line(ln.from, 'cm-r-title');
        if (!isRaw) hide(ln.from, ln.from + title[0].length);
        continue;
      }
      const ftags = /^#\+FILETAGS:\s*/i.exec(t);
      if (ftags) {
        line(ln.from, 'cm-r-ftags');
        if (!isRaw) {
          const tags = t.slice(ftags[0].length).split(':').map((x) => x.trim()).filter(Boolean);
          hide(ln.from, ln.to, new Tags(tags, false));
        }
        continue;
      }
      // a drawer: folded, a quiet «› Свойства»
      const dr = drawers.get(i);
      if (dr && folded.has(i)) {
        line(ln.from, 'cm-r-text cm-r-drawer', pad ? `padding-left: calc(6px + ${pad}px)` : '');
        if (!isRaw) {
          const name = /:([^:]+):/.exec(t)![1];
          const fold = { from: ln.to, to: doc.line(dr.end + 1).to };
          hide(ln.from, ln.to, new Chip(drawerName(name), '', 'drawer', ICON.open, (_el, v) => v.dispatch({ effects: unfoldEffect.of(fold) }), 'Развернуть ' + drawerName(name)));
        }
        continue;
      }
      const role = tables[i];
      if (role === 'rule') {
        line(ln.from, 'cm-r-trule');
        continue;
      }
      const plan = planningIn(t);
      line(ln.from, `cm-r-text${plan.length ? ' cm-r-plan' : ''}${role === 'head' ? ' cm-r-thead' : role ? ' cm-r-trow' : ''}`, pad ? `padding-left: calc(6px + ${pad}px)` : '');
      if (isRaw) continue;
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

/** The extension: the drawing, clicks on statuses, Backspace at a heading's start one level up, the day's change. */
export function orgRich(deps: RichDeps): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      day = today();
      timer: ReturnType<typeof setInterval>;
      constructor(readonly view: EditorView) {
        this.decorations = build(view, deps);
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


// «Презентация» (ТЗ 59 §1–3): an Org file read as slides. A slide — a heading of the 1st level (`:noexport:` and
// COMMENT ones left out); its properties choose the layout, the kicker, the side of the image; its subheading
// «Заметки» (or «Notes») — the presenter's notes, not on the slide; in `free` its other subheadings are blocks placed
// by `:BOX:`. The text is read into blocks a slide draws: paragraphs, lists, tables, quotes, code, images, a rule.
// Pure functions of the text and its headings.

import type { Heading } from '@panopticon/api/org';

export const LAYOUTS = ['title', 'text', 'text-image', 'two', 'quote', 'image', 'free'] as const;
export type Layout = (typeof LAYOUTS)[number];
export const LAYOUT_NAMES: Record<Layout, string> = {
  title: 'Заголовок',
  text: 'Текст',
  'text-image': 'Текст и картинка',
  two: 'Две колонки',
  quote: 'Цитата',
  image: 'Картинка',
  free: 'Свободная',
};

export type Inline = string; // Org markup kept: the slide parses it when it draws
export type Block =
  | { kind: 'p'; text: Inline }
  | { kind: 'list'; items: { level: 1 | 2; ordered: boolean; text: Inline }[] }
  | { kind: 'table'; rows: Inline[][] }
  | { kind: 'quote'; text: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'image'; path: string }
  | { kind: 'hr' }
  | { kind: 'sub'; title: string; blocks: Block[] };

/** A block of a `free` slide: a subheading placed on it. */
export interface Box {
  line: number;
  title: string;
  /** `:BOX:` in % of the slide: x y w h; null — none yet (laid out in a grid). */
  box: [number, number, number, number] | null;
  style: 'plain' | 'card';
  fit: 'cover' | 'contain';
  blocks: Block[];
}
export interface Slide {
  line: number;
  title: string;
  kicker: string;
  /** `:LAYOUT:` as written (a known one), null — none. */
  set: Layout | null;
  /** The layout drawn: the one set, else chosen by the content (§3.1). */
  layout: Layout;
  imageSide: 'left' | 'right';
  /** The slide's own text, then its subheadings (but the notes) as sections. */
  blocks: Block[];
  boxes: Box[];
  notes: { line: number; title: string; text: string } | null;
  /** Its heading's subtree's end (exclusive). */
  end: number;
}
export interface Deck {
  title: string;
  ratio: '16:9' | '4:3';
  slides: Slide[];
}

const DRAWER = /^\s*:([A-Za-z_][\w-]*):\s*$/;
const END = /^\s*:END:\s*$/i;
const PLANNING = /^\s*(SCHEDULED|DEADLINE|CLOSED):/;
const PROP = /^\s*:([^:\s]+):\s*(.*?)\s*$/;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
const NOTES = /^(заметки|notes)$/i;

/** `#+PRESENT:` (any value) — the file is a presentation. */
export const isDeck = (text: string) => /^#\+PRESENT:/im.test(text);

/** An image link alone: its path as written (`file:` taken off), else null. */
export function imageLink(s: string): string | null {
  const m = /^\s*\[\[(?:file:)?([^\]]+?)\](?:\[[^\]]*\])?\]\s*$/.exec(s);
  if (!m) return null;
  const p = m[1].trim();
  return IMAGE_EXT.test(p) && !/^[a-z]+:\/\//i.test(p) ? p : null;
}
/** The image's path in the notes folder: from the file's folder, `./` and `..` resolved; null — outside it. */
export function resolveImage(file: string, p: string): string | null {
  const parts = file.split('/').slice(0, -1);
  for (const x of p.replace(/^\.\//, '').split('/')) {
    if (!x || x === '.') continue;
    if (x === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(x);
  }
  return parts.join('/') || null;
}

/** The drawers and the planning of a heading's own lines left out; its properties read. */
function ownLines(lines: string[], from: number, to: number): { props: Record<string, string>; lines: string[] } {
  const props: Record<string, string> = {};
  const out: string[] = [];
  let drawer: string | null = null;
  for (let i = from; i < to; i++) {
    const l = lines[i];
    if (drawer) {
      if (END.test(l)) drawer = null;
      else if (drawer === 'PROPERTIES') {
        const m = PROP.exec(l);
        if (m) props[m[1].toUpperCase()] = m[2];
      }
      continue;
    }
    const d = DRAWER.exec(l);
    if (d && !END.test(l)) {
      drawer = d[1].toUpperCase();
      continue;
    }
    if (PLANNING.test(l)) continue;
    out.push(l);
  }
  return { props, lines: out };
}

/** Org text into the blocks a slide draws. */
export function blocksOf(lines: string[]): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let list: Extract<Block, { kind: 'list' }> | null = null;
  let base = -1; // the indent of the list's first level
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') });
    para = [];
    list = null;
    base = -1;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    const begin = /^#\+begin_(quote|src|example)\b/i.exec(t);
    if (begin) {
      flush();
      const kind = begin[1].toLowerCase();
      const body: string[] = [];
      for (i++; i < lines.length && !/^#\+end_/i.test(lines[i].trim()); i++) body.push(lines[i]);
      if (kind === 'quote') {
        const ps: string[] = [];
        let cur: string[] = [];
        for (const b of body) {
          if (b.trim()) cur.push(b.trim());
          else if (cur.length) (ps.push(cur.join(' ')), (cur = []));
        }
        if (cur.length) ps.push(cur.join(' '));
        out.push({ kind: 'quote', text: ps });
      } else {
        const ind = Math.min(...body.filter((b) => b.trim()).map((b) => /^\s*/.exec(b)![0].length), Infinity);
        out.push({ kind: 'code', text: body.map((b) => b.slice(Number.isFinite(ind) ? ind : 0)).join('\n') });
      }
      continue;
    }
    if (!t) {
      flush();
      continue;
    }
    if (/^#(\+|\s|$)/.test(t)) continue; // keywords, comments
    if (/^-{5,}$/.test(t)) {
      flush();
      out.push({ kind: 'hr' });
      continue;
    }
    if (t.startsWith('|')) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].trim().startsWith('|'); i++) {
        const r = lines[i].trim();
        if (/^\|[-+\s|]*$/.test(r)) continue;
        rows.push(r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      }
      i--;
      if (rows.length) out.push({ kind: 'table', rows });
      continue;
    }
    const img = imageLink(t);
    if (img) {
      flush();
      out.push({ kind: 'image', path: img });
      continue;
    }
    const li = /^(\s*)([-+]|\d+[.)])\s+(.*)$/.exec(l);
    if (li && !(li[2] === '-' && li[1] === '' && /^-+$/.test(li[3]))) {
      if (para.length) {
        out.push({ kind: 'p', text: para.join(' ') });
        para = [];
      }
      const ind = li[1].length;
      if (!list) {
        list = { kind: 'list', items: [] };
        out.push(list);
        base = ind;
      }
      list.items.push({ level: ind > base ? 2 : 1, ordered: /\d/.test(li[2]), text: li[3].replace(/^\[[ X-]\]\s+/, '') });
      continue;
    }
    if (list && /^\s+\S/.test(l)) {
      // a list item's next line
      const it = list.items[list.items.length - 1];
      it.text += ' ' + t;
      continue;
    }
    list = null;
    para.push(t);
  }
  flush();
  return out;
}

const firstImage = (bs: Block[]): string | null => {
  for (const b of bs) {
    if (b.kind === 'image') return b.path;
    if (b.kind === 'sub') {
      const p = firstImage(b.blocks);
      if (p) return p;
    }
  }
  return null;
};
const hasText = (bs: Block[]) => bs.some((b) => b.kind !== 'image' && b.kind !== 'hr');

/** The layout of a slide with no `:LAYOUT:` (§3.1). */
export function autoLayout(first: boolean, bs: Block[]): Layout {
  if (first) return 'title';
  const img = !!firstImage(bs);
  if (img && hasText(bs)) return 'text-image';
  if (img) return 'image';
  if (bs.some((b) => b.kind === 'quote')) return 'quote';
  return 'text';
}

function parseBox(v: string | undefined): Box['box'] {
  if (!v) return null;
  const n = v.trim().split(/\s+/).map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null;
  return [n[0], n[1], n[2], n[3]] as [number, number, number, number];
}

/** The file as a deck: its slides with what they show. `headings` — the file's (as the core parses it). */
export function deckOf(text: string, headings: Heading[]): Deck {
  const lines = text.split('\n');
  const title = /^#\+TITLE:\s*(.*)$/im.exec(text)?.[1].trim() ?? '';
  const ratio = /^#\+PRESENT:\s*4\s*:\s*3\b/im.test(text) ? '4:3' : '16:9';
  const slides: Slide[] = [];
  const tops = headings.filter((h) => h.level === 1);
  for (const h of tops) {
    if (h.tags.some((t) => t.toLowerCase() === 'noexport') || /^COMMENT\b/.test(h.title) || h.keyword === 'COMMENT') continue;
    const kids = headings.filter((k) => k.level === 2 && k.line > h.line && k.line < h.end);
    const ownEnd = headings.find((k) => k.line > h.line && k.line < h.end)?.line ?? h.end;
    const own = ownLines(lines, h.line + 1, ownEnd);
    const blocks = blocksOf(own.lines);
    let notes: Slide['notes'] = null;
    const boxes: Box[] = [];
    for (const k of kids) {
      if (k.tags.some((t) => t.toLowerCase() === 'noexport') || /^COMMENT\b/.test(k.title)) continue;
      const kEnd = headings.find((x) => x.line > k.line && x.line < k.end)?.line ?? k.end;
      const body = ownLines(lines, k.line + 1, kEnd);
      if (NOTES.test(k.title.trim())) {
        if (!notes) notes = { line: k.line, title: k.title, text: body.lines.join('\n').trim() };
        continue;
      }
      // its own text and its deeper subheadings' titles and text, as one section
      const deeper = headings.filter((x) => x.line > k.line && x.line < k.end);
      const sub: Block[] = [...blocksOf(body.lines)];
      for (const d of deeper) {
        const dEnd = headings.find((x) => x.line > d.line && x.line < d.end)?.line ?? d.end;
        sub.push({ kind: 'p', text: `*${d.title}*` }, ...blocksOf(ownLines(lines, d.line + 1, dEnd).lines));
      }
      blocks.push({ kind: 'sub', title: k.title, blocks: sub });
      boxes.push({
        line: k.line,
        title: k.title,
        box: parseBox(body.props.BOX),
        style: body.props.STYLE?.toLowerCase() === 'card' ? 'card' : 'plain',
        fit: body.props.FIT?.toLowerCase() === 'contain' ? 'contain' : 'cover',
        blocks: sub,
      });
    }
    const set = (LAYOUTS as readonly string[]).includes(own.props.LAYOUT?.toLowerCase() ?? '') ? (own.props.LAYOUT!.toLowerCase() as Layout) : null;
    slides.push({
      line: h.line,
      title: h.title.trim(),
      kicker: own.props.KICKER ?? '',
      set,
      layout: set ?? autoLayout(slides.length === 0, blocks),
      imageSide: own.props.IMAGE?.toLowerCase() === 'left' ? 'left' : 'right',
      blocks,
      boxes,
      notes,
      end: h.end,
    });
  }
  return { title, ratio, slides };
}

/** The first image of a slide (its text and sections). */
export const slideImage = (s: Slide) => firstImage(s.blocks);

/** Blocks with no `:BOX:` laid out in two columns under the title (§5.4): x y w h, whole %. */
export function gridBoxes(n: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const rows = Math.max(1, Math.ceil(n / 2));
  const top = 30;
  const h = Math.max(6, Math.floor((88 - top - (rows - 1) * 4) / rows));
  for (let i = 0; i < n; i++) {
    const c = i % 2;
    const r = Math.floor(i / 2);
    out.push([c ? 52 : 7, top + r * (h + 4), 41, h]);
  }
  return out;
}

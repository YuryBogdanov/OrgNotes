// «Презентация» (ТЗ 59 §2–3): a slide drawn — the same element in the strip, on the stage, in the show and in the
// PDF. It is laid out in its own field (960 × 540, 720 × 540 for 4:3) and scaled by its holder. Text that does not
// fit is drawn smaller in steps down to 70 %, then cut (`fit` says so). DOM only, no markup from the file as HTML.

import type { Block, Box, Deck, Slide } from './model';
import { resolveImage, slideImage } from './model';

export const FIELD = { '16:9': { w: 960, h: 540 }, '4:3': { w: 720, h: 540 } } as const;

/** What a slide needs from outside: its images' URLs (null — no such file). */
export interface Look {
  file: string;
  image(path: string): Promise<string | null>;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// ---- the markup of a line: *bold* /italic/ =code= ~code~ +strike+ _under_, links ------------------------------------

const EMPH: Record<string, string> = { '*': 'b', '/': 'i', '=': 'code', '~': 'code', '+': 's', _: 'u' };
const LINK = /\[\[([^\]]+)\](?:\[([^\]]+)\])?\]/g;

/** A line's Org markup as nodes. */
export function inline(text: string): Node[] {
  const out: Node[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK)) {
    out.push(...emphasis(text.slice(at, m.index)));
    const a = el('span', 'pr-link');
    a.append(...emphasis(m[2] ?? m[1].replace(/^file:/, '')));
    out.push(a);
    at = m.index! + m[0].length;
  }
  out.push(...emphasis(text.slice(at)));
  return out;
}
function emphasis(text: string): Node[] {
  const out: Node[] = [];
  const re = /(^|[\s('"«—-])([*/=~+_])(\S(?:.*?\S)?)\2(?=$|[\s.,;:!?)'"»—-])/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index! + m[1].length;
    if (start > at) out.push(document.createTextNode(text.slice(at, start)));
    const tag = EMPH[m[2]];
    const e = document.createElement(tag);
    if (tag === 'code') e.textContent = m[3];
    else e.append(...emphasis(m[3]));
    out.push(e);
    at = start + m[2].length * 2 + m[3].length;
  }
  if (at < text.length) out.push(document.createTextNode(text.slice(at)));
  return out;
}

// ---- blocks ---------------------------------------------------------------------------------------------------

/** An image of the slide: its picture when found, else a dashed frame with its path and «нет файла». */
export function imageEl(look: Look, path: string, cls = 'pr-img', fit: 'cover' | 'contain' = 'cover'): HTMLElement {
  const box = el('div', cls);
  box.dataset.path = path;
  const real = resolveImage(look.file, path);
  const missing = () => {
    box.classList.add('missing');
    box.replaceChildren(el('span', 'pr-path', path), el('span', 'pr-miss', 'нет файла'));
  };
  if (!real) missing();
  else
    void look.image(real).then((url) => {
      if (!url) return missing();
      const img = el('img');
      img.src = url;
      img.alt = '';
      img.style.objectFit = fit;
      box.replaceChildren(img);
    });
  return box;
}

function blockEl(b: Block, look: Look): HTMLElement | null {
  switch (b.kind) {
    case 'p': {
      const p = el('p', 'pr-p');
      p.append(...inline(b.text));
      return p;
    }
    case 'list': {
      const ul = el('div', 'pr-list');
      let n = 0;
      for (const it of b.items) {
        const li = el('div', `pr-li l${it.level}`);
        n = it.ordered ? n + 1 : 0;
        li.append(el('span', 'pr-mark', it.ordered ? `${n}.` : '—'));
        const t = el('span');
        t.append(...inline(it.text));
        li.append(t);
        ul.append(li);
      }
      return ul;
    }
    case 'table': {
      const t = el('table', 'pr-table');
      b.rows.forEach((r, i) => {
        const tr = el('tr');
        for (const c of r) {
          const td = el(i === 0 ? 'th' : 'td');
          td.append(...inline(c));
          tr.append(td);
        }
        t.append(tr);
      });
      return t;
    }
    case 'quote': {
      const q = el('blockquote', 'pr-quote');
      for (const p of b.text) {
        const x = el('p');
        x.append(...inline(p));
        q.append(x);
      }
      return q;
    }
    case 'code':
      return el('pre', 'pr-code', b.text);
    case 'image':
      return imageEl(look, b.path, 'pr-img inline');
    case 'hr':
      return null;
    case 'sub': {
      const s = el('section', 'pr-sub');
      const h = el('div', 'pr-sub-t');
      h.append(...inline(b.title));
      s.append(h, ...blocksEl(b.blocks, look));
      return s;
    }
  }
}
const blocksEl = (bs: Block[], look: Look) => bs.map((b) => blockEl(b, look)).filter((x): x is HTMLElement => !!x);

const lineCount = (bs: Block[]): number =>
  bs.reduce((n, b) => n + (b.kind === 'list' ? b.items.length : b.kind === 'table' ? b.rows.length : b.kind === 'sub' ? 1 + lineCount(b.blocks) : b.kind === 'hr' || b.kind === 'image' ? 0 : 1), 0);
const withoutImages = (bs: Block[]): Block[] => bs.filter((b) => b.kind !== 'image').map((b) => (b.kind === 'sub' ? { ...b, blocks: withoutImages(b.blocks) } : b));
const head = (s: Slide, cls = 'pr-h') => {
  const out: HTMLElement[] = [];
  if (s.kicker) out.push(el('div', 'pr-kicker', s.kicker));
  const h = el('div', cls);
  h.append(...inline(s.title));
  if (!s.title) h.classList.add('empty');
  out.push(h);
  return out;
};

/** The body of `two`: split by the rule `-----`, else in half by its blocks. */
function twoColumns(bs: Block[]): [Block[], Block[]] {
  const hr = bs.findIndex((b) => b.kind === 'hr');
  if (hr >= 0) return [bs.slice(0, hr), bs.slice(hr + 1).filter((b) => b.kind !== 'hr')];
  const total = lineCount(bs);
  let n = 0;
  for (let i = 0; i < bs.length; i++) {
    n += lineCount([bs[i]]);
    if (n * 2 >= total) return [bs.slice(0, i + 1), bs.slice(i + 1)];
  }
  return [bs, []];
}

/** A block of a free slide in its place. */
export function boxEl(b: Box, look: Look, at: [number, number, number, number]): HTMLElement {
  const box = el('div', `pr-box ${b.style}`);
  box.dataset.line = String(b.line);
  Object.assign(box.style, { left: `${at[0]}%`, top: `${at[1]}%`, width: `${at[2]}%`, height: `${at[3]}%` });
  const only = b.blocks.length === 1 && b.blocks[0].kind === 'image' ? b.blocks[0] : null;
  if (only) {
    box.classList.add('picture');
    box.append(imageEl(look, only.path, 'pr-img fill', b.fit));
    return box;
  }
  const inner = el('div', 'pr-fit');
  const t = el('div', 'pr-box-t');
  t.append(...inline(b.title));
  inner.append(t, ...blocksEl(b.blocks, look));
  box.append(inner);
  return box;
}

/** The slide in its field. `boxes` — the places of a free slide's blocks (its own `:BOX:`, else laid out). */
export function slideEl(s: Slide, deck: Deck, look: Look, boxes?: [number, number, number, number][]): HTMLElement {
  const f = FIELD[deck.ratio];
  const root = el('div', `pr-slide pr-l-${s.layout}`);
  root.style.width = `${f.w}px`;
  root.style.height = `${f.h}px`;
  root.dataset.line = String(s.line);
  const pad = el('div', 'pr-pad');
  root.append(pad);
  const ownText = s.blocks;
  switch (s.layout) {
    case 'title': {
      const sub = el('div', 'pr-fit pr-subtitle');
      sub.append(...blocksEl(withoutImages(ownText), look));
      pad.append(...head(s), sub);
      break;
    }
    case 'text': {
      const body = el('div', 'pr-fit pr-body');
      if (lineCount(ownText) > 6) body.classList.add('dense');
      body.append(...blocksEl(ownText, look));
      pad.append(...head(s), body);
      break;
    }
    case 'text-image': {
      const col = el('div', 'pr-col');
      const body = el('div', 'pr-fit pr-body');
      if (lineCount(ownText) > 6) body.classList.add('dense');
      body.append(...blocksEl(withoutImages(ownText), look));
      col.append(...head(s), body);
      const img = slideImage(s);
      const pic = img ? imageEl(look, img, 'pr-img side') : el('div', 'pr-img side none');
      pad.classList.add('row');
      if (s.imageSide === 'left') pad.append(pic, col);
      else pad.append(col, pic);
      break;
    }
    case 'two': {
      const [a, b] = twoColumns(ownText);
      const cols = el('div', 'pr-fit pr-two');
      const ca = el('div', 'pr-body dense');
      ca.append(...blocksEl(a, look));
      const cb = el('div', 'pr-body dense');
      cb.append(...blocksEl(b, look));
      cols.append(ca, cb);
      pad.append(...head(s), cols);
      break;
    }
    case 'quote': {
      const qi = ownText.findIndex((b) => b.kind === 'quote');
      const q = el('div', 'pr-fit pr-bigquote');
      if (qi >= 0) q.append(blockEl(ownText[qi], look)!);
      const cap = el('div', 'pr-caption');
      cap.append(...blocksEl(ownText.slice(qi + 1), look));
      pad.append(q, cap);
      break;
    }
    case 'image': {
      root.classList.add('bleed');
      const img = slideImage(s);
      root.replaceChildren(img ? imageEl(look, img, 'pr-img full') : el('div', 'pr-img full none'));
      break;
    }
    case 'free': {
      pad.append(...head(s, 'pr-h free'));
      const at = boxes ?? s.boxes.map((b) => b.box ?? [30, 35, 40, 30]);
      const layer = el('div', 'pr-boxes');
      s.boxes.forEach((b, i) => layer.append(boxEl(b, look, at[i])));
      root.append(layer);
      break;
    }
  }
  return root;
}

/** Text that does not fit drawn smaller, down to 70 %; true — it still does not fit (cut). The slide must be in a
 *  document (laid out): a scale on its holder does not matter. */
export function fit(slide: HTMLElement): boolean {
  let over = false;
  for (const b of slide.querySelectorAll<HTMLElement>('.pr-fit')) {
    let k = 1;
    b.style.setProperty('--k', '1');
    while (b.scrollHeight > b.clientHeight + 1 && k > 0.7) {
      k = Math.round((k - 0.05) * 100) / 100;
      b.style.setProperty('--k', String(k));
    }
    if (b.scrollHeight > b.clientHeight + 1) over = true;
  }
  slide.classList.toggle('over', over);
  return over;
}

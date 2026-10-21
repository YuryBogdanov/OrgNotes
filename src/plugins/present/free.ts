// «Презентация», the free layout (ТЗ 59 §5): a block moved or resized on the slide — kept inside it, no smaller than
// 8 × 6 %, its edges and centre snapping (6 pt of the screen) to the field's margins and centre, to the other blocks'
// edges and centres and to the bottom of the slide's title; the lines it snapped to, for the dashed guides. Pure:
// in the slide's own units (its field, 960 × 540 or 720 × 540).

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Guides {
  x: number[];
  y: number[];
}
export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const MIN = { w: 8, h: 6 }; // %
export const MARGIN = { x: 64, y: 56 };

/** The lines a block may snap to: the field's margins and centre, the other blocks', the title's bottom. */
export function targets(field: { w: number; h: number }, others: Rect[], titleBottom: number | null): Guides {
  const x = [MARGIN.x, field.w - MARGIN.x, field.w / 2];
  const y = [MARGIN.y, field.h - MARGIN.y, field.h / 2];
  for (const o of others) {
    x.push(o.x, o.x + o.w, o.x + o.w / 2);
    y.push(o.y, o.y + o.h, o.y + o.h / 2);
  }
  if (titleBottom !== null) y.push(titleBottom);
  return { x, y };
}

/** The nearest target to any of `lines` within `tol`: the shift and the line, or null. */
function nearest(lines: number[], to: number[], tol: number): { d: number; at: number } | null {
  let best: { d: number; at: number } | null = null;
  for (const l of lines)
    for (const t of to) {
      const d = t - l;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t };
    }
  return best;
}

/** The block `start` dragged by `dx, dy` (field units) by its body or a handle; `snap` off with ⌥. */
export function dragRect(start: Rect, handle: Handle, dx: number, dy: number, field: { w: number; h: number }, o: { snap: boolean; to: Guides; tol: number }): { r: Rect; guides: Guides } {
  const minW = (MIN.w / 100) * field.w;
  const minH = (MIN.h / 100) * field.h;
  const { w, h } = start;
  let { x, y } = start;
  const guides: Guides = { x: [], y: [] };
  if (handle === 'move') {
    x = Math.min(Math.max(0, x + dx), field.w - w);
    y = Math.min(Math.max(0, y + dy), field.h - h);
    if (o.snap) {
      const sx = nearest([x, x + w / 2, x + w], o.to.x, o.tol);
      if (sx && x + sx.d >= 0 && x + sx.d + w <= field.w) {
        x += sx.d;
        guides.x.push(sx.at);
      }
      const sy = nearest([y, y + h / 2, y + h], o.to.y, o.tol);
      if (sy && y + sy.d >= 0 && y + sy.d + h <= field.h) {
        y += sy.d;
        guides.y.push(sy.at);
      }
    }
    return { r: { x, y, w, h }, guides };
  }
  // a handle: its edges move, the others stay
  let l = x;
  let r = x + w;
  let t = y;
  let b = y + h;
  if (handle.includes('w')) l = Math.min(Math.max(0, l + dx), r - minW);
  if (handle.includes('e')) r = Math.max(Math.min(field.w, r + dx), l + minW);
  if (handle.includes('n')) t = Math.min(Math.max(0, t + dy), b - minH);
  if (handle.includes('s')) b = Math.max(Math.min(field.h, b + dy), t + minH);
  if (o.snap) {
    if (handle.includes('w')) {
      const s = nearest([l], o.to.x, o.tol);
      if (s && l + s.d >= 0 && r - (l + s.d) >= minW) {
        l += s.d;
        guides.x.push(s.at);
      }
    }
    if (handle.includes('e')) {
      const s = nearest([r], o.to.x, o.tol);
      if (s && r + s.d <= field.w && r + s.d - l >= minW) {
        r += s.d;
        guides.x.push(s.at);
      }
    }
    if (handle.includes('n')) {
      const s = nearest([t], o.to.y, o.tol);
      if (s && t + s.d >= 0 && b - (t + s.d) >= minH) {
        t += s.d;
        guides.y.push(s.at);
      }
    }
    if (handle.includes('s')) {
      const s = nearest([b], o.to.y, o.tol);
      if (s && b + s.d <= field.h && b + s.d - t >= minH) {
        b += s.d;
        guides.y.push(s.at);
      }
    }
  }
  return { r: { x: l, y: t, w: r - l, h: b - t }, guides };
}

/** A box in % (as `:BOX:` holds it) in field units, and back in whole % (kept inside, at least the least size). */
export const fromPct = (b: [number, number, number, number], f: { w: number; h: number }): Rect => ({ x: (b[0] / 100) * f.w, y: (b[1] / 100) * f.h, w: (b[2] / 100) * f.w, h: (b[3] / 100) * f.h });
export function toPct(r: Rect, f: { w: number; h: number }): [number, number, number, number] {
  let w = Math.max(MIN.w, Math.round((r.w / f.w) * 100));
  let h = Math.max(MIN.h, Math.round((r.h / f.h) * 100));
  w = Math.min(100, w);
  h = Math.min(100, h);
  const x = Math.min(Math.max(0, Math.round((r.x / f.w) * 100)), 100 - w);
  const y = Math.min(Math.max(0, Math.round((r.y / f.h) * 100)), 100 - h);
  return [x, y, w, h];
}
/** A box nudged by the keys: 1 % (5 with ⇧), kept inside. */
export function nudge(b: [number, number, number, number], dx: number, dy: number): [number, number, number, number] {
  return [Math.min(Math.max(0, b[0] + dx), 100 - b[2]), Math.min(Math.max(0, b[1] + dy), 100 - b[3]), b[2], b[3]];
}

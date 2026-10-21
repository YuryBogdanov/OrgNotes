import { describe, expect, it } from 'vitest';
import { dragRect, fromPct, nudge, targets, toPct } from './free';

const F = { w: 960, h: 540 };
const box = { x: 200, y: 200, w: 300, h: 150 };

describe('the free layout: a block dragged', () => {
  it('moved: kept inside the slide', () => {
    const r = dragRect(box, 'move', 2000, -500, F, { snap: false, to: { x: [], y: [] }, tol: 6 }).r;
    expect(r).toEqual({ x: 660, y: 0, w: 300, h: 150 });
  });
  it('its edge snaps to another block within the tolerance; the guide is that line; with ⌥ it does not', () => {
    const other = { x: 600, y: 300, w: 200, h: 100 };
    const to = targets(F, [other], null);
    const a = dragRect(box, 'move', 96, 0, F, { snap: true, to, tol: 6 }); // its right edge at 596 — 4 from 600
    expect(a.r.x + a.r.w).toBe(600);
    expect(a.guides.x).toEqual([600]);
    const b = dragRect(box, 'move', 96, 0, F, { snap: false, to, tol: 6 });
    expect(b.r.x + b.r.w).toBe(596);
    expect(b.guides.x).toEqual([]);
  });
  it('the centre snaps to the slide\'s centre; the field\'s margin and the title\'s bottom are targets', () => {
    const to = targets(F, [], 140);
    const a = dragRect(box, 'move', 128, 0, F, { snap: true, to, tol: 6 }); // centre 478 → 480
    expect(a.r.x + a.r.w / 2).toBe(480);
    expect(to.x).toContain(64);
    expect(to.y).toEqual(expect.arrayContaining([56, 484, 270, 140]));
  });
  it('a handle: only its edges move, never smaller than 8 × 6 %', () => {
    const r = dragRect(box, 'se', -1000, -1000, F, { snap: false, to: { x: [], y: [] }, tol: 6 }).r;
    expect([r.x, r.y]).toEqual([200, 200]);
    expect(r.w).toBeCloseTo(76.8);
    expect(r.h).toBeCloseTo(32.4);
    const n = dragRect(box, 'nw', -500, -500, F, { snap: false, to: { x: [], y: [] }, tol: 6 }).r;
    expect(n).toEqual({ x: 0, y: 0, w: 500, h: 350 });
  });
});

describe('the box in %', () => {
  it('whole %, inside, the least size', () => {
    expect(toPct(fromPct([7, 40, 40, 26], F), F)).toEqual([7, 40, 40, 26]);
    expect(toPct({ x: 950, y: 530, w: 20, h: 5 }, F)).toEqual([92, 94, 8, 6]);
  });
  it('the keys nudge it by 1 % or 5, inside', () => {
    expect(nudge([7, 40, 40, 26], 5, -1)).toEqual([12, 39, 40, 26]);
    expect(nudge([58, 0, 40, 26], 5, -1)).toEqual([60, 0, 40, 26]);
  });
});

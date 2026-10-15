// WebKit sends a mousemove when a list scrolls (or is drawn again) under a pointer at rest: a row the keys chose
// would jump to the one under the pointer. Only a move of the pointer itself picks a row: the window notes where
// the pointer was at each mousemove (before the lists' handlers run), and a list asks whether it changed.

let prev: { x: number; y: number } | null = null;
let cur: { x: number; y: number } | null = null;
if (typeof window !== 'undefined')
  window.addEventListener(
    'mousemove',
    (e) => {
      prev = cur;
      cur = { x: e.screenX, y: e.screenY };
    },
    true,
  );
/** Did the pointer really move with this mousemove (not a list sliding under it)? */
export function moved(_e: MouseEvent): boolean {
  return !prev || !cur || prev.x !== cur.x || prev.y !== cur.y;
}

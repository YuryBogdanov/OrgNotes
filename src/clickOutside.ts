// `use:clickOutside={{ onoutside, also, capture }}` (tech sprint 1.2): a mousedown anywhere but on the element (and
// on the nodes `also` gives — the anchor that opened it) calls `onoutside`. `capture`: before the others hear it
// (a bar that closes its menus before the click lands elsewhere).

export interface Outside {
  onoutside: (e: MouseEvent) => void;
  also?: () => (Node | null | undefined)[];
  capture?: boolean;
}
export function clickOutside(node: HTMLElement, o: Outside) {
  let opts = o;
  const down = (e: MouseEvent) => {
    const t = e.target as Node;
    if (node.contains(t) || (opts.also?.() ?? []).some((n) => n?.contains(t))) return;
    opts.onoutside(e);
  };
  const capture = !!o.capture;
  window.addEventListener('mousedown', down, capture);
  return {
    update: (next: Outside) => void (opts = next),
    destroy: () => window.removeEventListener('mousedown', down, capture),
  };
}

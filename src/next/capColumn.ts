// The column of the status capsules in a list (fix #312): as wide as the widest capsule of the list, not a fixed
// 46 pt — «IN-PROGRESS» does not run into the title. `use:capColumn` on the list; its `.kc` cells and what is aligned
// under them read `--kc`. Measured again as the rows change and when the fonts are in.

export function capColumn(node: HTMLElement, min = 46) {
  let frame = 0;
  const measure = () => {
    frame = 0;
    let w = min;
    for (const k of node.querySelectorAll<HTMLElement>('.kc')) {
      const cap = k.firstElementChild as HTMLElement | null;
      if (cap) w = Math.max(w, Math.ceil(cap.getBoundingClientRect().width));
    }
    node.style.setProperty('--kc', w + 'px');
  };
  const later = () => (frame ||= requestAnimationFrame(measure));
  measure();
  const mo = new MutationObserver(later);
  mo.observe(node, { childList: true, subtree: true, characterData: true });
  void document.fonts?.ready.then(later);
  return {
    destroy: () => {
      mo.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}

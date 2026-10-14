/** `use:portal`: the element moved to <body> — out of a parent that clips or transforms what is fixed in it (the
 *  settings sheet), so a dialog's scrim covers the window. */
export function portal(node: HTMLElement) {
  document.body.append(node);
  return { destroy: () => node.remove() };
}

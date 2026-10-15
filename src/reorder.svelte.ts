// Reordering a list by dragging (tech sprint 4.3: the four copies — the agenda builder's blocks, the statuses and their
// sets in the settings, the blocks of «Сегодня», «Главное на завтра» — in one). The row or its grip is `use:r.handle`,
// what it can be dropped on is `use:r.zone` (a row, or a place such as 'end'); `dragId` and `overId` draw the line
// where it would go. Reordering with the keys (⌥↑ ⌥↓) stays with each list.

export class Reorder {
  /** The row being dragged (null: none). */
  dragId = $state<string | null>(null);
  /** The place it is over now. */
  overId = $state<string | null>(null);
  private onDrop: (id: string, target: string) => void;
  private onStart?: (id: string) => void;
  /** `onDrop`: the row `id` dropped on `target` (a row's id or a place); `onStart`: a drag begins. */
  constructor(onDrop: (id: string, target: string) => void, onStart?: (id: string) => void) {
    this.onDrop = onDrop;
    this.onStart = onStart;
  }
  private end() {
    this.dragId = this.overId = null;
  }
  /** What is dragged: `id`; `image`: the closest element matching it is the drag image (the whole row by its grip). */
  handle = (node: HTMLElement, p: { id: string; image?: string }) => {
    const start = (e: DragEvent) => {
      this.dragId = p.id;
      this.onStart?.(p.id);
      e.dataTransfer?.setData('text/plain', p.id);
      const img = p.image ? (node.closest(p.image) as HTMLElement | null) : null;
      if (img && e.dataTransfer) e.dataTransfer.setDragImage(img, 12, 20);
    };
    const end = () => this.end();
    node.draggable = true;
    node.addEventListener('dragstart', start);
    node.addEventListener('dragend', end);
    return {
      update: (np: { id: string; image?: string }) => void (p = np),
      destroy: () => {
        node.removeEventListener('dragstart', start);
        node.removeEventListener('dragend', end);
      },
    };
  };
  /** Where it can be dropped: `id`, a row's or a place's. Only a row of this list is taken (not a file from Finder). */
  zone = (node: HTMLElement, id: string) => {
    const over = (e: DragEvent) => {
      if (!this.dragId) return;
      e.preventDefault();
      this.overId = id;
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const d = this.dragId;
      this.end();
      if (d) this.onDrop(d, id);
    };
    node.addEventListener('dragover', over);
    node.addEventListener('drop', drop);
    return {
      update: (nid: string) => void (id = nid),
      destroy: () => {
        node.removeEventListener('dragover', over);
        node.removeEventListener('drop', drop);
      },
    };
  };
}

<script lang="ts">
  import { untrack } from 'svelte';
  import { present } from './state.svelte';
  import type { Box, Deck, Slide } from './model';
  import { FIELD } from './render';
  import { dragRect, fromPct, nudge, targets, toPct, type Guides, type Handle, type Rect } from './free';

  // The free layout on the stage (ТЗ 59 §5): a click on a block chooses it (a frame of the lamp 6 pt outside, eight
  // handles), on the empty place none; its body drags it, a handle resizes it — inside the slide, at least 8 × 6 %, the
  // edges and centre snapping to the margins, the centre, the other blocks and the title's bottom (a dashed guide; ⌥:
  // none), its size over it; let go — `:BOX:` in whole %, one step. The keys on a chosen block: the arrows (1 %, ⇧ 5),
  // ⌫ delete, ↩ its text. Its menu. The choice lives here only, never in the file.
  let { path, slide, deck, holder, scale, onedit, textItem }: { path: string; slide: Slide; deck: Deck; holder: HTMLElement; scale: number; onedit: (b: { line: number; title: string }) => void; textItem: (ref: { path: string; line: number; title: string }) => { label: string; checked?: boolean; run(): void } } = $props();
  const ctx = present.ctx;
  const field = $derived(FIELD[deck.ratio]);
  let chosen = $state<number | null>(null); // the block's heading line
  const box = $derived(chosen === null ? null : (slide.boxes.find((b) => b.line === chosen) ?? null));
  const at = (b: Box): [number, number, number, number] => b.box ?? [30, 35, 40, 30];
  // a drag going on: the block's place now (field units), the guides, its size in %
  let live = $state<{ r: Rect; guides: Guides } | null>(null);
  const rect = $derived(live?.r ?? (box ? fromPct(at(box), field) : null));
  const pct = $derived(rect ? toPct(rect, field) : null);

  // another slide: no choice (the slide's object is new at each change of the file; its line says which it is)
  const slideLine = $derived(slide.line);
  $effect(() => {
    void slideLine;
    untrack(() => (chosen = null));
  });
  $effect(() => {
    // the chosen block gone from the file
    if (chosen !== null && !slide.boxes.some((b) => b.line === chosen)) chosen = null;
  });

  /** The bottom of the slide's title in its field (its padding layer lies at the slide's top left). */
  function titleBottom(): number | null {
    const h = holder.querySelector<HTMLElement>('.pr-slide .pr-h');
    return h ? h.offsetTop + h.offsetHeight : null;
  }
  function start(e: PointerEvent, handle: Handle, b: Box) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    chosen = b.line;
    const r0 = fromPct(at(b), field);
    const others = slide.boxes.filter((x) => x.line !== b.line).map((x) => fromPct(at(x), field));
    const to = targets(field, others, titleBottom());
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / scale;
      const dy = (ev.clientY - y0) / scale;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 2 / scale) return;
      moved = true;
      live = dragRect(r0, handle, dx, dy, field, { snap: !ev.altKey, to, tol: 6 / scale });
      const el = holder.querySelector<HTMLElement>(`.pr-box[data-line="${b.line}"]`);
      if (el) Object.assign(el.style, { left: `${(live.r.x / field.w) * 100}%`, top: `${(live.r.y / field.h) * 100}%`, width: `${(live.r.w / field.w) * 100}%`, height: `${(live.r.h / field.h) * 100}%` });
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      const l = live;
      live = null;
      if (!moved || !l) return;
      const p = toPct(l.r, field);
      if (p.join(' ') !== at(b).join(' ')) void setBox(b, p, handle === 'move' ? 'Переместить блок' : 'Изменить размер блока');
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }
  const ref = (b: { line: number; title: string }) => ({ path, line: b.line, title: b.title });
  const setBox = (b: Box, p: [number, number, number, number], label: string) => ctx.edit!.transaction(label, (tx) => tx.setProperty(ref(b), 'BOX', p.join(' ')));

  // the blocks of the slide: their clicks (the slide is drawn anew when it changes; one listener on its holder)
  $effect(() => {
    const down = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.pr-box');
      const b = el ? slide.boxes.find((x) => String(x.line) === el.dataset.line) : undefined;
      if (b) start(e, 'move', b);
      else chosen = null;
    };
    const dbl = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.pr-box');
      const b = el ? slide.boxes.find((x) => String(x.line) === el.dataset.line) : undefined;
      if (b) {
        e.stopPropagation();
        onedit(b);
      }
    };
    const menu = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.pr-box');
      const b = el ? slide.boxes.find((x) => String(x.line) === el.dataset.line) : undefined;
      if (!b) return;
      e.preventDefault();
      chosen = b.line;
      boxMenu(b, e.clientX, e.clientY);
    };
    holder.addEventListener('pointerdown', down);
    holder.addEventListener('dblclick', dbl, true);
    holder.addEventListener('contextmenu', menu);
    return () => {
      holder.removeEventListener('pointerdown', down);
      holder.removeEventListener('dblclick', dbl, true);
      holder.removeEventListener('contextmenu', menu);
    };
  });

  const hasText = (b: Box) => b.blocks.length > 0;
  async function remove(b: Box) {
    if (hasText(b)) {
      const r = await ctx.ui.sheet({
        title: 'Удалить блок?',
        render: (el) => void (el.textContent = `«${b.title || 'Без названия'}» — подзаголовок со всем текстом. ⌘Z вернёт.`),
        buttons: [{ id: 'cancel', label: 'Отмена' }, { id: 'ok', label: 'Удалить', primary: true }],
      });
      if (r !== 'ok') return;
    }
    chosen = null;
    await ctx.edit!.transaction('Удалить блок', (tx) => tx.remove(ref(b)));
  }
  /** «На передний план» / «На задний план»: the block last / first of the slide's blocks (the next lies over). */
  function layer(b: Box, front: boolean) {
    const bs = slide.boxes;
    const edge = front ? bs[bs.length - 1] : bs[0];
    if (!edge || edge.line === b.line) return;
    void ctx.edit!.transaction(front ? 'На передний план' : 'На задний план', (tx) => tx.move(ref(b), front ? { after: ref(edge) } : { before: ref(edge) }));
  }
  function boxMenu(b: Box, x: number, y: number) {
    const picture = b.blocks.length === 1 && b.blocks[0].kind === 'image';
    ctx.ui.menu(
      [
        { label: 'Править текст', shortcut: '↩', run: () => onedit(b) },
        { label: 'Подложка', checked: b.style === 'card', run: () => void ctx.edit!.transaction('Подложка блока', (tx) => tx.setProperty(ref(b), 'STYLE', b.style === 'card' ? null : 'card')) },
        ...(picture
          ? [
              { label: 'Заполнить', checked: b.fit === 'cover', run: () => void ctx.edit!.transaction('Картинка блока', (tx) => tx.setProperty(ref(b), 'FIT', null)) },
              { label: 'Целиком', checked: b.fit === 'contain', run: () => void ctx.edit!.transaction('Картинка блока', (tx) => tx.setProperty(ref(b), 'FIT', 'contain')) },
            ]
          : []),
        'sep',
        { label: 'На передний план', disabled: slide.boxes[slide.boxes.length - 1]?.line === b.line, run: () => layer(b, true) },
        { label: 'На задний план', disabled: slide.boxes[0]?.line === b.line, run: () => layer(b, false) },
        'sep',
        textItem(ref(b)),
        { label: 'Удалить блок…', danger: true, run: () => void remove(b) },
      ],
      { x, y },
    );
  }

  // the keys on a chosen block (the focus on the stage)
  $effect(() => {
    const b = box;
    if (!b) return;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable="true"], .cm-editor, .pr-strip')) return;
      const d = e.shiftKey ? 5 : 1;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
      if (arrows[e.key] && !e.metaKey && !e.altKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        const [dx, dy] = arrows[e.key];
        const p = nudge(at(b), dx, dy);
        if (p.join(' ') !== at(b).join(' ')) void setBox(b, p, 'Переместить блок');
      } else if (e.key === 'Backspace' && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        void remove(b);
      } else if (e.key === 'Enter' && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        onedit(b);
      } else if (e.key === 'Escape') chosen = null;
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  });

  const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  /** Choose a block from outside (one just made). */
  export function choose(line: number) {
    chosen = line;
  }
</script>

{#if rect && box}
  <div class="pr-selbox" style:left="{rect.x * scale}px" style:top="{rect.y * scale}px" style:width="{rect.w * scale}px" style:height="{rect.h * scale}px" aria-hidden="true">
    {#each HANDLES as h (h)}
      <span class="pr-handle {h}" role="presentation" onpointerdown={(e) => start(e, h, box)}></span>
    {/each}
    {#if live && pct}<span class="pr-size">{pct[2]} × {pct[3]} %</span>{/if}
  </div>
{/if}
{#if live}
  {#each live.guides.x as gx (gx)}<div class="pr-guide v" style:left="{gx * scale}px" aria-hidden="true"></div>{/each}
  {#each live.guides.y as gy (gy)}<div class="pr-guide h" style:top="{gy * scale}px" aria-hidden="true"></div>{/each}
{/if}

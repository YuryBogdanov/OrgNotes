<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { present } from './state.svelte';
  import { LAYOUTS, LAYOUT_NAMES, type Deck, type Layout, type Slide } from './model';
  import { FIELD, fit, slideEl, type Look } from './render';
  import { gridBoxes } from './model';
  import FreeLayer from './FreeLayer.svelte';

  // The editor of a presentation (ТЗ 59 §4): its head (the slide's number, «Раскладка ▾»), the strip of the slides on
  // the left (a click, ↑↓, a drag to reorder, the menu of a slide, «+ Слайд»), the slide in the middle (a double
  // click: its text in an editor over it) and the presenter's notes under it.
  let { path }: { path: string } = $props();
  const ctx = present.ctx;
  const file = $derived(present.files.get(path));
  const deck = $derived(file?.deck);
  const cur = $derived(Math.min(present.current.get(path) ?? 0, Math.max(0, (deck?.slides.length ?? 1) - 1)));
  const slide = $derived(deck?.slides[cur] ?? null);
  const look: Look = { get file() { return path; }, image: (p) => present.image(p) };
  onMount(() => void present.read(path));

  /** A slide drawn into `node`, scaled to its width; the text fitted. Drawn anew only when what it shows changed. */
  function draw(node: HTMLElement, a: { s: Slide; deck: Deck; width: number; vars: string; onfit?: (over: boolean) => void }) {
    let key = '';
    const paint = (o: typeof a) => {
      const f = FIELD[o.deck.ratio];
      const k = o.width / f.w;
      node.style.height = `${f.h * k}px`;
      const next = JSON.stringify([o.s, o.deck.ratio, o.vars]);
      const old = node.firstElementChild as HTMLElement | null;
      if (next === key && old) {
        old.style.transform = `scale(${k})`;
        return;
      }
      key = next;
      const el = slideEl(o.s, o.deck, look);
      if (o.vars) el.style.cssText += ';' + o.vars;
      el.style.transform = `scale(${k})`;
      el.style.transformOrigin = '0 0';
      node.replaceChildren(el);
      o.onfit?.(fit(el));
    };
    paint(a);
    return { update: paint };
  }

  // ---- the strip ----
  let overflow = $state<Record<number, boolean>>({});
  let strip: HTMLDivElement | undefined = $state();
  let drag = $state<{ from: number; to: number } | null>(null);
  function stripKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      present.step(path, e.key === 'ArrowDown' ? 1 : -1);
    }
  }
  $effect(() => {
    void cur;
    untrack(() => strip?.querySelector<HTMLElement>('.pr-thumb.on')?.scrollIntoView({ block: 'nearest' }));
  });
  function dragOver(e: DragEvent, i: number) {
    if (!drag) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    drag.to = e.clientY < r.top + r.height / 2 ? i : i + 1;
  }
  function drop(e: DragEvent) {
    if (!drag) return;
    e.preventDefault();
    present.moveSlide(path, drag.from, drag.to);
    drag = null;
  }
  const hasText = (s: Slide) => s.blocks.length > 0 || !!s.notes?.text;
  async function removeSlide(s: Slide) {
    if (hasText(s)) {
      const r = await ctx.ui.sheet({
        title: 'Удалить слайд?',
        render: (el) => void (el.textContent = `«${s.title || 'Без названия'}» — заголовок со всем текстом. ⌘Z вернёт.`),
        buttons: [{ id: 'cancel', label: 'Отмена' }, { id: 'ok', label: 'Удалить', primary: true }],
      });
      if (r !== 'ok') return;
    }
    await present.remove(path, s);
  }
  function thumbMenu(e: MouseEvent, s: Slide) {
    e.preventDefault();
    present.choose(path, deck!.slides.indexOf(s));
    ctx.ui.menu(
      [
        { label: 'Новый слайд после', run: () => present.newSlide(path, s) },
        { label: 'Дублировать', run: () => present.duplicate(path, s) },
        { label: 'Показать в тексте', run: () => void ctx.ui.openBeside(present.ref(path, s)) },
        'sep',
        { label: 'Удалить слайд…', danger: true, run: () => void removeSlide(s) },
      ],
      { x: e.clientX, y: e.clientY },
    );
  }

  // ---- the layouts' menu (§4.2) ----
  let layoutOpen = $state(false);
  let layoutBtn: HTMLButtonElement | undefined = $state();
  let pop = $state({ x: 0, y: 0 });
  function openLayouts() {
    const r = layoutBtn!.getBoundingClientRect();
    const host = layoutBtn!.closest('.pr-view')!.getBoundingClientRect();
    pop = { x: Math.max(8, r.right - host.left - 250), y: r.bottom - host.top + 4 };
    layoutOpen = !layoutOpen;
  }
  function pick(l: Layout) {
    layoutOpen = false;
    if (slide && slide.layout !== l) void present.setLayout(path, slide, l);
    else if (slide && !slide.set) void present.setLayout(path, slide, l);
  }
  const SCHEME: Record<Layout, string> = {
    title: 'M4 13h16M4 16h10',
    text: 'M4 5h14M4 9h22M4 12h20M4 15h18',
    'text-image': 'M4 5h10M4 9h12M4 12h11M18 4h10v12H18z',
    two: 'M4 5h14M4 9h10M4 12h9M18 9h10M18 12h9',
    quote: 'M7 8h18M9 11h14M12 15h8',
    image: 'M3 3h26v14H3zM3 13l7-5 6 5 4-3 9 6',
    free: 'M4 4h10M5 8h9v8H5zM18 6h9v5h-9zM18 13h9v3h-9z',
  };
  $effect(() => {
    if (!layoutOpen) return;
    const off = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.pr-pop, .pr-layout-btn')) layoutOpen = false;
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (layoutOpen = false);
    addEventListener('pointerdown', off, true);
    addEventListener('keydown', esc, true);
    return () => {
      removeEventListener('pointerdown', off, true);
      removeEventListener('keydown', esc, true);
    };
  });

  // ---- the slide's text in an editor over it (§4.4) ----
  let stageW = $state(0);
  const slideW = $derived(Math.min(860, Math.max(200, stageW - 64)));
  let editing = $state<{ line: number; title: string; block?: boolean } | null>(null);
  let edBox: HTMLDivElement | undefined = $state();
  const open = $derived(!!editing);
  $effect(() => {
    const box = edBox;
    if (!open || !box) return;
    const at = untrack(() => editing!);
    // the heading moves while typed in (`onRef`): kept aside, the editor is not made anew
    const ed = untrack(() => ctx.ui.editor(box, { path, line: at.line, title: at.title }, { source: true }));
    queueMicrotask(() => ed.focus());
    return () => ed.dispose();
  });
  function editSlide() {
    if (slide) editing = { line: slide.line, title: slide.title };
  }
  /** A block's text (the free layout, §4.4): its heading only. */
  function editBlock(b: { line: number; title: string }) {
    editing = { line: b.line, title: b.title, block: true };
  }

  // ---- images dropped from Finder or pasted (§6) ----
  const IMG = /\.(png|jpe?g|gif|webp|svg)$/i;
  const imageOf = (fs: FileList | File[] | undefined | null) => [...(fs ?? [])].find((f) => f.type.startsWith('image/') || IMG.test(f.name));
  let copying = $state<{ x: number; y: number } | null>(null);
  async function base64(f: File): Promise<string> {
    const b = new Uint8Array(await f.arrayBuffer());
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function put(f: File, at?: { x: number; y: number }) {
    const s = slide;
    if (!s) return;
    copying = at ?? { x: 50, y: 50 };
    try {
      const name = f.name && f.name !== 'image.png' ? f.name : `Вставка.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg')}`;
      await present.insertImage(path, s, { name, base64: await base64(f) }, at);
    } finally {
      copying = null;
    }
  }
  function dragOverStage(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  function dropOnStage(e: DragEvent) {
    const f = imageOf(e.dataTransfer?.files);
    if (!f || !holderEl) return;
    e.preventDefault();
    const r = holderEl.getBoundingClientRect();
    const at = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
    void put(f, at);
  }
  $effect(() => {
    const paste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (present.active.view !== 'present.slides' || present.active.path !== path) return;
      if (t?.closest?.('input, textarea, [contenteditable="true"], .cm-editor')) return;
      const f = imageOf(e.clipboardData?.files);
      if (!f) return;
      e.preventDefault();
      void put(f);
    };
    addEventListener('paste', paste);
    return () => removeEventListener('paste', paste);
  });

  // ---- the free layout (§5) ----
  let holderEl: HTMLDivElement | undefined = $state();
  const scale = $derived(deck ? slideW / FIELD[deck.ratio].w : 1);
  // blocks with no `:BOX:` (the layout changed to free, a block written in the text): laid out once, one step
  const laidOut = new Set<string>();
  $effect(() => {
    const s = slide;
    if (!s || s.layout !== 'free') return;
    const none = s.boxes.filter((b) => !b.box);
    const k = `${path}:${s.line}:${none.map((b) => b.line).join(',')}`;
    if (!none.length || laidOut.has(k)) return;
    laidOut.add(k);
    const taken = s.boxes.length - none.length;
    const at = gridBoxes(s.boxes.length).slice(taken);
    void ctx.edit!.transaction('Разложить блоки', (tx) => none.forEach((b, i) => tx.setProperty({ path, line: b.line, title: b.title }, 'BOX', at[i].join(' '))));
  });
  async function newBlock() {
    if (!slide) return;
    let made: { line: number; title: string } | null = null;
    const r = await ctx.edit!.transaction('Новый блок', (tx) => void (made = tx.insertHeading({ under: present.ref(path, slide!), position: 'last' }, '** Новый блок\n:PROPERTIES:\n:BOX: 30 35 40 30\n:END:\n')));
    if (r === 'ok' && made) editBlock(made);
  }
  function editKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      editing = null;
    }
  }
  $effect(() => {
    // another slide chosen: the editor of the one before goes
    void cur;
    untrack(() => (editing = null));
  });

  // ---- the presenter's notes (§4.4) ----
  let notesBox: HTMLDivElement | undefined = $state();
  const notesRef = $derived(slide?.notes ? { path, line: slide.notes.line, title: slide.notes.title } : null);
  const notesKey = $derived(notesRef ? `${notesRef.line}:${notesRef.title}` : '');
  $effect(() => {
    void notesKey;
    const box = notesBox;
    const ref = untrack(() => notesRef);
    if (!box || !ref) return;
    // just made: the caret under its title, typed into at once
    const ed = untrack(() => ctx.ui.editor(box, ref, { source: true, ...(focusNotes ? { caret: 'end' as const } : {}) }));
    focusNotes = false;
    return () => ed.dispose();
  });
  let focusNotes = false;
  async function startNotes(e: Event) {
    const t = e.currentTarget as HTMLTextAreaElement;
    if (!slide || !t.value || making) return;
    making = true;
    focusNotes = true;
    if (!(await present.startNotes(path, slide, t.value))) focusNotes = false;
    making = false;
  }
  let making = false;
</script>

<div class="pr-view" data-ui="next">
  {#if !deck}
    <div class="pr-empty">Читаю файл…</div>
  {:else}
    <div class="pr-head">
      <span class="pr-count">{deck.slides.length ? `СЛАЙД ${cur + 1} ИЗ ${deck.slides.length}` : 'НЕТ СЛАЙДОВ'}</span>
      <span class="pr-sp"></span>
      {#if slide}
        {#if slide.layout === 'free'}<button class="pr-btn" onclick={newBlock}>+ Блок</button>{/if}
        <button class="pr-btn pr-layout-btn" bind:this={layoutBtn} aria-haspopup="menu" aria-expanded={layoutOpen} onclick={openLayouts}>
          <span class="dim">Раскладка</span>{LAYOUT_NAMES[slide.layout]}<span class="caret">▾</span>
        </button>
      {/if}
    </div>
    <div class="pr-work">
      <div class="pr-strip" bind:this={strip} tabindex="0" role="listbox" aria-label="Слайды" onkeydown={stripKey} ondragleave={(e) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && drag && (drag.to = -1)}>
        {#each deck.slides as s, i (s.line + ':' + s.title + ':' + i)}
          <div class="pr-thumb" class:on={i === cur} class:drop-before={drag && drag.to === i && drag.from !== i && drag.from + 1 !== i} class:drop-after={drag && i === deck.slides.length - 1 && drag.to === deck.slides.length && drag.from !== i}
            role="option" aria-selected={i === cur} aria-label="Слайд {i + 1}: {s.title || 'Без названия'}" tabindex="-1" draggable="true"
            onclick={() => present.choose(path, i)} onkeydown={(e) => e.key === 'Enter' && present.choose(path, i)} oncontextmenu={(e) => thumbMenu(e, s)}
            ondragstart={(e) => { drag = { from: i, to: i }; e.dataTransfer?.setData('text/plain', String(i)); }}
            ondragover={(e) => dragOver(e, i)} ondrop={drop} ondragend={() => (drag = null)}>
            <span class="pr-num">{i + 1}</span>
            <div>
              <div class="pr-mini" style:width="150px" use:draw={{ s, deck, width: 150, vars: present.slideVars(), onfit: (v) => (overflow[i] = v) }}></div>
              {#if overflow[i]}<span class="pr-over" style="position:relative;display:inline-block;margin-top:4px;right:auto;bottom:auto">не помещается</span>{/if}
              {#if !s.title}<div class="pr-untitled">Без названия</div>{/if}
            </div>
          </div>
        {/each}
        <button class="pr-add" onclick={() => present.newSlide(path)}>+ Слайд</button>
      </div>
      <div class="pr-stage" role="presentation" bind:clientWidth={stageW} ondragover={dragOverStage} ondrop={dropOnStage}>
        {#if slide}
          <div class="pr-frame" style:width="{slideW}px">
            <div class="pr-holder" class:free={slide.layout === 'free'} role="presentation" bind:this={holderEl} ondblclick={editSlide} use:draw={{ s: slide, deck, width: slideW, vars: present.slideVars() }}></div>
            {#if copying}
              <div class="pr-copying" style:left="{copying.x}%" style:top="{copying.y}%">Копирую…</div>
            {/if}
            {#if slide.layout === 'free' && holderEl}
              <div class="pr-freelayer" style:width="{FIELD[deck.ratio].w * scale}px" style:height="{FIELD[deck.ratio].h * scale}px"><FreeLayer {path} {slide} {deck} holder={holderEl} {scale} onedit={editBlock} /></div>
            {/if}
            {#if editing}
              <div class="pr-editcard" role="dialog" aria-label={editing.block ? 'Текст блока' : 'Текст слайда'} tabindex="-1" onkeydown={editKey}>
                <div class="ed" bind:this={edBox}></div>
                <div class="pr-editfoot"><button class="pr-btn" onclick={() => (editing = null)}>Готово <span class="dim">⎋</span></button></div>
              </div>
            {/if}
          </div>
          <div class="pr-notes" style:width="{slideW}px">
            <div class="pr-notes-h"><b>Заметки докладчика</b><span>подзаголовок «Заметки» — на слайде не виден</span></div>
            {#if notesRef}
              {#key notesKey}<div class="pr-notes-ed" bind:this={notesBox}></div>{/key}
            {:else}
              <textarea class="pr-notes-none" aria-label="Заметки докладчика" placeholder="Нет заметок" rows="3" oninput={startNotes}></textarea>
            {/if}
          </div>
        {:else}
          <div class="pr-empty">В файле нет слайдов: слайд — заголовок первого уровня.<button class="pr-btn" onclick={() => present.newSlide(path)}>+ Слайд</button></div>
        {/if}
      </div>
    </div>
    {#if layoutOpen && slide}
      <div class="pr-pop" role="menu" aria-label="Раскладка" style:left="{pop.x}px" style:top="{pop.y}px">
        {#each LAYOUTS as l (l)}
          {#if l === 'free'}<hr />{/if}
          <button class="pr-lay" class:cur={slide.layout === l} role="menuitemradio" aria-checked={slide.layout === l} onclick={() => pick(l)}>
            <svg width="32" height="20" viewBox="0 0 32 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="0.65" y="0.65" width="30.7" height="18.7" rx="2" /><path d={SCHEME[l]} /></svg>
            {LAYOUT_NAMES[l]}
            {#if slide.layout === l}<span class="chk">✓</span>{/if}
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

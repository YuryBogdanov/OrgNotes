<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { kanban } from './state.svelte';
  import { boardFor, boardOf, headingsWord, titleHtml, type StatusSet } from './board';
  import { openSetup } from './setup';

  // The board of a file (ТЗ 33 §3): the header (the workflow, the filter, what is not on it, «Текст»), the columns of
  // the statuses — the finished ones show the recent cards, the ones after the first folded — and the cards.
  let { path, showText }: { path: string; showText: () => void } = $props();

  const file = $derived(kanban.files.get(path));
  const name = $derived(path.split('/').pop() ?? path);
  const wfName = $derived(file ? boardOf(file.text) : null);
  const set = $derived(file && wfName ? (file.sets.find((s) => s.name === wfName) ?? null) : null);
  let filter = $state('');
  let root: HTMLDivElement | undefined = $state();
  let filterEl: HTMLInputElement | undefined = $state();
  const selected = $derived(kanban.selected?.path === path ? kanban.selected.key : null);
  function select(key: string | null) {
    kanban.selected = key ? { path, key } : null;
  }
  const showOld = $derived(new Set([...kanban.showOld].filter((k) => k.startsWith(path + '\u0000')).map((k) => k.slice(path.length + 1))));
  const board = $derived(file && set ? boardFor(file.text, file.headings, set, { filter, doneDays: kanban.doneDays, showOld }) : null);
  const firstDone = $derived(set?.states.find((s) => s.done)?.name ?? null);
  const textKey = $derived(kanban.ctx.commands.keyOf('kanban.toggle'));

  let choosing = $state(false);
  let had = false; // the file has had «#+BOARD» while shown
  onMount(() => {
    void kanban.read(path).then((f) => {
      // no «#+BOARD» yet: the choice of a workflow first (cancelled — back to the text)
      if (f && !boardOf(f.text)) void choose();
    });
  });
  // «#+BOARD» gone (⌘Z, a hand edit in the other pane): back to the text
  $effect(() => {
    if (!file || choosing) return;
    if (boardOf(file.text)) had = true;
    else if (had) showText();
  });
  async function choose() {
    const f = kanban.files.get(path) ?? (await kanban.read(path));
    if (!f) return;
    choosing = true;
    const s = await openSetup(f, wfName);
    if (s) await kanban.setBoard(path, s.name);
    choosing = false;
    if (!s && !boardOf(f.text)) showText();
  }
  function wfMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    kanban.ctx.ui.menu(
      [
        ...(file?.sets ?? []).map((s: StatusSet) => ({ label: s.name, checked: s.name === wfName, run: () => void kanban.setBoard(path, s.name) })),
        'sep' as const,
        { label: 'Убрать доску', run: () => void kanban.setBoard(path, null).then((ok) => ok && showText()) },
      ],
      { x: r.left, y: r.bottom + 4 },
    );
  }
  function offMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    kanban.ctx.ui.menu(
      (board?.off ?? []).map((o) => ({
        label: (o.keyword ? o.keyword + ' ' : '') + o.title,
        run: () => {
          showText();
          void kanban.ctx.commands.run('file.open', { path, line: o.line });
        },
      })),
      { x: r.right - 280, y: r.bottom + 4 },
    );
  }
  const folded = (kw: string, done: boolean) => kanban.isFolded(path, kw, kw === firstDone, done);
  const toggleOld = (kw: string) => {
    const k = path + '\u0000' + kw;
    if (kanban.showOld.has(k)) kanban.showOld.delete(k);
    else kanban.showOld.add(k);
  };
  const PRIO: Record<string, string> = { A: 'var(--todo)', B: 'var(--wait)', C: 'var(--fg2)' };

  // ---- what the keys and the drops count against: the board as shown ----
  $effect(() => {
    if (board && set) kanban.shown.set(path, { set, columns: board.columns.map((c) => ({ keyword: c.keyword, cards: c.cards.map((k) => ({ key: k.key, line: k.line, title: k.heading })) })) });
  });
  const ask = (a: { kind: 'new' | 'filter' | 'open'; path: string }) => {
    if (a.path !== path) return;
    if (a.kind === 'filter') return void (filterEl?.focus(), filterEl?.select());
    if (a.kind === 'open') {
      const c = kanban.card(path);
      if (c) openPeek(c);
      return;
    }
    const c = kanban.card(path);
    startAdd(c && !set?.states.find((s) => s.name === c.keyword)?.done ? c.keyword : (set?.states.find((s) => !s.done)?.name ?? null));
  };
  onMount(() => {
    kanban.ask = ask;
  });
  onDestroy(() => {
    if (kanban.ask === ask) kanban.ask = null;
    kanban.shown.delete(path);
  });

  // ---- a new card: a field at the bottom of the column; ↩ makes it (the field stays for the next), ⎋ or away — none ----
  let adding = $state<string | null>(null);
  let draft = $state('');
  function startAdd(kw: string | null) {
    if (!kw) return;
    adding = kw;
    draft = '';
    if (folded(kw, false)) kanban.setFolded(path, kw, false);
  }
  async function addKey(e: KeyboardEvent, kw: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const key = await kanban.newCard(path, kw, draft);
      if (key) {
        draft = '';
        select(key);
        // ⌘↩: made and opened at the side
        if (e.metaKey) {
          adding = null;
          const c = kanban.card(path);
          if (c) openPeek(c);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      adding = null;
      draft = '';
      root?.focus({ preventScroll: true });
    }
  }
  const focusField = (el: HTMLInputElement) => el.focus();

  // ---- dragging a card: a tilted copy under the pointer, a dashed place where it goes ----
  type Pending = { key: string; line: number; title: string; kw: string; sx: number; sy: number; ox: number; oy: number; w: number; h: number; html: string; tags: string };
  let pending: Pending | null = null;
  type Over = { kw: string; index: number } | { zone: 'archive' | 'delete' };
  // the zones: 20 from the sides, 16 from the bottom of the board, while a card is dragged
  let zones = $state({ left: 0, width: 0, top: 0 });
  let drag = $state<(Pending & { x: number; y: number; over: Over | null }) | null>(null);
  const overCol = (o: Over | null | undefined) => (o && 'kw' in o ? o : null);
  const overZone = (o: Over | null | undefined) => (o && 'zone' in o ? o.zone : null);
  function down(e: PointerEvent, k: { key: string; line: number; title: string; heading: string; tags: string[] }, kw: string) {
    if (e.button !== 0) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pending = { key: k.key, line: k.line, title: k.heading, kw, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height, html: titleHtml(k.title), tags: k.tags.length ? `:${k.tags.join(':')}:` : '' };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }
  function targetAt(x: number, y: number, key: string): Over | null {
    const under = document.elementsFromPoint(x, y) as HTMLElement[];
    const zone = under.find((el) => el.dataset?.zone)?.dataset.zone;
    if (zone === 'archive' || zone === 'delete') return { zone };
    const colEl = under.find((el) => el.dataset?.col);
    if (!colEl) return null;
    const cards = [...colEl.querySelectorAll<HTMLElement>('.kb-card')].filter((el) => el.dataset.key !== key);
    let index = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        index = i;
        break;
      }
    }
    return { kw: colEl.dataset.col!, index };
  }
  function move(e: PointerEvent) {
    const p = pending;
    if (!p) return;
    if (!drag && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 4) return;
    if (!drag && root) {
      const r = root.getBoundingClientRect();
      zones = { left: r.left + 20, width: r.width - 40, top: r.bottom - 16 - 60 };
    }
    drag = { ...p, x: e.clientX, y: e.clientY, over: targetAt(e.clientX, e.clientY, p.key) };
  }
  function up() {
    window.removeEventListener('pointermove', move);
    const p = pending;
    const d = drag;
    pending = null;
    drag = null;
    if (!p) return;
    if (!d) {
      select(p.key); // a click: chosen and opened at the side
      openPeek({ line: p.line, title: p.title });
      return;
    }
    select(p.key);
    const card = { key: p.key, line: p.line, title: p.title, keyword: p.kw };
    const col = overCol(d.over);
    const zone = overZone(d.over);
    if (zone === 'delete') void kanban.removeCard(path, card);
    else if (zone === 'archive') void kanban.archiveCard(path, card);
    else if (col) void kanban.moveCard(path, card, col.kw, col.index);
  }
  onDestroy(() => window.removeEventListener('pointermove', move));
  /** A column's rows while a card is dragged over it: the cards, and the place where it would go. */
  function rowsOf(c: { keyword: string; cards: { key: string }[] }) {
    const o = overCol(drag?.over);
    const ph = o?.kw === c.keyword ? o.index : -1;
    const out: ({ ph: true } | { ph: false; i: number })[] = [];
    let n = 0;
    c.cards.forEach((k, i) => {
      if (k.key !== drag?.key) {
        if (n === ph) out.push({ ph: true });
        n++;
      }
      out.push({ ph: false, i });
    });
    if (ph >= n) out.push({ ph: true });
    return out;
  }

  // ---- the card at the side: its subtree in an editor, edited right there ----
  // the card opened (what the editor is made for) and where its heading is now (the editor says, as it is edited)
  let opened = $state<{ line: number; title: string; n: number } | null>(null);
  let peek = $state<{ line: number; title: string } | null>(null);
  let peekEl: HTMLDivElement | undefined = $state();
  let peekN = 0;
  function openPeek(c: { line: number; title: string }) {
    opened = { line: c.line, title: c.title, n: ++peekN };
    peek = { line: c.line, title: c.title };
  }
  function closePeek() {
    opened = null;
    peek = null;
    root?.focus({ preventScroll: true });
  }
  $effect(() => {
    const el = peekEl;
    const at = opened;
    if (!el || !at) return;
    const ed = untrack(() => kanban.ctx.ui.editor(el, { path, line: at.line, title: at.title }, { onRef: (r) => (peek = { line: r.line, title: r.title }) }));
    queueMicrotask(() => ed.focus());
    return () => ed.dispose();
  });
  const peekHeading = $derived(peek && file ? (file.headings.find((h) => h.line === peek!.line && h.title === peek!.title) ?? file.headings.find((h) => h.title === peek!.title)) : undefined);
  function peekStatus(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const h = peekHeading;
    if (!h || !set) return;
    kanban.ctx.ui.menu(set.states.map((s) => ({ label: s.name, checked: s.name === h.keyword, run: () => void kanban.setStatus(path, h, s.name) })), { x: r.left, y: r.bottom + 4 });
  }
  function inFile() {
    const h = peekHeading;
    if (!h) return;
    showText();
    void kanban.ctx.commands.run('file.open', { path, line: h.line });
  }
  function peekKeys(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePeek();
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      inFile();
    }
  }

  // ---- the keys of the board itself: ← → ↑ ↓ choose a card, ⎋ lets it go (the rest are the plugin's commands) ----
  function keys(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, textarea') || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || !board) return;
    const cols = board.columns.filter((c) => !folded(c.keyword, c.done) && c.cards.length);
    if (e.key === 'Escape' && selected) {
      e.preventDefault();
      select(null);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) || !cols.length) return;
    e.preventDefault();
    let ci = cols.findIndex((c) => c.cards.some((k) => k.key === selected));
    if (ci < 0) {
      select(cols[0].cards[0].key);
      return;
    }
    let ki = cols[ci].cards.findIndex((k) => k.key === selected);
    if (e.key === 'ArrowUp') ki = Math.max(0, ki - 1);
    else if (e.key === 'ArrowDown') ki = Math.min(cols[ci].cards.length - 1, ki + 1);
    else {
      ci = Math.max(0, Math.min(cols.length - 1, ci + (e.key === 'ArrowLeft' ? -1 : 1)));
      ki = Math.min(ki, cols[ci].cards.length - 1);
    }
    select(cols[ci].cards[ki].key);
    queueMicrotask(() => root?.querySelector('.kb-card.sel')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="kanban" class:dragging={!!drag} tabindex="0" bind:this={root} onkeydown={keys} role="application" aria-label="Доска {name}">
  <div class="kb-head">
    <span class="kb-name">{name}</span>
    {#if file && wfName}
      <button class="kb-hb" title="Сменить workflow" onclick={wfMenu}><span class="kb-dim">Workflow:</span><b>{wfName}</b>
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="var(--fg3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5l4 4 4-4" /></svg></button>
    {/if}
    {#if board}
      <label class="kb-filter">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
        <input bind:this={filterEl} bind:value={filter} onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); filter = ''; root?.focus({ preventScroll: true }); } }} placeholder="Фильтр: текст, :тег:" aria-label="Фильтр карточек" spellcheck="false" autocomplete="off" />
      </label>
    {/if}
    <span class="kb-gap"></span>
    {#if board?.off.length}
      <button class="kb-off" title="Заголовки 1-го уровня без статуса или со статусом из другого workflow" onclick={offMenu}>Не на доске: {headingsWord(board.off.length)} ›</button>
    {/if}
    <button class="kb-hb" title="Вернуться к тексту файла" onclick={showText}>
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 5h12M4 9h12M4 13h8" /></svg>Текст{#if textKey}<span class="kb-dim kb-k">{textKey}</span>{/if}
    </button>
  </div>

  {#if file && wfName && !set}
    <div class="kb-missing" role="status">
      <b>Workflow «{wfName}» не найден в настройках статусов</b>
      <div class="kb-mb">
        <button class="kb-btn pri" onclick={choose}>Выбрать workflow</button>
        <button class="kb-btn" onclick={() => void kanban.ctx.commands.run('settings.open', { section: 'Статусы' })}>Открыть настройки статусов</button>
      </div>
    </div>
  {:else if board}
    <div class="kb-cols" role="list" aria-label="Колонки">
      {#each board.columns as c (c.keyword)}
        {@const tone = kanban.tone(c.keyword, path)}
        {#if folded(c.keyword, c.done)}
          <button class="kb-col folded" class:over={overCol(drag?.over)?.kw === c.keyword} role="listitem" aria-label="{c.keyword}: {c.total}, свёрнута" title="Развернуть" data-col={c.keyword} onclick={() => kanban.setFolded(path, c.keyword, false)}>
            <span class="kb-n">{c.total}</span><span class="kb-kw v" style:--c={tone}>{c.keyword}</span>
          </button>
        {:else}
          <section class="kb-col" role="listitem" aria-label={c.keyword} data-col={c.keyword}>
            <div class="kb-chw">
              <button class="kb-ch" title="Свернуть" onclick={() => kanban.setFolded(path, c.keyword, true)}>
                <span class="kb-kw" style:--c={tone}>{c.keyword}</span>
                <span class="kb-n">{filter.trim() ? `${c.matched} из ${c.total}` : c.total}</span>
                {#if c.done && kanban.doneDays}<span class="kb-note">за {kanban.doneDays} дней</span>{/if}
              </button>
              {#if !c.done}<button class="kb-plus" aria-label="Добавить карточку в {c.keyword}" title="Добавить карточку" onclick={() => startAdd(c.keyword)}>+</button>{/if}
            </div>
            <div class="kb-cards">
              {#each rowsOf(c) as row (row.ph ? 'ph' : c.cards[row.i].key)}
                {#if row.ph}
                  <div class="kb-ph" style:height="{drag?.h ?? 58}px" aria-hidden="true"></div>
                {:else}
                {@const k = c.cards[row.i]}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="kb-card" class:done={k.done} class:sel={selected === k.key} class:ghost={drag?.key === k.key} role="button" tabindex="-1" aria-label={k.title} data-line={k.line} data-key={k.key}
                  onpointerdown={(e) => down(e, k, c.keyword)}>
                  <div class="kb-t">{@html titleHtml(k.title)}</div>
                  {#if k.priority || k.date || k.progress || k.tags.length}
                    <div class="kb-meta">
                      {#if k.priority}<span class="kb-pr" style:--c={PRIO[k.priority] ?? 'var(--fg2)'}>#{k.priority}</span>{/if}
                      {#if k.date}<span class="kb-date" class:late={k.date.late}><svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 4h14v13H3zM3 8h14" /></svg>{k.date.text}</span>{/if}
                      {#if k.progress}<span class="kb-prog"><svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 10l4 4 8-8" /></svg>{k.progress}</span>{/if}
                      {#if k.tags.length}<span class="kb-tags">:{k.tags.join(':')}:</span>{/if}
                    </div>
                  {/if}
                </div>
                {/if}
              {/each}
              {#if adding === c.keyword}
                <input class="kb-new" use:focusField bind:value={draft} placeholder="Название карточки" aria-label="Новая карточка в {c.keyword}" spellcheck="false" autocomplete="off"
                  onkeydown={(e) => void addKey(e, c.keyword)} onblur={() => { adding = null; draft = ''; }} />
              {:else if !c.done}
                <button class="kb-add" onclick={() => startAdd(c.keyword)}>+ Карточка</button>
              {/if}
              {#if c.older}
                <button class="kb-more" onclick={() => toggleOld(c.keyword)}>Ещё {c.older} {c.older % 10 === 1 && c.older % 100 !== 11 ? 'старая' : 'старых'} ›</button>
              {:else if showOld.has(c.keyword)}
                <button class="kb-more" onclick={() => toggleOld(c.keyword)}>Только за {kanban.doneDays} дней</button>
              {/if}
            </div>
          </section>
        {/if}
      {/each}
    </div>
  {:else}
    <div class="kb-stage"></div>
  {/if}
  {#if opened && peek}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="kb-peek" role="dialog" aria-label="Карточка" tabindex="-1" onkeydown={peekKeys}>
      <div class="kb-ph2">
        {#if peekHeading?.keyword}<button class="kb-kw kb-pk" style:--c={kanban.tone(peekHeading.keyword, path)} title="Сменить статус" onclick={peekStatus}>{peekHeading.keyword} ▾</button>{/if}
        <span class="kb-pt">{(peekHeading?.title ?? peek.title).replace(/\s*\[(\d+%|\d+\/\d+)\]/, '')}</span>
        <button class="kb-pl" onclick={inFile}>В файле ›</button>
        <button class="kb-px" aria-label="Закрыть" title="Закрыть" onclick={closePeek}>×</button>
      </div>
      <div class="kb-pb" bind:this={peekEl}></div>
      <div class="kb-pf">Редактируется прямо здесь · ⎋ закрыть · ⌘↩ открыть в файле</div>
    </div>
  {/if}
</div>
{#if drag}
  <div class="kb-zones" aria-hidden="true" style:left="{zones.left}px" style:top="{zones.top}px" style:width="{zones.width}px">
    <div class="kb-zone arch" class:on={overZone(drag.over) === 'archive'} data-zone="archive">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h14v4H3zM4.5 8v8h11V8M8 11h4" /></svg>
      {#if overZone(drag.over) === 'archive'}Отпустите — карточка уйдёт в архив{:else}В архив<span class="kb-zw">{kanban.archiveOf(path).split('/').pop()}</span>{/if}
    </div>
    <div class="kb-zone del" class:on={overZone(drag.over) === 'delete'} data-zone="delete">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M5.5 6l1 10.5h7l1-10.5" /></svg>
      {#if overZone(drag.over) === 'delete'}Отпустите — карточка и её содержимое удалятся из файла{:else}Удалить{/if}
    </div>
  </div>
  <div class="kb-drag" style:left="{drag.x - drag.ox}px" style:top="{drag.y - drag.oy}px" style:width="{drag.w}px" aria-hidden="true">
    <div class="kb-t">{@html drag.html}</div>
    {#if drag.tags}<div class="kb-meta"><span class="kb-tags">{drag.tags}</span></div>{/if}
  </div>
{/if}

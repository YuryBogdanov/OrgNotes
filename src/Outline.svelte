<script lang="ts">
  import { draggedHeading, setDragged } from './dragData';
  import { SvelteSet } from 'svelte/reactivity';
  import { store } from './store.svelte';
  import { subtreeProgress, toneFor } from './org';
  import { toneStyle } from './colors';
  import { displayName } from './names';

  // The inspector's «Структура»: the headings of the active editor's file as a tree. A click or ↑/↓ moves the
  // caret there (the focus stays here), Return or a double click goes into the editor.
  const f = $derived(store.file);
  let filter = $state('');
  let tasksOnly = $state(false);
  const collapsed = new SvelteSet<string>(); // path#line of folded branches

  const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
  type Row = { i: number; level: number; title: string; kw: string | null; tone: string; done: boolean; kids: boolean; open: boolean; cnt: string; hit: [number, number] | null };

  const rows = $derived.by((): Row[] => {
    if (!f) return [];
    const hs = f.headings;
    const q = norm(filter.trim());
    const searching = !!q || tasksOnly;
    // a heading stays when it matches, and so do the headings above it
    const keep = new Set<number>();
    if (searching) {
      hs.forEach((h, i) => {
        if ((q && !norm(h.title).includes(q)) || (tasksOnly && !h.keyword)) return;
        for (let p = i; p >= 0 && !keep.has(p); p = hs[p].parent) keep.add(p);
      });
    }
    const out: Row[] = [];
    let hiddenUntil = -1;
    hs.forEach((h, i) => {
      if (searching ? !keep.has(i) : h.line < hiddenUntil) return;
      const kids = hs[i + 1]?.parent === i;
      const key = f.path + '#' + h.line;
      const open = !kids || searching || !collapsed.has(key); // a filter shows every match
      if (!open) hiddenUntil = h.end;
      const p = kids && !open ? subtreeProgress(hs, i, f.wf) : { done: 0, total: 0 };
      const at = q ? norm(h.title).indexOf(q) : -1;
      out.push({
        i, level: h.level, title: h.title, kw: h.keyword, tone: h.keyword ? toneStyle(toneFor(h.keyword, f.wf)) : '',
        done: !!h.keyword && f.wf.done.includes(h.keyword), kids, open,
        cnt: p.total ? `${p.done}/${p.total}` : '', hit: at >= 0 ? [at, at + q.length] : null,
      });
    });
    return out;
  });

  const current = $derived(store.selected); // the heading the caret is in
  let cursor = $state(-1); // the row ↑/↓ are on (a heading index)
  $effect(() => {
    cursor = current;
  });

  let list: HTMLDivElement | undefined = $state();
  // the current heading stays in view as the caret moves
  $effect(() => {
    const i = current;
    if (i < 0 || !list) return;
    queueMicrotask(() => list?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }));
  });

  function go(i: number, focus: boolean) {
    const h = f?.headings[i];
    if (!h) return;
    cursor = i;
    store.revealLine(h.line, focus);
  }
  function fold(r: Row) {
    const key = f!.path + '#' + f!.headings[r.i].line;
    collapsed.has(key) ? collapsed.delete(key) : collapsed.add(key);
  }
  function key(e: KeyboardEvent) {
    const k = rows.findIndex((r) => r.i === cursor);
    const r = rows[k];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = rows[Math.max(0, Math.min(rows.length - 1, k < 0 ? 0 : k + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) go(next.i, false); // a preview: the editor follows, the keyboard stays here
    } else if (e.key === 'Enter' && r) {
      e.preventDefault();
      go(r.i, true);
    } else if (e.key === 'ArrowRight' && r?.kids && !r.open) {
      e.preventDefault();
      fold(r);
    } else if (e.key === 'ArrowLeft' && r?.kids && r.open && !filter && !tasksOnly) {
      e.preventDefault();
      fold(r);
    }
  }
</script>

{#if !f}
  <div class="empty">Откройте файл, чтобы увидеть структуру</div>
{:else}
  <div class="outline">
    <div class="cap">СТРУКТУРА · {displayName(f.name)}</div>
    <label class="filter">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 5h14M6 10h8M9 15h2" /></svg>
      <input bind:value={filter} placeholder="Фильтр заголовков" aria-label="Фильтр заголовков" spellcheck="false" autocomplete="off"
        onkeydown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); list?.focus(); key(e); } else if (e.key === 'Escape') filter = ''; }} />
    </label>
    <div class="seg" role="radiogroup" aria-label="Что показывать">
      <button role="radio" aria-checked={!tasksOnly} class:on={!tasksOnly} onclick={() => (tasksOnly = false)}>Все</button>
      <button role="radio" aria-checked={tasksOnly} class:on={tasksOnly} onclick={() => (tasksOnly = true)}>Только задачи</button>
    </div>
    {#if !f.headings.length}
      <div class="empty">В файле нет заголовков</div>
    {:else if !rows.length}
      <div class="empty">Ничего не найдено</div>
    {:else}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="tree" role="tree" aria-label="Структура файла" tabindex="0" bind:this={list} onkeydown={key}
        aria-activedescendant={cursor >= 0 ? 'ol-' + cursor : undefined}>
        {#each rows as r (r.i)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="row" id={'ol-' + r.i} data-i={r.i} role="treeitem" aria-selected={r.i === current} aria-expanded={r.kids ? r.open : undefined}
            aria-level={r.level} class:cur={r.i === current} class:kb={r.i === cursor && r.i !== current} class:dim={r.done}
            style="padding-left:{6 + (r.level - 1) * 14}px" onclick={() => go(r.i, false)} ondblclick={() => go(r.i, true)}
            draggable="true" ondragstart={(e) => { const d = f && f.headings[r.i] ? draggedHeading(f.path, f.headings[r.i].line) : null; if (d) setDragged(e.dataTransfer, d); }}>
            <button class="chev" class:hide={!r.kids} tabindex="-1" aria-label="Свернуть или развернуть" onclick={(e) => { e.stopPropagation(); fold(r); }}>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate({r.open ? 90 : 0}deg)"><path d="M4 2l4 4-4 4" /></svg>
            </button>
            {#if r.kw}<span class="kw tone-chip" style={r.tone}>{r.kw}</span>{/if}
            <span class="t" class:top={r.level === 1}>{#if r.hit}{r.title.slice(0, r.hit[0])}<mark>{r.title.slice(r.hit[0], r.hit[1])}</mark>{r.title.slice(r.hit[1])}{:else}{r.title}{/if}</span>
            {#if r.cnt}<span class="cnt">{r.cnt}</span>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .outline { display: flex; flex-direction: column; gap: 10px; flex: 1 1 auto; min-height: 0; }
  .cap { font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .filter { height: 26px; display: flex; align-items: center; gap: 7px; padding: 0 9px; background: var(--field); border-radius: 6px; color: var(--fg2); }
  .filter input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--fg); font-size: 12px; padding: 0; -webkit-user-select: text; user-select: text; }
  .filter input::placeholder { color: var(--fg2); }
  .filter:focus-within { box-shadow: 0 0 0 2px var(--acc); }
  .seg { display: flex; padding: 2px; background: var(--field); border-radius: 7px; gap: 2px; }
  .seg button { flex: 1; height: 22px; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 12px; }
  .seg button.on { background: var(--segon); box-shadow: var(--shadow); color: var(--fg); font-weight: 600; }
  .tree { display: flex; flex-direction: column; gap: 1px; outline: none; overflow: auto; min-height: 0; }
  .row { display: flex; align-items: center; gap: 6px; flex: 0 0 26px; height: 26px; padding-right: 8px; border-radius: 6px; cursor: default; }
  .row.cur { background: var(--sel); }
  .tree:focus-visible .row.kb, .tree:focus .row.kb { box-shadow: inset 0 0 0 1.5px var(--acc); }
  .tree:focus-visible .row.cur { box-shadow: inset 0 0 0 1.5px var(--acc); }
  .chev { flex: 0 0 10px; width: 10px; height: 14px; padding: 0; border: 0; background: transparent; color: var(--fg3); display: flex; align-items: center; justify-content: center; }
  .chev.hide { visibility: hidden; }
  .kw { flex: 0 0 auto; min-width: 34px; text-align: center; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; }
  .t { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12.5px; }
  .t.top { font-weight: 600; }
  .row.dim .t { color: var(--fg3); }
  mark { background: color-mix(in srgb, var(--acc) 28%, transparent); color: inherit; border-radius: 2px; }
  .cnt { flex: 0 0 auto; font-size: 11px; color: var(--fg3); }
  .empty { color: var(--fg2); font-size: 12px; line-height: 1.5; padding-top: 6px; }
</style>

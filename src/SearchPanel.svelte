<script lang="ts">
  import { draggedHeading, setDragged } from './dragData';
  import { tick } from 'svelte';
  import { store } from './store.svelte';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import { displayName, displayPath } from './names';
  import { summary, type Scope } from './search';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';

  // The navigator in «Поиск» (⇧⌘F, ⌃⌘6): a query in every file, run by ↩; the results by file, with the heading path,
  // the line and the piece around the match. A result opens its file at the match with the pane's find bar.
  const s = $derived(store.search);
  const SHOWN = 4; // results of a group before «Ещё N»
  let input: HTMLInputElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();
  $effect(() => {
    void s.focusN;
    void tick().then(() => {
      input?.focus();
      input?.select();
    });
  });
  const SCOPES: { id: Scope; t: string }[] = [
    { id: 'all', t: 'Везде' },
    { id: 'headings', t: 'Заголовки' },
    { id: 'text', t: 'Текст' },
  ];
  const fileOf = (path: string) => store.files.find((f) => f.path === path);
  const changed = (path: string, stamp: string) => fileOf(path)?.text !== stamp;
  const where = (rel: string) => displayPath(rel).slice(0, -1).join(' › ') || 'корень';
  /** The rows of the list, in order: what ↑↓ walk over. */
  const flat = $derived(s.groups.flatMap((g, gi) => (g.open ? g.hits.slice(0, g.all ? g.hits.length : SHOWN).map((_, i) => ({ g: gi, i })) : [])));
  const isSel = (g: number, i: number) => s.sel?.g === g && s.sel?.i === i;
  /** «Ещё N», or «Ещё N в „План найма на Q4“» when they are all under one heading. */
  function more(gi: number) {
    const g = s.groups[gi];
    const rest = g.hits.slice(SHOWN);
    const under = new Set(rest.map((h) => h.under));
    const f = fileOf(g.path);
    if (under.size === 1 && f) {
      const u = [...under][0];
      const h = u !== null && u !== undefined ? f.headings[u] : undefined;
      if (h) return `Ещё ${rest.length} в «${h.title}»`;
    }
    return `Ещё ${rest.length}`;
  }
  async function pick(g: number, i: number) {
    store.openHit(g, i);
  }
  async function scrollSel() {
    await tick();
    list?.querySelector('.hit.sel')?.scrollIntoView({ block: 'nearest' });
  }
  function fieldKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void store.runSearch();
    } else if (e.key === 'ArrowDown' && flat.length) {
      e.preventDefault();
      s.sel = s.sel ?? flat[0];
      list?.focus();
      void scrollSel();
    } else if (e.key === 'Escape' && s.q) {
      e.preventDefault();
      s.q = '';
    }
  }
  function listKey(e: KeyboardEvent) {
    const at = s.sel ? flat.findIndex((x) => x.g === s.sel!.g && x.i === s.sel!.i) : -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.key === 'ArrowUp' && at <= 0) return input?.focus();
      const n = flat[Math.min(flat.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) s.sel = n;
      void scrollSel();
    } else if (e.key === 'Enter' && s.sel) {
      e.preventDefault();
      void pick(s.sel.g, s.sel.i);
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && s.sel) {
      e.preventDefault();
      const g = s.groups[s.sel.g];
      g.open = e.key === 'ArrowRight';
    }
  }
  const allOpen = $derived(s.groups.length > 0 && s.groups.every((g) => g.open));
  const toggleAll = () => s.groups.forEach((g) => (g.open = !allOpen));

  // ---- the recent queries -------------------------------------------------------------------------------------
  const recent = $derived.by(() => {
    void s.focusN;
    void s.ran;
    return store.searchRecent();
  });
  const ago = (t: number) => {
    const min = Math.floor((Date.now() - t) / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} мин`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} ч`;
    return `${Math.floor(h / 24)} дн`;
  };
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
</script>

<div class="search">
  <div class="top">
    <div class="fld">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
      <input bind:this={input} bind:value={s.q} onkeydown={fieldKey} placeholder="Поиск по всем файлам" aria-label="Поиск по всем файлам" spellcheck="false" autocomplete="off" />
      {#if s.q && s.q.trim() !== s.ran}<span class="enter">↩ искать</span>{/if}
      {#if s.q}<button class="clr" aria-label="Очистить" onclick={() => { s.q = ''; input?.focus(); }}><svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" /></svg></button>{/if}
    </div>
    <div class="opts">
      <div class="seg" role="group" aria-label="Где искать">
        {#each SCOPES as sc (sc.id)}<button aria-pressed={s.scope === sc.id} class:on={s.scope === sc.id} onclick={() => (s.scope = sc.id)}>{sc.t}</button>{/each}
      </div>
      <button class="tg" title="Учитывать регистр" aria-pressed={store.findCase} class:on={store.findCase} onclick={() => store.setFindOpts({ cs: !store.findCase })}>Aa</button>
      <button class="tg" title="Слово целиком" aria-pressed={store.findWord} class:on={store.findWord} onclick={() => store.setFindOpts({ word: !store.findWord })}>Слово</button>
    </div>
  </div>

  {#if s.ran}
    <div class="res">
      <div class="sum">
        <span>
          {#if s.running}Ищу… {s.scanned} {s.scanned === 1 ? 'файл' : 'файлов'}{:else if !s.total}Ничего не найдено{:else}{summary(s.total, s.groups.length)}{/if}
          {#if s.capped}<span class="cap"> · показаны первые 1000, уточните запрос</span>{/if}
        </span>
        {#if s.groups.length}<button onclick={toggleAll}>{allOpen ? 'Свернуть все' : 'Развернуть все'}</button>{/if}
      </div>
      {#if !s.running && !s.total}
        <div class="nothing">Проверьте «Aa», «Слово» и где искать: «Везде», «Заголовки» или «Текст».</div>
      {/if}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="list" bind:this={list} role="listbox" tabindex="0" aria-label="Результаты поиска" onkeydown={listKey}>
        {#each s.groups as g, gi (g.path)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="file" onclick={() => (g.open = !g.open)}>
            <svg class="chev" class:open={g.open} width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2l4 4-4 4" /></svg>
            <svg class="fi" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
            <span class="fn">{displayName(g.name)}</span>
            <span class="fp">{changed(g.path, g.stamp) ? 'изменён — ↩ обновить' : where(g.name)}</span>
            <span class="fc">{g.hits.length}</span>
          </div>
          {#if g.open}
            {#each g.all ? g.hits : g.hits.slice(0, SHOWN) as h, i (i)}
              {@const f = fileOf(g.path)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="hit" class:sel={isSel(gi, i)} role="option" tabindex="-1" aria-selected={isSel(gi, i)} onclick={() => pick(gi, i)}
                draggable="true" ondragstart={(e) => { const under = h.under !== null ? f?.headings[h.under] : undefined; const d = under ? draggedHeading(g.path, under.line) : null; setDragged(e.dataTransfer, d ?? { kind: 'file', path: f?.name ?? g.name }); }}>
                <div class="w">
                  {#if h.heading}<svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h8M6 9h8M9 13.5h8" /></svg>{/if}
                  <span class="wp">{h.where}</span><span class="ln">стр. {h.line + 1}</span>
                </div>
                <div class="frag" class:hd={h.heading}>
                  {#if h.keyword && f}<span class="kw tone-chip" style={toneStyle(toneFor(h.keyword, f.wf))}>{h.keyword}</span>{' '}{/if}{h.pre}<mark>{h.match}</mark>{h.post}
                </div>
              </div>
            {/each}
            {#if !g.all && g.hits.length > SHOWN}
              <button class="more" onclick={() => (g.all = true)}>{more(gi)}</button>
            {/if}
          {/if}
        {/each}
      </div>
      <div class="foot">↑↓ — по результатам · ↩ — открыть · ⌘G / ⇧⌘G — следующее / предыдущее в редакторе</div>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="recent" oncontextmenu={(e) => { e.preventDefault(); menu = { x: e.clientX, y: e.clientY, items: [{ label: 'Очистить историю', action: () => store.clearSearchRecent() }] }; }}>
      {#if recent.length}<div class="rh">НЕДАВНИЕ ЗАПРОСЫ</div>{/if}
      {#each recent as r (r.q)}
        <button class="rq" onclick={() => { s.q = r.q; void store.runSearch(); }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 1.5" /></svg>
          <span class="rt">{r.q}</span><span class="ra">{ago(r.t)}</span>
        </button>
      {/each}
      <div class="hint">Наберите текст и нажмите ↩ — поиск по всем файлам рабочей папки. Поиск в текущем файле — ⌘F.</div>
    </div>
  {/if}
</div>
{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}

<style>
  .search { flex: 1; min-height: 0; display: flex; flex-direction: column; font-size: 13px; }
  .top { flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; padding: 10px; }
  .fld { display: flex; align-items: center; gap: 7px; height: 30px; box-sizing: border-box; padding: 0 8px; background: var(--bg); border: 1.5px solid var(--line); border-radius: 7px; color: var(--fg2); }
  .fld:focus-within { border-color: var(--acc); }
  .fld input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--fg); font-size: 13px; padding: 0; -webkit-user-select: text; user-select: text; }
  .enter { font-size: 11px; color: var(--fg3); white-space: nowrap; }
  .clr { width: 18px; height: 18px; border: 0; border-radius: 9px; background: var(--field); color: var(--fg2); padding: 0; display: flex; align-items: center; justify-content: center; }
  .opts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .seg { display: flex; padding: 2px; background: var(--field); border-radius: 6px; gap: 2px; }
  .seg button { height: 20px; padding: 0 8px; border: 0; border-radius: 4px; background: transparent; color: var(--fg2); font-size: 11.5px; }
  .seg button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); }
  .tg { height: 22px; min-width: 26px; padding: 0 6px; border: 1px solid var(--line); border-radius: 5px; background: transparent; color: var(--fg2); font-size: 11.5px; font-weight: 600; }
  .tg:first-of-type { margin-left: auto; }
  .tg.on { background: color-mix(in srgb, var(--acc) 16%, transparent); border-color: var(--acc); color: var(--acc); }
  .res { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; border-top: 1px solid var(--line); }
  .sum { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 0 12px; font-size: 11.5px; color: var(--fg2); }
  .sum > span { flex: 1; }
  .sum button { height: 20px; padding: 0 6px; border: 0; border-radius: 4px; background: transparent; color: var(--fg2); font-size: 11.5px; }
  .cap { color: var(--wait); }
  .nothing { padding: 4px 12px; font-size: 12px; color: var(--fg2); line-height: 1.45; }
  .list { flex: 1 1 0; min-height: 0; overflow: auto; padding: 0 6px 8px; display: flex; flex-direction: column; outline: none; }
  .file { display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 6px; margin-top: 4px; border-radius: 6px; cursor: default; }
  .chev { flex: 0 0 10px; color: var(--fg3); }
  .chev.open { transform: rotate(90deg); }
  .fi { flex: 0 0 14px; color: var(--acc); }
  .fn { font-weight: 600; }
  .fp { flex: 1; min-width: 0; font-size: 11.5px; color: var(--fg3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fc { flex: 0 0 auto; min-width: 18px; height: 17px; padding: 0 5px; border-radius: 9px; background: var(--field); color: var(--fg2); font-size: 11px; text-align: center; line-height: 17px; }
  .hit { display: flex; flex-direction: column; gap: 2px; padding: 5px 8px 6px 28px; border-radius: 6px; cursor: default; }
  .hit:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
  .hit.sel { background: var(--sel); box-shadow: inset 0 0 0 1px var(--acc); }
  .w { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--fg3); min-width: 0; }
  .wp { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ln { flex: 0 0 auto; }
  .frag { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12.5px; }
  .frag.hd { font-weight: 600; }
  .frag mark { background: var(--hl); color: var(--fg); border-radius: 3px; padding: 0 1px; }
  .kw { padding: 0 4px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .more { align-self: flex-start; border: 0; background: none; padding: 3px 8px 4px 28px; font-size: 11.5px; color: var(--acc); }
  .foot { flex: 0 0 auto; padding: 8px 12px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); line-height: 1.45; }
  .recent { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; border-top: 1px solid var(--line); padding: 8px 6px; }
  .rh { height: 26px; display: flex; align-items: center; padding: 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.05em; color: var(--fg3); }
  .rq { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--fg); text-align: left; font-size: 13px; }
  .rq:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
  .rq svg { color: var(--fg3); }
  .rt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ra { font-size: 11px; color: var(--fg3); }
  .hint { margin: auto 8px 4px; font-size: 11.5px; color: var(--fg2); line-height: 1.5; }
</style>

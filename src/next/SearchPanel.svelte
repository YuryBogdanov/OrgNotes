<script lang="ts">
  import { tick } from 'svelte';
  import { store } from '../store.svelte';
  import { draggedHeading, setDragged } from '../dragData';
  import { toneFor } from '../org';
  import { toneStyle } from '../colors';
  import { displayName } from '../names';
  import { summary } from '../search';
  import { openSearchTab } from './searchTabState.svelte';

  // «Поиск» of the new sidebar (ТЗ 43 §2.4, ТЗ 21, ⇧⌘F): the field on top, «Aa», «.*» and «только заголовки» under it;
  // ↩ runs it in every file. The results by file (ТЗ 50 §5): a file's row of 24 pt — the chevron, its icon, its name,
  // how many; a result one line of 24 pt — a heading's capsule and title, or the line of text, the match on
  // `lampsoft` bold, the heading it is under in its tip. ↑↓ over the files' rows and the open ones' results, ↩ opens
  // (a file's row folds it), → ← on a file's row unfold and fold it; ⌥⌘G / ⌥⇧⌘G the next and the previous from the
  // window. Empty: the recent queries.
  const s = $derived(store.search);
  const SHOWN = 4; // results of a file before «Ещё N»
  let input: HTMLInputElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();
  $effect(() => {
    void s.focusN;
    void tick().then(() => {
      input?.focus();
      input?.select();
    });
  });
  const fileOf = (path: string) => store.files.find((f) => f.path === path);
  // the rows the keys go over: each file's (i -1), its results when it is open
  const flat = $derived(s.groups.flatMap((g, gi) => [{ g: gi, i: -1 }, ...(g.open ? g.hits.slice(0, g.all ? g.hits.length : SHOWN).map((_, i) => ({ g: gi, i })) : [])]));
  const isSel = (g: number, i: number) => s.sel?.g === g && s.sel?.i === i;
  const headsOnly = $derived(s.scope === 'headings');
  async function scrollSel() {
    await tick();
    list?.querySelector('.hit.sel, .file.sel')?.scrollIntoView({ block: 'nearest' });
  }
  function fieldKey(e: KeyboardEvent) {
    // ⌘↩: the results in a tab of their own (ТЗ 53 §1)
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      openSearchTab();
    } else if (e.key === 'Enter') {
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
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      openSearchTab();
    } else if (e.key === 'Enter' && s.sel) {
      e.preventDefault();
      if (s.sel.i < 0) s.groups[s.sel.g].open = !s.groups[s.sel.g].open;
      else store.openHit(s.sel.g, s.sel.i);
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && s.sel) {
      e.preventDefault();
      s.groups[s.sel.g].open = e.key === 'ArrowRight';
      // folded from one of its results: the file's row chosen
      if (e.key === 'ArrowLeft') s.sel = { g: s.sel.g, i: -1 };
    }
  }
  /** The options change what is found: run again what is shown. */
  const rerun = () => s.ran && void store.runSearch();
  const recent = $derived.by(() => {
    void s.focusN;
    void s.ran;
    return store.searchRecent();
  });
</script>

<div class="sp">
  <div class="top">
    <div class="fld">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></svg>
      <input bind:this={input} bind:value={s.q} onkeydown={fieldKey} placeholder="Поиск по всем файлам" aria-label="Поиск по всем файлам" spellcheck="false" autocomplete="off" />
      {#if s.q && s.q.trim() !== s.ran}<span class="enter">↩</span>{/if}
    </div>
    <div class="opts">
      <button class="tg" title="Учитывать регистр" aria-pressed={store.findCase} class:on={store.findCase} onclick={() => (store.setFindOpts({ cs: !store.findCase }), rerun())}>Aa</button>
      <button class="tg mono" title="Регулярное выражение" aria-pressed={s.re} class:on={s.re} onclick={() => ((s.re = !s.re), rerun())}>.*</button>
      <button class="tg" aria-pressed={headsOnly} class:on={headsOnly} onclick={() => ((s.scope = headsOnly ? 'all' : 'headings'), rerun())}>только заголовки</button>
    </div>
  </div>
  {#if s.ran}
    <div class="sum" aria-live="polite">{#if s.running}Ищу… {s.scanned}{:else if !s.total}Ничего не найдено{:else}{summary(s.total, s.groups.length)}{/if}{#if s.capped} · первые 1000{/if}</div>
    <div class="list" bind:this={list} role="listbox" tabindex="0" aria-label="Результаты поиска" onkeydown={listKey}>
      {#each s.groups as g, gi (g.path)}
        {@const f = fileOf(g.path)}
        <button class="file" class:sel={isSel(gi, -1)} aria-expanded={g.open} tabindex="-1" onclick={() => ((g.open = !g.open), (s.sel = { g: gi, i: -1 }))}>
          <svg class="chev" class:open={g.open} width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M2.5 1.2 5.8 4 2.5 6.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <svg class="fi" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
          <span class="fn">{displayName(g.name)}</span><span class="n">{g.hits.length}</span>
        </button>
        {#if g.open}
          {#each g.all ? g.hits : g.hits.slice(0, SHOWN) as h, i (i)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="hit" class:sel={isSel(gi, i)} role="option" tabindex="-1" aria-selected={isSel(gi, i)} title={h.where || undefined} onclick={() => store.openHit(gi, i)}
              draggable="true" ondragstart={(e) => { const under = h.under !== null ? f?.headings[h.under] : undefined; const d = under ? draggedHeading(g.path, under.line) : null; setDragged(e.dataTransfer, d ?? { kind: 'file', path: f?.name ?? g.name }); }}>
              {#if h.keyword && f}<span class="kw" style={toneStyle(toneFor(h.keyword, f.wf))}>{h.keyword}</span>{/if}
              <span class="frag" class:hd={h.heading}>{h.pre}<mark>{h.match}</mark>{h.post}</span>
            </div>
          {/each}
          {#if !g.all && g.hits.length > SHOWN}<button class="more" onclick={() => (g.all = true)}>Ещё {g.hits.length - SHOWN}</button>{/if}
        {/if}
      {/each}
    </div>
    {#if s.total}<button class="all" onclick={() => openSearchTab()}>Открыть все во вкладке<span class="k">⌘↩</span></button>{/if}
  {:else if recent.length}
    <div class="cap">Недавние</div>
    {#each recent as r (r.q)}
      <button class="rq" onclick={() => { s.q = r.q; void store.runSearch(); }}>{r.q}</button>
    {/each}
  {/if}
</div>

<style>
  .sp { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .top { flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; padding: 2px 0 8px; }
  .fld { height: 28px; display: flex; align-items: center; gap: 7px; padding: 0 10px; border-radius: 7px; background: var(--chip); color: var(--ink3); }
  .fld:focus-within { box-shadow: inset 0 0 0 1px var(--lamp); }
  .fld input { flex: 1; min-width: 0; padding: 0; border: 0; outline: none; background: none; color: var(--ink); font: 12.5px var(--ui); -webkit-user-select: text; user-select: text; }
  .enter { font-size: 11px; color: var(--ink3); }
  .opts { display: flex; flex-wrap: wrap; gap: 4px; }
  .tg { height: 22px; padding: 0 8px; border: 0; border-radius: 5px; background: var(--chip); color: var(--ink2); font: 600 11.5px var(--ui); }
  .tg.mono { font-family: var(--mono); }
  .tg.on { background: var(--lampsoft); color: var(--lampink); }
  .sum { padding: 0 10px 6px; font-size: 11.5px; color: var(--ink3); }
  .list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; outline: none; }
  .file { flex: 0 0 24px; height: 24px; display: flex; align-items: center; gap: 6px; margin-top: 2px; padding: 0 10px 0 4px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font: 600 12px var(--ui); text-align: left; }
  .file:hover:not(.sel) { background: var(--chip); }
  .file.sel { background: var(--lampsoft); }
  .fi { flex: 0 0 13px; color: var(--ink3); }
  .chev { flex: 0 0 10px; color: var(--ink3); transition: transform 0.12s; }
  .chev.open { transform: rotate(90deg); }
  .fn { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n { margin-left: auto; font-weight: 400; font-size: 11.5px; color: var(--ink3); }
  .hit { flex: 0 0 24px; height: 24px; box-sizing: border-box; display: flex; align-items: center; gap: 6px; padding: 0 10px 0 20px; border-radius: 6px; cursor: default; min-width: 0; }
  .hit:hover { background: var(--chip); }
  .hit.sel { background: var(--lampsoft); }
  .frag { flex: 1; min-width: 0; font-size: 12.5px; color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .frag.hd { color: var(--ink); font-weight: 600; }
  .frag mark { padding: 0 1px; border-radius: 2px; background: var(--lampsoft); color: var(--ink); font-weight: 600; }
  .kw { flex: 0 0 auto; display: inline-flex; align-items: center; height: 15px; padding: 0 4px; border-radius: 3px; font: 700 9px var(--ui); letter-spacing: 0.02em; color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .more { align-self: flex-start; margin: 2px 0 4px 20px; padding: 0; border: 0; background: none; color: var(--lampink); font: 12px var(--ui); }
  .all { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 10px 6px; border: 0; border-top: 1px solid var(--rule); background: none; color: var(--lampink); font: 12px var(--ui); text-align: left; }
  .all:hover { text-decoration: underline; }
  .all .k { margin-left: auto; font: 11px var(--mono); color: var(--ink3); }
  .cap { padding: 6px 10px 4px; font-size: 11px; font-weight: 600; color: var(--ink3); }
  .rq { flex: 0 0 26px; display: block; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink2); font: 12.5px var(--ui); text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rq:hover { background: var(--chip); }
  .tg:focus-visible, .file:focus-visible, .rq:focus-visible, .more:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
</style>

<script lang="ts">
  import { tick } from 'svelte';
  import { store } from '../store.svelte';
  import { summary } from '../search';
  import { displayName } from '../names';
  import { tabFocus } from './searchTabState.svelte';
  import { contextBlocks, type CtxBlock } from '../searchContext';
  import { DEFAULT_WORKFLOW, parseHeadings, toneFor } from '../org';
  import { toneStyle } from '../colors';
  import type { SearchGroup } from '../store.svelte';

  // The tab of the results of the search in every file (ТЗ 53 §1–2): the header as the screens of ТЗ 47 — «Поиск по всем
  // файлам», the query in Yeseva One in «ёлочках», «Свернуть все» / «Развернуть все»; the field (up to 560 pt), the
  // chips «Aa», «.*», «Слово» (the panel's), how many found. The query, the options and the results are the panel's
  // (`store.search`); ↩ in the field runs it, ↓ goes to the list.
  const s = $derived(store.search);
  let input: HTMLInputElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();
  $effect(() => {
    void tabFocus.n;
    void tick().then(() => {
      input?.focus();
      input?.select();
    });
  });
  $effect(() => {
    void tabFocus.list;
    if (tabFocus.list) void tick().then(() => list?.focus());
  });
  const allOpen = $derived(s.groups.length > 0 && s.groups.every((g) => g.open));
  const toggleAll = () => {
    const open = !allOpen;
    for (const g of s.groups) g.open = open;
  };
  const rerun = () => s.ran && void store.runSearch();
  const count = $derived(s.running ? `Ищу… ${s.scanned} ${s.scanned % 10 === 1 && s.scanned % 100 !== 11 ? 'файл' : 'файлов'}` : s.ran ? (s.total ? summary(s.total, s.groups.length) : 'Ничего не найдено') : '');
  function fieldKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void store.runSearch();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      list?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      list?.focus();
    }
  }
  const SHOWN = 4; // blocks of a group before «Ещё N в …» (as the panel)

  // ---- the blocks of a group: from the text searched (its lines are the hits'); computed for the open ones only ----
  const fileOf = (path: string) => store.files.find((f) => f.path === path);
  const cache = new Map<string, { stamp: string; blocks: CtxBlock[] }>();
  function blocksOf(g: SearchGroup): CtxBlock[] {
    const c = cache.get(g.path);
    if (c && c.stamp === g.stamp && c.blocks.length) return c.blocks;
    const f = fileOf(g.path);
    const heads = f && f.text === g.stamp ? f.headings : parseHeadings(g.stamp, f?.wf ?? DEFAULT_WORKFLOW);
    const blocks = contextBlocks(g.stamp, heads, g.hits);
    cache.set(g.path, { stamp: g.stamp, blocks });
    return blocks;
  }
  const folderOf = (name: string) => (name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : 'корень');
  const changed = (g: SearchGroup) => fileOf(g.path)?.text !== g.stamp;
  const tone = (kw: string | null, path: string) => {
    const f = fileOf(path);
    return kw && f ? toneStyle(toneFor(kw, f.wf)) : '';
  };
  const isSel = (gi: number, b: CtxBlock) => s.sel?.g === gi && b.hits.includes(s.sel.i);
  /** A line's text with its matches marked: the runs of plain text and of a match. */
  function runs(text: string, marks: [number, number][]): { t: string; m: boolean }[] {
    const out: { t: string; m: boolean }[] = [];
    let at = 0;
    for (const [a, b] of [...marks].sort((x, y) => x[0] - y[0])) {
      if (a < at) continue;
      if (a > at) out.push({ t: text.slice(at, a), m: false });
      out.push({ t: text.slice(a, b), m: true });
      at = b;
    }
    if (at < text.length) out.push({ t: text.slice(at), m: false });
    return out;
  }
</script>

<div class="stab">
  <div class="wrap">
    <header>
      <div class="ttl">
        <div class="kick">Поиск по всем файлам</div>
        <h1>{s.ran ? `«${s.ran}»` : 'Поиск'}</h1>
      </div>
      {#if s.groups.length}<button class="btn" onclick={toggleAll}>{allOpen ? 'Свернуть все' : 'Развернуть все'}</button>{/if}
    </header>
    <div class="qrow">
      <label class="fld">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></svg>
        <input bind:this={input} bind:value={s.q} onkeydown={fieldKey} placeholder="Поиск по всем файлам" aria-label="Запрос" spellcheck="false" autocomplete="off" />
        {#if s.q}<button class="clr" aria-label="Очистить" title="Очистить" onclick={() => { s.q = ''; input?.focus(); }}>×</button>{/if}
      </label>
      <button class="tg" title="Учитывать регистр" aria-pressed={store.findCase} class:on={store.findCase} onclick={() => (store.setFindOpts({ cs: !store.findCase }), rerun())}>Aa</button>
      <button class="tg mono" title="Регулярное выражение" aria-pressed={s.re} class:on={s.re} onclick={() => ((s.re = !s.re), rerun())}>.*</button>
      <button class="tg" title="Слово целиком" aria-pressed={store.findWord} class:on={store.findWord} onclick={() => (store.setFindOpts({ word: !store.findWord }), rerun())}>Слово</button>
      <span class="cnt" aria-live="polite">{count}{#if s.capped} · первые 1000{/if}</span>
    </div>
    <div class="list" bind:this={list} role="listbox" tabindex="0" aria-label="Результаты поиска">
      {#if s.capped}<div class="capped">Показаны первые 1000 совпадений — уточните запрос</div>{/if}
      {#each s.groups as g, gi (g.path)}
        <section class="grp" aria-label={displayName(g.name)}>
          <button class="file" aria-expanded={g.open} onclick={() => (g.open = !g.open)}>
            <svg class="chev" class:open={g.open} width="10" height="10" viewBox="0 0 8 8" aria-hidden="true"><path d="M2.5 1.2 5.8 4 2.5 6.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <svg class="fi" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
            <span class="fn">{displayName(g.name.split('/').pop() ?? g.name)}</span>
            <span class="fd">{folderOf(g.name)}</span>
            {#if changed(g)}<span class="stale" role="link" tabindex="-1" onclick={(e) => { e.stopPropagation(); void store.runSearch(); }} onkeydown={() => {}}>изменён — ↩ обновить</span>{/if}
            <span class="n">{g.hits.length}</span>
          </button>
          {#if g.open}
            {@const bs = blocksOf(g)}
            {@const shownBs = g.all ? bs : bs.slice(0, SHOWN)}
            {#each shownBs as b (b.lines[0]?.n ?? 0)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="blk" class:sel={isSel(gi, b)} role="option" tabindex="-1" aria-selected={isSel(gi, b)} onclick={() => store.openHit(gi, b.hits[0])}>
                {#if b.keyword || b.where}
                  <div class="bh">{#if b.keyword}<span class="cap" style={tone(b.keyword, g.path)}>{b.keyword}</span>{/if}<span class="wh">{b.where}</span></div>
                {/if}
                {#each b.lines as l (l.n)}
                  <div class="ln" class:m={l.match} class:hd={l.heading}>
                    <span class="no">{l.n + 1}</span>
                    <span class="tx">{#each runs(l.text, l.marks) as r, ri (ri)}{#if r.m}<mark>{r.t}</mark>{:else}{r.t}{/if}{/each}</span>
                  </div>
                {/each}
              </div>
            {/each}
            {#if shownBs.length < bs.length}
              {@const rest = bs.slice(shownBs.length).reduce((n, b) => n + b.hits.length, 0)}
              <button class="more" onclick={() => (g.all = true)}>Ещё {rest} в {displayName(g.name.split('/').pop() ?? g.name)} ›</button>
            {/if}
          {/if}
        </section>
      {:else}
        {#if s.ran && !s.running}<div class="none">Ничего не найдено</div>{/if}
      {/each}
    </div>
  </div>
</div>

<style>
  .stab { height: 100%; overflow: auto; box-sizing: border-box; color: var(--ink); font: 13px/1.45 var(--ui); background-color: var(--bg);
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 24px 24px; background-position: -1px -1px; }
  .wrap { padding: 26px 36px 32px; }
  header { display: flex; align-items: flex-end; gap: 14px; }
  .ttl { flex: 1; min-width: 0; }
  .kick { margin-bottom: 8px; font: 500 11px var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink3); }
  h1 { margin: 0; font: 400 38px/1.05 var(--title); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .btn { flex: 0 0 auto; height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 13px var(--ui); }
  .qrow { display: flex; align-items: center; gap: 6px; margin: 14px 0 18px; }
  .fld { flex: 0 1 560px; min-width: 0; height: 36px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 10px 0 12px; border-radius: 8px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink3); }
  .fld:focus-within { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .fld input { flex: 1; min-width: 0; padding: 0; border: 0; outline: none; background: none; color: var(--ink); font: 14px var(--ui); caret-color: var(--lamp); -webkit-user-select: text; user-select: text; }
  .fld input::placeholder { color: var(--ink3); }
  .clr { width: 20px; height: 20px; padding: 0; border: 0; border-radius: 10px; background: var(--chip2); color: var(--ink2); font-size: 14px; line-height: 1; }
  .tg { height: 28px; padding: 0 10px; border: 0; border-radius: 6px; background: var(--chip); color: var(--ink2); font: 600 12px var(--ui); }
  .tg.mono { font-family: var(--mono); }
  .tg.on { background: var(--lampsoft); color: var(--lampink); box-shadow: inset 0 0 0 1px var(--lampline); }
  .tg:focus-visible, .btn:focus-visible, .clr:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
  .cnt { margin-left: 8px; font-size: 12.5px; color: var(--ink3); white-space: nowrap; }
  .list { display: flex; flex-direction: column; gap: 14px; outline: none; }
  .capped { font-size: 12.5px; color: var(--wait); }
  .grp { display: flex; flex-direction: column; gap: 4px; }
  /* the group's head sticks to the top while its blocks scroll */
  .file { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px; height: 34px; box-sizing: border-box; padding: 0 8px; border: 0; border-bottom: 1px solid var(--rule); background: var(--bg); color: var(--ink); font: 13px var(--ui); text-align: left; }
  .chev { flex: 0 0 10px; color: var(--ink3); transition: transform 0.12s; }
  .chev.open { transform: rotate(90deg); }
  .fi { flex: 0 0 14px; color: var(--ink3); }
  .fn { font-size: 14px; font-weight: 600; white-space: nowrap; }
  .fd { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--ink3); }
  .stale { font-size: 11.5px; color: var(--wait); white-space: nowrap; cursor: default; }
  .stale:hover { text-decoration: underline; }
  .n { margin-left: auto; font-size: 12px; color: var(--ink3); }
  .file:focus-visible { outline: 2px solid var(--lampline); outline-offset: -2px; }
  /* a match: its heading's status and path over its lines, the line numbers in a column of 30 */
  .blk { padding: 8px 12px; border-radius: 9px; cursor: default; }
  .blk:hover:not(.sel) { background: var(--chip); }
  .blk.sel { background: var(--lampsoft); box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .bh { display: flex; align-items: center; gap: 8px; margin: 0 0 3px 42px; font-size: 11.5px; color: var(--ink3); min-width: 0; }
  .wh { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cap { flex: 0 0 auto; display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 4px; font: 700 10.5px var(--ui); letter-spacing: 0.02em; color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .ln { display: flex; align-items: baseline; gap: 12px; min-height: 22px; }
  .no { flex: 0 0 30px; text-align: right; font: 10.5px/21px var(--mono); color: var(--ink3); }
  .ln.m .no { color: var(--lampink); }
  .tx { flex: 1; min-width: 0; font-size: 13.5px; line-height: 1.55; color: var(--ink2); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .ln.m .tx { color: var(--ink); }
  .ln.hd .tx { font-weight: 600; }
  .tx mark { padding: 0 1px; border-radius: 3px; background: var(--lampsoft); box-shadow: inset 0 0 0 1px var(--lampline); color: var(--ink); font-weight: 600; }
  .more { align-self: flex-start; margin: 2px 0 0 54px; padding: 0; border: 0; background: none; color: var(--lampink); font: 12.5px var(--ui); }
  .more:hover { text-decoration: underline; }
  .none { padding: 60px 0; text-align: center; font-size: 14px; color: var(--ink2); }
</style>

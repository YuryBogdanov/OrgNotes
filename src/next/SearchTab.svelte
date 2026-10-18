<script lang="ts">
  import { tick } from 'svelte';
  import { store } from '../store.svelte';
  import { summary } from '../search';
  import { displayName } from '../names';
  import { facetsOf, headsOf, keptOf, liveFilters, resetFilters, setFilters, tabFocus } from './searchTabState.svelte';
  import { anyFilter, facetCounts, filteredWord } from '../searchFilters';
  import { contextBlocks, type CtxBlock } from '../searchContext';
  import { toneFor } from '../org';
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
  // ---- the filters (§4): what was found, chosen; the numbers of each over the others ----
  const flt = $derived(liveFilters());
  const filtered = $derived(anyFilter(flt));
  const facets = $derived(s.running ? [] : facetsOf(s.groups));
  const kept = $derived(facets.length === s.groups.length ? keptOf(facets, flt) : s.groups.map((g) => g.hits.map((_, i) => i)));
  const counts = $derived(facetCounts(facets.flat(), flt));
  let filesAll = $state(false);
  let tagsAll = $state(false);
  const FILES = 5;
  const TAGS = 12;
  const files = $derived(
    s.groups
      .map((g) => ({ path: g.path, name: g.name, n: counts.files.get(g.path) ?? 0 }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ru')),
  );
  const statuses = $derived(
    [...new Set([...counts.status.keys(), ...flt.status])]
      .map((k) => ({ k, n: counts.status.get(k) ?? 0 }))
      .sort((a, b) => (a.k === '') !== (b.k === '') ? (a.k === '' ? 1 : -1) : b.n - a.n || a.k.localeCompare(b.k)),
  );
  /** A tag as written (the filters keep them in lower case). */
  const tagNames = $derived.by(() => {
    const m = new Map<string, string>();
    for (const g of s.groups) for (const h of headsOf(g)) for (const t of h.tags) if (!m.has(t.toLowerCase())) m.set(t.toLowerCase(), t);
    for (const g of s.groups) for (const t of fileOf(g.path)?.filetags ?? []) if (!m.has(t.toLowerCase())) m.set(t.toLowerCase(), t);
    return m;
  });
  const tagList = $derived(
    [...new Set([...counts.tags.keys(), ...flt.tags])]
      .map((k) => ({ k, n: counts.tags.get(k) ?? 0 }))
      .sort((a, b) => Number(flt.tags.has(b.k)) - Number(flt.tags.has(a.k)) || b.n - a.n || a.k.localeCompare(b.k, 'ru')),
  );
  const toggle = <T,>(set: Set<T>, v: T) => (set.has(v) ? set.delete(v) : set.add(v));
  const scopes = [
    { v: 'all', l: 'Везде' },
    { v: 'headings', l: 'Заголовки' },
    { v: 'text', l: 'Текст' },
  ] as const;
  const setScope = (v: (typeof scopes)[number]['v']) => {
    if (s.scope === v) return;
    s.scope = v;
    rerun();
  };
  const shownGroups = $derived(s.groups.map((g, gi) => ({ g, gi, keep: kept[gi] ?? [] })).filter((x) => x.keep.length));
  const count = $derived(
    s.running
      ? `Ищу… ${s.scanned} ${s.scanned % 10 === 1 && s.scanned % 100 !== 11 ? 'файл' : 'файлов'}`
      : s.ran
        ? s.total
          ? filtered ? filteredWord(counts.shown, s.total) : summary(s.total, s.groups.length)
          : 'Ничего не найдено'
        : '',
  );
  function fieldKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void store.runSearch();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      toList();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      toList();
    }
  }
  // ---- the keys of the list (§5): ↑↓ over the blocks shown (an open group's head is passed by, a folded one is a
  // stop), ← → fold and unfold the group, ↩ opens (beside the tab: `openFile` puts a file after the active tab) ----
  const stops = $derived(
    shownGroups.flatMap(({ g, gi, keep }) => {
      if (!g.open) return [{ g: gi, i: -1 }];
      const bs = blocksOf(g, keep);
      return (g.all ? bs : bs.slice(0, SHOWN)).map((b) => ({ g: gi, i: b.hits[0] }));
    }),
  );
  const stopAt = () => {
    const c = s.sel;
    if (!c) return -1;
    if (c.i < 0) return stops.findIndex((x) => x.g === c.g && x.i < 0);
    const g = s.groups[c.g];
    // the block the chosen match is in
    const b = g?.open ? blocksOf(g, kept[c.g] ?? []).find((x) => x.hits.includes(c.i)) : undefined;
    return stops.findIndex((x) => x.g === c.g && (b ? x.i === b.hits[0] : x.i < 0));
  };
  async function scrollSel() {
    await tick();
    list?.querySelector('.blk.sel, .file.sel')?.scrollIntoView({ block: 'nearest' });
  }
  function toList() {
    if (stopAt() < 0 && stops.length) s.sel = stops[0];
    list?.focus();
    void scrollSel();
  }
  function listKey(e: KeyboardEvent) {
    const at = stopAt();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.key === 'ArrowUp' && at <= 0) return input?.focus();
      const n = stops[Math.min(stops.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) s.sel = n;
      void scrollSel();
    } else if (e.key === 'Enter' && s.sel) {
      e.preventDefault();
      if (s.sel.i < 0) s.groups[s.sel.g].open = !s.groups[s.sel.g].open;
      else store.openHit(s.sel.g, s.sel.i);
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && s.sel) {
      e.preventDefault();
      const g = s.groups[s.sel.g];
      g.open = e.key === 'ArrowRight';
      if (!g.open) s.sel = { g: s.sel.g, i: -1 };
      else if (s.sel.i < 0) {
        const b = blocksOf(g, kept[s.sel.g] ?? [])[0];
        if (b) s.sel = { g: s.sel.g, i: b.hits[0] };
      }
      void scrollSel();
    }
  }
  const SHOWN = 4; // blocks of a group before «Ещё N в …» (as the panel)

  // ---- the blocks of a group: from the text searched (its lines are the hits'); computed for the open ones only.
  // Built on the matches kept by the filters; a block's `hits` are the group's own indices. ----
  const fileOf = (path: string) => store.files.find((f) => f.path === path);
  const cache = new Map<string, { stamp: string; keep: number[]; blocks: CtxBlock[] }>();
  function blocksOf(g: SearchGroup, keep: number[]): CtxBlock[] {
    const c = cache.get(g.path);
    if (c && c.stamp === g.stamp && c.keep.length === keep.length && c.keep.every((x, i) => x === keep[i]) && c.blocks.length) return c.blocks;
    const blocks = contextBlocks(g.stamp, headsOf(g), keep.map((i) => g.hits[i])).map((b) => ({ ...b, hits: b.hits.map((i) => keep[i]) }));
    cache.set(g.path, { stamp: g.stamp, keep, blocks });
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
    <div class="body">
    <div class="list" bind:this={list} role="listbox" tabindex="0" aria-label="Результаты поиска" onkeydown={listKey}>
      {#if s.capped}<div class="capped">Показаны первые 1000 совпадений — уточните запрос</div>{/if}
      {#each shownGroups as { g, gi, keep } (g.path)}
        <section class="grp" aria-label={displayName(g.name)}>
          <button class="file" class:sel={s.sel?.g === gi && s.sel.i < 0} aria-expanded={g.open} tabindex="-1" onclick={() => ((g.open = !g.open), (s.sel = { g: gi, i: -1 }))}>
            <svg class="chev" class:open={g.open} width="10" height="10" viewBox="0 0 8 8" aria-hidden="true"><path d="M2.5 1.2 5.8 4 2.5 6.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <svg class="fi" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
            <span class="fn">{displayName(g.name.split('/').pop() ?? g.name)}</span>
            <span class="fd">{folderOf(g.name)}</span>
            {#if changed(g)}<span class="stale" role="link" tabindex="-1" onclick={(e) => { e.stopPropagation(); void store.runSearch(); }} onkeydown={() => {}}>изменён — ↩ обновить</span>{/if}
            <span class="n">{keep.length}</span>
          </button>
          {#if g.open}
            {@const bs = blocksOf(g, keep)}
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
        {#if s.ran && !s.running}
          {#if filtered && s.total}
            <div class="none">С фильтрами ничего не найдено<button class="btn" onclick={resetFilters}>Сбросить фильтры</button></div>
          {:else}<div class="none">Ничего не найдено</div>{/if}
        {/if}
      {/each}
    </div>
    <aside class="flt" aria-label="Фильтры">
      <div class="fh"><span>Фильтры</span>{#if filtered}<button class="reset" onclick={resetFilters}>Сбросить</button>{/if}</div>
      <div class="lab">Где искать</div>
      <div class="seg" role="radiogroup" aria-label="Где искать">
        {#each scopes as o (o.v)}<button role="radio" aria-checked={s.scope === o.v} class:on={s.scope === o.v} onclick={() => setScope(o.v)}>{o.l}</button>{/each}
      </div>
      {#if s.ran && s.total && !s.running}
        <div class="lab">Файлы</div>
        <div class="files" role="group" aria-label="Файлы">
          {#each filesAll ? files : files.slice(0, FILES) as x (x.path)}
            <label class="fr">
              <input type="checkbox" checked={!flt.off.has(x.path)} onchange={() => setFilters((f) => toggle(f.off, x.path))} />
              <span class="box" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2 4.1 7.3 8 2.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
              <span class="nm">{displayName(x.name.split('/').pop() ?? x.name)}{#if x.name.includes('/')}<span class="fd">&nbsp;· {folderOf(x.name)}</span>{/if}</span>
              <span class="n">{x.n}</span>
            </label>
          {/each}
          {#if !filesAll && files.length > FILES}<button class="more" onclick={() => (filesAll = true)}>Ещё {files.length - FILES} {files.length - FILES === 1 ? 'файл' : files.length - FILES < 5 ? 'файла' : 'файлов'} ›</button>{/if}
        </div>
        <div class="lab">Статус</div>
        <div class="chips" role="group" aria-label="Статус">
          {#each statuses as x (x.k)}
            <button class="chip" class:on={flt.status.has(x.k)} aria-pressed={flt.status.has(x.k)} onclick={() => setFilters((f) => toggle(f.status, x.k))}>
              {#if x.k}<span class="cap" style={tone(x.k, s.groups[0]?.path ?? '')}>{x.k}</span>{:else}<span class="plain">без статуса</span>{/if}<span class="cn">{x.n}</span>
            </button>
          {/each}
        </div>
        {#if tagList.length}
          <div class="lab">Теги</div>
          <div class="chips" role="group" aria-label="Теги">
            {#each tagsAll ? tagList : tagList.slice(0, TAGS) as x (x.k)}
              <button class="chip tag" class:on={flt.tags.has(x.k)} aria-pressed={flt.tags.has(x.k)} onclick={() => setFilters((f) => toggle(f.tags, x.k))}>
                <span class="plain">{tagNames.get(x.k) ?? x.k}</span><span class="cn">{x.n}</span>
              </button>
            {/each}
            {#if !tagsAll && tagList.length > TAGS}<button class="more" onclick={() => (tagsAll = true)}>Ещё {tagList.length - TAGS} ›</button>{/if}
          </div>
        {/if}
      {/if}
    </aside>
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
  .file.sel { box-shadow: inset 0 -1.5px 0 var(--lampline); color: var(--lampink); }
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
  /* the results and the filters: each scrolls on its own */
  .stab { display: flex; flex-direction: column; overflow: hidden; }
  .wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; padding-bottom: 0; }
  .body { flex: 1; min-height: 0; display: flex; gap: 28px; }
  .body > .list { flex: 1; min-width: 0; overflow: auto; padding-bottom: 32px; }
  .flt { flex: 0 0 268px; overflow: auto; padding: 0 0 32px; display: flex; flex-direction: column; }
  .fh { display: flex; align-items: center; justify-content: space-between; font: 600 11px var(--ui); color: var(--ink3); letter-spacing: 0.04em; text-transform: uppercase; min-height: 20px; }
  .reset { padding: 0; border: 0; background: none; color: var(--lampink); font: 12px var(--ui); text-transform: none; letter-spacing: 0; }
  .reset:hover { text-decoration: underline; }
  .lab { margin: 16px 0 8px; font: 600 11px var(--ui); color: var(--ink3); }
  .seg { align-self: flex-start; display: flex; gap: 2px; padding: 2px; border-radius: 7px; background: var(--chip); }
  .seg button { height: 24px; padding: 0 12px; border: 0; border-radius: 5px; background: transparent; color: var(--ink2); font: 12.5px var(--ui); }
  .seg button.on { background: var(--segon); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); }
  .files { display: flex; flex-direction: column; }
  .fr { display: flex; align-items: center; gap: 9px; height: 26px; padding: 0 4px; border-radius: 6px; cursor: default; font-size: 13px; }
  .fr:hover { background: var(--chip); }
  .fr input { position: absolute; opacity: 0; pointer-events: none; }
  .box { flex: 0 0 15px; height: 15px; box-sizing: border-box; display: grid; place-items: center; border-radius: 4px; box-shadow: inset 0 0 0 1.5px var(--rule); color: transparent; }
  .fr input:checked + .box { background: var(--lamp); box-shadow: none; color: var(--onlamp); }
  .fr input:focus-visible + .box { outline: 2px solid var(--lampline); outline-offset: 1px; }
  .fr .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fr .fd { font-size: 12px; }
  .fr .n { margin-left: 0; }
  .files .more, .chips .more { margin: 4px 0 0 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px 0 4px; border: 0; border-radius: 6px; background: var(--chip); color: var(--ink2); font: 12.5px var(--ui); }
  .chip .plain { padding-left: 4px; }
  .chip .cn { font-size: 11.5px; color: var(--ink3); }
  .chip.on { background: var(--lampsoft); box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .chip.tag.on { color: var(--lampink); }
  .chip:focus-visible, .seg button:focus-visible, .reset:focus-visible, .more:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
  .none { display: flex; flex-direction: column; align-items: center; gap: 14px; }
</style>

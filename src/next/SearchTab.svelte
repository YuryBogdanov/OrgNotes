<script lang="ts">
  import { tick } from 'svelte';
  import { store } from '../store.svelte';
  import { summary } from '../search';
  import { displayName } from '../names';
  import { tabFocus } from './searchTabState.svelte';

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
  const SHOWN = 4;
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
      {#each s.groups as g, gi (g.path)}
        <button class="file" aria-expanded={g.open} onclick={() => (g.open = !g.open)}>
          <span class="fn">{displayName(g.name)}</span><span class="n">{g.hits.length}</span>
        </button>
        {#if g.open}
          {#each g.all ? g.hits : g.hits.slice(0, SHOWN) as h, i (i)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="hit" role="option" tabindex="-1" aria-selected={s.sel?.g === gi && s.sel?.i === i} onclick={() => store.openHit(gi, i)}>{h.pre}<mark>{h.match}</mark>{h.post}</div>
          {/each}
          {#if !g.all && g.hits.length > SHOWN}<button class="more" onclick={() => (g.all = true)}>Ещё {g.hits.length - SHOWN} в {displayName(g.name)} ›</button>{/if}
        {/if}
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
  .list { display: flex; flex-direction: column; gap: 2px; outline: none; }
  .file { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 8px; border: 0; border-bottom: 1px solid var(--rule); background: none; color: var(--ink); font: 600 14px var(--ui); text-align: left; }
  .n { margin-left: auto; font-weight: 400; font-size: 12px; color: var(--ink3); }
  .hit { padding: 6px 12px 6px 42px; border-radius: 9px; font-size: 13.5px; cursor: default; }
  .hit:hover { background: var(--chip); }
  .hit mark { padding: 0 1px; border-radius: 3px; background: var(--lampsoft); box-shadow: inset 0 0 0 1px var(--lampline); color: var(--ink); font-weight: 600; }
  .more { align-self: flex-start; margin: 2px 0 8px 42px; padding: 0; border: 0; background: none; color: var(--lampink); font: 12.5px var(--ui); }
</style>

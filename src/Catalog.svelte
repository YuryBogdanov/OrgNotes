<script lang="ts">
  import { onMount } from 'svelte';
  import { catalog, CATEGORIES, count, type CatalogEntry, type CatState } from './pluginCatalog.svelte';
  import CatalogButton from './CatalogButton.svelte';

  // «Каталог плагинов» (ТЗ 37 §5): the catalog's plugins — a search, the order, the categories, a card each with
  // the state of its button; a click on a card opens its page.
  let { back, open, act }: { back: () => void; open: (e: CatalogEntry) => void; act: (e: CatalogEntry, s: CatState) => void } = $props();
  let query = $state('');
  let sort = $state<'popular' | 'new' | 'name'>('popular');
  let cat = $state<string | null>(null);
  onMount(() => void catalog.load());

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const l = catalog.list.filter((e) => (!cat || e.categories.includes(cat)) && (!q || [e.name, e.description, e.author, e.id].some((x) => x.toLowerCase().includes(q))));
    const by = sort === 'popular' ? (a: CatalogEntry, b: CatalogEntry) => b.downloads - a.downloads : sort === 'new' ? (a: CatalogEntry, b: CatalogEntry) => (b.updated ?? '').localeCompare(a.updated ?? '') : (a: CatalogEntry, b: CatalogEntry) => a.name.localeCompare(b.name, 'ru');
    return [...l].sort((a, b) => by(a, b) || a.name.localeCompare(b.name, 'ru'));
  });
  const SORTS: [typeof sort, string][] = [['popular', 'популярные'], ['new', 'новые'], ['name', 'по названию']];
  /** «обновлён 10 минут назад». */
  function ago(ms: number) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'обновлён только что';
    if (m < 60) return `обновлён ${m} мин назад`;
    const h = Math.round(m / 60);
    return h < 24 ? `обновлён ${h} ч назад` : `обновлён ${new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
  }
  const DEFAULT_ICON = 'M4 4h12v12H4zM8 4v12M4 8h4';
</script>

<div class="cat">
  <button class="back" onclick={back}>‹ Плагины</button>
  <div class="head">
    <div class="ttl">
      <h2>Каталог плагинов</h2>
      <div class="st">
        Из репозитория <code>{catalog.repo}</code> ·
        {#if catalog.loading}загружаем список плагинов…{:else if catalog.offline}нет связи — список от {new Date(catalog.fetched).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} · <button class="lnk" onclick={() => void catalog.load(true)}>↻ Повторить</button>{:else if catalog.fetched}{ago(catalog.fetched)} · <button class="lnk" onclick={() => void catalog.load(true)}>↻ Обновить</button>{/if}
      </div>
    </div>
  </div>
  <div class="tools">
    <label class="find">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
      <input bind:value={query} placeholder="Найти в каталоге" aria-label="Найти в каталоге" spellcheck="false" />
    </label>
    <label class="sort"><span>Сортировка:</span>
      <select bind:value={sort} aria-label="Сортировка">{#each SORTS as [v, t] (v)}<option value={v}>{t}</option>{/each}</select>
    </label>
  </div>
  <div class="chips" role="tablist" aria-label="Категории">
    <button role="tab" aria-selected={!cat} class:on={!cat} onclick={() => (cat = null)}>Все</button>
    {#each CATEGORIES as [id, t] (id)}<button role="tab" aria-selected={cat === id} class:on={cat === id} onclick={() => (cat = id)}>{t}</button>{/each}
  </div>

  {#if catalog.loading && !catalog.list.length}
    <div class="grid" aria-busy="true" aria-label="Загрузка каталога">
      {#each [1, 0.85, 0.7, 0.55, 0.4, 0.3] as op (op)}
        <div class="card skel" style:opacity={op}>
          <div class="row"><span class="ib"></span><div class="lines"><i style:width="55%"></i><i style:width="30%"></i></div></div>
          <i style:width="92%"></i><i style:width="70%"></i>
          <div class="row sp"><i style:width="28%"></i><b></b></div>
        </div>
      {/each}
    </div>
  {:else if catalog.error && !catalog.list.length}
    <p class="err" role="alert">Не удалось загрузить каталог: {catalog.error} · <button class="lnk" onclick={() => void catalog.load(true)}>Повторить</button></p>
  {:else}
    <div class="grid">
      {#each shown as e (e.id)}
        {@const s = catalog.stateOf(e)}
        {@const m = catalog.manifests.get(e.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <div class="card" role="group" aria-label={e.name} onclick={(ev) => !(ev.target as Element).closest('button') && open(e)}>
          <div class="row">
            <span class="ib"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={e.icon ?? m?.icon ?? DEFAULT_ICON} /></svg></span>
            <div class="nm"><button class="name" onclick={() => open(e)}>{e.name}</button><div class="au">{e.author}</div></div>
          </div>
          <div class="desc">{e.description}</div>
          <div class="row">
            <span class="meta">{m ? `v${m.version}` : ''}{m && e.downloads ? ' · ' : ''}{e.downloads ? `⬇ ${count(e.downloads)}` : ''}</span>
            <CatalogButton {e} {s} onact={() => act(e, s)} />
          </div>
        </div>
      {:else}
        <p class="none">{query.trim() || cat ? 'Ничего не найдено' : 'В каталоге пока пусто'}</p>
      {/each}
    </div>
  {/if}
  <p class="note">Плагины из каталога пишет сообщество. Перед установкой видно, какие права получит плагин.</p>
</div>

<style>
  .cat { display: flex; flex-direction: column; gap: 14px; }
  .back, .lnk { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--acc); font-size: 12.5px; }
  .lnk { font-size: inherit; }
  .head { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
  .ttl { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: 18px; font-weight: 700; }
  .st { font-size: 12px; color: var(--fg2); margin-top: 2px; }
  code { font-family: var(--mono); }
  .tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .find { flex: 1 1 260px; display: flex; align-items: center; gap: 7px; height: 30px; box-sizing: border-box; padding: 0 9px; background: var(--bg); border: 1px solid var(--line); border-radius: 7px; color: var(--fg3); }
  .find:focus-within { border: 2px solid var(--acc); padding: 0 8px; }
  .find input { flex: 1; min-width: 0; border: 0; outline: none; background: none; color: var(--fg); font-size: 13px; }
  .sort { height: 28px; display: inline-flex; align-items: center; gap: 6px; padding: 0 4px 0 10px; border-radius: 6px; background: var(--field); font-size: 12.5px; }
  .sort span { color: var(--fg2); }
  .sort select { border: 0; background: none; color: var(--fg); font: inherit; outline: none; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chips button { height: 24px; padding: 0 10px; border: 0; border-radius: 12px; background: var(--field); color: var(--fg); font-size: 12.5px; }
  .chips button.on { background: var(--acc); color: var(--onacc); font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .card { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 10px; background: var(--side); border: 1px solid var(--line); cursor: default; }
  .card:hover { border-color: color-mix(in srgb, var(--acc) 50%, var(--line)); }
  .row { display: flex; align-items: center; gap: 10px; }
  .row.sp { justify-content: space-between; }
  .ib { flex: 0 0 34px; width: 34px; height: 34px; box-sizing: border-box; border-radius: 8px; background: var(--bg); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; color: var(--fg); }
  .nm { flex: 1; min-width: 0; }
  .name { max-width: 100%; padding: 0; border: 0; background: none; color: var(--fg); font: inherit; font-weight: 700; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .au { font-size: 11.5px; color: var(--fg3); }
  .desc { font-size: 12.5px; color: var(--fg2); line-height: 1.4; min-height: 34px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .meta { flex: 0 1 auto; min-width: 0; font-size: 11.5px; color: var(--fg3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .skel .ib, .skel i, .skel b { display: block; background: var(--field); border: 0; }
  .skel i { height: 8px; border-radius: 4px; }
  .skel b { width: 86px; height: 26px; border-radius: 6px; }
  .skel .lines { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .skel .lines i:first-child { height: 10px; }
  .err { margin: 0; font-size: 12.5px; color: var(--todo); }
  .none { grid-column: 1 / -1; margin: 0; font-size: 12.5px; color: var(--fg2); }
  .note { margin: 0; font-size: 11.5px; color: var(--fg3); line-height: 1.5; }
</style>

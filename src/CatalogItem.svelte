<script lang="ts">
  import { catalog, count, kb, type CatalogEntry, type CatState, type Release } from './pluginCatalog.svelte';
  import CatalogButton from './CatalogButton.svelte';
  import { RIGHTS } from './api/host.svelte';
  import { API_VERSION } from './api/index';
  import { APP_VERSION } from './api/declare';
  import { incompatible } from './api/manifest';
  import { renderReadme } from './readme';
  import { openExternal } from './store.svelte';
  import { plugins } from './api/host.svelte';
  import { pluginUpdates as up } from './pluginUpdates.svelte';

  // A plugin's page in the catalog (ТЗ 37 §6): its README, its releases; its rights and whether it fits this app.
  let { e, back, act }: { e: CatalogEntry; back: () => void; act: (e: CatalogEntry, s: CatState) => void } = $props();
  const m = $derived(catalog.manifests.get(e.id));
  const s = $derived(catalog.stateOf(e));
  // installed from the folder of plugins: «Удалить плагин…» here too (fix of ТЗ 37)
  const have = $derived(plugins.entries.find((x) => x.manifest?.id === e.id && !x.builtin) ?? null);
  const page = $derived(`https://github.com/${e.repo}`);
  let tab = $state<'about' | 'versions'>('about');

  let readme = $state<string | null>(null);
  let readmeErr = $state<string | null>(null);
  $effect(() => {
    const it = e;
    readme = readmeErr = null;
    catalog.readme(it).then((t) => (readme = renderReadme(t, `https://github.com/${it.repo}`)), (err) => (readmeErr = String(err)));
  });
  let releases = $state<Release[] | null>(null);
  let relErr = $state<string | null>(null);
  $effect(() => {
    if (tab !== 'versions' || releases) return;
    catalog.releases(e).then((r) => (releases = r), (err) => (relErr = String(err)));
  });
  /** Links of the README open outside. */
  function click(ev: MouseEvent) {
    const a = (ev.target as Element).closest('a');
    if (!a) return;
    ev.preventDefault();
    void openExternal(a.href);
  }
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '');
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const minor = (v: string) => v.replace(/^[\^~]|>=/g, '').split('.').slice(0, 2).join('.');
  const fits = $derived(m ? incompatible(m, API_VERSION, APP_VERSION) : null);
</script>

<div class="item">
  <button class="back" onclick={back}>‹ Каталог</button>
  <div class="head">
    <span class="ib"><svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={e.icon ?? m?.icon ?? 'M4 4h12v12H4zM8 4v12M4 8h4'} /></svg></span>
    <div class="ttl">
      <h2>{e.name}</h2>
      <div class="sub">{[e.author, m ? `v${m.version}` : '', e.updated ? `обновлён ${date(e.updated)}` : '', e.downloads ? `⬇ ${count(e.downloads)}` : ''].filter(Boolean).join(' · ')}</div>
    </div>
    <button class="code" onclick={() => void openExternal(page)}>Исходный код ↗</button>
    {#if have}<button class="code rm" onclick={() => (up.removing = have)}>Удалить плагин…</button>{/if}
    <CatalogButton {e} {s} big onact={() => act(e, s)} />
  </div>
  <div class="seg" role="tablist" aria-label="Страница плагина">
    <button role="tab" aria-selected={tab === 'about'} class:on={tab === 'about'} onclick={() => (tab = 'about')}>Описание</button>
    <button role="tab" aria-selected={tab === 'versions'} class:on={tab === 'versions'} onclick={() => (tab = 'versions')}>Версии</button>
  </div>
  <div class="cols">
    <div class="main">
      {#if tab === 'about'}
        <p class="lead">{e.description}</p>
        {#if readme}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="md" onclick={click}>{@html readme}</div>
        {:else if readmeErr}
          <p class="dim">README не загрузился: {readmeErr}</p>
        {:else}
          <p class="dim">Загружаем README…</p>
        {/if}
      {:else if releases}
        {#each releases as r (r.tag)}
          <div class="rel">
            <div class="rh"><b>{r.tag}</b><span>{date(r.date)}{r.size ? ` · ${kb(r.size)}` : ''}</span></div>
            {#if r.notes.trim()}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <div class="md" onclick={click}>{@html renderReadme(r.notes, page)}</div>
            {/if}
          </div>
        {:else}
          <p class="dim">Релизов нет</p>
        {/each}
      {:else if relErr}
        <p class="dim">Версии не загрузились: {relErr}</p>
      {:else}
        <p class="dim">Загружаем версии…</p>
      {/if}
    </div>
    <div class="side">
      <div class="box" aria-label="Права">
        <div class="cap">ПРАВА</div>
        {#if m}
          {#each m.permissions as p (p)}
            <span class:net={p === 'net'}>{cap(RIGHTS[p] ?? p)}{p === 'net' && m.net.length ? `: ${m.net.join(', ')}` : ''}</span>
          {:else}
            <span>Только свои настройки и данные</span>
          {/each}
        {:else}
          <span class="dim">{m === null ? 'Манифест не прочитан' : '…'}</span>
        {/if}
      </div>
      {#if m}
        <div class="box" aria-label="Совместимость">
          <div class="cap">СОВМЕСТИМОСТЬ</div>
          <span>API плагинов {minor(m.api)}{m.minAppVersion ? ` · приложение ${m.minAppVersion} и новее` : ''}</span>
          {#if fits}<span class="bad">{fits}</span>{:else}<span class="ok">Подходит вашей версии {APP_VERSION}</span>{/if}
        </div>
      {/if}
      <p class="dim small">Плагин сообщества. Скачивается из релиза на GitHub.</p>
    </div>
  </div>
</div>

<style>
  .item { display: flex; flex-direction: column; gap: 14px; }
  .back { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--acc); font-size: 12.5px; }
  .head { display: flex; align-items: center; gap: 14px; }
  .ib { flex: 0 0 56px; width: 56px; height: 56px; box-sizing: border-box; border-radius: 12px; background: var(--side); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; color: var(--fg); }
  .ttl { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: 19px; font-weight: 700; }
  .sub { font-size: 12px; color: var(--fg2); margin-top: 2px; }
  .code.rm { color: var(--todo); }
  .code { height: 30px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font-size: 12.5px; white-space: nowrap; }
  .seg { display: flex; padding: 2px; gap: 2px; background: var(--field); border-radius: 8px; align-self: flex-start; }
  .seg button { height: 24px; padding: 0 12px; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); font-size: 12.5px; }
  .seg button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); font-weight: 600; }
  .cols { display: flex; gap: 16px; align-items: flex-start; }
  .main { flex: 1.5; min-width: 0; display: flex; flex-direction: column; gap: 10px; font-size: 13px; line-height: 1.5; }
  .side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
  .box { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 10px; background: var(--side); border: 1px solid var(--line); font-size: 12.5px; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--fg2); }
  .net { color: var(--wait); }
  .ok { color: var(--done); }
  .bad { color: var(--todo); }
  .lead { margin: 0; }
  .dim { margin: 0; color: var(--fg3); font-size: 12.5px; }
  .small { font-size: 11.5px; line-height: 1.5; }
  .rel { display: flex; flex-direction: column; gap: 4px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
  .rh { display: flex; align-items: baseline; gap: 8px; }
  .rh span { font-size: 12px; color: var(--fg3); }
  .md :global(h2), .md :global(h3), .md :global(h4) { margin: 10px 0 4px; font-size: 14px; }
  .md :global(h2) { font-size: 15px; }
  .md :global(p), .md :global(ul), .md :global(ol), .md :global(blockquote), .md :global(pre) { margin: 0 0 8px; }
  .md :global(ul), .md :global(ol) { padding-left: 20px; }
  .md :global(code) { font: 12px var(--mono); padding: 0 3px; border-radius: 3px; background: var(--field); }
  .md :global(pre) { padding: 8px 10px; border-radius: 8px; background: var(--side); border: 1px solid var(--line); overflow: auto; }
  .md :global(pre code) { padding: 0; background: none; }
  .md :global(blockquote) { padding-left: 10px; border-left: 3px solid var(--line); color: var(--fg2); }
  .md :global(a) { color: var(--acc); text-decoration: none; }
  .md :global(a:hover) { text-decoration: underline; }
  .md :global(hr) { border: 0; border-top: 1px solid var(--line); }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { catalog, kb, type CatalogEntry } from './pluginCatalog.svelte';
  import { RIGHTS } from './api/host.svelte';
  import type { Manifest } from './api/manifest';
  import { portal } from './portal';

  // «Установить «X»?» (ТЗ 37 §7): what the plugin gets, the release that is downloaded and its size, on at once.
  let { e, m, onclose }: { e: CatalogEntry; m: Manifest; onclose: () => void } = $props();
  let enable = $state(true);
  let size = $state<number | null>(null);
  onMount(() => {
    catalog.releases(e).then(
      (rs) => (size = rs.find((r) => r.tag.replace(/^v/, '') === m.version)?.size ?? null),
      () => {},
    );
  });
  function go() {
    void catalog.install(e, enable); // before the sheet goes (its props with it)
    onclose();
  }
  function key(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      onclose();
    } else if (ev.key === 'Enter' && !(ev.target as Element).closest('button, input')) {
      ev.preventDefault();
      go();
    }
  }
</script>

<div class="layer" use:portal>
<div class="scrim" aria-hidden="true"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="dlg" role="dialog" aria-modal="true" aria-label="Установка плагина" tabindex="-1" onkeydown={key}>
  <b class="t">Установить «{e.name}»?</b>
  <div class="dim">{m.permissions.length ? 'Плагин получит:' : 'Плагину не нужно никаких прав: только свои настройки и данные.'}</div>
  {#if m.permissions.length}
    <ul>
      {#each m.permissions as p (p)}<li class:net={p === 'net'}>{RIGHTS[p] ?? p}{p === 'net' && m.net.length ? `: ${m.net.join(', ')}` : ''}</li>{/each}
    </ul>
  {/if}
  <div class="fine">Скачается релиз v{m.version} из github.com/{e.repo}{size ? ` (${kb(size)})` : ''} в папку плагинов. Удалить можно в «Настройки → Плагины».</div>
  <label class="chk"><input type="checkbox" bind:checked={enable} /> Включить сразу после установки</label>
  <div class="row">
    <button class="b" onclick={onclose}>Отмена</button>
    <!-- svelte-ignore a11y_autofocus -->
    <button class="b pri" autofocus onclick={go}>Установить</button>
  </div>
</div>
</div>

<style>
  .layer { color: var(--fg); font: 13px var(--ui, -apple-system, system-ui, sans-serif); }
  .scrim { position: fixed; inset: 0; z-index: 90; background: rgba(0, 0, 0, 0.3); }
  .dlg { position: fixed; z-index: 91; left: 50%; top: 160px; transform: translateX(-50%); width: min(440px, calc(100% - 32px)); box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; padding: 18px 20px 16px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45); font-size: 13px; outline: none; }
  .t { font-size: 15px; }
  .dim { font-size: 12.5px; color: var(--fg2); }
  ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
  .net { color: var(--wait); font-weight: 600; }
  .fine { font-size: 12px; color: var(--fg3); line-height: 1.5; }
  .chk { display: flex; align-items: center; gap: 8px; }
  .chk input { margin: 0; width: 15px; height: 15px; accent-color: var(--acc); }
  .row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .b { height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font-size: 13px; }
  .b.pri { border: 0; padding: 0 14px; background: var(--acc); color: var(--onacc); font-weight: 600; }
</style>

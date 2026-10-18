<script lang="ts">
  import { onMount } from 'svelte';
  import { catalog, kb, type CatalogEntry } from '../pluginCatalog.svelte';
  import { RIGHTS } from '../api/host.svelte';
  import type { Manifest } from '../api/manifest';
  import Sheet from './ui/Sheet.svelte';
  import Button from './ui/Button.svelte';

  // «Установить «X»?» in the new interface (ТЗ 54 §3, ТЗ 37 §7): what the plugin gets, the release downloaded and
  // its size, on at once — a sheet of ТЗ 44 over the settings.
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
</script>

<Sheet title="Установить «{e.name}»?" label="Установка плагина" oncancel={onclose}>
  <p class="dim">{m.permissions.length ? 'Плагин получит:' : 'Плагину не нужно никаких прав: только свои настройки и данные.'}</p>
  {#if m.permissions.length}
    <ul>{#each m.permissions as p (p)}<li class:net={p === 'net'}>{RIGHTS[p] ?? p}{p === 'net' && m.net.length ? `: ${m.net.join(', ')}` : ''}</li>{/each}</ul>
  {/if}
  <p class="fine">Скачается релиз v{m.version} из github.com/{e.repo}{size ? ` (${kb(size)})` : ''} в папку плагинов. Удалить можно в «Настройки → Плагины».</p>
  <label class="chk"><input type="checkbox" bind:checked={enable} /><span class="box" aria-hidden="true">✓</span>Включить сразу после установки</label>
  {#snippet foot()}
    <span style="flex:1"></span>
    <Button key="esc" onclick={onclose}>Отмена</Button>
    <Button kind="main" autofocus onclick={go}>Установить</Button>
  {/snippet}
</Sheet>

<style>
  p { margin: 0; }
  .dim { color: var(--ink2); }
  ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
  .net { color: var(--wait); font-weight: 600; }
  .fine { font-size: 12px; color: var(--ink3); }
  .chk { display: flex; align-items: center; gap: 8px; cursor: default; }
  .chk input { position: absolute; opacity: 0; pointer-events: none; }
  .box { flex: 0 0 15px; width: 15px; height: 15px; box-sizing: border-box; border: 1.5px solid var(--ink3); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: transparent; font-size: 10px; font-weight: 800; }
  .chk input:checked + .box { border: 0; background: var(--lamp); color: var(--onlamp); }
  .chk input:focus-visible + .box { outline: 2px solid var(--lampline); outline-offset: 1px; }
</style>

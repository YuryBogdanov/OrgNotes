<script lang="ts">
  import { catalog, kb, type CatalogEntry, type CatState } from './pluginCatalog.svelte';

  // The button of a plugin in the catalog (ТЗ 37 §5): «Установить», «✓ Установлен», «Обновить · x», why not, or the
  // progress of its download with «Отменить».
  let { e, s, big = false, onact }: { e: CatalogEntry; s: CatState; big?: boolean; onact: () => void } = $props();
</script>

{#if s.kind === 'progress'}
  <span class="prog" role="progressbar" aria-label="Установка «{e.name}»" aria-valuenow={s.total ? Math.round((s.done / s.total) * 100) : 0}>
    <span class="pt">
      <span class="pl">{s.enabling ? 'Включаем…' : s.total ? `${kb(s.done)} из ${kb(s.total)}` : 'Скачиваем…'}</span>
      {#if !s.enabling}<button class="lnk" onclick={() => catalog.cancel(e.id)}>Отменить</button>{/if}
    </span>
    <span class="bar"><span style:width={s.enabling ? '100%' : `${s.total ? Math.round((s.done / s.total) * 100) : 4}%`}></span></span>
  </span>
{:else if s.kind === 'install'}
  <button class="b pri" class:big onclick={onact}>Установить</button>
{:else if s.kind === 'installed'}
  <span class="b done" class:big>✓ Установлен</span>
{:else if s.kind === 'update'}
  <button class="b upd" class:big onclick={onact}>Обновить · {s.version}</button>
{:else if s.kind === 'old'}
  <span class="b old" class:big title="Этот плагин не подходит вашей версии приложения">{s.why}</span>
{/if}

<style>
  .b { margin-left: auto; height: 26px; display: inline-flex; align-items: center; padding: 0 12px; box-sizing: border-box; border-radius: 6px; border: 0; background: transparent; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
  .b.big { height: 30px; padding: 0 16px; border-radius: 7px; font-size: 13px; }
  .pri { background: var(--acc); color: var(--onacc); }
  .done { color: var(--fg2); font-weight: 500; }
  .upd { border: 1px solid var(--acc); color: var(--acc); }
  .old { border: 1px solid var(--line); color: var(--fg3); font-weight: 500; }
  .prog { margin-left: auto; flex: 0 1 190px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .pt { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--fg2); white-space: nowrap; min-width: 0; }
  .pl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .lnk { flex: 0 0 auto; padding: 0; border: 0; background: none; color: var(--acc); font-size: 11.5px; }
  .bar { height: 4px; border-radius: 2px; background: var(--field); overflow: hidden; }
  .bar span { display: block; height: 4px; background: var(--acc); transition: width 0.15s; }
</style>

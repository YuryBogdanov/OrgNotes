<script lang="ts">
  import SchemaSettings from './SchemaSettings.svelte';
  import { store } from './store.svelte';
  import { blocksOf } from './views';

  // «Настройки → Агенды» (tech sprint 4.2, from Settings.svelte): «Мои агенды», a new one in the builder. Deleting
  // asks first: the sheet shows the question (`onremove`).
  let { onremove }: { onremove: (a: { id: string; name: string }) => void } = $props();

  /** «Новая агенда»: the settings close and the builder opens (one sheet at a time); ⌘, brings them back. */
  function newAgenda() {
    store.closeSettings();
    store.newAgendaInBuilder();
  }
</script>

<section class="general spage" aria-label="Агенды">
  <div class="cap">МОИ АГЕНДЫ</div>
  {#if store.agendas.length}
    <div class="alist" role="list" aria-label="Мои агенды">
      {#each store.agendas as a (a.id)}
        <div class="arow" role="listitem">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 6h12M4 10h8M4 14h5" /></svg>
          <span class="an">{a.name}</span>
          <span class="ab">{a.blocks.length} {a.blocks.length % 10 === 1 && a.blocks.length % 100 !== 11 ? 'блок' : a.blocks.length % 10 >= 2 && a.blocks.length % 10 <= 4 && (a.blocks.length % 100 < 12 || a.blocks.length % 100 > 14) ? 'блока' : 'блоков'}</span>
          <button class="x" aria-label="Удалить агенду {a.name}" title="Удалить агенду" onclick={() => onremove({ id: a.id, name: a.name })}>×</button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="help">Своих агенд пока нет. Агенда — это набор блоков, каждый выбирает задачи по условиям.</p>
  {/if}
  <div><button class="primary-b" onclick={newAgenda}>Новая агенда в конструкторе…</button></div>
  <p class="help">Изменить агенду можно в навигаторе в режиме «Агенда» (⌃⌘2): правый клик по названию → «Редактировать…».</p>
  {#each blocksOf('Агенды') as b (b.schema.id)}<SchemaSettings schema={b.schema} embedded />{/each}
</section>

<style>
  .alist { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .arow { display: flex; align-items: center; gap: 9px; height: 36px; padding: 0 8px 0 12px; background: var(--side); }
  .arow + .arow { border-top: 1px solid var(--line); }
  .an { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ab { font-size: 12px; color: var(--fg2); }
  .primary-b { height: 28px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--acc); color: var(--onacc); font-size: 12.5px; font-weight: 600; }
  .x { width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: var(--fg3); font-size: 16px; }
  .x:hover:not(:disabled) { background: var(--field); color: var(--todo); }
  .x:disabled { opacity: 0.3; }
</style>

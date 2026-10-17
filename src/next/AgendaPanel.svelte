<script lang="ts">
  import { store } from '../store.svelte';
  import { asNamed } from '../themes';
  import Compat from './Compat.svelte';
  import { ConfirmDialog, ContextMenu, type MenuItem } from './bridges';

  // «Агенда» of the new sidebar (ТЗ 43 §2.2): the built-in agenda, then «Мои агенды»; 28 pt rows — the agenda's dot
  // (its first block's colour), its name. A click opens it in the agenda's tab (or switches the one open); the one
  // shown is marked. A right click on one of mine: «Редактировать…», «Удалить агенду…»; a double click edits it.
  // «Новая агенда…» at the bottom: the builder (a bridge).
  const shown = $derived(store.tab?.kind === 'agenda' ? (store.agenda?.id ?? '') : null);
  const dot = (color: string | undefined) => (asNamed(color) ? `var(--p-${asNamed(color)})` : (color ?? 'var(--ink3)'));
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let confirmDel = $state<{ id: string; name: string } | null>(null);
  function agendaMenu(e: MouseEvent, id: string, name: string) {
    e.preventDefault();
    const from = e.currentTarget as Element;
    menu = {
      x: e.clientX,
      y: e.clientY,
      items: [{ label: 'Редактировать…', action: () => store.editAgenda(id, from) }, 'sep', { label: 'Удалить агенду…', danger: true, action: () => (confirmDel = { id, name }) }],
    };
  }
</script>

<nav class="ap" aria-label="Список агенд">
  <div class="cap">Встроенные</div>
  <button class="row" class:on={shown === ''} aria-current={shown === '' ? 'true' : undefined} onclick={() => store.openAgendaHere('')}>
    <i style:background="var(--lamp)"></i><span class="nm">Агенда</span>
  </button>
  <div class="cap">Мои агенды</div>
  {#each store.agendas as a (a.id)}
    <button class="row" class:on={shown === a.id} aria-current={shown === a.id ? 'true' : undefined}
      onclick={() => store.openAgendaHere(a.id)} oncontextmenu={(e) => agendaMenu(e, a.id, a.name)} ondblclick={(e) => store.editAgenda(a.id, e.currentTarget)}>
      <i style:background={dot(a.blocks[0]?.color)}></i><span class="nm">{a.name}</span>
    </button>
  {:else}
    <p class="none">Своих агенд пока нет</p>
  {/each}
  <button class="new" onclick={(e) => store.newAgendaInBuilder(e.currentTarget)}>
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
    Новая агенда…
  </button>
</nav>

<Compat>
  {#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}
  {#if confirmDel}
    {@const id = confirmDel.id}
    <ConfirmDialog label="Удаление агенды" title="Удалить агенду «{confirmDel.name}»?" onclose={() => (confirmDel = null)} actions={[{ label: 'Удалить', kind: 'danger', run: () => void store.deleteAgenda(id) }]}>
      Задачи и файлы не изменятся: удаляется только сама агенда.
    </ConfirmDialog>
  {/if}
</Compat>

<style>
  .ap { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; }
  .cap { padding: 10px 10px 4px; font-size: 11px; font-weight: 600; color: var(--ink3); }
  .cap:first-child { padding-top: 2px; }
  .row { flex: 0 0 28px; display: flex; align-items: center; gap: 9px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink2); font: 13px var(--ui); text-align: left; white-space: nowrap; }
  .row:hover:not(.on) { background: var(--chip); }
  .row.on { background: var(--lampsoft); color: var(--ink); }
  .row i { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 4px; }
  .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .none { margin: 0; padding: 4px 10px; font-size: 12px; color: var(--ink3); }
  .new { flex: 0 0 28px; display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--lampink); font: 12.5px var(--ui); text-align: left; }
  .new:hover { background: var(--chip); }
  .row:focus-visible, .new:focus-visible { outline: 2px solid var(--lamp); outline-offset: -2px; }
</style>

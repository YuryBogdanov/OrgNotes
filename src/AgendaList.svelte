<script lang="ts">
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { store } from './store.svelte';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';

  // The navigator in the «Агенда» mode: the built-in agenda, «Мои агенды», «Новая агенда». A picked agenda opens
  // in the active pane; the one shown there is marked. A right click on a custom one: «Редактировать…», «Удалить…».
  const shown = $derived(store.tab?.kind === 'agenda' ? (store.agenda?.id ?? '') : null);
  // ---- right click ----------------------------------------------------------------------------------
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let confirmDel = $state<{ id: string; name: string } | null>(null);
  function agendaMenu(e: MouseEvent, id: string, name: string) {
    e.preventDefault();
    const from = e.currentTarget as Element;
    menu = {
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Редактировать…', action: () => store.editAgenda(id, from) },
        'sep',
        { label: 'Удалить агенду…', danger: true, action: () => (confirmDel = { id, name }) },
      ],
    };
  }
  function delKey(e: KeyboardEvent) {
    if (confirmDel && e.key === 'Escape') {
      e.preventDefault();
      confirmDel = null;
    }
  }
</script>

<svelte:window onkeydown={delKey} />

<nav class="lst" aria-label="Список агенд">
  <div class="cap">ВСТРОЕННЫЕ</div>
  <button class="ag" class:on={shown === ''} aria-current={shown === '' ? 'true' : undefined} onclick={() => store.openAgendaHere('')}>
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3" /></svg>
    <span>Агенда</span>
  </button>
  <div class="cap mine">МОИ АГЕНДЫ</div>
  {#each store.agendas as a (a.id)}
    <button class="ag" class:on={shown === a.id} aria-current={shown === a.id ? 'true' : undefined}
      onclick={() => store.openAgendaHere(a.id)} oncontextmenu={(e) => agendaMenu(e, a.id, a.name)} ondblclick={(e) => store.editAgenda(a.id, e.currentTarget)}>
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 6h12M4 10h8M4 14h5" /></svg>
      <span>{a.name}</span>
    </button>
  {/each}
  <button class="new" onclick={(e) => store.newAgendaInBuilder(e.currentTarget)}>
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 3v14M3 10h14" /></svg>
    Новая агенда
  </button>
  <p class="hint">Выбранная агенда открывается в активной панели.</p>
</nav>

{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}
{#if confirmDel}
  {@const id = confirmDel.id}
  <ConfirmDialog label="Удаление агенды" title="Удалить агенду «{confirmDel.name}»?" onclose={() => (confirmDel = null)} actions={[{ label: 'Удалить', kind: 'danger', run: () => void store.deleteAgenda(id) }]}>
    Задачи и файлы не изменятся: удаляется только сама агенда.
  </ConfirmDialog>
{/if}

<style>
  .hint { margin: 12px 0 0; padding: 0 10px; font-size: 11.5px; line-height: 1.45; color: var(--fg2); }
  .lst { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 2px; padding: 10px 6px; overflow: auto; }
  .cap { padding: 0 10px 4px; font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .cap.mine { margin-top: 12px; }
  .ag { flex: 0 0 auto; display: flex; align-items: center; gap: 9px; height: 28px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--fg); text-align: left; font-size: 13px; }
  .ag svg { flex: 0 0 15px; }
  .ag span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ag.on { background: var(--sel); color: var(--acc); }
  .ag:focus-visible, .new:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .new { flex: 0 0 auto; margin-top: 6px; height: 28px; border: 1px dashed var(--line); background: transparent; color: var(--fg2); border-radius: 6px; font-size: 12.5px; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .new:hover { color: var(--acc); }
</style>

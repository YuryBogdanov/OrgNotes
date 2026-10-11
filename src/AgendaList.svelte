<script lang="ts">
  import { store } from './store.svelte';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';

  // The list of agendas in place of the navigator (an agenda alone in the window, as on the design board):
  // the built-in one, «Мои агенды», «Новая агенда». A right click on a custom one: «Редактировать…», «Удалить…».
  const custom = $derived(store.agenda);
  const pick = (id: string) => {
    if (id !== store.agendaSel) store.selectAgenda(id);
  };
  // ---- right click ----------------------------------------------------------------------------------
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let confirmDel = $state<{ id: string; name: string } | null>(null);
  function agendaMenu(e: MouseEvent, id: string, name: string) {
    e.preventDefault();
    menu = {
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Редактировать…', action: () => store.editAgenda(id) },
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
  <div class="cap">АГЕНДЫ</div>
  <button class="ag" class:on={!custom} aria-current={!custom ? 'true' : undefined} onclick={() => pick('')}>
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3" /></svg>
    <span>Агенда</span>
  </button>
  <div class="cap mine">МОИ АГЕНДЫ</div>
  {#each store.agendas as a (a.id)}
    <button class="ag" class:on={custom?.id === a.id} aria-current={custom?.id === a.id ? 'true' : undefined}
      onclick={() => pick(a.id)} oncontextmenu={(e) => agendaMenu(e, a.id, a.name)} ondblclick={() => store.editAgenda(a.id)}>
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 6h12M4 10h8M4 14h5" /></svg>
      <span>{a.name}</span>
    </button>
  {/each}
  <button class="new" onclick={() => store.newAgendaInBuilder()}>
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 3v14M3 10h14" /></svg>
    Новая агенда
  </button>
</nav>

{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}
{#if confirmDel}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal" onmousedown={() => (confirmDel = null)}>
    <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Удаление агенды" onmousedown={(e) => e.stopPropagation()}>
      <h2>Удалить агенду «{confirmDel.name}»?</h2>
      <p>Задачи и файлы не изменятся: удаляется только сама агенда.</p>
      <div class="btns">
        <button onclick={() => (confirmDel = null)}>Отмена</button>
        <button class="danger-b" onclick={() => { const id = confirmDel!.id; confirmDel = null; void store.deleteAgenda(id); }}>Удалить</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .lst { height: 100%; display: flex; flex-direction: column; gap: 2px; padding: 10px 6px; overflow: auto; }
  .cap { padding: 0 10px 4px; font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .cap.mine { margin-top: 12px; }
  .ag { flex: 0 0 auto; display: flex; align-items: center; gap: 9px; height: 28px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--fg); text-align: left; font-size: 13px; }
  .ag svg { flex: 0 0 15px; }
  .ag span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ag.on { background: var(--sel); color: var(--acc); }
  .ag:focus-visible, .new:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .new { flex: 0 0 auto; margin-top: 6px; height: 28px; border: 1px dashed var(--line); background: transparent; color: var(--fg2); border-radius: 6px; font-size: 12.5px; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .new:hover { color: var(--acc); }
  .modal { position: fixed; inset: 0; z-index: 110; background: rgba(0, 0, 0, 0.28); display: flex; align-items: flex-start; justify-content: center; padding-top: 14vh; }
  .dlg { width: 420px; max-width: calc(100% - 32px); padding: 18px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35); }
  .dlg h2 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  .dlg p { margin: 0 0 14px; color: var(--fg2); line-height: 1.45; }
  .btns { display: flex; justify-content: flex-end; gap: 8px; }
  .btns button { height: 28px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--field); }
  .btns .danger-b { background: var(--todo); color: var(--onacc); font-weight: 600; }
</style>

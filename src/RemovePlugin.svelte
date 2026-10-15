<script lang="ts">
  import { pluginUpdates as up } from './pluginUpdates.svelte';
  import { store } from './store.svelte';
  import { portal } from './portal';

  // «Удалить „…“?» (fix of ТЗ 37 §2): over the settings sheet; the plugin goes to the Trash, the notes stay; its
  // settings only with the box ticked. ⎋ — cancel.
  let drop = $state(false);
  const e = $derived(up.removing);
  const name = $derived(e?.manifest?.name ?? e?.dir ?? '');
  $effect(() => {
    if (e) drop = false;
  });
  function go() {
    const x = up.removing;
    if (!x) return;
    up.removing = null;
    // its own settings page goes with it: back to the list
    if (x.manifest?.contributes.settings.some((s) => s.section === store.settingsSection)) store.showSection('Плагины');
    void up.remove(x.manifest?.id ?? x.dir, drop);
  }
</script>

{#if e}
  <div class="layer" use:portal>
    <div class="scrim" aria-hidden="true"></div>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Удалить плагин" tabindex="-1"
      onkeydown={(ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); up.removing = null; } }}>
      <b>Удалить «{name}»?</b>
      <p>Плагин уйдёт в Корзину macOS, его команды и сочетания пропадут. <strong>Ваши org-файлы не изменятся</strong> — включая записи, созданные плагином.</p>
      <label class="box">
        <input type="checkbox" bind:checked={drop} />
        <span>Удалить и настройки плагина<br /><i>…которые вы в нём настроили. Без галочки останутся — пригодятся, если поставите плагин снова</i></span>
      </label>
      <div class="row">
        <button class="btn" onclick={() => (up.removing = null)}>Отмена</button>
        <!-- svelte-ignore a11y_autofocus -->
        <button class="btn danger" autofocus onclick={go}>Удалить</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .layer { color: var(--fg); font: 13px var(--ui); }
  .scrim { position: fixed; inset: 0; z-index: 90; background: rgba(0, 0, 0, 0.3); }
  .dlg { position: fixed; z-index: 91; left: 50%; top: 150px; transform: translateX(-50%); width: min(440px, calc(100% - 32px)); box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; padding: 18px 20px 16px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45); outline: none; }
  b { font-size: 15px; }
  p { margin: 0; line-height: 1.5; }
  .box { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 8px; background: var(--side); font-size: 12.5px; line-height: 1.45; }
  .box input { flex: 0 0 auto; margin: 2px 0 0; }
  .box i { font-style: normal; color: var(--fg2); }
  .row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .btn { height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font: inherit; }
  .danger { padding: 0 14px; border: 0; background: #c9303a; color: #fff; font-weight: 600; }
</style>

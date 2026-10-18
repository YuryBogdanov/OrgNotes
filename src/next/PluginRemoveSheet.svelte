<script lang="ts">
  import { pluginUpdates as up } from '../pluginUpdates.svelte';
  import { store } from '../store.svelte';
  import Sheet from './ui/Sheet.svelte';
  import Button from './ui/Button.svelte';

  // «Удалить „…“?» in the new interface (ТЗ 54 §3, fix of ТЗ 37 §2): a sheet over the settings; the plugin goes to the
  // Trash, the notes stay; its settings only with the box ticked.
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
  <Sheet title="Удалить «{name}»?" label="Удалить плагин" role="alertdialog" oncancel={() => (up.removing = null)}>
    <p>Плагин уйдёт в Корзину macOS, его команды и сочетания пропадут. <b>Ваши org-файлы не изменятся</b> — включая записи, созданные плагином.</p>
    <label class="chk"><input type="checkbox" bind:checked={drop} /><span class="box" aria-hidden="true">✓</span>
      <span>Удалить и настройки плагина<br /><i>Без галочки останутся — пригодятся, если поставите плагин снова</i></span></label>
    {#snippet foot()}
      <span style="flex:1"></span>
      <Button key="esc" onclick={() => (up.removing = null)}>Отмена</Button>
      <Button kind="danger" autofocus onclick={go}>Удалить</Button>
    {/snippet}
  </Sheet>
{/if}

<style>
  p { margin: 0; }
  .chk { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 8px; background: var(--chip); font-size: 12.5px; cursor: default; }
  .chk i { font-style: normal; color: var(--ink3); }
  .chk input { position: absolute; opacity: 0; pointer-events: none; }
  .box { flex: 0 0 15px; width: 15px; height: 15px; margin-top: 1px; box-sizing: border-box; border: 1.5px solid var(--ink3); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: transparent; font-size: 10px; font-weight: 800; }
  .chk input:checked + .box { border: 0; background: var(--lamp); color: var(--onlamp); }
  .chk input:focus-visible + .box { outline: 2px solid var(--lampline); outline-offset: 1px; }
</style>

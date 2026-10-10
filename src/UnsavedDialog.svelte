<script lang="ts">
  import { onMount } from 'svelte';
  import type { Tab } from './layout';

  // "Сохранить изменения в «Без названия»?" before an untitled tab with text is closed (or the app quits).
  let { tab, onanswer }: { tab: Tab; onanswer: (a: 'save' | 'discard' | 'cancel') => void } = $props();
  let saveBtn: HTMLButtonElement | undefined = $state();
  onMount(() => saveBtn?.focus());
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onanswer('cancel');
    }
  }
</script>

<svelte:window onkeydown={key} />

<div class="dim">
  <div class="sheet" role="alertdialog" aria-modal="true" aria-label="Несохранённые изменения">
    <h2>Сохранить изменения в «{tab.title ?? 'Без названия'}»?</h2>
    <p>Если не сохранить, текст этой вкладки пропадёт.</p>
    <div class="btns">
      <button onclick={() => onanswer('discard')}>Не сохранять</button>
      <span class="grow"></span>
      <button onclick={() => onanswer('cancel')}>Отмена</button>
      <button class="primary" bind:this={saveBtn} onclick={() => onanswer('save')}>Сохранить</button>
    </div>
  </div>
</div>

<style>
  .dim { position: fixed; left: 0; right: 0; top: 52px; bottom: 0; z-index: 86; background: rgba(0, 0, 0, 0.2); display: flex; justify-content: center; align-items: flex-start; }
  .sheet { width: 420px; max-width: 92%; padding: 18px 20px 16px; background: var(--bg); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 12px 12px; box-shadow: 0 14px 40px rgba(0, 0, 0, 0.3); }
  h2 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  p { margin: 0 0 14px; color: var(--fg2); line-height: 1.45; }
  .btns { display: flex; align-items: center; gap: 8px; }
  .grow { flex: 1; }
  button { height: 26px; padding: 0 12px; border: 1px solid var(--line); background: var(--bg); border-radius: 6px; font-size: 13px; }
  .primary { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; padding: 0 16px; }
</style>

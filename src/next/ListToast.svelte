<script lang="ts">
  import { fly } from 'svelte/transition';
  import { lists } from '../taskLists.svelte';

  // The toast of a list after a change (ТЗ 34) in the new interface: at the bottom of the screen, in the middle, for
  // 6 seconds — on `card` with `popshadow`, «Отменить ⌘Z» on `chip2`.
  let { list, bottom = 20 }: { list: string; bottom?: number } = $props();
  const t = $derived(lists.toast?.list === list ? lists.toast : null);
</script>

{#if t}
  <div class="at" style:bottom="{bottom}px">
    <div class="lt" role="status" transition:fly={{ y: 6, duration: 140 }}>
      <span class="tx">{t.text}</span>
      <span class="sub">скроется при обновлении</span>
      <button onclick={() => void lists.undo()}>Отменить ⌘Z</button>
    </div>
  </div>
{/if}

<style>
  .at { position: absolute; left: 16px; right: 16px; z-index: 5; display: flex; justify-content: center; pointer-events: none; }
  .lt { pointer-events: auto; display: flex; align-items: center; gap: 14px; height: 38px; max-width: 100%; box-sizing: border-box; padding: 0 6px 0 16px; border-radius: 10px; background: var(--card); border: 1px solid var(--rule); box-shadow: var(--popshadow); color: var(--ink); font: 13px var(--ui); white-space: nowrap; }
  .tx { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .sub { color: var(--ink3); flex: 0 0 auto; }
  button { flex: 0 0 auto; height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: var(--chip2); color: var(--ink); font: 600 12.5px var(--ui); }
  @container (max-width: 560px) { .sub { display: none; } }
</style>

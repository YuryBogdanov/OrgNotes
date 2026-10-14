<script lang="ts">
  import { fly } from 'svelte/transition';
  import { lists } from './taskLists.svelte';

  // The toast of a list after a change (ТЗ 34): at the bottom of the list, in the middle, for 6 seconds.
  let { list, bottom = 38 }: { list: string; bottom?: number } = $props();
  const t = $derived(lists.toast?.list === list ? lists.toast : null);
</script>

{#if t}
  <div class="at" style:bottom="{bottom}px">
    <div class="ltoast" role="status" transition:fly={{ y: 6, duration: 140 }}>
      <span class="tx">{t.text}</span>
      <span class="sub">скроется при обновлении</span>
      <button onclick={() => void lists.undo()}>Отменить ⌘Z</button>
    </div>
  </div>
{/if}

<style>
  /* a dark pill in both themes, as the design draws it */
  .at { position: absolute; left: 16px; right: 16px; bottom: 38px; z-index: 5; display: flex; justify-content: center; pointer-events: none; }
  .ltoast {
    pointer-events: auto; display: flex; align-items: center; gap: 14px; height: 38px; max-width: 100%; box-sizing: border-box;
    padding: 0 8px 0 16px; border-radius: 9px; background: #2b2b31; color: #f2f2f4; font-size: 13px; white-space: nowrap;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }
  .tx { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .sub { color: #a9a9b3; flex: 0 0 auto; }
  button { flex: 0 0 auto; height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: #3d3d46; color: inherit; font-weight: 600; font-size: 13px; }
  button:hover { background: #4a4a54; }
  @container (max-width: 560px) { .sub { display: none; } }
</style>

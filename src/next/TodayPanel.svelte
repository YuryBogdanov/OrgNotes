<script lang="ts">
  import { today } from '../todayState.svelte';

  // The panel «Сегодня» of the sidebar (ТЗ 50 §4): its body grows in 50.4 (the compact day, the screen's contents);
  // its foot — «Полная версия» (the tab «Сегодня») and «Завершить день» (the sheet of ТЗ 32), two buttons of 28 pt.
  let { full }: { full: boolean } = $props();
</script>

<div class="tp">
  <div class="body"></div>
  <div class="foot">
    {#if !full}<button onclick={() => today.open()}>Полная версия</button>{/if}
    <button onclick={() => today.openEndDay()}>Завершить день</button>
  </div>
</div>

<style>
  .tp { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .body { flex: 1; min-height: 0; overflow: auto; }
  .foot { flex: 0 0 auto; display: flex; gap: 6px; padding: 10px 6px 12px; }
  .foot button { flex: 1; height: 28px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 500 12.5px var(--ui); white-space: nowrap; }
  .foot button:hover { background: var(--lampsoft); }
  .foot button:focus-visible { outline: 2px solid var(--lampline); outline-offset: 1px; }
</style>

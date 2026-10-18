<script lang="ts">
  import { fly } from 'svelte/transition';
  import { lists } from '../taskLists.svelte';

  // The one toast after a change in the new interface (ТЗ 48 §1, ТЗ 34 §5) — of any list, the plugins' too: at the
  // bottom of the tab's area, in the middle; the popover of ТЗ 44, 38 pt, 13 pt with the value bold («Запланировано на
  // **завтра** · План переезда хранилища»), «Отменить ⌘Z»; 4 s, the pointer over it holds it.
  const t = $derived(lists.toast);
  const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

{#if t}
  <div class="at">
    <div class="lt" role="status" transition:fly={{ y: 6, duration: still() ? 0 : 140 }} onmouseenter={() => lists.holdToast(true)} onmouseleave={() => lists.holdToast(false)}>
      {#if t.lead}
        <span class="tx">{t.lead}{#if t.value}{' '}<b>{t.value}</b>{/if}{#if t.title}<span class="ti">{` · ${t.title}`}</span>{/if}</span>
      {:else}
        <span class="tx">{t.text}</span>
      {/if}
      {#if t.action}
        {@const a = t.action}
        <button onclick={() => { lists.toast = null; a.run(); }}>{a.label}</button>
      {:else}
        <button onclick={() => void lists.undo()}>Отменить <span class="k">⌘Z</span></button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .at { position: absolute; left: 16px; right: 16px; bottom: 20px; z-index: 6; display: flex; justify-content: center; pointer-events: none; }
  .lt { pointer-events: auto; display: flex; align-items: center; gap: 14px; height: 38px; max-width: 100%; box-sizing: border-box; padding: 0 6px 0 16px; border-radius: 10px; background: var(--card); border: 1px solid var(--rule); box-shadow: var(--popshadow); color: var(--ink); font: 13px var(--ui); white-space: nowrap; }
  .tx { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .tx b { font-weight: 600; }
  .ti { color: var(--ink2); }
  button { flex: 0 0 auto; height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: var(--chip2); color: var(--ink); font: 600 12.5px var(--ui); }
  .k { font: 11px var(--mono); opacity: 0.65; margin-left: 2px; }
</style>

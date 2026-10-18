<script lang="ts">
  import { plugins } from './api/host.svelte';

  // A plugin's block of «Сегодня» (ТЗ 32): an element in the core's card it draws in; it may leave the block out, and
  // give a summary for the panel «Сегодня» (ТЗ 50 §6).
  let { id }: { id: string } = $props();
  let el = $state<HTMLElement>();
  const entry = $derived(plugins.todayRenders.get(id));

  $effect(() => {
    const node = el;
    const e = entry;
    if (!node || !e) return;
    const block = {
      setHidden: (h: boolean) => void (h ? plugins.todayHidden.set(id, true) : plugins.todayHidden.delete(id)),
      // the panel «Сегодня» of the new interface (API 1.15): a short line; null — none
      setSummary: (v: { text: string; tone?: 'alert' | 'wait' } | null) => {
        if (v && typeof v.text === 'string' && v.text.trim()) plugins.todaySummary.set(id, { text: v.text.trim().slice(0, 40), tone: v.tone === 'alert' || v.tone === 'wait' ? v.tone : undefined });
        else plugins.todaySummary.delete(id);
      },
    };
    const dispose = plugins.guard(e.plugin, () => e.render(node, block), undefined);
    return () => {
      plugins.guard(e.plugin, () => dispose?.(), undefined);
      node.replaceChildren();
    };
  });
</script>

<div class="ptb" bind:this={el} data-block={id}></div>

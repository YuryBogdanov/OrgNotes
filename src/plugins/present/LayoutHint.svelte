<script lang="ts">
  import { LAYOUT_NAMES, type Layout } from './model';
  import { HINTS, SCHEME, parts } from './hints';

  // The card of a layout (fix-59-1 §4): its scheme large, its name, what it does, «В ФАЙЛЕ» and an example of Org.
  let { layout }: { layout: Layout } = $props();
  const h = $derived(HINTS[layout]);
</script>

<div class="pr-hintcard" role="tooltip">
  <div class="hc-top">
    <svg width="96" height="60" viewBox="0 0 32 20" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="0.45" y="0.45" width="31.1" height="19.1" rx="1.6" /><path d={SCHEME[layout]} /></svg>
    <b>{LAYOUT_NAMES[layout]}</b>
  </div>
  <div class="hc-words">{#each parts(h.words) as p, i (i)}{#if p.code}<code>{p.t}</code>{:else}{p.t}{/if}{/each}</div>
  <div class="hc-cap">В ФАЙЛЕ</div>
  <pre class="hc-ex">{h.example}</pre>
</div>

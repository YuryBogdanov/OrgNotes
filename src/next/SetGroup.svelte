<script lang="ts">
  import type { Snippet } from 'svelte';

  // A group of a settings' section (ТЗ 54 §2): its caption 11 pt semibold `ink3` in capitals, a note beside it; under
  // them a card on `card` with a `rule` and 12 pt corners. 18 pt between groups.
  let { caption, note, label, children, head }: { caption?: string; note?: string; label?: string; children: Snippet; head?: Snippet } = $props();
</script>

<section class="grp" aria-label={label ?? caption}>
  {#if caption || note || head}
    <div class="gh">{#if caption}<span class="cap">{caption}</span>{/if}{#if note}<span class="note">{note}</span>{/if}{#if head}{@render head()}{/if}</div>
  {/if}
  <div class="card">{@render children()}</div>
</section>

<style>
  .grp { margin-bottom: 18px; }
  .gh { display: flex; align-items: baseline; gap: 8px; margin: 0 4px 6px; }
  .cap { flex: 0 0 auto; white-space: nowrap; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink3); }
  .note { min-width: 0; font-size: 11.5px; color: var(--ink3); }
  .card { border: 1px solid var(--rule); border-radius: 12px; background: var(--card); overflow: hidden; }
</style>

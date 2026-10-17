<script lang="ts">
  import type { Snippet } from 'svelte';
  import { store } from '../store.svelte';
  import { tokenVars } from './tokens';
  import { compatVars } from './compat';

  // The compatibility layer (ТЗ 43 §5): around anything old — a core screen through a bridge, a plugin's panel or tab,
  // a bridged sheet or menu. It gives the old variables by the new tokens (compat.ts), so the old content draws in the
  // new colours, its layout and fonts its own. The tokens themselves too: a menu moved to <body> (`use:portal`) is out
  // of the window's frame. `data-ui="next"` lets a plugin know where it is. No box of its own: `display: contents`.
  let { children }: { children: Snippet } = $props();
  const style = $derived(`${tokenVars(store.appearance)};${compatVars(store.appearance)}`);
</script>

<div class="compat" data-ui="next" {style}>{@render children()}</div>

<style>
  .compat { display: contents; color: var(--fg); font-family: var(--ui); }
</style>

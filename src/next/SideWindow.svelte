<script lang="ts">
  import { applyStored, effective, readChoice } from '../appearance';
  import { tokenVars, FONTS } from './tokens';
  import MiniWindow from './MiniWindow.svelte';
  import CaptureWindow from './CaptureWindow.svelte';

  // The windows over other programs in the new interface (ТЗ 52 §1): the mini window (#mini) and the quick entry
  // (#capture). On their root the new tokens by the app's appearance, `data-ui="next"`, the interface's fonts; no
  // layer of compatibility (no plugins here). The appearance follows the main window's (they share the storage).
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  let look = $state(effective(readChoice(), mq?.matches));
  $effect(() => {
    const again = () => {
      applyStored();
      look = effective(readChoice(), mq?.matches);
    };
    window.addEventListener('storage', again);
    mq?.addEventListener('change', again);
    return () => {
      window.removeEventListener('storage', again);
      mq?.removeEventListener('change', again);
    };
  });
  const mini = location.hash === '#mini';
</script>

<!-- `next`: the new editor's styles (editor.css) are the window's -->
<div class="side-win next" data-ui="next" style="{tokenVars(look)};--ui:{FONTS.ui};--mono:{FONTS.mono};--text:{FONTS.ui};--title:{FONTS.title}">
  {#if mini}<MiniWindow />{:else}<CaptureWindow />{/if}
</div>

<style>
  .side-win { color: var(--ink); font: 13px/1.45 var(--ui); }
</style>

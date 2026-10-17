<script lang="ts">
  import type { Snippet } from 'svelte';
  import Sheet from './ui/Sheet.svelte';
  import Button from './ui/Button.svelte';

  // «Удалить …?» and the like in the new interface (ТЗ 44 §4): a sheet — the title, a line of text, «Отмена esc» and
  // the actions; the last one has the focus. An action runs, then the sheet closes.
  export interface ConfirmAction {
    label: string;
    kind?: 'danger' | 'primary';
    run: () => void;
  }
  let { label, title, actions, onclose, children }: { label: string; title: string; actions: ConfirmAction[]; onclose: () => void; children?: Snippet } = $props();
</script>

<Sheet {title} {label} role="alertdialog" oncancel={onclose}>
  {#if children}<p>{@render children()}</p>{/if}
  {#snippet foot()}
    <span style="flex:1"></span>
    <Button key="esc" onclick={onclose}>Отмена</Button>
    {#each actions as a, i (a.label)}
      <Button kind={a.kind === 'danger' ? 'danger' : 'main'} autofocus={i === actions.length - 1} onclick={() => (a.run(), onclose())}>{a.label}</Button>
    {/each}
  {/snippet}
</Sheet>

<style>
  p { margin: 0; }
</style>

<script module lang="ts">
  export interface ConfirmAction {
    label: string;
    kind?: 'danger' | 'primary';
    run: () => void;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import Modal from './Modal.svelte';

  // «Удалить …?» and the like (tech sprint 1.2): a title, a line of text, «Отмена» and the actions — the last one gets
  // the focus. An action runs, then the dialog closes (its `onclose` after the action: an action that reads the
  // dialog's state still has it).
  let { label, title, actions, onclose, children }: { label: string; title: string; actions: ConfirmAction[]; onclose: () => void; children?: Snippet } = $props();
</script>

<Modal {label} {onclose}>
  <h2>{title}</h2>
  {#if children}<p>{@render children()}</p>{/if}
  <div class="btns">
    <button onclick={onclose}>Отмена</button>
    {#each actions as a (a.label)}
      <button class={a.kind ?? ''} onclick={() => (a.run(), onclose())}>{a.label}</button>
    {/each}
  </div>
</Modal>

<script lang="ts">
  import New from './New.svelte';

  // «+ Задача» / «+ Событие» over the window (a bare sheet of the core): under the toolbar, a click outside closes it.
  let { kind, date, onclose }: { kind: 'task' | 'event'; date: string; onclose: () => void } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="capscrim" onmousedown={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <New {kind} {date} {onclose} />
</div>

<style>
  .capscrim { position: fixed; inset: 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 110px; }
</style>

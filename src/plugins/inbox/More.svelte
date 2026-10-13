<script lang="ts">
  import { data } from './state.svelte';
  import { session } from './session.svelte';

  // «…» right of the bar: «Открыть в файле», «Удалить…» (asks when the task has text under it).
  function del() {
    if (session.item?.hasDetails) session.confirmDel = true;
    else void session.remove();
  }
  function more(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    data.ctx.ui.menu([{ label: 'Открыть в файле', run: () => session.openInFile() }, 'sep', { label: 'Удалить…', danger: true, run: del }], { x: r.right - 220, y: r.top - 76 });
  }
</script>

<button class="dots" aria-label="Ещё: удалить, открыть в файле" title="Ещё" onclick={more}>
  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="10" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="15" cy="10" r="1.4" /></svg>
</button>

<script lang="ts">
  let { onresize }: { onresize: (dx: number) => void } = $props();
  let last = 0;
  function down(e: PointerEvent) {
    last = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    onresize(e.clientX - last);
    last = e.clientX;
  }
</script>

<div class="split" role="separator" aria-orientation="vertical" onpointerdown={down} onpointermove={move}></div>

<style>
  .split { flex: 0 0 1px; width: 1px; background: var(--line); position: relative; z-index: 5; }
  .split::after { content: ''; position: absolute; inset: 0 -4px; cursor: col-resize; }
</style>

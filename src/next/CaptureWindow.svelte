<script lang="ts">
  import { onMount } from 'svelte';
  import Capture from './Capture.svelte';

  // The quick entry as a panel of its own in the new interface (ТЗ 52 §4; ⇧⌘I from another program, ТЗ 01 §4). It only takes the text: the main window
  // writes the task (it owns the files, their unsaved edits and conflicts) and answers how it went.
  let n = $state(1);
  let file = $state<string | null>(null);
  let box: HTMLDivElement | undefined = $state();
  const readFile = () => {
    try {
      file = localStorage.getItem('capture:file') || null;
    } catch {
      file = null;
    }
  };
  readFile();

  async function win() {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow();
  }
  async function hide() {
    (await win()).hide();
  }
  async function submit(title: string, details: string): Promise<'ok' | 'nofile' | 'empty' | 'error'> {
    const { emitTo, once } = await import('@tauri-apps/api/event');
    const id = Date.now();
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve('error'), 5000);
      void once<{ id: number; result: 'ok' | 'nofile' | 'empty' | 'error' }>('capture-result', (e) => {
        if (e.payload.id !== id) return;
        clearTimeout(timer);
        resolve(e.payload.result);
      }).then(() => emitTo('main', 'capture-submit', { id, title, details }));
    });
  }
  async function pick() {
    const { emitTo } = await import('@tauri-apps/api/event');
    const { invoke } = await import('@tauri-apps/api/core');
    await hide();
    await invoke('show_main_window');
    await emitTo('main', 'capture-pick');
  }

  onMount(() => {
    let off: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen('capture-open', () => {
        readFile();
        n++; // a fresh entry, with the draft
      }).then((u) => (off = u)),
    );
    // closes when it loses the focus (the draft stays)
    const blur = () => void hide();
    window.addEventListener('blur', blur);
    // the panel is as tall as its content
    const ro = new ResizeObserver(async () => {
      if (!box) return;
      const { LogicalSize } = await import('@tauri-apps/api/dpi');
      (await win()).setSize(new LogicalSize(600, Math.ceil(box.getBoundingClientRect().height)));
    });
    if (box) ro.observe(box);
    return () => {
      off?.();
      window.removeEventListener('blur', blur);
      ro.disconnect();
    };
  });
</script>

<div class="panel" bind:this={box}>
  {#key n}<Capture {file} standalone onsubmit={submit} onpick={pick} onclose={() => void hide()} />{/key}
</div>

<style>
  .panel { width: 600px; }
  :global(html:has(.panel)), :global(body:has(.panel)) { background: transparent !important; overflow: hidden; }
</style>

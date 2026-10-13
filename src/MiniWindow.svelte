<script lang="ts">
  import { onMount } from 'svelte';

  // The mini window (ТЗ 31), its prototype (PR A): the native panel over every program — full-screen ones too — that
  // fades away from the pointer. Here: the header and a draft to type in; the note of the main window comes in PR B.
  const KEY = 'mini:draft';
  const read = () => {
    try {
      return localStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  };
  let text = $state(read());
  let area: HTMLTextAreaElement | undefined = $state();
  const isTauri = '__TAURI_INTERNALS__' in window;
  async function call(cmd: string, args?: Record<string, unknown>) {
    if (!isTauri) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke(cmd, args).catch(() => {});
  }
  let last = 0;
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      void call('mini_return_focus'); // the keys back to the program before; the window stays and fades
      return;
    }
    if (e.metaKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      void call('mini_hide');
      return;
    }
    // full while typed in: a key now and then is enough (the pause is counted natively)
    const now = Date.now();
    if (now - last > 250) {
      last = now;
      void call('mini_typed');
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, text);
    } catch {
      /* the draft of the prototype only */
    }
  }
  onMount(() => {
    let off: (() => void) | undefined;
    if (isTauri)
      void import('@tauri-apps/api/event').then(({ listen }) =>
        listen('mini-focus', () => {
          area?.focus();
        }).then((u) => (off = u)),
      );
    area?.focus();
    return () => off?.();
  });
</script>

<div class="mini" role="application" aria-label="Мини-окно">
  <header data-tauri-drag-region>
    <button class="close" aria-label="Скрыть мини-окно" title="Скрыть мини-окно · ⌘W" onclick={() => call('mini_hide')}></button>
    <span class="path" data-tauri-drag-region title="Прототип мини-окна"><span class="file">прототип ›</span> <b>Черновик</b></span>
  </header>
  <textarea bind:this={area} bind:value={text} oninput={save} onkeydown={key} spellcheck="false" aria-label="Текст"
    placeholder="Пишите здесь. ⌃⌥⌘M — показать или вернуться в программу, ⎋ — вернуть фокус, ⌘W — скрыть."></textarea>
</div>

<style>
  :global(html), :global(body) { background: transparent !important; }
  .mini { position: fixed; inset: 0; display: flex; flex-direction: column; border-radius: 11px; overflow: hidden; background: var(--bg); border: 1px solid var(--line); color: var(--fg); }
  header { flex: 0 0 30px; display: flex; align-items: center; gap: 8px; padding: 0 10px; background: var(--bar); border-bottom: 1px solid var(--line); font-size: 12.5px; user-select: none; -webkit-user-select: none; }
  .close { flex: 0 0 11px; width: 11px; height: 11px; padding: 0; border: 0; border-radius: 6px; background: #ff5f57; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.18); }
  .path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file { color: var(--fg2); }
  textarea { flex: 1; min-height: 0; resize: none; border: 0; outline: none; padding: 10px 12px; background: transparent; color: var(--fg); font: 14px/1.55 var(--mono, ui-monospace, Menlo, monospace); }
</style>

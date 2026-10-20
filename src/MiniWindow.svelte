<script lang="ts">
  import { windowDrag } from './windowDrag';
  import { onMount } from 'svelte';
  import Editor from './Editor.svelte';
  import MiniPalette from './MiniPalette.svelte';
  import FindBar from './FindBar.svelte';
  import { store, type MiniNote } from './store.svelte';
  import { keyHandler } from './keyDispatch';
  import { pressOf } from './keys';
  import { applyStored } from './appearance';
  import type { Heading } from './org';

  // The mini window (ТЗ 31): one note over every program — the heading with its subtree (narrowed) or a file whole —
  // in the editor of the main window, on the same state of the files (the store mirrors the main window's: its edits
  // go there). ⌘P changes the note; what needs the big window says «Доступно в главном окне».
  const isTauri = '__TAURI_INTERNALS__' in window;
  async function call(cmd: string, args?: Record<string, unknown>) {
    if (!isTauri) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke(cmd, args).catch(() => {});
  }
  async function toMain(event: string, payload: unknown) {
    if (!isTauri) return;
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo('main', event, payload).catch(() => {});
  }

  // ---- the note and its heading now ------------------------------------------------------------------------
  const note = $derived(store.miniNote);
  const file = $derived(note ? store.files.find((f) => f.name === note.path) : undefined);
  /** The heading by its title, the nearest to where it was; gone from its file — the one heading of that title in
   *  another file (moved there, ТЗ 16). */
  function find(n: MiniNote): { name: string; h: Heading } | null {
    const near = (hs: Heading[]) => hs.filter((h) => h.title === n.title).sort((a, b) => Math.abs(a.line - n.line) - Math.abs(b.line - n.line))[0];
    const f = store.files.find((x) => x.name === n.path);
    const here = f && near(f.headings);
    if (here) return { name: f.name, h: here };
    const elsewhere = store.files.flatMap((x) => x.headings.filter((h) => h.title === n.title).map((h) => ({ name: x.name, h })));
    return elsewhere.length === 1 ? elsewhere[0] : null;
  }
  const found = $derived(note && !note.whole && store.loaded ? find(note) : null);
  // it moved (another file, another line): the note follows it
  $effect(() => {
    if (note && found && (found.name !== note.path || found.h.line !== note.line)) store.setMiniNote({ ...note, path: found.name, line: found.h.line });
  });
  const shown = $derived(note?.whole ? file : found ? store.files.find((f) => f.name === found.name) : undefined);
  const gone = $derived(!!note && !note.whole && store.loaded && !found);

  /** Another note (⌘P, ⇧⌘M): a new editor, the caret where it was last or at the end of the subtree. */
  let gen = $state(0);
  function open(n: MiniNote) {
    store.setMiniNote(n);
    rootLine = n.whole ? -1 : n.line;
    gen++;
    palette = false;
  }
  /** The caret: where it was in this note, else the end of its text (the subtree's last line of text). */
  const reveal = $derived.by(() => {
    void gen;
    const f = shown;
    if (!f || !note) return null;
    let line = note.line;
    if (!note.whole && found) {
      const lines = f.text.split('\n');
      let last = Math.min(found.h.end, lines.length) - 1;
      while (last > found.h.line && !lines[last].trim()) last--;
      line = last;
    }
    return { line, n: gen + 1, focus: true, col: 1e9 };
  });
  /** The caret's line (the root's own lines: ⌥↩ there makes the next note); the root's line in the editor now. */
  let caret = 0;
  let rootLine = -1;

  // ---- the palette, the hint ---------------------------------------------------------------------------------
  let palette = $state(false);

  // ---- ⌘F: the search in what the window shows (as a pane's, ТЗ 21) -------------------------------------------
  let fb = $state({ open: false, q: '', go: 0, dir: 1 as 1 | -1, focusN: 0 });
  let hits = $state<{ total: number; cur: number; folded: number; wrapped: boolean } | null>(null);
  const findProp = $derived(fb.q ? { q: fb.q, cs: store.findCase, word: store.findWord, show: fb.open, at: null, go: fb.go, dir: fb.dir } : null);
  function findStep(dir: 1 | -1) {
    if (!fb.q) return openFind();
    fb.dir = dir;
    fb.go++;
  }
  function openFind() {
    fb.open = true;
    fb.focusN++;
  }
  function closeFind() {
    fb.open = false;
    (document.querySelector('.mini .cm-content') as HTMLElement | null)?.focus({ preventScroll: true });
  }
  $effect(() => void call('mini_pin', { on: palette || fb.open })); // full while one is open
  let hint = $state('');
  let hintT: ReturnType<typeof setTimeout> | undefined;
  function say(text: string) {
    hint = text;
    clearTimeout(hintT);
    hintT = setTimeout(() => (hint = ''), 2000);
  }
  const openInMain = () => {
    if (!note) return;
    void toMain('mini-open-main', { path: shown?.name ?? note.path, line: found?.h.line ?? note.line });
  };

  // ---- the keys -------------------------------------------------------------------------------------------------
  /** The commands of the window here: ⌘P the palette, ⌘W hides it, ⌘S is the main window's (it writes); the rest
   *  needs the big window. The editor's commands run in the editor as in the main window. */
  function runWindow(id: string): boolean {
    if (id === 'goto') return (palette = true), true;
    if (id === 'find') return openFind(), true;
    if (id === 'findNext') return findStep(1), true;
    if (id === 'findPrev') return findStep(-1), true;
    if (id === 'closeWindow') return void call('mini_hide'), true;
    if (id === 'save' || id === 'saveAll') return true; // the main window writes at once
    say('Доступно в главном окне');
    return true;
  }
  /** ⌥↩ on the root heading (or in its own text): the next heading of its level after its subtree, the note there. */
  function rootNew(e: KeyboardEvent): boolean {
    const f = shown;
    if (!f || !found || note?.whole) return false;
    const press = pressOf(e);
    if (!press || !(store.bindings.get('newHeading') ?? []).includes(press)) return false;
    const h = found.h;
    const child = f.headings.find((x) => x.line > h.line && x.line < h.end);
    if (caret < h.line || caret >= (child?.line ?? h.end)) return false;
    const lines = f.text.split('\n');
    let at = Math.min(h.end, lines.length);
    while (at > h.line + 1 && !lines[at - 1].trim()) at--;
    lines.splice(at, 0, '*'.repeat(h.level) + ' ');
    store.setText(lines.join('\n'), f.path);
    open({ path: f.name, line: at, title: '' });
    return true;
  }
  let last = 0;
  /** The press is one of this command's (as set in «Клавиши», group «МИНИ-ОКНО»). */
  const is = (id: string, press: string | null) => !!press && (store.bindings.get(id) ?? []).includes(press);
  function keys(e: KeyboardEvent) {
    const press = pressOf(e);
    const stop = () => {
      e.preventDefault();
      e.stopImmediatePropagation(); // the window's handler is a listener of the window too
    };
    // ⎋ (or as set): what is open closes first; then the keys go back to the program before (the window stays, fades)
    if (e.key === 'Escape' || is('miniBack', press)) {
      if (palette) palette = false;
      else if (fb.open) closeFind();
      else if (hint) hint = '';
      else if (is('miniBack', press)) void call('mini_return_focus');
      else return;
      return stop();
    }
    if (palette) return; // its own keys
    if (is('miniPalette', press)) return (palette = true), stop();
    if (is('miniHide', press)) return void call('mini_hide'), stop();
    if (rootNew(e)) return stop();
    // full while typed in: a key now and then is enough (the pause is counted natively)
    const now = Date.now();
    if (now - last > 250) {
      last = now;
      void call('mini_typed');
    }
  }

  onMount(() => {
    void store.loadMirror();
    const key = keyHandler(runWindow);
    window.addEventListener('keydown', keys, true);
    window.addEventListener('keydown', key, true);
    // the appearance chosen in the main window (they share the storage)
    const storage = () => applyStored();
    window.addEventListener('storage', storage);
    let off: (() => void) | undefined;
    if (isTauri)
      void import('@tauri-apps/api/event').then(({ listen }) =>
        Promise.all([
          listen('mini-focus', () => {
            if (!store.miniNote) palette = true;
            else (document.querySelector('.mini .cm-content') as HTMLElement | null)?.focus({ preventScroll: true });
          }),
          // ⇧⌘M in the main window: its note here, in a new editor (the store took the note)
          listen('mini-open', () => {
            gen++;
            palette = false;
          }),
        ]).then((us) => (off = () => us.forEach((u) => u()))),
      );
    return () => {
      window.removeEventListener('keydown', keys, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('storage', storage);
      off?.();
    };
  });
  // nothing to show yet: the palette
  $effect(() => {
    if (store.loaded && !note) palette = true;
  });
  const path = $derived(shown?.name ?? note?.path ?? '');
</script>

<div class="mini" role="application" aria-label="Мини-окно">
  <header use:windowDrag={{ zoom: false }}>
    <button class="close" aria-label="Скрыть мини-окно" title="Скрыть мини-окно · ⌘W" onclick={() => call('mini_hide')}></button>
    <span class="path" title={note && !note.whole ? `${path} › ${found?.h.title ?? note.title}` : path}>
      {#if note && !note.whole}<span class="file">{path} ›</span> <b>{found?.h.title || note.title || 'Без названия'}</b>{:else if note}<b>{path}</b>{:else}<span class="file">Заметка не выбрана</span>{/if}
    </span>
    <button class="pk" title="Сменить заметку · ⌘P" onclick={() => (palette = true)}>⌘P</button>
    <button class="om" aria-label="Открыть в главном окне" title="Открыть в главном окне" disabled={!note} onclick={openInMain}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 3h6v6M17 3l-7 7M8 4H4v12h12v-4" /></svg>
    </button>
  </header>
  <div class="body">
    {#if fb.open}
      <FindBar bind:q={() => fb.q, (v) => (fb.q = v)} info={hits} focusN={fb.focusN} onnext={() => findStep(1)} onprev={() => findStep(-1)} onclose={closeFind} />
    {/if}
    {#if shown && note && (note.whole || found)}
      {#key gen}
        <Editor text={shown.text} fileKey={'mini|' + gen + '|' + shown.path} path={shown.path} wf={shown.wf} {reveal} gutter={false} levels={store.levels}
          narrow={note.whole || !found ? null : { line: found.h.line, end: found.h.end }}
          onchange={(t) => {
            const path = shown!.path;
            store.setText(t, path);
            // the root heading edited here (its title typed): the note keeps it, by the line the editor shows it at
            const f = store.files.find((x) => x.path === path);
            const h = rootLine >= 0 && note && !note.whole ? f?.headings.find((x) => x.line === rootLine) : undefined;
            if (h && note && (h.title !== note.title || h.line !== note.line)) store.setMiniNote({ ...note, line: h.line, title: h.title });
          }}
          oncursor={(l) => (caret = l)}
          onnarrow={(line) => (rootLine = line)}
          find={findProp} onfound={(i) => (hits = i)}
          onfollow={() => say('Доступно в главном окне')} />
      {/key}
    {:else if gone}
      <div class="gone"><span>Заголовок удалён</span><button onclick={() => (palette = true)}>Выбрать заметку · ⌘P</button></div>
    {/if}
    {#if palette}<MiniPalette onpick={open} onclose={() => (palette = false)} />{/if}
  </div>
  {#if hint}<div class="hint" role="status">{hint}</div>{/if}
  <svg class="grip" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M9 3L3 9M9 6.5L6.5 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
</div>

<style>
  :global(html), :global(body) { background: transparent !important; }
  .mini { position: fixed; inset: 0; display: flex; flex-direction: column; border-radius: 11px; overflow: hidden; background: var(--bg); border: 1px solid var(--line); color: var(--fg); }
  header { flex: 0 0 30px; display: flex; align-items: center; gap: 8px; padding: 0 8px 0 10px; background: var(--bar); border-bottom: 1px solid var(--line); font-size: 12px; user-select: none; -webkit-user-select: none; }
  .close { flex: 0 0 11px; width: 11px; height: 11px; padding: 0; border: 0; border-radius: 6px; background: #ff5f57; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.18); }
  .path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .path b { font-weight: 600; }
  .file { color: var(--fg2); }
  .pk { display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 11px; }
  .om { display: inline-flex; align-items: center; padding: 2px; border: 0; background: transparent; color: var(--fg2); }
  .pk:hover, .om:hover:not(:disabled) { background: var(--field); color: var(--fg); }
  .om:disabled { opacity: 0.4; }
  .body { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  /* the text 12 pt from the edge, no gutter (ТЗ 31 §2) */
  .body :global(.cm-editor) { flex: 1; min-height: 0; }
  .body :global(.cm-content) { padding-left: 12px; padding-right: 12px; }
  .gone { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--fg2); font-size: 12.5px; }
  .gone button { border: 0; background: none; color: var(--acc); font-size: 12.5px; }
  .hint { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); z-index: 30; padding: 5px 12px; border-radius: 7px; background: var(--fg); color: var(--bg); font-size: 12px; white-space: nowrap; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25); }
  .grip { position: absolute; right: 3px; bottom: 3px; color: var(--fg3); pointer-events: none; }
</style>

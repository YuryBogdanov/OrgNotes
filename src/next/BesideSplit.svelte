<script lang="ts">
  import type { Snippet } from 'svelte';
  import { store } from '../store.svelte';
  import { openFile } from '../layout';
  import { displayName } from '../names';
  import { besideOf, besideShare, closeBeside, followBeside, setBesideShare, togglePin } from '../beside.svelte';
  import { lists, resolve } from '../taskLists.svelte';
  import Editor from './Editor.svelte';

  // A tab of a list with the file of its row beside it (ТЗ 56 §4): the list on the left (46 % by default, 35–65 %,
  // kept on this Mac), a rule with a grip, the file on the right — its head of 44 on `side` (the file's icon, the name,
  // «› the headings' path», «следует за выбором» / «закреплён», «Открыть вкладкой ⌘↩», ×) and the editor in «Исходник»
  // always: the whole file with its line numbers, the heading's subtree marked by the lamp, opened with the heading in
  // the upper third. Under 1000 pt the file does not share the width: it lies over the list, 60 % on the right.
  let { tabId, children }: { tabId: string; children: Snippet } = $props();
  const b = $derived(besideOf(tabId));
  const file = $derived(b ? store.files.find((f) => f.path === b.path) : undefined);
  let w = $state(0);
  const over = $derived(w > 0 && w < 1000);
  const heading = $derived(file && b ? file.headings.find((h) => h.line === b.line) : undefined);
  const crumb = $derived(heading ? [...heading.path, heading.title].join(' › ') : '');
  let box: HTMLDivElement | undefined = $state();

  // §3: the file follows the row chosen in the list, 120 ms after (a quick scroll does not jerk the editor) — not
  // while pinned, not while the caret is in the file (typing does not take it away)
  const chosen = $derived.by(() => {
    if (!b || b.pinned) return null;
    const spec = lists.specs.find((s) => s.tab?.()?.id === tabId && lists.besideTab(s));
    const t = spec?.selected();
    const r = t ? resolve(t) : null;
    return r ? { path: r.f.path, line: r.h.line } : null;
  });
  $effect(() => {
    const c = chosen;
    if (!c) return;
    const t = setTimeout(() => followBeside(tabId, c), 120);
    return () => clearTimeout(t);
  });

  function drag(e: PointerEvent) {
    e.preventDefault();
    const r = box!.getBoundingClientRect();
    const move = (ev: PointerEvent) => setBesideShare((ev.clientX - r.left) / r.width);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  /** «Открыть вкладкой»: the file as a tab of its own after this one, at its line; beside it is closed. */
  export function openAsTab() {
    if (!b || !file) return;
    const at = { ...b.caret }; // taken before: the new tab unmounts this one
    const t = openFile(store.layout, store.layout.active, file.path, at.line, { replace: false, focus: true });
    t.cursor = at;
    closeBeside(tabId);
  }
  function edKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      openAsTab();
    }
  }
</script>

<div class="split" data-beside={tabId} class:open={!!b && !!file} class:over bind:clientWidth={w} bind:this={box} style:--share="{besideShare.v * 100}%">
  <div class="list">{@render children()}</div>
  {#if b && file}
    {#if !over}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="div" title="Потяните, чтобы изменить ширину" onpointerdown={drag}><i></i></div>
    {/if}
    <section class="side" aria-label="Файл сбоку">
      <header>
        <svg class="fi" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
        <span class="fn">{displayName(file.name.split('/').pop() ?? file.name)}</span>
        {#if crumb}<span class="cr" title={crumb}>› {crumb}</span>{/if}
        <button class="pin" class:on={b.pinned} aria-pressed={b.pinned} title={b.pinned ? 'Снова следовать за выбором в списке' : 'Закрепить: выбор в списке не меняет файл'} onclick={() => togglePin(tabId)}>
          {b.pinned ? 'закреплён' : 'следует за выбором'}
        </button>
        <span class="sp"></span>
        <button class="lnk" onclick={openAsTab}>Открыть вкладкой <kbd>⌘↩</kbd></button>
        <button class="x" aria-label="Закрыть файл сбоку" title="Закрыть ⎋" onclick={() => closeBeside(tabId)}>×</button>
      </header>
      <div class="ed grid" onkeydown={edKey} role="presentation">
        {#key file.path}
          <Editor text={file.text} fileKey={'beside:' + tabId + ':' + file.path} path={file.name} wf={file.wf} rich={false} levels={store.levels} drawers={store.foldDrawers}
            mark={b.line} hit={b.hit ?? null} reveal={{ line: b.caret.line, col: b.caret.col, n: b.n, top: b.line, focus: false }} resetOn={store.diskGen[file.path] ?? 0}
            onchange={(t) => store.setText(t, file.path)} oncursor={() => {}} onfollow={(l) => store.follow(l)} />
        {/key}
      </div>
    </section>
  {/if}
</div>

<style>
  .split { position: relative; flex: 1; min-height: 0; display: flex; }
  .list { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .split.open:not(.over) .list { flex: 0 0 var(--share); }
  /* the list's screen gives up its second columns and its big title while the file is beside it (§4) */
  .split.open .list :global(h1) { font-size: 32px !important; }
  .split.open .list :global([data-beside-hide]) { display: none !important; }
  /* the rule between, a grip of 5 × 36 in its middle */
  .div { flex: 0 0 9px; margin: 0 -4px; position: relative; z-index: 2; cursor: col-resize; display: flex; align-items: center; justify-content: center; }
  .div::before { content: ''; position: absolute; top: 0; bottom: 0; left: 4px; width: 1px; background: var(--rule); }
  .div i { position: relative; width: 5px; height: 36px; border-radius: 3px; background: var(--rule); }
  .side { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--bg); }
  /* a narrow area: over the list, 60 % on the right, the board's card's shadow */
  .over .side { position: absolute; top: 0; right: 0; bottom: 0; width: 60%; z-index: 5; box-shadow: -18px 0 40px rgba(0, 0, 0, 0.18); border-left: 1px solid var(--rule); }
  header { flex: 0 0 44px; height: 44px; min-width: 0; overflow: hidden; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 14px 0 18px; background: var(--side); border-bottom: 1px solid var(--rule); white-space: nowrap; }
  .fi { flex: 0 0 15px; color: var(--lampink); }
  .fn { flex: 0 1 auto; min-width: 40px; overflow: hidden; text-overflow: ellipsis; font-size: 13.5px; font-weight: 600; }
  .cr { flex: 0 1000 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 12.5px; color: var(--ink3); }
  .pin { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; height: 22px; padding: 0 8px; border: 0; border-radius: 6px; background: var(--chip); color: var(--ink2); font: 11.5px var(--ui); }
  .pin.on { background: var(--lampsoft); color: var(--lampink); box-shadow: inset 0 0 0 1px var(--lampline); }
  .sp { flex: 1; }
  .lnk { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; padding: 0; border: 0; background: none; color: var(--lampink); font: 12px var(--ui); }
  .lnk kbd { font: 11px var(--mono); color: var(--ink3); margin-left: 4px; }
  .lnk:hover { text-decoration: underline; }
  .x { flex: 0 0 22px; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--ink3); font-size: 15px; }
  .x:hover { background: var(--chip); color: var(--ink); }
  .pin:focus-visible, .lnk:focus-visible, .x:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
  .ed { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .grid { background-color: var(--bg); background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 24px 24px; background-position: -1px -1px; }
  /* «Исходник» beside: IBM Plex Mono 13.5 on lines of 24 */
  .ed :global(.cm-content), .ed :global(.cm-gutters) { font-size: 13.5px; }
  .ed :global(.cm-line), .ed :global(.cm-gutterElement) { line-height: 24px; }
</style>

<script lang="ts">
  import { store } from '../store.svelte';
  import { viewOf, fileViewOf } from '../views';
  import { isPinned, type Tab } from '../layout';
  import { OFF_ICON, isCore, isDirty, isGone, tabLabel } from '../tabLabels';
  import { tabMenuItems } from '../tabMenu';
  import type { MenuItem } from './bridges';

  // The tabs of the new interface (ТЗ 42 §4.3), 36 pt under the toolbar: a pinned tab — its icon alone; a tab — its
  // icon and name, «×» on the active one and on hover, a dot instead while unsaved; up to 190 pt, down to 90, then the
  // row scrolls; «+» — an untitled tab; right, «Оформление / Исходник» (the old «Текст / Оформление», one for all
  // tabs). One pane: the tabs of the layout's first (the second is folded in, store.foldPanesForNext).
  let { onmenu }: { onmenu: (at: { x: number; y: number }, items: MenuItem[]) => void } = $props();
  const pi = 0;
  const pane = $derived(store.layout.panes[pi]);
  const text = $derived(store.tab?.kind === 'file' || store.tab?.kind === 'untitled');

  const FILE = 'M3.5 2h6l3 3v9h-9z';
  /** The icon of a tab: a path in a 16 box (the file's), or a view's in its 20 box. */
  function iconOf(t: Tab): { d: string; box: number; dash?: boolean } {
    if (t.kind === 'untitled') return { d: FILE, box: 16, dash: true };
    if (t.kind === 'agenda') return { d: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3', box: 20 };
    if (!isCore(t.kind)) return { d: viewOf(t.kind)?.icon ?? OFF_ICON, box: 20 };
    const fv = t.kind === 'file' ? fileViewOf(store.viewOf(t)) : undefined;
    return fv ? { d: fv.icon, box: 20 } : { d: FILE, box: 16 };
  }
  /** A file's tab: its path in the notes folder with the extension, «1on1 / boris.org» (the mockups); others as before. */
  const label = (t: Tab) => (t.kind === 'file' && !t.scope ? (store.fileOf(t)?.name ?? tabLabel(t)).split('/').join(' / ') : tabLabel(t));
  function menu(e: MouseEvent, t: Tab) {
    e.preventDefault();
    onmenu({ x: e.clientX, y: e.clientY }, tabMenuItems(pi, t));
  }
  // the active tab scrolled into view
  let strip: HTMLDivElement | undefined = $state();
  $effect(() => {
    const id = pane?.tabs[pane.active]?.id;
    if (!id || !strip) return;
    queueMicrotask(() => strip?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  });
</script>

<div class="tabs">
  <div class="strip" role="tablist" aria-label="Вкладки" bind:this={strip}>
    {#each pane?.tabs ?? [] as t, ti (t.id)}
      {@const ic = iconOf(t)}
      {@const on = ti === pane.active}
      <div class="tab" class:on class:pin={isPinned(t)} class:dirty={isDirty(t)} class:gone={isGone(t)} class:untitled={t.kind === 'untitled'} data-tab={t.id}
        role="tab" aria-selected={on} aria-label={label(t)} tabindex={on ? 0 : -1} title={isPinned(t) ? label(t) : t.kind === 'file' ? (t.path ?? '') : undefined}
        onclick={() => store.activateTab(pi, ti)} oncontextmenu={(e) => menu(e, t)}
        onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); void store.closeTab(pi, ti); } }}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); store.activateTab(pi, ti); } }}>
        <svg class="ic" width={ic.box === 20 ? 16 : 15} height={ic.box === 20 ? 16 : 15} viewBox="0 0 {ic.box} {ic.box}" fill="none" stroke="currentColor" stroke-width={ic.box === 20 ? 1.6 : 1.4} stroke-linecap="round" stroke-linejoin="round" stroke-dasharray={ic.dash ? '2 1.8' : undefined} aria-hidden="true"><path d={ic.d} /></svg>
        {#if !isPinned(t)}
          <span class="lbl">{label(t)}</span>
          <span class="end">
            <span class="dot" aria-hidden="true"></span>
            <button class="x" tabindex="-1" aria-label="Закрыть вкладку {label(t)}" title="Закрыть вкладку" onclick={(e) => { e.stopPropagation(); void store.closeTab(pi, ti); }}>
              <svg width="9" height="9" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8" /></svg>
            </button>
          </span>
        {/if}
      </div>
    {/each}
    <button class="add" aria-label="Новая вкладка" title="Новая вкладка ({store.keyHint('newTab')})" onclick={() => store.newUntitled(pi)}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
    </button>
  </div>
  <!-- only over a text (ТЗ 43 §4): a screen has no «Оформление / Исходник» -->
  {#if text}
    <div class="mode" role="radiogroup" aria-label="Вид текста">
      <button role="radio" aria-checked={store.rich} class:on={store.rich} onclick={() => store.setRich(true)}>Оформление</button>
      <button role="radio" aria-checked={!store.rich} class:on={!store.rich} onclick={() => store.setRich(false)}>Исходник</button>
    </div>
  {/if}
</div>

<style>
  .tabs { flex: 0 0 36px; display: flex; align-items: stretch; background: var(--side); border-bottom: 1px solid var(--rule); }
  .strip { flex: 1; min-width: 0; display: flex; align-items: stretch; overflow-x: auto; scrollbar-width: none; }
  .strip::-webkit-scrollbar { display: none; }
  .tab { flex: 0 1 190px; min-width: 90px; display: flex; align-items: center; gap: 7px; padding: 0 12px; border-right: 1px solid var(--rule); color: var(--ink2); font-size: 12.5px; white-space: nowrap; cursor: default; }
  .tab.pin { flex: 0 0 40px; min-width: 40px; justify-content: center; padding: 0; }
  .tab:hover { color: var(--ink); }
  .tab.on { background: var(--bg); box-shadow: inset 0 2px 0 var(--lamp); color: var(--ink); }
  .tab:focus-visible { outline: 2px solid var(--lamp); outline-offset: -2px; }
  .ic { flex: 0 0 auto; color: var(--ink3); }
  .tab.on .ic { color: var(--lampink); }
  .lbl { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .untitled .lbl, .gone .lbl { font-style: italic; }
  .end { margin-left: auto; flex: 0 0 16px; height: 16px; display: flex; align-items: center; justify-content: center; position: relative; }
  .dot { display: none; width: 7px; height: 7px; border-radius: 4px; background: var(--ink2); }
  .x { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--ink3); opacity: 0; }
  .x:hover { background: var(--chip2); color: var(--ink); }
  .tab.on .x, .tab:hover .x { opacity: 1; }
  /* unsaved: a dot instead of «×», the cross on hover */
  .tab.dirty .dot { display: block; }
  .tab.dirty .x { position: absolute; inset: 0; opacity: 0; }
  .tab.dirty:hover .dot { display: none; }
  .tab.dirty:hover .x { opacity: 1; }
  .add { flex: 0 0 34px; display: flex; align-items: center; justify-content: center; padding: 0; border: 0; background: transparent; color: var(--ink3); }
  .add:hover { color: var(--ink); }
  .mode { flex: 0 0 auto; align-self: center; display: flex; gap: 2px; margin: 0 12px; padding: 2px; border-radius: 7px; background: var(--chip); }
  .mode button { height: 22px; padding: 0 10px; border: 0; border-radius: 5px; background: transparent; color: var(--ink2); font: 12px var(--ui); white-space: nowrap; }
  .mode button.on { background: var(--segon); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); }
  .mode button:focus-visible, .add:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
</style>

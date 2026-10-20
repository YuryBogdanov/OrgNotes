<script lang="ts">
  import { windowDrag } from '../windowDrag';
  import { store } from '../store.svelte';
  import { viewOf, fileViewOf } from '../views';
  import { isFilePinned, isPinned, type Tab } from '../layout';
  import { OFF_ICON, isCore, isDirty, isGone, tabLabel } from '../tabLabels';
  import { tabMenuItems } from '../tabMenu';
  import { tabNames } from './tabNames';
  import type { MenuItem } from '../menuItems';

  // The tabs of the new interface (ТЗ 42 §4.3), 36 pt under the toolbar: a pinned tab — its icon alone; a tab — its
  // icon and name, «×» on the active one and on hover, a dot instead while unsaved; up to 190 pt, down to 90, then the
  // row scrolls; «+» — an untitled tab; right, «Оформление / Исходник» and the file's views (ТЗ 49 §2; the text's mode is
  // one for all tabs). One pane: the tabs of the layout's first (the second is folded in, store.foldPanesForNext).
  let { onmenu }: { onmenu: (at: { x: number; y: number }, items: MenuItem[]) => void } = $props();
  const pi = 0;
  const pane = $derived(store.layout.panes[pi]);

  const FILE = 'M3.5 2h6l3 3v9h-9z';
  // a pinned tab (ТЗ 58): the pin stuck in, left of the file's icon
  const PIN = 'M5.5 1.8h5M6.3 1.8l-.4 4.6L3.6 9h8.8l-2.3-2.6-.4-4.6M8 9v5.2';
  /** The icon of a tab: a path in a 16 box (the file's), or a view's in its 20 box. */
  function iconOf(t: Tab): { d: string; box: number; dash?: boolean } {
    if (t.kind === 'untitled') return { d: FILE, box: 16, dash: true };
    if (t.kind === 'agenda') return { d: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3', box: 20 };
    if (!isCore(t.kind)) return { d: viewOf(t.kind)?.icon ?? OFF_ICON, box: 20 };
    const fv = t.kind === 'file' ? fileViewOf(store.viewOf(t)) : undefined;
    return fv ? { d: fv.icon, box: 20 } : { d: FILE, box: 16 };
  }
  /** A file's tab (ТЗ 44 §11): its name without `.org`; the same name open twice — the folder that tells them apart, in
   *  grey; narrowed — «Ольга Петрова › 1-1». Others as before. */
  const relOf = (t: Tab) => store.fileOf(t)?.name ?? t.path ?? '';
  const plain = (t: Tab) => t.kind === 'file' && !t.scope;
  const names = $derived.by(() => {
    const tabs = (pane?.tabs ?? []).filter(plain);
    const ns = tabNames(tabs.map(relOf));
    return new Map(tabs.map((t, i) => [t.id, ns[i]]));
  });
  const nameOf = (t: Tab) => {
    const n = names.get(t.id);
    if (!n) return { name: tabLabel(t), hint: '' };
    return { name: t.narrow ? `${n.name} › ${t.narrow.title}` : n.name, hint: n.hint };
  };
  const label = (t: Tab) => {
    const n = nameOf(t);
    return n.hint ? `${n.name} — ${n.hint}` : n.name;
  };
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

<!-- the empty place right of the tabs drags the window too (fix #304) -->
<div class="tabs" use:windowDrag>
  <div class="strip" role="tablist" aria-label="Вкладки" bind:this={strip}>
    {#each pane?.tabs ?? [] as t, ti (t.id)}
      {@const ic = iconOf(t)}
      {@const on = ti === pane.active}
      {@const fp = isFilePinned(t)}
      <div class="tab" class:on class:pin={isPinned(t)} class:fpin={fp} class:dirty={isDirty(t)} class:gone={isGone(t)} class:untitled={t.kind === 'untitled'} class:hinted={!!names.get(t.id)?.hint} data-tab={t.id}
        role="tab" aria-selected={on} aria-label={fp ? `${label(t)}, закреплена` : label(t)} tabindex={on ? 0 : -1} title={isPinned(t) ? label(t) : t.kind === 'file' ? relOf(t) : undefined}
        onclick={() => store.activateTab(pi, ti)} oncontextmenu={(e) => menu(e, t)}
        onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); void store.closeTab(pi, ti); } }}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); store.activateTab(pi, ti); } }}>
        {#if fp}<svg class="ic pinic" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={PIN} /></svg>{/if}
        <svg class="ic" width={ic.box === 20 ? 16 : 15} height={ic.box === 20 ? 16 : 15} viewBox="0 0 {ic.box} {ic.box}" fill="none" stroke="currentColor" stroke-width={ic.box === 20 ? 1.6 : 1.4} stroke-linecap="round" stroke-linejoin="round" stroke-dasharray={ic.dash ? '2 1.8' : undefined} aria-hidden="true"><path d={ic.d} /></svg>
        {#if !isPinned(t)}
          {@const n = nameOf(t)}
          <span class="lbl"><span class="nm">{n.name}</span>{#if n.hint}<span class="hint">{` — ${n.hint}`}</span>{/if}</span>
          <span class="end">
            <span class="dot" aria-hidden="true"></span>
            {#if !fp}<button class="x" tabindex="-1" aria-label="Закрыть вкладку {label(t)}" title="Закрыть вкладку" onclick={(e) => { e.stopPropagation(); void store.closeTab(pi, ti); }}>
              <svg width="9" height="9" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8" /></svg>
            </button>{/if}
          </span>
        {/if}
      </div>
    {/each}
    <button class="add" aria-label="Новая вкладка" title="Новая вкладка ({store.keyHint('newTab')})" onclick={() => store.newUntitled(pi)}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
    </button>
  </div>
</div>

<style>
  .tabs { flex: 0 0 36px; display: flex; align-items: stretch; background: var(--side); border-bottom: 1px solid var(--rule); }
  .strip { flex: 1; min-width: 0; display: flex; align-items: stretch; overflow-x: auto; scrollbar-width: none; }
  .strip::-webkit-scrollbar { display: none; }
  .tab { flex: 0 1 190px; min-width: 90px; display: flex; align-items: center; gap: 7px; padding: 0 12px; border-right: 1px solid var(--rule); color: var(--ink2); font-size: 12.5px; white-space: nowrap; cursor: default; }
  /* a name told apart by its folder (ТЗ 44 §11): room for the folder too, then it gives way */
  .tab.hinted { flex-basis: 280px; }
  .tab.pin { flex: 0 0 40px; min-width: 40px; justify-content: center; padding: 0; }
  /* a pinned file tab (ТЗ 58): never shrinks, up to 190 (the name cut short); the pin 5 from the file's icon */
  .tab.fpin { flex: 0 0 auto; min-width: 0; max-width: 190px; }
  .pinic { margin-right: -2px; }
  .tab.fpin:not(.dirty) .end { display: none; }
  .tab.fpin.dirty:hover .dot { display: block; } /* no «×» to give way to */
  .tab:hover { color: var(--ink); }
  .tab.on { background: var(--bg); box-shadow: inset 0 2px 0 var(--lamp); color: var(--ink); }
  .tab:focus-visible { outline: 2px solid var(--lamp); outline-offset: -2px; }
  .ic { flex: 0 0 auto; color: var(--ink3); }
  .tab.on .ic { color: var(--lampink); }
  /* the grey folder gives way first, then the name (§11) */
  .lbl { min-width: 0; display: flex; overflow: hidden; }
  .lbl .nm { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lbl .hint { flex: 0 100000 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: pre; color: var(--ink3); }
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
  .add:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
</style>

<script lang="ts">
  import { store } from './store.svelte';
  import { allFileViews, fileViewOf, viewOf } from './views';
  import { fileTypeOf } from './fileTypes.svelte';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import { isPinned, targetOf, type Tab } from './layout';
  import { displayName } from './names';
  import { OFF_ICON, isCore as core, isDirty as dirty, isGone as gone, tabLabel as label } from './tabLabels';

  // A pane's row of tabs (tech sprint 4.2, from Pane.svelte): it scrolls with faded edges when the tabs do not fit,
  // «⌵» lists them all; a tab's menu; the full path after a second over a file tab.
  let { pi }: { pi: number } = $props();

  const pane = $derived(store.layout.panes[pi]);
  const tab = $derived(pane?.tabs[pane.active]);

  // ---- the tab context menu ------------------------------------------------------------------
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let menuTab = $state<string | null>(null); // highlighted, with its cross, while the menu is open
  function tabMenu(e: MouseEvent, t: Tab, ti: number) {
    e.preventDefault();
    const to = targetOf(store.layout, pi);
    const hasFile = t.kind === 'file';
    const items: MenuItem[] = [
      { label: 'Закрыть', shortcut: store.keyHint('closeTab'), action: () => store.closeTab(pi, idx(t)) },
      { label: 'Закрыть остальные', shortcut: store.keyHint('closeOthers'), disabled: pane.tabs.length < 2, action: () => store.closeOthers(pi, idx(t)) },
      'sep',
      { label: 'Переместить в соседний редактор', shortcut: store.keyHint(to > pi ? 'moveRight' : 'moveLeft'), disabled: to < 0 || isPinned(t), action: () => store.moveTab(pi, idx(t)) },
      { label: 'Продублировать в соседнем редакторе', shortcut: store.keyHint(to > pi ? 'dupRight' : 'dupLeft'), disabled: to < 0 || t.kind === 'untitled' || !!viewOf(t.kind)?.single || isPinned(t), action: () => store.duplicateTab(pi, idx(t)) },
    ];
    if (hasFile) {
      // «Показать как ›»: the text and the views of the plugins (ТЗ 33); a plugin's file type has its one view
      const now = store.viewOf(t);
      items.push('sep');
      if (!fileTypeOf(t.path)) items.push({
        label: 'Показать как', action: () => {},
        sub: [
          { label: 'Текст', checked: now === '', action: () => store.showAs(t, '') },
          ...allFileViews().map((v) => ({ label: v.title, checked: now === v.id, shortcut: v.key ? store.keyHint(v.key) : undefined, action: () => store.showAs(t, v.id) })),
          'sep', { note: 'Виды добавляют плагины' },
        ],
      });
      items.push('sep');
      items.push({ label: 'Показать в навигаторе', shortcut: store.keyHint('revealInNav'), action: () => store.revealInNavigator(t) });
      items.push({ label: 'Скопировать путь', shortcut: store.keyHint('copyPath'), action: () => store.copyPath(t) });
    }
    menuTab = t.id;
    menu = { x: e.clientX, y: e.clientY, items };
    void ti;
  }
  const idx = (t: Tab) => pane.tabs.findIndex((x) => x.id === t.id);

  // ---- the tab row: scrolls when the tabs do not fit at their minimum width ---------------------------------
  let strip: HTMLDivElement | undefined = $state();
  let over = $state(false); // more tabs than room: the row scrolls and "⌵" lists them all
  let fadeL = $state(false);
  let fadeR = $state(false);
  function edges() {
    if (!strip) return;
    const max = strip.scrollWidth - strip.clientWidth;
    over = max > 1;
    fadeL = strip.scrollLeft > 1;
    fadeR = strip.scrollLeft < max - 1;
  }
  $effect(() => {
    if (!strip) return;
    const el = strip;
    const ro = new ResizeObserver(edges);
    ro.observe(el);
    // a mouse wheel scrolls the row sideways too (a trackpad already does)
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', wheel);
    };
  });
  // the active tab is always scrolled into view: a new one, one picked from the list or with the keyboard
  $effect(() => {
    const id = tab?.id;
    void pane.tabs.length;
    if (!id || !strip) return;
    queueMicrotask(() => {
      const el = strip?.querySelector<HTMLElement>(`[data-tab="${id}"]`);
      if (strip && el) {
        // clear of the faded edges, not just inside the row
        const FADE = 24;
        const left = el.offsetLeft; // the row is the tabs' offset parent
        const right = left + el.offsetWidth;
        if (left < strip.scrollLeft + FADE) strip.scrollLeft = left - FADE;
        else if (right > strip.scrollLeft + strip.clientWidth - FADE) strip.scrollLeft = right - strip.clientWidth + FADE;
      }
      edges();
    });
  });
  // a double click on the free part of the row (not on a tab) opens an untitled tab
  function stripDblClick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    if (el.closest('.tab') || el.closest('button')) return;
    store.newUntitled(pi);
  }
  function listMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const items: MenuItem[] = pane.tabs.map((t, ti) => ({
      label: t.kind === 'file' ? displayName(t.path ?? '') : label(t),
      icon: core(t.kind) ? t.kind : (viewOf(t.kind)?.icon ?? OFF_ICON), italic: t.kind === 'untitled', dot: dirty(t), checked: ti === pane.active,
      action: () => store.activateTab(pi, ti),
    }));
    menu = { x: r.right - 240, y: r.bottom + 2, items };
  }

  // ---- the full path on disk after a second over a file tab ------------------------------------------------------
  let tip = $state<{ text: string; x: number; y: number } | null>(null);
  let tipTimer: ReturnType<typeof setTimeout> | undefined;
  function tipStart(e: MouseEvent, t: Tab) {
    tipEnd();
    if (t.kind !== 'file' || !t.path) return;
    const el = e.currentTarget as HTMLElement;
    tipTimer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      tip = { text: gone(t) ? `Файла нет на диске: ${t.path} · ${store.keyHint('save') || '«Сохранить»'} создаст его снова` : t.path!, x: r.left, y: r.bottom + 4 };
    }, 1000);
  }
  function tipEnd() {
    clearTimeout(tipTimer);
    tip = null;
  }
</script>

<div class="bar">
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="strip" class:fl={fadeL} class:fr={fadeR} role="tablist" aria-label="Вкладки" bind:this={strip} ondblclick={stripDblClick} onscroll={() => { edges(); tipEnd(); }}>
  {#each pane.tabs as t, ti (t.id)}
    <div class="tab" class:on={ti === pane.active} class:dirty={dirty(t)} class:untitled={t.kind === 'untitled'} class:gone={gone(t)} class:menu={menuTab === t.id} class:pinned={isPinned(t)}
      role="tab" aria-selected={ti === pane.active} tabindex={ti === pane.active ? 0 : -1} data-tab={t.id}
      onmouseenter={(e) => tipStart(e, t)} onmouseleave={tipEnd} onmousedown={tipEnd}
      onclick={(e) => { if (e.ctrlKey) return tabMenu(e, t, ti); store.activateTab(pi, ti); }}
      oncontextmenu={(e) => tabMenu(e, t, ti)}
      onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); store.closeTab(pi, ti); } }}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); store.activateTab(pi, ti); } }}>
      {#if t.kind === 'untitled'}
        <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2.2 2" aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
      {:else if t.kind === 'agenda'}
        <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="2.5" /><path d="M3 8h14M7 2.5v3M13 2.5v3" /></svg>
      {:else if !core(t.kind)}
        <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={viewOf(t.kind)?.icon ?? OFF_ICON} /></svg>
      {:else if t.kind === 'file' && fileViewOf(store.viewOf(t))}
        <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-view={store.viewOf(t)}><path d={fileViewOf(store.viewOf(t))!.icon} /></svg>
      {:else}
        <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
      {/if}
      <span class="lbl">{label(t)}</span>
      {#if isPinned(t)}<svg class="pin" width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-label="Закреплена"><path d="M7 3h6l-1 5 3 3H5l3-3zM10 11v6" /></svg>{/if}
      <span class="slot">
        <span class="dot" aria-hidden="true"></span>
        <button class="x" aria-label="Закрыть вкладку {label(t)}" title="Закрыть вкладку" tabindex="-1"
          onclick={(e) => { e.stopPropagation(); store.closeTab(pi, ti); }}>
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" /></svg>
        </button>
      </span>
    </div>
  {/each}
  <div class="fill"></div>
</div>
{#if over}
  <button class="more" aria-label="Все вкладки" aria-haspopup="menu" title="Все вкладки" onclick={listMenu}>
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" /></svg>
  </button>
{/if}
</div>

{#if tip}
  <div class="tip" role="tooltip" style="left:{tip.x}px;top:{tip.y}px">{tip.text}</div>
{/if}
{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => { menu = null; menuTab = null; }} />
{/if}

<style>
  /* the line under the row is a shadow, so the active tab (drawn above it) joins the editor */
  .bar { flex: 0 0 34px; display: flex; align-items: stretch; background: var(--side); box-shadow: inset 0 -1px 0 var(--line); }
  .strip {
    position: relative;
    flex: 1 1 auto; min-width: 0; display: flex; align-items: flex-end; gap: 2px; padding: 0 8px;
    overflow-x: auto; overflow-y: hidden; scrollbar-width: none;
    --fl: 0px; --fr: 0px;
    -webkit-mask-image: linear-gradient(to right, transparent 0, #000 var(--fl), #000 calc(100% - var(--fr)), transparent 100%);
    mask-image: linear-gradient(to right, transparent 0, #000 var(--fl), #000 calc(100% - var(--fr)), transparent 100%);
  }
  .strip.fl { --fl: 24px; }
  .strip.fr { --fr: 24px; }
  .more { align-self: center; flex: 0 0 22px; height: 22px; margin: 0 6px 0 2px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; }
  .more:hover { background: var(--field); color: var(--fg); }
  .tip { position: fixed; z-index: 95; max-width: 520px; padding: 3px 7px; border-radius: 5px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); font-size: 11.5px; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18); pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .strip::-webkit-scrollbar { display: none; }
  .tab {
    position: relative; flex: 0 1 auto; min-width: 110px; max-width: 240px; height: 30px; display: flex; align-items: center; gap: 7px;
    padding: 0 6px 0 12px; border: 1px solid transparent; border-bottom: 0; border-radius: 7px 7px 0 0;
    font-size: 12.5px; color: var(--fg2); cursor: default;
  }
  .tab:hover:not(.on), .tab.menu:not(.on) { background: var(--field); color: var(--fg); }
  .tab.untitled .lbl, .tab.gone .lbl { font-style: italic; }
  .tab.menu .x { opacity: 1; }
  .tab.menu .dot { opacity: 0; }
  .tab.on { background: var(--bg); border-color: var(--line); color: var(--fg2); }
  :global(.pane.active) .tab.on { color: var(--fg); }
  .tab:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  /* «Сегодня» (ТЗ 32): pinned first, a thicker divider after it */
  .tab.pinned { flex: 0 0 auto; min-width: 0; margin-right: 8px; }
  .tab.pinned::after { content: ''; position: absolute; right: -6px; top: 6px; bottom: 4px; width: 3px; border-radius: 1.5px; background: var(--line); }
  .pin { flex: 0 0 auto; color: var(--fg3); }
  .ic { flex: 0 0 auto; color: var(--acc); }
  .tab:not(.on) .ic { color: var(--fg3); }
  .lbl { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* the slot is always there, so the tab does not change width on hover */
  .slot { position: relative; flex: 0 0 16px; width: 16px; height: 16px; margin-left: 2px; }
  .dot { position: absolute; left: 5px; top: 5px; width: 6px; height: 6px; border-radius: 3px; background: var(--fg2); opacity: 0; }
  .tab.dirty .dot { opacity: 1; }
  .x { position: absolute; inset: 0; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; opacity: 0; }
  .tab:hover .x { opacity: 1; }
  .tab:hover .dot { opacity: 0; }
  .x:hover { background: rgba(128, 128, 128, 0.28); }
  .fill { flex: 1 1 auto; align-self: stretch; min-width: 12px; }
</style>

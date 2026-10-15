<script lang="ts">
  import { parentOf } from './navTree';
  import { clickOutside } from './clickOutside';
  import { moved } from './pointer';
  import { tick, untrack } from 'svelte';
  import { store } from './store.svelte';
  import { displayName, displayPath } from './names';

  // The path of the active file in the toolbar, Xcode's jump bar: each segment opens a menu with everything in the
  // folder that holds it — its folders (each with its contents in a submenu), a line, its files. ⌃⌘J gives it the keyboard:
  // ←/→ between segments, ↓/↩ open a menu, typing filters it, Esc goes back one step and finally into the text.
  type Item = { kind: 'folder' | 'file'; rel: string; label: string; current: boolean };
  type Level = { items: Item[]; sel: number; filter: string; parent?: string; at?: { left: number; top: number } };

  const file = $derived(store.file);
  const byName = (a: Item, b: Item) => a.label.localeCompare(b.label, 'ru');
  /** The segments: every folder of the path, then the file. */
  const segs = $derived.by(() => {
    if (!file) return [] as { kind: 'folder' | 'file'; rel: string; label: string }[];
    const parts = file.name.split('/');
    const labels = displayPath(file.name);
    return parts.map((_, i) => ({ kind: i === parts.length - 1 ? ('file' as const) : ('folder' as const), rel: parts.slice(0, i + 1).join('/'), label: labels[i] }));
  });
  // folders and files straight inside a folder ('' = the notes folder)
  const foldersIn = (dir: string, current = '') =>
    store.folders.filter((f) => parentOf(f) === dir).map((f) => ({ kind: 'folder' as const, rel: f, label: f.split('/').pop()!, current: f === current })).sort(byName);
  const filesIn = (dir: string, current = '') =>
    store.files.filter((f) => parentOf(f.name) === dir).map((f) => ({ kind: 'file' as const, rel: f.name, label: displayName(f.name), current: f.name === current })).sort(byName);
  /** A folder's contents: its folders first, then its files, each by name as in the navigator; the path's own
   *  entries are checked. */
  const contentsOf = (dir: string) => [...foldersIn(dir, segs.find((s) => s.kind === 'folder' && parentOf(s.rel) === dir)?.rel), ...filesIn(dir, file?.name)];
  /** What a segment's menu shows: everything in the folder that holds it (folders and files alike). */
  function menuOf(i: number): Item[] {
    const s = segs[i];
    return s ? contentsOf(parentOf(s.rel)) : [];
  }

  // ---- state ---------------------------------------------------------------------------------------------------
  let focusIdx = $state<number | null>(null); // the segment with the keyboard (the ring)
  let openIdx = $state<number | null>(null); // the segment whose menu is open
  let levels = $state<Level[]>([]); // the menu, then its submenus
  let keyboard = $state(false); // entered with ⌃⌘J: Esc at the end goes back into the text
  let before: HTMLElement | null = null;
  let bar: HTMLDivElement | undefined = $state();

  const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
  const shown = (l: Level) => (l.filter ? l.items.filter((it) => norm(it.label).includes(norm(l.filter))) : l.items);

  async function focusSeg(i: number) {
    focusIdx = i;
    await tick();
    bar?.querySelector<HTMLElement>(`[data-seg="${i}"]`)?.focus();
  }
  function open(i: number) {
    const items = menuOf(i);
    openIdx = i;
    levels = [{ items, sel: Math.max(0, items.findIndex((x) => x.current)), filter: '' }];
  }
  function closeMenus() {
    openIdx = null;
    levels = [];
  }
  function leave() {
    closeMenus();
    focusIdx = null;
    if (keyboard && before?.isConnected) before.focus({ preventScroll: true }); // back to the caret, not scrolled (#103)
    keyboard = false;
  }
  function sub(item: Item) {
    if (item.kind !== 'folder') return;
    const items = contentsOf(item.rel);
    // a submenu is drawn beside its item, outside the parent's scrolling list (which would clip it)
    const depth = levels.length - 1;
    const el = bar?.querySelector<HTMLElement>(`.menu[data-depth="${depth}"] .item[data-rel="${CSS.escape(item.rel)}"]`);
    const r = el?.getBoundingClientRect();
    const at = r ? { left: r.right + 7, top: r.top - 6 } : undefined;
    levels = [...levels, { items, sel: Math.max(0, items.findIndex((x) => x.current)), filter: '', parent: item.rel, at }];
  }
  function pick(item: Item | undefined, other: boolean) {
    if (!item) return;
    if (item.kind === 'folder') return sub(item); // a folder is not a place to go: it opens its contents
    const f = store.files.find((x) => x.name === item.rel);
    closeMenus();
    focusIdx = null;
    keyboard = false;
    if (f) store.openFromJump(f.path, other);
  }

  // ⌃⌘J from the menu bar or the shortcut table: only the request itself, not later changes of the path
  let handled = 0;
  $effect(() => {
    const n = store.jumpReq;
    if (!n || n === handled) return;
    handled = n;
    untrack(() => {
      if (!segs.length) return;
      const a = document.activeElement as HTMLElement | null;
      if (!bar?.contains(a)) before = a;
      keyboard = true;
      closeMenus();
      void focusSeg(segs.length - 1);
    });
  });
  // the path changed under an open menu (another tab): start again
  $effect(() => {
    void file?.name;
    closeMenus();
    focusIdx = null;
  });

  // ---- keys ------------------------------------------------------------------------------------------------------
  const top = $derived(levels[levels.length - 1]);
  function move(d: number) {
    const l = levels[levels.length - 1];
    const n = shown(l).length;
    if (n) l.sel = Math.max(0, Math.min(n - 1, l.sel + d)); // no going round at the ends
    mouseOwns = false;
  }
  function key(e: KeyboardEvent) {
    if (focusIdx === null && openIdx === null) return;
    const l = levels[levels.length - 1];
    const k = e.key;
    if (!l) {
      // on a segment
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault();
        const i = (focusIdx ?? 0) + (k === 'ArrowLeft' ? -1 : 1);
        if (i >= 0 && i < segs.length) void focusSeg(i);
      } else if (k === 'Home' || k === 'End') {
        e.preventDefault();
        void focusSeg(k === 'Home' ? 0 : segs.length - 1);
      } else if (k === 'ArrowDown' || k === 'Enter' || k === ' ') {
        e.preventDefault();
        open(focusIdx ?? segs.length - 1);
      } else if (k === 'Escape') {
        e.preventDefault();
        leave();
      }
      return;
    }
    const list = shown(l);
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      move(k === 'ArrowDown' ? 1 : -1);
    } else if (k === 'ArrowRight') {
      e.preventDefault();
      const it = list[l.sel];
      if (it?.kind === 'folder') sub(it);
      else if (levels.length === 1) neighbour(1); // a file, or nothing chosen: the next column of the bar
    } else if (k === 'ArrowLeft') {
      e.preventDefault();
      if (levels.length > 1) levels = levels.slice(0, -1);
      else neighbour(-1);
    } else if (k === 'Enter') {
      e.preventDefault();
      pick(list[l.sel], e.altKey);
    } else if (k === 'Escape') {
      e.preventDefault();
      // one level at a time: the deepest submenu, then the menu (the segment keeps the focus)
      if (levels.length > 1) levels = levels.slice(0, -1);
      else {
        const i = openIdx;
        closeMenus();
        if (keyboard && i !== null) void focusSeg(i);
        else leave();
      }
    } else if (k === 'Backspace') {
      e.preventDefault();
      l.filter = e.metaKey ? '' : e.altKey ? l.filter.replace(/\S*\s*$/, '') : l.filter.slice(0, -1);
      l.sel = 0;
    } else if (k.length === 1 && !e.metaKey && !e.ctrlKey) {
      // typing filters the open menu (any layout: the letters are matched as typed)
      e.preventDefault();
      l.filter += k;
      l.sel = 0;
    }
  }
  /** ←/→ on the top menu: the neighbour segment's menu, without closing the chain. */
  function neighbour(d: number) {
    const i = (openIdx ?? 0) + d;
    if (i < 0 || i >= segs.length) return;
    focusIdx = i;
    open(i);
    void focusSeg(i);
  }

  // ---- mouse -------------------------------------------------------------------------------------------------------
  let mouseOwns = $state(true); // a key press takes the highlight until the pointer moves
  function clickSeg(i: number) {
    if (openIdx === i) return leave();
    focusIdx = i;
    open(i);
  }
  function hover(depth: number, j: number) {
    mouseOwns = true;
    const l = levels[depth];
    if (!l) return;
    const it0 = shown(l)[j];
    if (l.sel === j && it0 && levels[depth + 1]?.parent === it0.rel) return; // its submenu is already open
    l.sel = j;
    levels = levels.slice(0, depth + 1);
    const it = shown(l)[j];
    if (it?.kind === 'folder') sub(it); // a submenu opens on hover, as in macOS menus
  }
  const runs = (label: string, filter: string) => {
    if (!filter) return [{ s: label, hit: false }];
    const i = norm(label).indexOf(norm(filter));
    if (i < 0) return [{ s: label, hit: false }];
    return [{ s: label.slice(0, i), hit: false }, { s: label.slice(i, i + filter.length), hit: true }, { s: label.slice(i + filter.length), hit: false }].filter((r) => r.s);
  };
</script>


{#snippet menu(depth: number)}
  {@const l = levels[depth]}
  {@const list = shown(l)}
  <div class="menu" class:sub={depth > 0} class:filtered={!!l.filter} data-depth={depth} role="menu" aria-label={depth ? 'Содержимое папки' : 'Меню сегмента'}
    style={l.at ? `left:${l.at.left}px;top:${l.at.top}px` : undefined}>
    {#if l.filter}
      <div class="filter" aria-label="Фильтр"><svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5L17 17" /></svg><span class="ft">{l.filter}</span><span class="caret" aria-hidden="true"></span></div>
    {/if}
    {#each list as it, j (it.rel)}
      {#if j && it.kind === 'file' && list[j - 1].kind === 'folder'}<div class="line" role="separator"></div>{/if}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="item" class:on={j === l.sel} role="menuitem" tabindex="-1" aria-current={it.current ? 'true' : undefined} data-rel={it.rel}
        onmousemove={(e) => { e.stopPropagation(); if (moved(e)) hover(depth, j); }} onclick={(e) => { e.stopPropagation(); pick(it, e.altKey); }}>
        <span class="chk" aria-hidden="true">{it.current ? '✓' : ''}</span>
        <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {#if it.kind === 'folder'}<path d="M3 6a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z" />{:else}<path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" />{/if}
        </svg>
        <span class="nm" class:cur={it.current}>{#each runs(it.label, l.filter) as r}{#if r.hit}<b>{r.s}</b>{:else}{r.s}{/if}{/each}</span>
        {#if it.kind === 'folder'}<svg class="more" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2l4 4-4 4" /></svg>{/if}
      </div>
    {:else}
      <div class="item none" role="menuitem" aria-disabled="true">{l.items.length ? 'Ничего не найдено' : 'Пусто'}</div>
    {/each}
    {#if l.filter}<div class="keys">↑↓ выбор · ↩ открыть · → вложенная папка · Esc закрыть</div>{/if}
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="jb" bind:this={bar} use:clickOutside={{ onoutside: () => (openIdx !== null || focusIdx !== null) && leave(), capture: true }} role="navigation" aria-label="Путь к файлу" onkeydown={key}>
  {#each segs as s, i (s.rel)}
    {#if i}<span class="sep" aria-hidden="true">›</span>{/if}
    <span class="wrap">
      <button class="seg" class:last={i === segs.length - 1} class:open={openIdx === i} class:ring={focusIdx === i && keyboard && openIdx === null}
        data-seg={i} tabindex={focusIdx === i ? 0 : -1} aria-haspopup="menu" aria-expanded={openIdx === i} onclick={() => clickSeg(i)}>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {#if s.kind === 'folder'}<path d="M3 6a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z" />{:else}<path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" />{/if}
        </svg>
        <span>{s.label}</span>
      </button>
      {#if openIdx === i}{#each levels as _, d (d)}{@render menu(d)}{/each}{/if}
      {#if focusIdx === i && keyboard && openIdx === null}
        <div class="hint" role="note">← → сегменты · ↓ или ↩ меню · Esc вернуться в текст</div>
      {/if}
    </span>
  {/each}
</div>

<style>
  .jb { display: flex; align-items: center; gap: 2px; min-width: 0; }
  .sep { color: var(--fg3); padding: 0 1px; }
  .wrap { position: relative; display: inline-flex; min-width: 0; }
  .seg { height: 22px; display: flex; align-items: center; gap: 5px; padding: 0 7px; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font: inherit; font-size: 12.5px; cursor: default; max-width: 260px; }
  .seg span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seg svg { flex: 0 0 13px; color: var(--acc); }
  .seg.last { color: var(--fg); }
  .seg:hover, .seg.open { background: rgba(128, 128, 128, 0.2); }
  .seg:focus { outline: none; }
  .seg.ring { box-shadow: 0 0 0 2px var(--acc); }
  .hint { position: absolute; top: 34px; left: 0; z-index: 30; padding: 6px 10px; border-radius: 7px; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2); font-size: 11.5px; color: var(--fg2); white-space: nowrap; pointer-events: none; }
  .menu { position: absolute; top: 31px; left: 0; z-index: 30; min-width: 210px; max-width: 340px; max-height: min(70vh, 520px); overflow-y: auto; padding: 5px; display: flex; flex-direction: column; gap: 1px; background: var(--bg); border: 1px solid var(--line); border-radius: 9px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25); font-size: 13px; color: var(--fg); text-align: left; }
  .menu.sub { position: fixed; }
  .menu.filtered { min-width: 240px; }
  .filter { flex: 0 0 28px; display: flex; align-items: center; gap: 7px; padding: 0 8px; margin-bottom: 4px; border-radius: 6px; background: var(--field); color: var(--fg); }
  .filter svg { color: var(--fg2); }
  .caret { width: 1.5px; height: 15px; background: var(--acc); margin-left: -6px; }
  .item { position: relative; flex: 0 0 26px; display: flex; align-items: center; gap: 7px; padding: 0 8px; border-radius: 6px; white-space: nowrap; cursor: default; }
  .item.on { background: var(--pacc); color: var(--onpacc); }
  .item.none { color: var(--fg2); }
  .chk { flex: 0 0 12px; font-size: 11px; text-align: center; }
  .ic { flex: 0 0 13px; color: var(--acc); }
  .item.on .ic { color: inherit; }
  .nm { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .nm.cur { font-weight: 600; }
  .nm b { font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
  .more { flex: 0 0 9px; margin-left: auto; color: var(--fg3); }
  .item.on .more { color: inherit; }
  .line { flex: 0 0 1px; height: 1px; margin: 4px 8px; background: var(--line); }
  .keys { margin: 5px 3px 2px; padding-top: 6px; border-top: 1px solid var(--line); font-size: 11px; color: var(--fg3); line-height: 1.5; white-space: normal; }
</style>

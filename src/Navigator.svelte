<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { store } from './store.svelte';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import { createItems as fileCreateItems, entryItems, headingItems } from './fileMenu';
  import { fileTypeOf, fileTypes } from './fileTypes.svelte';
  import { draggedHeading, setDragged } from './dragData';
  import { buttons, expandAll, folderKey, parentOf, pathKeys, readOpen, subtreeKeys, treeNodes, writeOpen } from './navTree';
  import { visibleRows, type NavRow as Row } from './navRows';

  // ТЗ 02: the open nodes, kept per notes folder; everything else is folded
  const open = new SvelteSet<string>();
  let openDir: string | null = null; // the folder whose state `open` holds
  $effect.pre(() => {
    const dir = store.dir;
    if (dir === openDir) return;
    open.clear();
    for (const k of readOpen(dir) ?? []) open.add(k);
    openDir = dir;
  });
  $effect(() => {
    const keys = [...open];
    if (openDir && openDir === store.dir) writeOpen(openDir, new Set(keys));
  });
  const nodes = $derived(treeNodes(store.folders, store.files, store.navHeadings));
  /** The path to the current file and heading: opened when it changes, kept by «Свернуть всё». */
  const path = $derived(pathKeys(store.file, store.selected, store.navHeadings));
  const can = $derived(buttons(nodes, open, path));
  let capped = $state(false); // «Развернуть всё» left the headings closed

  const rows = $derived(
    visibleRows(store.folders, store.files, open, { headings: store.navHeadings, creating: store.creating?.dir ?? null, cur: store.cur, selected: store.selected }),
  );

  const toggle = (r: Row) => (open.has(r.key) ? open.delete(r.key) : open.add(r.key));
  /** ⌥-click, ⌥→ ⌥←: the node with everything under it. */
  function toggleSubtree(r: Row, to = !r.open) {
    for (const k of subtreeKeys(nodes, r.key)) {
      if (to) open.add(k);
      else open.delete(k);
    }
  }
  /** Bring the current row into view (after the tree has drawn). */
  const showCurrent = () => queueMicrotask(() => listEl?.querySelector<HTMLElement>('.row.sel')?.scrollIntoView({ block: 'nearest' }));

  // the current file changes (a tab, the palette, a link): the path to it opens; nothing else is folded
  $effect(() => {
    const keys = path;
    if (openDir !== store.dir) return;
    untrack(() => {
      for (const k of keys) open.add(k);
    });
    showCurrent();
  });
  function collapseAll() {
    open.clear();
    for (const k of path) open.add(k);
    capped = false;
    showCurrent();
  }
  function expandEverything() {
    const r = expandAll(nodes);
    for (const k of r.keys) open.add(k);
    capped = r.capped;
  }
  // the palette and the keys («Навигатор: свернуть всё / развернуть всё»)
  $effect(() => {
    const q = store.navTreeReq;
    if (!q || !store.loaded) return;
    untrack(() => (q.kind === 'collapse' ? collapseAll() : expandEverything()));
    store.navTreeReq = null;
  });
  function click(r: Row) {
    if (r.kind === 'new') return;
    focusKey = r.key;
    if (r.kind === 'folder') {
      if (r.hasKids) toggle(r);
    } else store.open(r.file!, r.line ?? 0, false); // the keyboard stays here: ↑↓ go on, ↩ goes into the editor
  }
  function chev(e: MouseEvent, r: Row) {
    e.stopPropagation();
    focusKey = r.key;
    if (e.altKey) toggleSubtree(r);
    else toggle(r);
  }

  // ---- keyboard, as in Finder: ↑↓ move, → opens (then goes in), ← closes (then goes to the parent), ↩ opens a file
  let focusKey = $state<string | null>(null);
  function setFocus(k: string) {
    focusKey = k;
    queueMicrotask(() => listEl?.querySelector<HTMLElement>(`[data-key="${CSS.escape(k)}"]`)?.focus());
  }
  function key(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const list = rows.filter((r) => r.kind !== 'new');
    const i = list.findIndex((r) => r.key === focusKey);
    const r = list[i];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) setFocus(next.key);
    } else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && r) {
      e.preventDefault();
      if (r.hasKids) toggleSubtree(r, e.key === 'ArrowRight');
    } else if (e.key === 'ArrowRight' && r) {
      e.preventDefault();
      if (r.hasKids && !r.open) toggle(r);
      else if (r.open && list[i + 1]) setFocus(list[i + 1].key);
    } else if (e.key === 'ArrowLeft' && r) {
      e.preventDefault();
      if (r.hasKids && r.open) toggle(r);
      else {
        for (let j = i - 1; j >= 0; j--) if (list[j].depth < r.depth) return setFocus(list[j].key);
      }
    } else if (e.key === 'Enter' && r && r.kind !== 'folder') {
      e.preventDefault();
      store.open(r.file!, r.line ?? 0, true);
    }
  }

  // ---- "Показать в навигаторе" -------------------------------------------------------
  let flash = $state<string | null>(null);
  let listEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    const r = store.navReveal;
    if (!r) return;
    const f = store.files.find((x) => x.path === r.path);
    if (!f) return;
    const parts = f.name.split('/').slice(0, -1);
    parts.forEach((_, i) => open.add(folderKey(parts.slice(0, i + 1).join('/')))); // expand every folder above it
    flash = r.path;
    const t = setTimeout(() => (flash = null), 1600);
    queueMicrotask(() => listEl?.querySelector<HTMLElement>(`[data-key="${CSS.escape(r.path)}"]`)?.scrollIntoView({ block: 'nearest' }));
    return () => clearTimeout(t);
  });

  // ---- context menu -----------------------------------------------------------
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const startCreate = (dir: string, kind: 'file' | 'folder', type?: string) => {
    if (dir) open.add(folderKey(dir)); // make sure the folder is expanded
    store.creating = { dir, kind, ...(type ? { type } : {}) };
  };
  const createItems = (dir: string): MenuItem[] => fileCreateItems(dir, startCreate);
  const creatingType = $derived(store.creating?.type ? fileTypes().find((t) => t.ext === store.creating!.type) : undefined);

  function rowMenu(e: MouseEvent, r: Row) {
    // a heading: the link to it (ТЗ 35)
    if (r.kind === 'heading' && r.file !== undefined && r.line !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      const items = headingItems(r.file, r.line);
      if (items.length) menu = { x: e.clientX, y: e.clientY, items };
      return;
    }
    if (!store.canManageFiles || r.kind === 'heading' || r.kind === 'new') return;
    e.preventDefault();
    e.stopPropagation();
    menu = { x: e.clientX, y: e.clientY, items: entryItems(r.rel, r.kind === 'folder', startCreate) };
  }
  function emptyMenu(e: MouseEvent) {
    if (!store.canManageFiles) return;
    e.preventDefault();
    menu = { x: e.clientX, y: e.clientY, items: createItems('') };
  }

  // ---- inline name input --------------------------------------------------------
  function focusSelect(el: HTMLInputElement) {
    el.focus();
    el.select();
  }
  function keyNew(e: KeyboardEvent, r: Row) {
    if (e.key === 'Enter') store.createEntry(r.rel, (e.currentTarget as HTMLInputElement).value, store.creating?.kind ?? 'file', store.creating?.type);
    else if (e.key === 'Escape') store.creating = null;
  }
  function keyRename(e: KeyboardEvent, r: Row) {
    if (e.key === 'Enter') store.renameEntry(r.rel, (e.currentTarget as HTMLInputElement).value);
    else if (e.key === 'Escape') store.renaming = null;
  }

  // ---- drag and drop ------------------------------------------------------------
  let dragRel = $state<string | null>(null);
  let dropOn = $state<string | null>(null); // folder rel, '' for the root, null for nothing
  const canDrop = (dest: string) => {
    if (dragRel == null) return false;
    if (parentOf(dragRel) === dest) return false;
    return !(dest === dragRel || dest.startsWith(dragRel + '/'));
  };
  function dragStart(e: DragEvent, r: Row) {
    // a heading: only to a plugin's view (a card on a canvas, ТЗ 39)
    if (r.kind === 'heading') {
      const f = r.file !== undefined ? store.files[r.file] : undefined;
      const d = f && r.line !== undefined ? draggedHeading(f.path, r.line) : null;
      if (d) setDragged(e.dataTransfer, d);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
      return;
    }
    dragRel = r.rel;
    e.dataTransfer?.setData('text/plain', r.rel);
    if (r.kind === 'file') setDragged(e.dataTransfer, { kind: 'file', path: r.rel });
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove';
  }
  function over(e: DragEvent, dest: string) {
    if (!canDrop(dest)) return;
    e.preventDefault();
    e.stopPropagation();
    dropOn = dest;
  }
  function drop(e: DragEvent, dest: string) {
    e.preventDefault();
    e.stopPropagation();
    const rel = dragRel;
    const ok = canDrop(dest); // before the drag state is cleared
    dragRel = dropOn = null;
    if (rel != null && ok) store.moveEntry(rel, dest);
  }
</script>

<div class="nav">
  <div class="head">
    <span class="title" title={store.dir ?? ''}>{store.dir ? store.dir.split('/').pop() : 'НАВИГАТОР'}</span>
    {#if store.canManageFiles}
      <button class="open" aria-label="Создать файл" title={store.titled('Создать файл', 'newFile')} onclick={() => startCreate(store.file ? parentOf(store.file.name) : '', 'file')}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 4v12M4 10h12" /></svg>
      </button>
      <button class="open" aria-label="Создать папку" title="Создать папку" onclick={() => startCreate(store.file ? parentOf(store.file.name) : '', 'folder')}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" /></svg>
      </button>
      <span class="vsep" aria-hidden="true"></span>
    {/if}
    <button class="tb" aria-label="Свернуть всё" title={store.titled('Свернуть всё', 'navCollapse')} disabled={!can.collapse} onclick={collapseAll}>
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.5l5 4 5-4M5 16.5l5-4 5 4" /></svg>
    </button>
    <button class="tb" aria-label="Развернуть всё" title={store.titled('Развернуть всё', 'navExpand')} disabled={!can.expand} onclick={expandEverything}>
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7.5l5-4 5 4M5 12.5l5 4 5-4" /></svg>
    </button>
  </div>
  {#if store.folderGone}
    <!-- the notes folder went away while working: the tabs keep their text -->
    <div class="gone" role="alert">
      <b>Папка недоступна</b>
      <span>Открытые вкладки и их текст сохранены.</span>
      <div class="gbtns">
        <button onclick={() => store.retryFolder()}>Повторить</button>
        <button onclick={() => store.changeFolder()}>Выбрать другую…</button>
      </div>
    </div>
  {:else if store.loaded && !store.files.length && !store.folders.length && !store.creating}
    <p class="none">В папке пока нет org-файлов.</p>
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="list" bind:this={listEl} class:rootdrop={dropOn === ''} oncontextmenu={emptyMenu} onkeydown={key}
    ondragover={(e) => over(e, '')} ondrop={(e) => drop(e, '')} ondragleave={() => (dropOn = null)}>
    {#each rows as r (r.key)}
      {#if r.kind === 'new'}
        <div class="row" style="padding-left:{6 + r.depth * 14 + 16}px">
          <svg class="ic" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.5" stroke-linejoin="round">
            {#if store.creating?.kind === 'folder'}<path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />{:else if creatingType}<path d={creatingType.icon} />{:else}<path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" />{/if}
          </svg>
          <input class="name" aria-label={store.creating?.kind === 'folder' ? 'Имя новой папки' : 'Имя нового файла'}
            placeholder={store.creating?.kind === 'folder' ? 'Новая папка' : (creatingType?.newLabel ?? 'Новый файл')}
            use:focusSelect onkeydown={(e) => keyNew(e, r)} onblur={() => (store.creating = null)} />
        </div>
      {:else}
        <div class="row" class:sel={r.selected} class:flash={r.kind === 'file' && flash === r.key} class:dim={r.done} data-key={r.key} class:drop={r.kind === 'folder' && dropOn === r.rel}
          style="padding-left:{6 + r.depth * 14}px" role="treeitem" aria-selected={r.selected} aria-expanded={r.hasKids ? r.open : undefined}
          tabindex={r.key === focusKey ? 0 : -1}
          draggable={r.kind === 'heading' || (store.canManageFiles && (r.kind === 'file' || r.kind === 'folder') && store.renaming !== r.rel)}
          ondragstart={(e) => dragStart(e, r)} ondragend={() => (dragRel = dropOn = null)}
          ondragover={(e) => r.kind === 'folder' && over(e, r.rel)}
          ondrop={(e) => r.kind === 'folder' && drop(e, r.rel)}
          oncontextmenu={(e) => rowMenu(e, r)}
          onclick={() => click(r)} ondblclick={() => store.canManageFiles && r.kind !== 'heading' && (store.renaming = r.rel)}>
          <!-- the chevron column is there on every row; a file shows its chevron only when open or under the pointer -->
          <button class="chev" class:hide={!r.hasKids} class:fh={r.kind === 'file' && !r.open} tabindex="-1" aria-label="Свернуть или развернуть" onclick={(e) => chev(e, r)}>
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate({r.open ? 90 : 0}deg)"><path d="M4 2l4 4-4 4" /></svg>
          </button>
          {#if r.kind === 'folder'}
            <svg class="ic" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.5" stroke-linejoin="round"><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" /></svg>
          {:else if r.kind === 'file' && fileTypeOf(r.rel)}
            <!-- a plugin's file type: its icon, in the plugins' colour -->
            <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--purple, var(--fg2))" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-type={fileTypeOf(r.rel)!.ext}><path d={fileTypeOf(r.rel)!.icon} /></svg>
          {:else if r.kind === 'file'}
            <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--fg2)" stroke-width="1.6" stroke-linejoin="round"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
          {/if}
          {#if r.kind === 'heading' && r.kw}
            <span class="kw tone-chip" style={r.tone}>{r.kw}</span>
          {/if}
          {#if store.renaming === r.rel && r.kind !== 'heading'}
            <input class="name" aria-label="Новое имя" value={r.label} use:focusSelect
              onclick={(e) => e.stopPropagation()} onkeydown={(e) => keyRename(e, r)} onblur={() => (store.renaming = null)} />
          {:else}
            <span class="label" class:strong={r.kind !== 'heading'}>{r.label}</span>
          {/if}
          {#if r.cnt}<span class="cnt">{r.cnt}</span>{/if}
        </div>
      {/if}
    {/each}
    {#if capped && !can.expand}<p class="capped">Заголовки не раскрыты: их слишком много</p>{/if}
  </div>
</div>

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />
{/if}

<style>
  .nav { height: 100%; display: flex; flex-direction: column; min-width: 0; }
  /* the line over the tree (ТЗ 02): the folder, «create», and «Свернуть всё» / «Развернуть всё» */
  .head { flex: 0 0 28px; display: flex; align-items: center; gap: 2px; padding: 4px 8px 0 14px; }
  .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 600; color: var(--fg3); letter-spacing: 0.05em; text-transform: uppercase; }
  .tb { width: 26px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; }
  .tb:hover:not(:disabled) { background: var(--field); }
  .tb:disabled { opacity: 0.35; }
  .tb:focus-visible, .open:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
  .vsep { width: 1px; height: 14px; margin: 0 4px; background: var(--line); }
  .capped { margin: 8px 8px 0; font-size: 11.5px; color: var(--fg2); }
  .open { width: 26px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; }
  .open:hover { background: var(--field); }
  .gone { margin: 4px 10px 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; border-radius: 8px; background: color-mix(in srgb, var(--wait) 14%, transparent); font-size: 12px; color: var(--fg2); }
  .gone b { color: var(--wait); font-size: 12.5px; }
  .gbtns { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
  .gbtns button { height: 22px; padding: 0 9px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); font-size: 12px; }
  .none { margin: 0; padding: 4px 18px 12px; color: var(--fg2); font-size: 12.5px; line-height: 1.5; }
  .list { flex: 1; overflow: auto; padding: 0 6px 10px; border-radius: 6px; }
  .list.rootdrop { box-shadow: inset 0 0 0 2px var(--acc); }
  .row { display: flex; align-items: center; gap: 6px; height: 24px; border-radius: 6px; padding-right: 8px; white-space: nowrap; }
  .row.sel { background: var(--sel); }
  .row.flash { background: var(--sel); box-shadow: inset 0 0 0 1.5px var(--acc); }
  .row.drop { background: var(--sel); box-shadow: inset 0 0 0 1.5px var(--acc); }
  .row.dim .label { color: var(--fg3); }
  .row:focus { outline: none; }
  .row:focus-visible { box-shadow: inset 0 0 0 1.5px var(--acc); }
  .chev { flex: 0 0 10px; width: 10px; height: 14px; padding: 0; border: 0; background: transparent; color: var(--fg3); display: flex; align-items: center; justify-content: center; }
  .chev.hide { visibility: hidden; }
  .chev.fh { opacity: 0; }
  .row:hover .chev.fh { opacity: 1; }
  .ic { flex: 0 0 auto; }
  .kw { flex: 0 0 auto; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; letter-spacing: 0.02em; }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .label.strong { font-weight: 500; }
  .cnt { font-size: 11px; color: var(--fg3); }
  .name { flex: 1; min-width: 0; height: 20px; padding: 0 4px; border: 1px solid var(--acc); border-radius: 4px; background: var(--bg); outline: none; -webkit-user-select: text; user-select: text; }
</style>

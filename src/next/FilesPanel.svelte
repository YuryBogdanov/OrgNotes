<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { store } from '../store.svelte';
  import { folderKey, readOpen, writeOpen } from '../navTree';
  import { visibleRows, type NavRow } from '../navRows';
  import { openFile } from '../layout';
  import { createItems, entryItems } from '../fileMenu';
  import type { MenuItem } from '../menuItems';
  import { fileViewOf } from '../views';
  import { fileTypeOf } from '../fileTypes.svelte';

  // «Файлы» of the new sidebar (ТЗ 42 §4.2, ТЗ 43 §2.1): the tree of the notes folder — the same rows as the old
  // navigator, files and folders only; a click opens in the tab shown, ⌥-click in a tab of its own; the menu of a row.
  let { onmenu }: { onmenu: (at: { x: number; y: number }, items: MenuItem[]) => void } = $props();

  // the open folders, kept per notes folder (the same store as the old navigator's)
  const open = new SvelteSet<string>();
  let openDir: string | null = null;
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
  const rows = $derived(visibleRows(store.folders, store.files, open, { headings: false, creating: store.creating?.dir ?? null, cur: store.cur, selected: -1 }));

  function click(e: MouseEvent, r: NavRow) {
    if (r.kind === 'folder') return void (r.hasKids && (open.has(r.key) ? open.delete(r.key) : open.add(r.key)));
    if (r.kind !== 'file' || r.file === undefined) return;
    // ⌥-click: a tab of its own; a click: in the tab shown (as the old navigator)
    if (e.altKey) openFile(store.layout, store.layout.active, store.files[r.file].path, 0, { replace: false });
    else store.open(r.file); // the file as it was left (fix #309)
  }
  const startCreate = (dir: string, kind: 'file' | 'folder', type?: string) => {
    if (dir) open.add(folderKey(dir));
    store.creating = { dir, kind, ...(type ? { type } : {}) };
  };
  function menu(e: MouseEvent, r: NavRow | null) {
    if (!store.canManageFiles || r?.kind === 'new') return;
    e.preventDefault();
    e.stopPropagation();
    onmenu({ x: e.clientX, y: e.clientY }, r ? entryItems(r.rel, r.kind === 'folder', startCreate) : createItems('', startCreate));
  }
  function focusSelect(el: HTMLInputElement) {
    el.focus();
    el.select();
  }
  function keyNew(e: KeyboardEvent, r: NavRow) {
    // the Enter taken here: the editor of the new file, focused meanwhile, must not get it (an empty line on top)
    if (e.key === 'Enter') {
      e.preventDefault();
      store.createEntry(r.rel, (e.currentTarget as HTMLInputElement).value, store.creating?.kind ?? 'file', store.creating?.type);
    } else if (e.key === 'Escape') store.creating = null;
  }
  function keyRename(e: KeyboardEvent, r: NavRow) {
    if (e.key === 'Enter') {
      e.preventDefault();
      store.renameEntry(r.rel, (e.currentTarget as HTMLInputElement).value);
    } else if (e.key === 'Escape') store.renaming = null;
  }

  const FILE = 'M3.5 2h6l3 3v9h-9z';
  const FOLDER = 'M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.5 1.6H13c.7 0 1.2.5 1.2 1.2V12c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2z';
  /** A row's icon (fix-49-2 §4): a folder; a file shown as a plugin's view — that view's icon; a plugin's file type —
   *  the type's; else the leaf. The view as its tab and «Показывать как ›» have it (`store.viewOfFile`). The views'
   *  icons are drawn in a box of 20: their line 1.75 there looks as the leaf's 1.4 in 16. */
  function iconOf(r: NavRow): { d: string; box: 16 | 20; view?: string } {
    if (r.kind === 'folder') return { d: FOLDER, box: 16 };
    const f = r.file === undefined ? undefined : store.files[r.file];
    const ft = f ? fileTypeOf(f.name) : undefined;
    if (ft) return { d: ft.icon, box: 20 };
    const v = fileViewOf(store.viewOfFile(f));
    return v ? { d: v.icon, box: 20, view: v.id } : { d: FILE, box: 16 };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="files" oncontextmenu={(e) => menu(e, null)}>
  <div class="tree" role="tree" aria-label="Файлы">
    {#each rows as r (r.key)}
      {#if r.kind === 'new'}
        <div class="row" style:padding-left="{6 + r.depth * 16 + 16}px">
          <input class="name" use:focusSelect aria-label={store.creating?.kind === 'folder' ? 'Имя папки' : 'Имя файла'} placeholder={store.creating?.kind === 'folder' ? 'папка' : 'файл'}
            onkeydown={(e) => keyNew(e, r)} onblur={() => (store.creating = null)} />
        </div>
      {:else if store.renaming === r.rel}
        <div class="row" style:padding-left="{6 + r.depth * 16 + 16}px">
          <input class="name" use:focusSelect aria-label="Новое имя" value={r.label} onkeydown={(e) => keyRename(e, r)} onblur={() => (store.renaming = null)} />
        </div>
      {:else}
        {@const ic = iconOf(r)}
        <button class="row" class:on={r.kind === 'file' && r.file === store.cur} role="treeitem" aria-selected={r.kind === 'file' && r.file === store.cur}
          aria-expanded={r.kind === 'folder' && r.hasKids ? r.open : undefined} style:padding-left="{6 + r.depth * 16}px"
          onclick={(e) => click(e, r)} oncontextmenu={(e) => menu(e, r)}>
          <span class="chev" class:open={r.open}>{#if r.kind === 'folder' && r.hasKids}<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M2.5 1.2 5.8 4 2.5 6.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}</span>
          <svg class="ic" width="15" height="15" viewBox="0 0 {ic.box} {ic.box}" fill="none" stroke="currentColor" stroke-width={ic.box === 20 ? 1.75 : 1.4} stroke-linecap={ic.box === 20 ? 'round' : undefined} stroke-linejoin={ic.box === 20 ? 'round' : undefined} aria-hidden="true" data-view={ic.view}><path d={ic.d} /></svg>
          <span class="nm">{r.label}</span>
        </button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .files { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .tree { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; }
  .row { flex: 0 0 26px; display: flex; align-items: center; gap: 6px; padding-right: 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink2); font: 13px var(--ui); text-align: left; white-space: nowrap; }
  .row:hover { background: var(--chip); }
  .row.on { background: var(--lampsoft); color: var(--ink); }
  .row.on .ic { color: var(--lampink); }
  .row:focus-visible { outline: 2px solid var(--lamp); outline-offset: -2px; }
  .chev { flex: 0 0 10px; display: flex; align-items: center; justify-content: center; color: var(--ink3); transition: transform 0.12s; }
  .chev.open { transform: rotate(90deg); }
  .ic { flex: 0 0 15px; color: var(--ink3); }
  .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .name { flex: 1; min-width: 0; height: 22px; padding: 0 6px; border: 1px solid var(--lamp); border-radius: 5px; background: var(--field); color: var(--ink); font: 13px var(--ui); outline: none; }
</style>

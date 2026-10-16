<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { store } from '../store.svelte';
  import { folderKey, readOpen, writeOpen } from '../navTree';
  import { visibleRows, type NavRow } from '../navRows';
  import { openFile } from '../layout';
  import { createItems, entryItems, type FileMenu } from '../fileMenu';

  // The sidebar of the new interface (ТЗ 42 §4.2): the window's lights on top, «Файлы» — the tree of the notes folder
  // (the same rows as the old navigator, files and folders only), the line of the folder with its gear. 236 pt, from
  // 200 to 360 by dragging its edge (kept on this Mac). The sections (Сегодня, Входящие…) come with later parts.
  let { width, onwidth, onmenu }: { width: number; onwidth: (w: number) => void; onmenu: (at: { x: number; y: number }, items: FileMenu) => void } = $props();

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
  const fileCount = $derived(store.files.length);

  function click(e: MouseEvent, r: NavRow) {
    if (r.kind === 'folder') return void (r.hasKids && (open.has(r.key) ? open.delete(r.key) : open.add(r.key)));
    if (r.kind !== 'file' || r.file === undefined) return;
    // ⌥-click: a tab of its own; a click: in the tab shown (as the old navigator)
    if (e.altKey) openFile(store.layout, store.layout.active, store.files[r.file].path, 0, { replace: false });
    else store.open(r.file, 0);
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
    if (e.key === 'Enter') store.createEntry(r.rel, (e.currentTarget as HTMLInputElement).value, store.creating?.kind ?? 'file', store.creating?.type);
    else if (e.key === 'Escape') store.creating = null;
  }
  function keyRename(e: KeyboardEvent, r: NavRow) {
    if (e.key === 'Enter') store.renameEntry(r.rel, (e.currentTarget as HTMLInputElement).value);
    else if (e.key === 'Escape') store.renaming = null;
  }

  // the folder's line: ~ for the home folder
  const folderShown = $derived((store.dir ?? '').replace(/^\/Users\/[^/]+/, '~'));
  const folderOk = $derived(!!store.dir && !store.folderGone);

  // ---- the edge: 200–360 pt
  function drag(e: PointerEvent) {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    const move = (m: PointerEvent) => onwidth(Math.max(200, Math.min(360, Math.round(w0 + m.clientX - x0))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  const FILE = 'M3.5 2h6l3 3v9h-9z';
  const FOLDER = 'M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.5 1.6H13c.7 0 1.2.5 1.2 1.2V12c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2z';
</script>

<aside class="side" style:width="{width}px" aria-label="Боковая панель">
  <div class="lights" aria-hidden="true"></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="files" oncontextmenu={(e) => menu(e, null)}>
    <div class="grp"><span>Файлы</span><span class="n">{fileCount}</span></div>
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
          <button class="row" class:on={r.kind === 'file' && r.file === store.cur} role="treeitem" aria-selected={r.kind === 'file' && r.file === store.cur}
            aria-expanded={r.kind === 'folder' && r.hasKids ? r.open : undefined} style:padding-left="{6 + r.depth * 16}px"
            onclick={(e) => click(e, r)} oncontextmenu={(e) => menu(e, r)}>
            <span class="chev" class:open={r.open}>{#if r.kind === 'folder' && r.hasKids}<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M2.5 1.2 5.8 4 2.5 6.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}</span>
            <svg class="ic" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d={r.kind === 'folder' ? FOLDER : FILE} /></svg>
            <span class="nm">{r.label}</span>
          </button>
        {/if}
      {/each}
    </div>
  </div>
  <div class="folder">
    <span class="dot" class:off={!folderOk} title={folderOk ? 'Папка доступна' : 'Папка недоступна'}></span>
    <span class="path" title={store.dir ?? ''}>{folderShown || 'Папка не выбрана'}</span>
    <button class="gear" aria-label="Настройки" title="Настройки" onclick={() => store.openSettings()}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
    </button>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="edge" onpointerdown={drag}></div>
</aside>

<style>
  .side { position: relative; flex: 0 0 auto; display: flex; flex-direction: column; box-sizing: border-box; padding: 0 10px; background: var(--side); border-right: 1px solid var(--rule); }
  /* the window's lights are drawn by macOS over this strip; it drags the window */
  .lights { flex: 0 0 52px; -webkit-app-region: drag; }
  .files { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .grp { display: flex; align-items: center; padding: 14px 10px 6px; font-size: 11px; font-weight: 600; color: var(--ink3); }
  .grp .n { margin-left: auto; font-weight: 400; }
  .tree { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; }
  .row { flex: 0 0 26px; display: flex; align-items: center; gap: 6px; padding-right: 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink2); font: 13px var(--ui); text-align: left; white-space: nowrap; }
  .row:hover { background: var(--chip); }
  .row.on { background: var(--lampsoft); color: var(--ink); }
  .row.on .ic { color: var(--lampink); }
  .row:focus-visible, .gear:focus-visible { outline: 2px solid var(--lamp); outline-offset: -2px; }
  .chev { flex: 0 0 10px; display: flex; align-items: center; justify-content: center; color: var(--ink3); transition: transform 0.12s; }
  .chev.open { transform: rotate(90deg); }
  .ic { flex: 0 0 15px; color: var(--ink3); }
  .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .name { flex: 1; min-width: 0; height: 22px; padding: 0 6px; border: 1px solid var(--lamp); border-radius: 5px; background: var(--field); color: var(--ink); font: 13px var(--ui); outline: none; }
  .folder { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 12px 10px; border-top: 1px solid var(--rule); color: var(--ink3); font-size: 11.5px; }
  .dot { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 4px; background: var(--done); }
  .dot.off { background: var(--todo); }
  .path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gear { margin-left: auto; display: flex; padding: 2px; border: 0; border-radius: 5px; background: transparent; color: var(--ink3); }
  .gear:hover { color: var(--ink); background: var(--chip); }
  .edge { position: absolute; top: 0; right: -3px; bottom: 0; width: 6px; cursor: col-resize; }
</style>

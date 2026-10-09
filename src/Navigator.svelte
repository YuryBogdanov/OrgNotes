<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { store } from './store.svelte';
  import { kwTone, subtreeProgress } from './org';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';

  type Row = {
    key: string; kind: 'folder' | 'file' | 'heading' | 'new'; depth: number; label: string;
    open: boolean; hasKids: boolean; rel: string; file?: number; line?: number;
    kw?: string | null; tone?: string; cnt?: string; selected?: boolean; done?: boolean;
  };
  const toggled = new SvelteSet<string>();
  const isOpen = (key: string, def: boolean) => def !== toggled.has(key);
  const base = (n: string) => n.split('/').pop()!;
  const parentOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
  const noExt = (n: string) => n.replace(/\.org$/, '');

  const rows = $derived.by(() => {
    type Node = { name: string; rel: string; children: Map<string, Node>; files: number[] };
    const root: Node = { name: '', rel: '', children: new Map(), files: [] };
    const ensure = (rel: string) => {
      let n = root;
      let acc = '';
      for (const p of rel.split('/').filter(Boolean)) {
        acc = acc ? acc + '/' + p : p;
        if (!n.children.has(p)) n.children.set(p, { name: p, rel: acc, children: new Map(), files: [] });
        n = n.children.get(p)!;
      }
      return n;
    };
    store.folders.forEach(ensure);
    store.files.forEach((f, i) => ensure(parentOf(f.name)).files.push(i));

    const out: Row[] = [];
    const newRow = (dir: string, depth: number) => {
      if (store.creating && store.creating.dir === dir)
        out.push({ key: '\u0000new:' + dir, kind: 'new', depth, label: '', open: false, hasKids: false, rel: dir });
    };
    const walk = (n: Node, depth: number) => {
      newRow(n.rel, depth);
      const kids = [...n.children.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      for (const c of kids) {
        const key = c.rel + '/';
        const open = isOpen(key, true);
        out.push({ key, kind: 'folder', depth, label: c.name, open, hasKids: true, rel: c.rel });
        if (open) walk(c, depth + 1);
      }
      for (const i of n.files) {
        const f = store.files[i];
        const fopen = isOpen(f.path, i === store.cur);
        out.push({
          key: f.path, kind: 'file', depth, label: noExt(base(f.name)), open: fopen, hasKids: f.headings.length > 0,
          rel: f.name, file: i, selected: i === store.cur && store.selected < 0,
        });
        if (!fopen) continue;
        let hiddenUntil = -1;
        f.headings.forEach((h, hi) => {
          if (h.line < hiddenUntil) return;
          const hasKids = f.headings[hi + 1]?.parent === hi;
          const key = f.path + '#' + h.line;
          const open = hasKids && isOpen(key, h.level <= 1);
          if (hasKids && !open) hiddenUntil = h.end;
          const p = hasKids ? subtreeProgress(f.headings, hi, f.wf) : { done: 0, total: 0 };
          out.push({
            key, kind: 'heading', depth: depth + h.level, label: h.title, open, hasKids, rel: f.name,
            file: i, line: h.line, kw: h.keyword, tone: h.keyword ? kwTone(h.keyword, f.wf) : undefined,
            cnt: p.total ? `${p.done}/${p.total}` : '',
            selected: i === store.cur && hi === store.selected,
            done: !!h.keyword && f.wf.done.includes(h.keyword),
          });
        });
      }
    };
    walk(root, 0);
    return out;
  });

  function click(r: Row) {
    if (r.kind === 'new') return;
    if (r.kind === 'folder') toggled.has(r.key) ? toggled.delete(r.key) : toggled.add(r.key);
    else store.open(r.file!, r.line ?? 0);
  }
  function chev(e: MouseEvent, r: Row) {
    e.stopPropagation();
    toggled.has(r.key) ? toggled.delete(r.key) : toggled.add(r.key);
  }

  // ---- context menu -----------------------------------------------------------
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const startCreate = (dir: string, kind: 'file' | 'folder') => {
    const key = dir + '/';
    if (dir && toggled.has(key)) toggled.delete(key); // make sure the folder is expanded
    store.creating = { dir, kind };
  };
  const createItems = (dir: string): MenuItem[] => [
    { label: 'Новый файл', action: () => startCreate(dir, 'file') },
    { label: 'Новая папка', action: () => startCreate(dir, 'folder') },
  ];

  function rowMenu(e: MouseEvent, r: Row) {
    if (!store.canManageFiles || r.kind === 'heading' || r.kind === 'new') return;
    e.preventDefault();
    e.stopPropagation();
    const isDir = r.kind === 'folder';
    const items: MenuItem[] = [
      ...(isDir ? [...createItems(r.rel), 'sep' as const] : []),
      { label: 'Переименовать', action: () => (store.renaming = r.rel) },
      { label: 'Переместить…', action: () => (store.dialog = { type: 'move', rel: r.rel, isDir }) },
      { label: 'Показать в Finder', action: () => store.revealEntry(r.rel) },
      'sep',
      { label: 'Переместить в Корзину…', danger: true, action: () => (store.dialog = { type: 'delete', rel: r.rel, isDir }) },
    ];
    menu = { x: e.clientX, y: e.clientY, items };
  }
  function emptyMenu(e: MouseEvent) {
    if (!store.canManageFiles) return;
    e.preventDefault();
    menu = { x: e.clientX, y: e.clientY, items: createItems('') };
  }
  function plusMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const here = store.file ? parentOf(store.file.name) : '';
    menu = { x: r.left, y: r.bottom + 4, items: createItems(here) };
  }

  // ---- inline name input --------------------------------------------------------
  function focusSelect(el: HTMLInputElement) {
    el.focus();
    el.select();
  }
  function keyNew(e: KeyboardEvent, r: Row) {
    if (e.key === 'Enter') store.createEntry(r.rel, (e.currentTarget as HTMLInputElement).value, store.creating?.kind ?? 'file');
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
    dragRel = r.rel;
    e.dataTransfer?.setData('text/plain', r.rel);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
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
      <button class="open" aria-label="Создать…" title="Создать файл или папку (⌘N — файл)" onclick={plusMenu}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 4v12M4 10h12" /></svg>
      </button>
    {/if}
    <button class="open" aria-label="Выбрать папку заметок (⌘O)" title="Выбрать папку заметок (⌘O)" onclick={() => store.chooseFolder()}>
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" /></svg>
    </button>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="list" class:rootdrop={dropOn === ''} oncontextmenu={emptyMenu}
    ondragover={(e) => over(e, '')} ondrop={(e) => drop(e, '')} ondragleave={() => (dropOn = null)}>
    {#each rows as r (r.key)}
      {#if r.kind === 'new'}
        <div class="row" style="padding-left:{6 + r.depth * 14 + 19}px">
          <svg class="ic" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.5" stroke-linejoin="round">
            {#if store.creating?.kind === 'folder'}<path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />{:else}<path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" />{/if}
          </svg>
          <input class="name" aria-label={store.creating?.kind === 'folder' ? 'Имя новой папки' : 'Имя нового файла'}
            placeholder={store.creating?.kind === 'folder' ? 'Новая папка' : 'Новый файл'}
            use:focusSelect onkeydown={(e) => keyNew(e, r)} onblur={() => (store.creating = null)} />
        </div>
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
        <div class="row" class:sel={r.selected} class:dim={r.done} class:drop={r.kind === 'folder' && dropOn === r.rel}
          style="padding-left:{6 + r.depth * 14}px" role="treeitem" aria-selected={r.selected} tabindex="-1"
          draggable={store.canManageFiles && (r.kind === 'file' || r.kind === 'folder') && store.renaming !== r.rel}
          ondragstart={(e) => dragStart(e, r)} ondragend={() => (dragRel = dropOn = null)}
          ondragover={(e) => r.kind === 'folder' && over(e, r.rel)}
          ondrop={(e) => r.kind === 'folder' && drop(e, r.rel)}
          oncontextmenu={(e) => rowMenu(e, r)}
          onclick={() => click(r)} ondblclick={() => store.canManageFiles && r.kind !== 'heading' && (store.renaming = r.rel)} onkeydown={() => {}}>
          <button class="chev" class:hide={!r.hasKids} aria-label="Свернуть или развернуть" onclick={(e) => chev(e, r)}>
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate({r.open ? 90 : 0}deg)"><path d="M4 2l4 4-4 4" /></svg>
          </button>
          {#if r.kind === 'folder'}
            <svg class="ic" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.5" stroke-linejoin="round"><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" /></svg>
          {:else if r.kind === 'file'}
            <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--fg2)" stroke-width="1.6" stroke-linejoin="round"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
          {/if}
          {#if r.kind === 'heading' && r.kw}
            <span class="kw" style="color:var({r.tone});background:color-mix(in srgb, var({r.tone}) 16%, transparent)">{r.kw}</span>
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
  </div>
</div>

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />
{/if}

<style>
  .nav { height: 100%; display: flex; flex-direction: column; min-width: 0; }
  .head { display: flex; align-items: center; gap: 2px; padding: 8px 8px 4px 14px; }
  .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; text-transform: uppercase; }
  .open { width: 26px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; }
  .open:hover { background: var(--field); }
  .list { flex: 1; overflow: auto; padding: 0 6px 10px; border-radius: 6px; }
  .list.rootdrop { box-shadow: inset 0 0 0 2px var(--acc); }
  .row { display: flex; align-items: center; gap: 5px; height: 24px; border-radius: 6px; padding-right: 8px; white-space: nowrap; }
  .row.sel { background: var(--sel); }
  .row.drop { background: var(--sel); box-shadow: inset 0 0 0 1.5px var(--acc); }
  .row.dim .label { color: var(--fg3); }
  .chev { flex: 0 0 14px; width: 14px; height: 14px; padding: 0; border: 0; background: transparent; color: var(--fg3); display: flex; align-items: center; justify-content: center; }
  .chev.hide { visibility: hidden; }
  .ic { flex: 0 0 auto; }
  .kw { flex: 0 0 auto; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; letter-spacing: 0.02em; }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .label.strong { font-weight: 500; }
  .cnt { font-size: 11px; color: var(--fg3); }
  .name { flex: 1; min-width: 0; height: 20px; padding: 0 4px; border: 1px solid var(--acc); border-radius: 4px; background: var(--bg); outline: none; -webkit-user-select: text; user-select: text; }
</style>

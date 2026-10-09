<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { store } from './store.svelte';
  import { kwTone, subtreeProgress } from './org';

  type Row = {
    key: string; kind: 'folder' | 'file' | 'heading'; depth: number; label: string;
    open: boolean; hasKids: boolean; file?: number; line?: number;
    kw?: string | null; tone?: string; cnt?: string; selected?: boolean; done?: boolean;
  };
  const toggled = new SvelteSet<string>();
  const isOpen = (key: string, def: boolean) => def !== toggled.has(key);
  const base = (n: string) => n.split('/').pop()!;

  const rows = $derived.by(() => {
    type Node = { children: Map<string, Node>; files: number[] };
    const root: Node = { children: new Map(), files: [] };
    store.files.forEach((f, i) => {
      let n = root;
      for (const p of f.name.split('/').slice(0, -1)) {
        if (!n.children.has(p)) n.children.set(p, { children: new Map(), files: [] });
        n = n.children.get(p)!;
      }
      n.files.push(i);
    });
    const out: Row[] = [];
    const walk = (n: Node, depth: number, prefix: string) => {
      for (const [name, c] of n.children) {
        const key = prefix + name + '/';
        const open = isOpen(key, true);
        out.push({ key, kind: 'folder', depth, label: name, open, hasKids: true });
        if (open) walk(c, depth + 1, key);
      }
      for (const i of n.files) {
        const f = store.files[i];
        const fopen = isOpen(f.path, i === store.cur);
        out.push({ key: f.path, kind: 'file', depth, label: base(f.name).replace(/\.org$/, ''), open: fopen, hasKids: f.headings.length > 0, file: i, selected: i === store.cur && store.selected < 0 });
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
            key, kind: 'heading', depth: depth + h.level, label: h.title, open, hasKids,
            file: i, line: h.line, kw: h.keyword, tone: h.keyword ? kwTone(h.keyword, f.wf) : undefined,
            cnt: p.total ? `${p.done}/${p.total}` : '',
            selected: i === store.cur && hi === store.selected,
            done: !!h.keyword && f.wf.done.includes(h.keyword),
          });
        });
      }
    };
    walk(root, 0, '');
    return out;
  });

  function click(r: Row) {
    if (r.kind === 'folder') toggled.has(r.key) ? toggled.delete(r.key) : toggled.add(r.key);
    else store.open(r.file!, r.line ?? 0);
  }
  function chev(e: MouseEvent, r: Row) {
    e.stopPropagation();
    toggled.has(r.key) ? toggled.delete(r.key) : toggled.add(r.key);
  }
</script>

<div class="nav">
  <div class="head">
    <span class="title" title={store.dir ?? ''}>{store.dir ? store.dir.split('/').pop() : 'НАВИГАТОР'}</span>
    <button class="open" aria-label="Выбрать папку заметок (⌘O)" title="Выбрать папку заметок (⌘O)" onclick={() => store.chooseFolder()}>
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" /></svg>
    </button>
  </div>
  <div class="list">
    {#each rows as r (r.key)}
      <div class="row" class:sel={r.selected} class:dim={r.done} style="padding-left:{6 + r.depth * 14}px" role="treeitem" aria-selected={r.selected} tabindex="-1"
        onclick={() => click(r)} onkeydown={() => {}}>
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
        <span class="label" class:strong={r.kind !== 'heading'}>{r.label}</span>
        {#if r.cnt}<span class="cnt">{r.cnt}</span>{/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .nav { height: 100%; display: flex; flex-direction: column; min-width: 0; }
  .head { display: flex; align-items: center; gap: 6px; padding: 8px 8px 4px 14px; }
  .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; text-transform: uppercase; }
  .open { width: 26px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; }
  .open:hover { background: var(--field); }
  .list { flex: 1; overflow: auto; padding: 0 6px 10px; }
  .row { display: flex; align-items: center; gap: 5px; height: 24px; border-radius: 6px; padding-right: 8px; white-space: nowrap; }
  .row.sel { background: var(--sel); }
  .row.dim .label { color: var(--fg3); }
  .chev { flex: 0 0 14px; width: 14px; height: 14px; padding: 0; border: 0; background: transparent; color: var(--fg3); display: flex; align-items: center; justify-content: center; }
  .chev.hide { visibility: hidden; }
  .ic { flex: 0 0 auto; }
  .kw { flex: 0 0 auto; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; letter-spacing: 0.02em; }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .label.strong { font-weight: 500; }
  .cnt { font-size: 11px; color: var(--fg3); }
</style>

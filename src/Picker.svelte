<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from './store.svelte';
  import { displayName, displayPath } from './names';
  import type { InboxItem } from './inbox';

  // A palette of where to: «Выбрать файл…» for the Inbox (files only), and «Перенести» of an Inbox task (a file —
  // its end or a heading in it — or a heading found by its title). Typing searches folders, files and headings;
  // → goes into a folder, ← back; a file goes on to its headings.
  let { mode, item, onclose }: { mode: 'inbox' | 'refile'; item?: InboxItem; onclose: () => void } = $props();

  type Row =
    | { kind: 'folder'; rel: string; label: string; sub: string }
    | { kind: 'file'; path: string; rel: string; label: string; sub: string }
    | { kind: 'heading'; path: string; line: number | null; label: string; sub: string };

  let q = $state('');
  let dir = $state(''); // the folder shown (no query)
  let inFile = $state<{ path: string; rel: string } | null>(null); // step 2: the headings of a file
  let sel = $state(0);
  let input: HTMLInputElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();

  const parentOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
  const norm = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е');
  const inboxPath = $derived(store.inboxFile?.path);
  const files = $derived(store.files.filter((f) => mode === 'inbox' || f.path !== inboxPath));
  const where = (rel: string) => displayPath(rel).slice(0, -1).join(' › ') || 'рабочая папка';

  const rows = $derived.by<Row[]>(() => {
    const n = norm(q.trim());
    if (inFile) {
      const f = store.files.find((x) => x.path === inFile!.path);
      if (!f) return [];
      const end: Row = { kind: 'heading', path: f.path, line: null, label: 'В конец файла', sub: displayName(f.name) };
      const hs = f.headings
        .filter((h) => !n || norm(h.title).includes(n))
        .map((h): Row => ({ kind: 'heading', path: f.path, line: h.line, label: h.title, sub: [displayName(f.name), ...h.path].join(' › ') }));
      return n ? hs : [end, ...hs];
    }
    if (!n) {
      const dirs = store.folders.filter((d) => parentOf(d) === dir).sort((a, b) => a.localeCompare(b, 'ru'));
      const fs = files.filter((f) => parentOf(f.name) === dir).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      return [
        ...dirs.map((d): Row => ({ kind: 'folder', rel: d, label: d.split('/').pop()!, sub: where(d) })),
        ...fs.map((f): Row => ({ kind: 'file', path: f.path, rel: f.name, label: displayName(f.name), sub: where(f.name) })),
      ];
    }
    const out: Row[] = [];
    if (mode === 'refile') {
      for (const f of files) for (const h of f.headings) if (norm(h.title).includes(n)) out.push({ kind: 'heading', path: f.path, line: h.line, label: h.title, sub: [displayName(f.name), ...h.path].join(' › ') });
    }
    for (const d of store.folders) if (norm(d.split('/').pop()!).includes(n)) out.push({ kind: 'folder', rel: d, label: d.split('/').pop()!, sub: where(d) });
    for (const f of files) if (norm(displayName(f.name)).includes(n)) out.push({ kind: 'file', path: f.path, rel: f.name, label: displayName(f.name), sub: where(f.name) });
    return out.slice(0, 200);
  });
  $effect(() => {
    void q;
    void dir;
    void inFile;
    sel = 0;
  });
  const typeWord = { folder: 'папка', file: 'файл', heading: 'заголовок' };

  onMount(() => input?.focus());

  async function choose(r: Row | undefined) {
    if (!r) return;
    if (r.kind === 'folder') {
      dir = r.rel;
      q = '';
      return;
    }
    if (mode === 'inbox') {
      if (r.kind === 'file') {
        onclose();
        await store.setInbox({ file: r.rel });
      }
      return;
    }
    if (r.kind === 'file') {
      inFile = { path: r.path, rel: r.rel };
      q = '';
      return;
    }
    const it = item; // read before closing: the palette is gone after it
    onclose();
    if (it) await store.inboxRefile(it, r.path, r.line);
  }
  function back() {
    if (inFile) {
      dir = parentOf(inFile.rel);
      inFile = null;
    } else if (dir) dir = parentOf(dir);
    q = '';
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(0, Math.min(rows.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
      void tick().then(() => listEl?.querySelector('.r.on')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void choose(rows[sel]);
    } else if (e.key === 'ArrowRight' && rows[sel]?.kind === 'folder' && (input?.selectionStart ?? 0) >= q.length) {
      e.preventDefault();
      void choose(rows[sel]);
    } else if (e.key === 'ArrowLeft' && !q && (dir || inFile)) {
      e.preventDefault();
      back();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }
  const crumbs = $derived(inFile ? displayPath(inFile.rel) : dir ? displayPath(dir) : []);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onmousedown={onclose}>
  <div class="pal" role="dialog" aria-label={mode === 'inbox' ? 'Файл Inbox' : 'Перенести задачу'} onmousedown={(e) => e.stopPropagation()}>
    <div class="crumb">
      {#if mode === 'inbox'}<span>Файл Inbox</span>{:else}<span>Перенести</span><span aria-hidden="true">›</span><span class="it">{item?.title}</span>{/if}
      {#each crumbs as c}<span aria-hidden="true">›</span><span class="it">{c}</span>{/each}
    </div>
    <div class="qrow">
      <span class="gt" aria-hidden="true">›</span>
      <input bind:this={input} bind:value={q} onkeydown={key} spellcheck="false" autocomplete="off"
        placeholder={inFile ? 'Заголовок, под который вставить' : mode === 'inbox' ? 'Найти файл' : 'Найти файл, папку или заголовок'} aria-label="Поиск" />
    </div>
    <div class="list" bind:this={listEl} role="listbox" aria-label="Куда">
      {#each rows as r, i (r.kind + (r.kind === 'folder' ? r.rel : r.kind === 'file' ? r.path : r.path + ':' + r.line))}
        <div class="r" class:on={i === sel} role="option" aria-selected={i === sel} onmousemove={() => (sel = i)} onclick={() => choose(r)}>
          <span class="l">{r.label}</span>
          <span class="s">{r.sub}</span>
          <span class="k">{r.kind === 'heading' && r.line === null ? '' : typeWord[r.kind]}{r.kind === 'folder' ? ' ›' : ''}</span>
        </div>
      {:else}
        <div class="none">Ничего не найдено</div>
      {/each}
    </div>
    <div class="keys">
      <span>↩ {mode === 'inbox' ? 'выбрать' : inFile ? 'перенести' : 'выбрать'}</span><span>↑↓ выбор</span><span>→ в папку · ← назад</span><span class="esc">esc отмена</span>
    </div>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 95; background: rgba(0, 0, 0, 0.28); display: flex; align-items: flex-start; justify-content: center; padding-top: 110px; }
  .pal { width: 640px; max-width: calc(100% - 48px); background: var(--bg); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45); overflow: hidden; color: var(--fg); display: flex; flex-direction: column; }
  .crumb { display: flex; align-items: center; gap: 8px; padding: 10px 18px 0; font-size: 11.5px; color: var(--fg3); min-width: 0; }
  .crumb .it { color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qrow { display: flex; align-items: center; gap: 12px; padding: 8px 18px 12px; font-size: 17px; }
  .gt { color: var(--fg2); }
  .qrow input { flex: 1; min-width: 0; border: 0; background: transparent; font-size: 17px; color: var(--fg); outline: none; -webkit-user-select: text; user-select: text; }
  .list { border-top: 1px solid var(--line); padding: 6px; display: flex; flex-direction: column; gap: 1px; font-size: 13px; max-height: 320px; overflow: auto; }
  .r { flex: 0 0 30px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border-radius: 7px; min-width: 0; }
  .r.on { background: var(--acc); color: var(--onacc); }
  .l { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55%; }
  .s { font-size: 12px; color: var(--fg2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .r.on .s, .r.on .k { color: inherit; opacity: 0.8; }
  .k { margin-left: auto; flex: 0 0 auto; font-size: 11px; color: var(--fg3); }
  .none { padding: 8px 10px; color: var(--fg2); }
  .keys { display: flex; align-items: center; gap: 14px; padding: 8px 18px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); }
  .esc { margin-left: auto; }
</style>

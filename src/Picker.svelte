<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from './store.svelte';
  import { displayName, displayPath } from './names';

  // «Выбрать файл…» for the Inbox (or, with `onpick`, any setting of a file): a palette of folders and files.
  // Typing searches both; → goes into a folder, ← back.
  let { onclose, onpick, label = 'Файл Inbox' }: { onclose: () => void; onpick?: (rel: string) => void; label?: string } = $props();

  type Row = { kind: 'folder'; rel: string; label: string; sub: string } | { kind: 'file'; path: string; rel: string; label: string; sub: string };

  let q = $state('');
  let dir = $state(''); // the folder shown (no query)
  let sel = $state(0);
  let input: HTMLInputElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();

  const parentOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
  const norm = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е');
  const where = (rel: string) => displayPath(rel).slice(0, -1).join(' › ') || 'рабочая папка';

  const rows = $derived.by<Row[]>(() => {
    const n = norm(q.trim());
    if (!n) {
      const dirs = store.folders.filter((d) => parentOf(d) === dir).sort((a, b) => a.localeCompare(b, 'ru'));
      const fs = store.files.filter((f) => parentOf(f.name) === dir).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      return [
        ...dirs.map((d): Row => ({ kind: 'folder', rel: d, label: d.split('/').pop()!, sub: where(d) })),
        ...fs.map((f): Row => ({ kind: 'file', path: f.path, rel: f.name, label: displayName(f.name), sub: where(f.name) })),
      ];
    }
    const out: Row[] = [];
    for (const d of store.folders) if (norm(d.split('/').pop()!).includes(n)) out.push({ kind: 'folder', rel: d, label: d.split('/').pop()!, sub: where(d) });
    for (const f of store.files) if (norm(displayName(f.name)).includes(n)) out.push({ kind: 'file', path: f.path, rel: f.name, label: displayName(f.name), sub: where(f.name) });
    return out.slice(0, 200);
  });
  $effect(() => {
    void q;
    void dir;
    sel = 0;
  });
  const typeWord = { folder: 'папка', file: 'файл' };

  onMount(() => input?.focus());

  async function choose(r: Row | undefined) {
    if (!r) return;
    if (r.kind === 'folder') {
      dir = r.rel;
      q = '';
      return;
    }
    onclose();
    if (onpick) onpick(r.rel);
    else await store.setInbox({ file: r.rel });
  }
  function back() {
    if (dir) dir = parentOf(dir);
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
    } else if (e.key === 'ArrowLeft' && !q && dir) {
      e.preventDefault();
      back();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }
  const crumbs = $derived(dir ? displayPath(dir) : []);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onmousedown={onclose}>
  <div class="pal" role="dialog" aria-label={label} onmousedown={(e) => e.stopPropagation()}>
    <div class="crumb">
      <span>{label}</span>
      {#each crumbs as c}<span aria-hidden="true">›</span><span class="it">{c}</span>{/each}
    </div>
    <div class="qrow">
      <span class="gt" aria-hidden="true">›</span>
      <input bind:this={input} bind:value={q} onkeydown={key} spellcheck="false" autocomplete="off"
        placeholder="Найти файл" aria-label="Поиск" />
    </div>
    <div class="list" bind:this={listEl} role="listbox" aria-label="Куда">
      {#each rows as r, i (r.kind + (r.kind === 'folder' ? r.rel : r.path))}
        <div class="r" class:on={i === sel} role="option" aria-selected={i === sel} onmousemove={() => (sel = i)} onclick={() => choose(r)}>
          <span class="l">{r.label}</span>
          <span class="s">{r.sub}</span>
          <span class="k">{typeWord[r.kind]}{r.kind === 'folder' ? ' ›' : ''}</span>
        </div>
      {:else}
        <div class="none">Ничего не найдено</div>
      {/each}
    </div>
    <div class="keys">
      <span>↩ выбрать</span><span>↑↓ выбор</span><span>→ в папку · ← назад</span><span class="esc">esc отмена</span>
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

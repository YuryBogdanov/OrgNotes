<script lang="ts">
  import { moved } from '../pointer';
  import { isOrgName } from '../fileTypes.svelte';
  import { onMount, tick } from 'svelte';
  import { store, type MiniNote } from '../store.svelte';
  import { fuzzy } from '../fuzzy';

  // «Сменить заметку» of the mini window in the new interface (ТЗ 52 §3; the workings — ТЗ 31 §4): the headings of every file and the files whole, as the palette's
  // section of headings; without a query — the notes of the mini window last opened, then the headings of its file.
  // ↩ opens a heading narrowed (a file whole), ⌘↩ the file of the heading whole, at it; ⎋ closes.
  let { onpick, onclose }: { onpick: (n: MiniNote) => void; onclose: () => void } = $props();

  interface Row {
    key: string;
    level: string; // «**», or «▤» for a file
    title: string;
    sub: string; // the file's path, or «весь файл»
    note: MiniNote;
  }
  let q = $state('');
  let sel = $state(0);
  let input: HTMLInputElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();
  const recent = (() => {
    try {
      return JSON.parse(localStorage.getItem('mini:recent') ?? '[]') as MiniNote[];
    } catch {
      return [] as MiniNote[];
    }
  })();
  const base = (name: string) => name.replace(/\.org$/, '');
  const rowOf = (n: MiniNote): Row =>
    n.whole
      ? { key: 'f:' + n.path, level: '▤', title: base(n.path), sub: 'весь файл', note: n }
      : { key: 'h:' + n.path + '#' + n.line + n.title, level: '*'.repeat(store.files.find((f) => f.name === n.path)?.headings.find((h) => h.line === n.line)?.level ?? 1), title: n.title, sub: n.path, note: n };
  const all = $derived.by((): Row[] => {
    const out: Row[] = [];
    for (const f of store.files) {
      if (!isOrgName(f.name)) continue; // a plugin's file (a canvas) is not a note to write in
      out.push(rowOf({ path: f.name, line: 0, title: '', whole: true }));
      for (const h of f.headings) out.push(rowOf({ path: f.name, line: h.line, title: h.title }));
    }
    return out;
  });
  const rows = $derived.by((): Row[] => {
    if (!q.trim()) {
      const cur = store.miniNote ? store.files.find((f) => f.name === store.miniNote!.path) : undefined;
      const seen = new Set<string>();
      const take = (r: Row) => (seen.has(r.key) ? [] : (seen.add(r.key), [r]));
      return [...recent.filter((n) => store.files.some((f) => f.name === n.path)).flatMap((n) => take(rowOf(n))), ...(cur ? cur.headings.flatMap((h) => take(rowOf({ path: cur.name, line: h.line, title: h.title }))) : [])].slice(0, 50);
    }
    return all
      .map((r) => ({ r, m: fuzzy(q, r.note.whole ? r.note.path : r.title) }))
      .filter((x) => x.m)
      .sort((a, b) => Number(b.m!.wordStart) - Number(a.m!.wordStart) || a.m!.span - b.m!.span || a.r.title.length - b.r.title.length)
      .slice(0, 50)
      .map((x) => x.r);
  });
  $effect(() => {
    void q;
    sel = 0;
  });
  function pick(r: Row | undefined, whole: boolean) {
    if (!r) return;
    const n: MiniNote = whole && !r.note.whole ? { path: r.note.path, line: r.note.line, title: '', whole: true } : r.note;
    try {
      const next = [n, ...recent.filter((x) => !(x.path === n.path && x.title === n.title && !!x.whole === !!n.whole))].slice(0, 12);
      localStorage.setItem('mini:recent', JSON.stringify(next));
    } catch {
      /* the recent ones of this time only */
    }
    onpick(n);
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(0, Math.min(rows.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
      void tick().then(() => list?.querySelector('.row.on')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(rows[sel], e.metaKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }
  onMount(() => input?.focus());
</script>

<div class="mpal" role="dialog" aria-label="Сменить заметку">
  <label class="field">
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
    <input bind:this={input} bind:value={q} onkeydown={key} placeholder="" aria-label="Заголовок или файл" spellcheck="false" autocomplete="off" />
    <span class="hint">заголовки и файлы</span>
  </label>
  <div class="list" bind:this={list} role="listbox" aria-label="Заметки">
    {#each rows as r, i (r.key)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="row" class:on={i === sel} role="option" aria-selected={i === sel} tabindex="-1" onmousemove={(e) => moved(e) && (sel = i)} onclick={(e) => pick(r, e.metaKey)}>
        <span class="lvl">{r.level}</span><span class="t">{r.title}</span><span class="sub">{r.sub}</span>
      </div>
    {:else}
      <div class="none">Ничего не найдено</div>
    {/each}
  </div>
  <div class="foot"><span>↩ открыть здесь</span><span>⌘↩ весь файл</span><span>⎋ закрыть</span></div>
</div>

<style>
  .mpal { position: absolute; left: 8px; right: 8px; top: 6px; z-index: 20; display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--rule); border-radius: 9px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28); overflow: hidden; font-size: 12.5px; }
  .field { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 10px; border-bottom: 1px solid var(--rule); color: var(--ink2); }
  .field input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--ink); font-size: 12.5px; }
  .hint { font-size: 11px; color: var(--ink3); white-space: nowrap; }
  .list { max-height: calc(34px * 5); overflow: auto; }
  .row { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; cursor: default; }
  .row.on { background: var(--lampsoft); }
  .row.on .t { font-weight: 600; }
  .lvl { flex: 0 0 auto; color: var(--ink3); font-family: var(--mono, ui-monospace, Menlo, monospace); font-size: 11px; }
  .t { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .sub { color: var(--ink3); font-size: 11px; white-space: nowrap; }
  .none { padding: 10px; color: var(--ink2); }
  .foot { display: flex; gap: 12px; height: 26px; align-items: center; padding: 0 10px; border-top: 1px solid var(--rule); font-size: 11px; color: var(--ink3); }
</style>

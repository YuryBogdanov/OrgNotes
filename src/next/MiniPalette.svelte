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
      : { key: 'h:' + n.path + '#' + n.line + n.title, level: '*'.repeat(store.files.find((f) => f.name === n.path)?.headings.find((h) => h.line === n.line)?.level ?? 1), title: n.title, sub: base(n.path).replace(/\//g, ' / '), note: n };
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
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></svg>
    <input bind:this={input} bind:value={q} onkeydown={key} placeholder="Заголовок или файл" aria-label="Заголовок или файл" spellcheck="false" autocomplete="off" />
  </label>
  <div class="list" bind:this={list} role="listbox" aria-label="Заметки">
    {#each rows as r, i (r.key)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="row" class:on={i === sel} role="option" aria-selected={i === sel} tabindex="-1" onmousemove={(e) => moved(e) && (sel = i)} onclick={(e) => pick(r, e.metaKey)}>
        {#if r.note.whole}
          <svg class="lvl" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 2h6l3 3v9h-9z" /></svg>
        {:else}
          <span class="lvl">{r.level}</span>
        {/if}
        <span class="t">{r.title}</span><span class="sub">{r.sub}</span>
      </div>
    {:else}
      <div class="none">Ничего не найдено</div>
    {/each}
  </div>
  <div class="foot">↩ открыть здесь · ⌘↩ весь файл · ⎋ закрыть</div>
</div>

<style>
  /* a popover of ТЗ 44 in the window (ТЗ 52 §3): under the header, 8 pt from the window's edges, its whole width */
  .mpal { position: absolute; left: 8px; right: 8px; top: 8px; z-index: 20; box-sizing: border-box; display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--rule); border-radius: 10px; background: var(--card); box-shadow: var(--popshadow); color: var(--ink); font-size: 13px; }
  .field { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; border-radius: 7px; background: var(--field); box-shadow: inset 0 0 0 1.5px var(--lampline); color: var(--ink3); }
  .field input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--ink); font: 13px var(--ui); caret-color: var(--lamp); }
  .field input::placeholder { color: var(--ink3); }
  .list { max-height: calc(34px * 5); overflow: auto; display: flex; flex-direction: column; }
  .row { flex: 0 0 34px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border-radius: 7px; cursor: default; }
  .row.on { background: var(--lampsoft); }
  .row.on .t { font-weight: 600; }
  .lvl { flex: 0 0 22px; width: 22px; color: var(--ink3); font: 11px var(--mono); }
  svg.lvl { flex: 0 0 15px; width: 15px; margin-right: 7px; }
  .t { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .sub { flex: 0 0 auto; max-width: 40%; overflow: hidden; text-overflow: ellipsis; color: var(--ink3); font-size: 11.5px; white-space: nowrap; }
  .none { padding: 10px; color: var(--ink2); }
  .foot { padding: 6px 10px 2px; font-size: 11px; color: var(--ink3); }
</style>

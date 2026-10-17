<script lang="ts">
  import { tick } from 'svelte';
  import type { NoteFile } from '../store.svelte';
  import { PlaceColumnsCtl, baseName } from '../placeColumns.svelte';

  // The choice of a place in a plugin's form in the new interface (ТЗ 44 §4, ТЗ 27 §2.4): the files and the headings
  // side by side on `field`, the captions 11 pt `ink3`, rows 28 pt, the chosen one on `lamp` (on `lampsoft` in the
  // column out of focus). The workings are placeColumns.svelte.ts, shared with the old columns.
  let { levels, file = null, heading = null, fileCap = '1. ФАЙЛ', headCap = '2. ЗАГОЛОВОК', fileNote, headNote, extra = null, onfile, onhead }: {
    levels?: number[]; file?: string | null; heading?: string | null; fileCap?: string; headCap?: string;
    fileNote?: (rel: string) => { text: string; dim?: boolean }; headNote?: (f: NoteFile, i: number) => string;
    extra?: { id: string; label: string } | null; onfile?: (rel: string) => void; onhead?: (id: string) => void;
  } = $props();
  const cc = new PlaceColumnsCtl(() => ({ levels, file, heading, extra, onfile, onhead }));
  let box: HTMLDivElement | undefined = $state();
  let search: HTMLInputElement | undefined = $state();
  const FILE = 'M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4';

  /** ↑↓ of the form: in the column in focus. */
  export function move(d: 1 | -1) {
    cc.move(d);
    void tick().then(() => box?.querySelector('.col.focus [aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  }
  export function focusList(which: 'file' | 'head') {
    cc.col = which;
    if (which === 'file') void tick().then(() => search?.focus());
  }
  function key(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target === search && cc.col === 'file' && !(e.key === 'ArrowRight' && search!.selectionStart === search!.value.length)) return;
    e.preventDefault();
    if (e.key === 'ArrowRight') cc.col = 'head';
    else if (e.key === 'ArrowLeft') focusList('file');
    else move(e.key === 'ArrowDown' ? 1 : -1);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="cols" bind:this={box} onkeydown={key}>
  <div class="col" class:focus={cc.col === 'file'}>
    <span class="cap">{fileCap}</span>
    <label class="search">
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
      <input bind:this={search} bind:value={cc.q} placeholder="Файл…" aria-label="Файл" spellcheck="false" autocomplete="off" onfocus={() => (cc.col = 'file')} />
    </label>
    <div class="list" role="listbox" aria-label="Файлы">
      {#each cc.files as f (f.path)}
        {@const note = fileNote?.(f.name)}
        <button role="option" tabindex="-1" aria-selected={file === f.name} class:on={file === f.name} class:dim={!!note?.dim} onclick={() => { cc.col = 'file'; onfile?.(f.name); }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={FILE} /></svg>
          <span class="nm">{baseName(f.name)}</span><span class="path">{f.name.split('/').slice(0, -1).join(' › ')}</span>{#if note}<span class="note">{note.text}</span>{/if}
        </button>
      {:else}
        <span class="empty">Ничего не найдено</span>
      {/each}
    </div>
  </div>
  <div class="col" class:focus={cc.col === 'head'}>
    <span class="cap">{headCap}{cc.cur ? ` · ${baseName(cc.cur.name)}` : ''}</span>
    <div class="list" role="listbox" aria-label="Заголовки{levels?.length === 1 ? ' первого уровня' : ''}">
      {#if !cc.cur}<span class="empty">Сначала выберите файл</span>{/if}
      {#each cc.heads as x (x.i)}
        <button role="option" tabindex="-1" aria-selected={heading === x.h.title} class:on={heading === x.h.title} onclick={() => { cc.col = 'head'; onhead?.(x.h.title); }}>
          <span class="lv" aria-hidden="true"></span><span class="nm">{x.h.title}</span>{#if headNote && cc.cur}<span class="note">{headNote(cc.cur, x.i)}</span>{/if}
        </button>
      {/each}
      {#if cc.cur && extra}
        <button role="option" tabindex="-1" aria-selected={heading === extra.id} class="new" class:on={heading === extra.id} onclick={() => { cc.col = 'head'; onhead?.(extra.id); }}>{extra.label}</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .cols { display: grid; grid-template-columns: 1fr 1fr; min-height: 240px; border-radius: 8px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); }
  .col { min-width: 0; display: flex; flex-direction: column; gap: 6px; padding: 10px; }
  .col + .col { border-left: 1px solid var(--rule); }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--ink3); padding: 0 4px; }
  .search { display: flex; align-items: center; gap: 7px; height: 28px; box-sizing: border-box; padding: 0 9px; border-radius: 7px; background: var(--chip); color: var(--ink3); }
  .search:focus-within { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--ink); caret-color: var(--lamp); font: 13px var(--ui); padding: 0; -webkit-user-select: text; user-select: text; }
  .list { display: flex; flex-direction: column; gap: 1px; max-height: 260px; overflow: auto; }
  .list button { flex: 0 0 28px; display: flex; align-items: center; gap: 8px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); text-align: left; font: 13px var(--ui); }
  .list button:hover { background: var(--chip); }
  .list button.dim { color: var(--ink3); }
  .list button.on { background: var(--lampsoft); }
  .col.focus .list button.on { background: var(--lamp); color: var(--onlamp); }
  .nm { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .path { flex: 1; min-width: 0; font-size: 11.5px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .note { margin-left: auto; font-size: 11.5px; color: var(--ink3); white-space: nowrap; }
  .col.focus .on .path, .col.focus .on .note { color: inherit; opacity: 0.75; }
  .lv { flex: 0 0 7px; height: 7px; border-radius: 2px; background: var(--ink); }
  .on .lv { background: currentColor; }
  .list .new { margin-top: 4px; box-shadow: inset 0 0 0 1px var(--rule); color: var(--lampink); }
  .empty { padding: 6px 8px; color: var(--ink3); font-size: 12.5px; }
</style>

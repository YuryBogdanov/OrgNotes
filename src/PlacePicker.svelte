<script lang="ts">
  import { portal } from './portal';
  import { moved } from './pointer';
  import { onMount, tick, type Snippet } from 'svelte';
  import { store, type NoteFile } from './store.svelte';
  import { ICONS } from './commands';
  import { runs } from './fuzzy';
  import { toneFor, type Heading } from './org';
  import { toneStyle } from './colors';
  import { bareTitle, plural } from './refile';
  import { PlacePaletteCtl } from './placePalette.svelte';
  import { PlaceColumnsCtl, baseName } from './placeColumns.svelte';

  // The choice of a place (roadmap 0.5), one component of the core for every «file + heading» of the app, in two
  // looks. «palette»: two steps in one window — a file (recent ones first), then a heading of it in a tree or the
  // file's 1st level; or the file alone (`kind: 'file'`). «columns»: inside a sheet, the files and the headings of
  // some levels side by side. Used by «Перенести», the files of the Inbox and the calendar, «Добавить ещё цели».
  import type { Pick } from './placePalette.svelte';
  let {
    variant = 'palette', kind = 'heading', title = 'Выбор места', token = 'Выбрать', placeholder = 'Файл…', plate, palette = false,
    full = true, self, exclude, recent = [], top = null, will, blocked = null, lastKey, onback, onpick, onclose,
    levels, file = null, heading = null, fileCap = '1. ФАЙЛ', headCap = '2. ЗАГОЛОВОК', fileNote, headNote, extra = null, onfile, onhead,
  }: {
    variant?: 'palette' | 'columns';
    kind?: 'file' | 'heading'; // the file alone, or a heading of it
    // ---- the palette
    title?: string; // the dialog's name
    token?: string; // the token before the field at step 1 («Перенести в», «Файл Inbox»)
    placeholder?: string; // of the field at step 1
    plate?: Snippet; // what is being placed («Переносится задача …»)
    palette?: boolean; // opened from the command palette: its lens and its key in the field
    full?: boolean; // over the whole window (else under the toolbar, as the command palette)
    self?: string; // its own file: marked «этот файл»
    exclude?: string; // a file not offered
    recent?: string[]; // paths offered first («НЕДАВНИЕ»)
    top?: string | null; // the row «на 1-й уровень» at step 2 (none: a heading must be chosen)
    will?: (h: Heading) => string; // a word on the heading under the cursor («станет 3-м уровнем»)
    blocked?: { path: string; line: number; end: number } | null; // the subtree being moved, in its own file
    lastKey?: (path: string) => string | undefined; // the branch to open at step 2
    onback?: () => void; // ⌫ in the empty field at step 1 (back to the command palette)
    onpick?: (p: Pick) => Promise<string | void> | string | void; // a text: why it did not go (the window stays)
    onclose?: () => void;
    // ---- the columns
    levels?: number[]; // the levels of headings offered (none: all)
    file?: string | null; // the file chosen (relative)
    heading?: string | null; // the heading chosen: its title, or `extra.id`
    fileCap?: string;
    headCap?: string;
    fileNote?: (rel: string) => { text: string; dim: boolean };
    headNote?: (f: NoteFile, i: number) => string;
    extra?: { id: string; label: string } | null; // a heading that is not there yet («+ Создать …»)
    onfile?: (rel: string) => void;
    onhead?: (id: string) => void;
  } = $props();

  // ---- the palette: its workings are placePalette.svelte.ts (the new interface draws them too) ---------------------
  const TOP = 'M4 3.5h12M10 17V8M6.5 11.5L10 8l3.5 3.5';
  const ctl = new PlacePaletteCtl(() => ({ kind, self, exclude, recent, top, blocked, lastKey, onback, onpick, onclose }));
  let input: HTMLInputElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();
  ctl.onscroll = () => list?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  ctl.onfocus = () => input?.focus();
  onMount(() => {
    if (variant !== 'palette') return;
    ctl.start();
    input?.focus();
    // the command palette that opened this gives the focus back as it goes: take it again
    requestAnimationFrame(() => input?.focus());
  });
  const close = ctl.close;
  const keepFocus = (e: MouseEvent) => {
    if (e.target !== input) e.preventDefault();
  };
  const lvColor = (level: number) => (level <= 3 ? `var(--h${level})` : 'var(--fg2)');

  // ---- the columns ---------------------------------------------------------------------------------------------
  const cc = new PlaceColumnsCtl(() => ({ levels, file, heading, extra, onfile, onhead }));
  let search: HTMLInputElement | undefined = $state();
  const base = baseName;
  const cfiles = $derived(variant === 'columns' ? cc.files : []);
  const cur = $derived(cc.cur);
  const heads = $derived(cc.heads);
  /** Which list the sheet's ↑↓ move in: the files', or the headings' (where the sheet starts with a file chosen). */
  export function focusList(which: 'file' | 'head') {
    cc.col = which;
    if (which === 'file') void tick().then(() => search?.focus());
  }
  /** ↑↓ of the sheet: in the list in focus. */
  export function move(d: 1 | -1) {
    cc.move(d);
    void tick().then(() => document.querySelector('.c-cols .sel')?.scrollIntoView({ block: 'nearest' }));
  }
</script>

{#if variant === 'palette'}
  <div use:portal>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="scrim" class:full onmousedown={(e) => { e.preventDefault(); close(); }}></div>
    <div class="pal" class:full role="dialog" aria-modal="true" aria-label={title} onmousedown={keepFocus}>
      {#if plate}<div class="plate">{@render plate()}</div>{/if}

      <div class="field">
        {#if palette}<svg class="lens" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5L17 17" /></svg>{/if}
        <span class="tok">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ctl.step === 1 ? (kind === 'file' ? ICONS.file : ICONS.refile) : ICONS.file} /></svg>
          {ctl.step === 1 ? token : ctl.fileName}
        </span>
        <input bind:this={input} bind:value={ctl.q} oninput={ctl.typed} onkeydown={ctl.key} spellcheck="false" autocomplete="off"
          placeholder={ctl.step === 1 ? placeholder : `Заголовок в ${ctl.fileName}…`} aria-label={ctl.step === 1 ? 'Файл' : 'Заголовок'}
          role="combobox" aria-expanded="true" aria-controls="rf-list" aria-activedescendant={ctl.sel ? 'rf-' + ctl.sel : undefined} />
        {#if palette && store.keyHint('palette')}<kbd>{store.keyHint('palette')}</kbd>{/if}
      </div>
      {#if ctl.err}<div class="err" role="alert">{ctl.err}</div>{/if}

      <div class="list" id="rf-list" role="listbox" aria-label={ctl.step === 1 ? 'Файлы' : 'Место в файле'} bind:this={list}>
        {#if ctl.step === 1}
          {#each ctl.files as f, i (f.path)}
            {#if f.group !== ctl.files[i - 1]?.group}<div class="gh" role="presentation">{f.group}</div>{/if}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="row" id={'rf-f:' + f.path} role="option" aria-selected={ctl.sel === 'f:' + f.path} class:on={ctl.sel === 'f:' + f.path}
              onmousemove={(e) => moved(e) && (ctl.sel = 'f:' + f.path)} onclick={() => ctl.act('f:' + f.path)}>
              <svg class="ic" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS.file} /></svg>
              <span class="t">{#each runs(f.label, f.at) as part}{#if part.hit}<b>{part.s}</b>{:else}{part.s}{/if}{/each}</span>
              <span class="hint">{f.sub}{f.self ? ' · этот файл' : ''}</span>
            </div>
          {:else}
            <div class="row empty" role="option" aria-selected="false" aria-disabled="true">Ничего не найдено</div>
          {/each}
        {:else if ctl.target}
          {#if top}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="row" id="rf-top" role="option" aria-selected={ctl.sel === 'top'} class:on={ctl.sel === 'top'} onmousemove={(e) => moved(e) && (ctl.sel = 'top')} onclick={() => ctl.act('top')}>
              <svg class="ic" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={TOP} /></svg>
              <span class="t">{top}</span>
              <span class="hint">в конец {ctl.fileName}</span>
              <span class="key">⌘↩</span>
            </div>
          {/if}
          <div class="gh" role="presentation">ЗАГОЛОВКИ · {ctl.fileName}{ctl.q.trim() ? ` — ${ctl.tree.matches} ${plural(ctl.tree.matches, 'совпадение', 'совпадения', 'совпадений')}` : ''}</div>
          {#each ctl.tree.rows as r (r.i)}
            {@const h = ctl.target.headings[r.i]}
            {@const on = ctl.sel === 'h:' + r.i}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="node" id={'rf-h:' + r.i} role="option" aria-selected={on} aria-disabled={r.blocked} class:on class:dim={r.dim} class:blocked={r.blocked}
              onmousemove={(e) => { if (moved(e) && !r.blocked) ctl.sel = 'h:' + r.i; }} onclick={() => { if (!r.blocked) ctl.act('h:' + r.i); }}>
              {#each { length: r.depth } as _}<span class="guide" aria-hidden="true"><span></span></span>{/each}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <svg class="chev" class:open={r.open} class:none={!r.hasKids} width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
                role="button" aria-label={r.open ? 'Свернуть' : 'Развернуть'} tabindex="-1" onclick={(e) => { e.stopPropagation(); ctl.toggle(r); }}><path d="M4.5 2.5l3.5 3.5-3.5 3.5" /></svg>
              <span class="lv" aria-hidden="true" style:background={r.dim ? 'var(--fg3)' : lvColor(h.level)}></span>
              {#if h.keyword}<span class="kw tone-chip" style={toneStyle(toneFor(h.keyword, ctl.target.wf))}>{h.keyword}</span>{/if}
              <span class="nt" class:l1={h.level === 1 && (!ctl.q.trim() || r.dim)}>{#each runs(bareTitle(h.title), r.at) as part}{#if part.hit}<b>{part.s}</b>{:else}{part.s}{/if}{/each}</span>
              {#if r.hasKids && !r.open}<span class="cnt">{r.kids}</span>{/if}
              {#if h.tags.length}<span class="tags">:{h.tags.join(':')}:</span>{/if}
              {#if on && will}<span class="will">{will(h)}</span>{/if}
            </div>
          {/each}
          {#if ctl.q.trim() && !ctl.tree.matches}<div class="row empty" role="option" aria-selected="false" aria-disabled="true">Ничего не найдено</div>{/if}
        {/if}
      </div>

      <div class="foot">
        {#each ctl.foot() as [k, t]}<span><kbd>{k}</kbd>{t}</span>{/each}
      </div>
    </div>
  </div>
{:else}
  <div class="c-cols">
    <div class="c-col" class:focus={cc.col === 'file'}>
      <span class="c-cap">{fileCap}</span>
      <label class="c-search">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
        <input bind:this={search} bind:value={cc.q} placeholder="Файл…" aria-label="Файл" spellcheck="false" autocomplete="off" onfocus={() => (cc.col = 'file')} />
      </label>
      <div class="c-list" role="listbox" aria-label="Файлы">
        {#each cfiles as f (f.path)}
          {@const note = fileNote?.(f.name)}
          <button role="option" aria-selected={file === f.name} class:sel={file === f.name} class:dim={!!note?.dim} onclick={() => { cc.col = 'file'; onfile?.(f.name); }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
            <b>{base(f.name)}</b><span class="c-path">{f.name.split('/').slice(0, -1).join(' › ')}</span>{#if note}<span class="c-nt">{note.text}</span>{/if}
          </button>
        {:else}
          <span class="c-empty">Ничего не найдено</span>
        {/each}
      </div>
    </div>
    <div class="c-col" class:focus={cc.col === 'head'}>
      <span class="c-cap">{headCap}{cur ? ` · ${base(cur.name)}` : ''}</span>
      <div class="c-list" role="listbox" aria-label="Заголовки{levels?.length === 1 ? ' первого уровня' : ''}">
        {#if !cur}<span class="c-empty">Сначала выберите файл</span>{/if}
        {#each heads as x (x.i)}
          <button role="option" aria-selected={heading === x.h.title} class:sel={heading === x.h.title} onclick={() => { cc.col = 'head'; onhead?.(x.h.title); }}>
            <span class="c-lv" aria-hidden="true"></span><span class="c-ht">{x.h.title}</span>{#if headNote && cur}<span class="c-nt">{headNote(cur, x.i)}</span>{/if}
          </button>
        {/each}
        {#if cur && extra}
          <button role="option" aria-selected={heading === extra.id} class="c-new" class:sel={heading === extra.id} onclick={() => { cc.col = 'head'; onhead?.(extra.id); }}>{extra.label}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; left: 0; right: 0; top: 52px; bottom: 0; z-index: 88; background: var(--scrim); }
  .scrim.full { top: 0; z-index: 94; }
  .pal {
    position: fixed; z-index: 89; top: 84px; left: 50%; transform: translateX(-50%); width: 640px; max-width: calc(100% - 32px);
    max-height: calc(100vh - 84px - 32px); display: flex; flex-direction: column; overflow: hidden; color: var(--fg);
    background: var(--pop); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 22px 60px rgba(0, 0, 0, 0.35);
  }
  .pal.full { z-index: 95; top: 110px; max-height: calc(100vh - 110px - 32px); }
  .plate { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--side); border-bottom: 1px solid var(--line); min-width: 0; }
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .field { flex: 0 0 52px; display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid var(--line); color: var(--fg2); }
  .lens { flex: 0 0 18px; }
  .tok {
    flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 9px; border-radius: 6px; max-width: 45%;
    background: color-mix(in srgb, var(--acc) 14%, transparent); color: var(--acc); font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden;
  }
  .tok svg { flex: 0 0 13px; }
  input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--fg); font: 17px var(--ui); padding: 0; caret-color: var(--acc); -webkit-user-select: text; user-select: text; }
  input::placeholder { color: var(--fg3); }
  kbd { font: 11px var(--mono); padding: 1px 6px; border: 1px solid var(--line); border-radius: 4px; color: var(--fg2); }
  .err { flex: 0 0 auto; padding: 7px 16px; font-size: 12px; color: var(--todo); background: color-mix(in srgb, var(--todo) 8%, transparent); border-bottom: 1px solid var(--line); }
  .list { flex: 0 1 auto; min-height: 0; overflow-y: auto; padding: 6px 8px 8px; display: flex; flex-direction: column; }
  .gh { padding: 10px 10px 4px; font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .row { flex: 0 0 40px; display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 10px; border-radius: 8px; color: var(--fg); cursor: default; min-width: 0; }
  .row.empty { color: var(--fg2); }
  .ic { flex: 0 0 17px; opacity: 0.9; }
  .t { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; }
  .t b, .nt b { font-weight: 700; }
  .hint { flex: 0 1 auto; min-width: 0; font-size: 12px; color: var(--fg2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .key { flex: 0 0 auto; display: flex; align-items: center; height: 20px; padding: 0 6px; border: 1px solid var(--line); border-radius: 4px; font: 11px var(--mono); color: var(--fg2); }
  .node { flex: 0 0 30px; display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px 0 8px; border-radius: 7px; color: var(--fg); cursor: default; min-width: 0; }
  .guide { flex: 0 0 14px; align-self: stretch; display: flex; justify-content: center; }
  .guide span { width: 1px; background: var(--line); }
  .chev { flex: 0 0 14px; color: var(--fg2); }
  .chev.open { transform: rotate(90deg); }
  .chev.none { visibility: hidden; }
  .lv { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 2px; }
  .nt { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13.5px; }
  .nt.l1 { font-weight: 600; }
  .node.dim .nt { color: var(--fg2); }
  .node.blocked { opacity: 0.45; }
  .cnt { flex: 0 0 auto; min-width: 18px; height: 18px; box-sizing: border-box; padding: 0 5px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--fg2); background: var(--field); }
  .tags { flex: 0 0 auto; font-size: 11.5px; color: var(--fg2); }
  .will { flex: 0 0 auto; font-size: 12px; font-weight: 600; }
  .row.on, .node.on { background: var(--pacc); color: var(--onpacc); }
  .row.on .hint, .row.on .key { color: color-mix(in srgb, var(--onpacc) 85%, transparent); }
  .row.on .key { border-color: color-mix(in srgb, var(--onpacc) 55%, transparent); }
  .node.on .guide span { background: color-mix(in srgb, var(--onpacc) 45%, transparent); }
  .node.on .chev, .node.on .nt { color: var(--onpacc); }
  .node.on .lv { background: var(--onpacc) !important; }
  .node.on .kw { color: var(--onpacc); background: color-mix(in srgb, var(--onpacc) 22%, transparent); }
  .node.on .cnt { color: var(--onpacc); background: color-mix(in srgb, var(--onpacc) 22%, transparent); }
  .node.on .tags { color: color-mix(in srgb, var(--onpacc) 85%, transparent); }
  .foot { flex: 0 0 auto; display: flex; align-items: center; flex-wrap: wrap; column-gap: 16px; row-gap: 4px; padding: 8px 16px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); }
  .foot span { display: flex; align-items: center; gap: 5px; }
  .foot kbd { padding: 0 5px; color: var(--fg); }
  .c-cols { display: flex; flex-wrap: wrap; border-bottom: 1px solid var(--line); min-height: 260px; }
  .c-col { flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 6px; padding: 14px 14px 12px; }
  .c-col + .c-col { border-left: 1px solid var(--line); }
  .c-cap { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; color: var(--fg2); }
  .c-search { display: flex; align-items: center; gap: 7px; height: 28px; box-sizing: border-box; padding: 0 9px; border: 1px solid var(--line); border-radius: 7px; color: var(--fg3); }
  .c-search:focus-within { border-color: var(--acc); }
  .c-search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--fg); font-size: 13px; padding: 0; -webkit-user-select: text; user-select: text; }
  .c-list { display: flex; flex-direction: column; gap: 1px; max-height: 300px; overflow: auto; }
  .c-list button { flex: 0 0 30px; display: flex; align-items: center; gap: 8px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--fg); text-align: left; font-size: 13px; }
  .c-list button.dim { color: var(--fg2); }
  .c-list button.sel { background: var(--acc); color: var(--onacc); }
  .c-col:not(.focus) .c-list button.sel { background: var(--sel); color: var(--fg); }
  .c-list button:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .c-path { flex: 1; min-width: 0; font-size: 12px; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c-nt { font-size: 11px; opacity: 0.85; white-space: nowrap; }
  .c-ht { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .c-lv { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 2px; background: var(--h1); }
  .sel .c-lv { background: currentColor; }
  .c-list .c-new { margin-top: 4px; border: 1px dashed var(--line); color: var(--acc); }
  .c-empty { padding: 6px 8px; color: var(--fg3); font-size: 12.5px; }
</style>

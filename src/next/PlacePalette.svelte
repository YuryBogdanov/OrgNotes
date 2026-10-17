<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { moved } from '../pointer';
  import { ICONS } from '../commands';
  import { runs } from '../fuzzy';
  import { toneFor, type Heading } from '../org';
  import { toneStyle } from '../colors';
  import { bareTitle, plural } from '../refile';
  import { PlacePaletteCtl, type Pick } from '../placePalette.svelte';

  // The choice of a place in the new interface's palette (ТЗ 44 §2.1, ТЗ 16): the old one's workings
  // (placePalette.svelte.ts), its look — 680 pt; the step's label in the field («Перенести › 1on1 / gleb»); step 2: the
  // pinned row «Перенести на 1-й уровень» in a dashed frame, then the file's tree — guide lines, a 7 pt mark of the
  // level (1st `ink`, deeper `ink3`), the capsule, the title 13.5, the children's count on a `chip` pill, the tags; the
  // row chosen says «станет N-м уровнем».
  let { kind = 'heading', title = 'Выбор места', token = 'Выбрать', placeholder = 'Файл…', plate, self, exclude, recent = [], top = null, will, blocked = null, lastKey, onback, onpick, onclose }: {
    kind?: 'file' | 'heading'; title?: string; token?: string; placeholder?: string; plate?: Snippet; self?: string; exclude?: string;
    recent?: string[]; top?: string | null; will?: (h: Heading) => string; blocked?: { path: string; line: number; end: number } | null;
    lastKey?: (path: string) => string | undefined; onback?: () => void; onpick?: (p: Pick) => Promise<string | void> | string | void; onclose?: () => void;
  } = $props();
  const TOP = 'M4 3.5h12M10 17V8M6.5 11.5L10 8l3.5 3.5';
  const ctl = new PlacePaletteCtl(() => ({ kind, self, exclude, recent, top, blocked, lastKey, onback, onpick, onclose }));
  let input: HTMLInputElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();
  ctl.onscroll = () => list?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  ctl.onfocus = () => input?.focus();
  onMount(() => {
    ctl.start();
    input?.focus();
    requestAnimationFrame(() => input?.focus()); // the palette that opened this gives the focus back as it goes
  });
  const keepFocus = (e: MouseEvent) => {
    if (e.target !== input) e.preventDefault();
  };
  const fileLabel = $derived(ctl.target ? ctl.target.name.replace(/\.org$/, '').split('/').join(' / ') : '');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dim" onmousedown={(e) => { e.preventDefault(); ctl.close(); }}></div>
<div class="pal" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onmousedown={keepFocus}>
  {#if plate}<div class="plate">{@render plate()}</div>{/if}
  <div class="field">
    <svg class="si" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></svg>
    <span class="tok">
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={kind === 'file' ? ICONS.file : ICONS.refile} /></svg>
      {token}{#if ctl.step === 2}{` › ${fileLabel}`}{/if}
    </span>
    <input bind:this={input} bind:value={ctl.q} oninput={ctl.typed} onkeydown={ctl.key} spellcheck="false" autocomplete="off"
      placeholder={ctl.step === 1 ? placeholder : `Заголовок в ${ctl.fileName}…`} aria-label={ctl.step === 1 ? 'Файл' : 'Заголовок'}
      role="combobox" aria-expanded="true" aria-controls="np-list" aria-activedescendant={ctl.sel ? 'np-' + ctl.sel : undefined} />
    <span class="esc">esc</span>
  </div>
  {#if ctl.err}<div class="err" role="alert">{ctl.err}</div>{/if}

  <div class="list" id="np-list" role="listbox" aria-label={ctl.step === 1 ? 'Файлы' : 'Место в файле'} bind:this={list}>
    {#if ctl.step === 1}
      {#each ctl.files as f, i (f.path)}
        {#if f.group !== ctl.files[i - 1]?.group}<div class="gh" role="presentation">{f.group}</div>{/if}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="row" id={'np-f:' + f.path} role="option" tabindex="-1" aria-selected={ctl.sel === 'f:' + f.path} class:on={ctl.sel === 'f:' + f.path}
          onmousemove={(e) => moved(e) && (ctl.sel = 'f:' + f.path)} onclick={() => ctl.act('f:' + f.path)}>
          <svg class="ic" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS.file} /></svg>
          <span class="t">{#each runs(f.label, f.at) as part, pi (pi)}{#if part.hit}<b>{part.s}</b>{:else}{part.s}{/if}{/each}</span>
          <span class="hint">{f.sub}{f.self ? ' · этот файл' : ''}</span>
        </div>
      {:else}
        <div class="row empty" role="option" aria-selected="false" aria-disabled="true">Ничего не найдено</div>
      {/each}
    {:else if ctl.target}
      {@const t = ctl.target}
      {#if top}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="row pin" id="np-top" role="option" tabindex="-1" aria-selected={ctl.sel === 'top'} class:on={ctl.sel === 'top'} onmousemove={(e) => moved(e) && (ctl.sel = 'top')} onclick={() => ctl.act('top')}>
          <svg class="ic" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={TOP} /></svg>
          <span class="t">{top}</span>
          <span class="hint">в конец {ctl.fileName}</span>
          <span class="key">⌘↩</span>
        </div>
      {/if}
      <div class="gh" role="presentation">Заголовки · {ctl.fileName}{ctl.q.trim() ? ` — ${ctl.tree.matches} ${plural(ctl.tree.matches, 'совпадение', 'совпадения', 'совпадений')}` : ''}</div>
      {#each ctl.tree.rows as r (r.i)}
        {@const h = t.headings[r.i]}
        {@const on = ctl.sel === 'h:' + r.i}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="node" id={'np-h:' + r.i} role="option" tabindex="-1" aria-selected={on} aria-disabled={r.blocked} class:on class:dim={r.dim} class:blocked={r.blocked}
          onmousemove={(e) => { if (moved(e) && !r.blocked) ctl.sel = 'h:' + r.i; }} onclick={() => { if (!r.blocked) ctl.act('h:' + r.i); }}>
          {#each { length: r.depth } as _, gi (gi)}<span class="guide" aria-hidden="true"></span>{/each}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <svg class="chev" class:open={r.open} class:none={!r.hasKids} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
            role="button" aria-label={r.open ? 'Свернуть' : 'Развернуть'} tabindex="-1" onclick={(e) => { e.stopPropagation(); ctl.toggle(r); }}><path d="M4.5 2.5l3.5 3.5-3.5 3.5" /></svg>
          <span class="lv" class:l1={h.level === 1} aria-hidden="true"></span>
          {#if h.keyword}<span class="kw" style={toneStyle(toneFor(h.keyword, t.wf))}>{h.keyword}</span>{/if}
          <span class="nt">{#each runs(bareTitle(h.title), r.at) as part, pi (pi)}{#if part.hit}<b>{part.s}</b>{:else}{part.s}{/if}{/each}</span>
          {#if r.hasKids && !r.open}<span class="cnt">{r.kids}</span>{/if}
          {#if h.tags.length}<span class="tags">:{h.tags.join(':')}:</span>{/if}
          {#if on && will}<span class="will">{will(h)}</span>{/if}
        </div>
      {/each}
      {#if ctl.q.trim() && !ctl.tree.matches}<div class="row empty" role="option" aria-selected="false" aria-disabled="true">Ничего не найдено</div>{/if}
    {/if}
  </div>
  <div class="foot">{#each ctl.foot() as [k, w], fi (fi)}<span><kbd>{k}</kbd> {w}</span>{/each}</div>
</div>

<style>
  .dim { position: fixed; inset: 0; z-index: 88; background: var(--dim); }
  .pal {
    position: fixed; z-index: 89; top: 84px; left: 50%; transform: translateX(-50%); width: 680px; max-width: calc(100% - 32px);
    max-height: calc(100vh - 84px - 32px); display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;
    border: 1px solid var(--rule); border-radius: 12px; background: var(--card); box-shadow: var(--popshadow); color: var(--ink); font: 13px var(--ui); outline: none;
    animation: pal-in 120ms ease-out;
  }
  @keyframes pal-in { from { opacity: 0; transform: translate(-50%, -4px); } }
  @media (prefers-reduced-motion: reduce) { .pal { animation: none; } }
  .plate { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; margin: 10px 10px 0; padding: 8px 12px; border-radius: 8px; background: var(--chip); font-size: 12.5px; color: var(--ink2); min-width: 0; }
  .field { flex: 0 0 52px; display: flex; align-items: center; gap: 10px; padding: 0 18px; border-bottom: 1px solid var(--rule); }
  .si { flex: 0 0 auto; color: var(--ink3); }
  .tok { flex: 0 1 auto; min-width: 0; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 9px; border-radius: 6px; background: var(--lampsoft); color: var(--lampink); font: 600 12.5px var(--ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  input { flex: 1; min-width: 60px; padding: 0; border: 0; outline: none; background: transparent; color: var(--ink); caret-color: var(--lamp); font: 17px var(--ui); -webkit-user-select: text; user-select: text; }
  input::placeholder { color: var(--ink3); }
  .esc { flex: 0 0 auto; font: 11px var(--mono); color: var(--ink3); }
  .err { padding: 8px 18px; font-size: 12.5px; color: var(--todo); border-bottom: 1px solid var(--rule); }
  .list { flex: 0 1 auto; min-height: 0; overflow-y: auto; padding: 6px 8px 8px; display: flex; flex-direction: column; }
  .gh { padding: 10px 12px 4px; font: 600 11px var(--ui); letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink3); }
  .row { flex: 0 0 40px; height: 40px; display: flex; align-items: center; gap: 12px; padding: 0 12px; border-radius: 8px; cursor: default; }
  .row.pin { margin: 2px 0 4px; border: 1px dashed var(--rule); box-sizing: border-box; }
  .row.on { background: var(--lamp); color: var(--onlamp); border-color: transparent; }
  .row.empty { color: var(--ink3); }
  .ic { flex: 0 0 17px; color: var(--ink3); }
  .t { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
  .t b, .nt b { font-weight: 700; }
  .hint { margin-left: auto; flex: 0 0 auto; font-size: 12px; color: var(--ink3); }
  .key { flex: 0 0 auto; height: 20px; display: flex; align-items: center; padding: 0 6px; border: 1px solid var(--rule); border-radius: 4px; font: 11px var(--mono); color: var(--ink3); }
  .row.on .ic, .row.on .hint, .row.on .key { color: var(--onlamp); }
  .row.on .key { border-color: color-mix(in srgb, var(--onlamp) 35%, transparent); }
  .node { flex: 0 0 32px; height: 32px; display: flex; align-items: center; gap: 7px; padding: 0 12px 0 8px; border-radius: 7px; cursor: default; }
  .node.on { background: var(--lamp); color: var(--onlamp); }
  .node.dim .nt { color: var(--ink3); }
  .node.blocked { opacity: 0.4; }
  .guide { flex: 0 0 14px; align-self: stretch; margin-left: 4px; box-shadow: inset 1px 0 var(--rule); }
  .chev { flex: 0 0 12px; color: var(--ink3); transition: transform 0.12s; }
  .chev.open { transform: rotate(90deg); }
  .chev.none { visibility: hidden; }
  .lv { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 2px; background: var(--ink3); }
  .lv.l1 { background: var(--ink); }
  .kw { flex: 0 0 auto; height: 17px; padding: 0 5px; border-radius: 4px; font: 700 10px/17px var(--ui); color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .nt { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; }
  .cnt { flex: 0 0 auto; height: 17px; padding: 0 6px; border-radius: 9px; background: var(--chip); font: 11px/17px var(--ui); color: var(--ink2); }
  .tags { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 11.5px var(--mono); color: var(--ink3); }
  .will { margin-left: auto; flex: 0 0 auto; font-size: 12px; }
  .node.on .chev, .node.on .tags, .node.on .cnt, .node.on .will { color: var(--onlamp); }
  .node.on .lv { background: var(--onlamp); }
  .node.on .cnt { background: color-mix(in srgb, var(--onlamp) 14%, transparent); }
  .node.on .kw { background: color-mix(in srgb, var(--onlamp) 12%, var(--card)); }
  .foot { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 9px 18px; border-top: 1px solid var(--rule); font-size: 11.5px; color: var(--ink3); }
  kbd { font: 11px var(--mono); color: var(--ink2); }
</style>

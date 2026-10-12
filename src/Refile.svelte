<script module lang="ts">
  // what is open in each file's tree, kept until the app quits
  const openMemo = new Map<string, Set<string>>();
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from './store.svelte';
  import { ICONS } from './commands';
  import { runs } from './fuzzy';
  import { displayName } from './names';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import { bareTitle, fileRows, initialOpen, keyOf, plural, treeRows, type FileRow, type TreeRow } from './refile';

  // «Перенести»: a heading with its subtree goes to another place in two steps in one window — a file, then a
  // heading in it (a tree) or the file's 1st level. Opened by the palette's «Перенести в другой файл…» (looks like
  // the palette, ⌫ goes back to it) and by «Перенести» of an Inbox task.
  const req = store.refile!;
  const fromPalette = req.self;
  const TOP = 'M4 3.5h12M10 17V8M6.5 11.5L10 8l3.5 3.5';

  let step = $state<1 | 2>(1);
  let q = $state('');
  let path = $state(''); // the file of step 2
  let sel = $state(''); // 'f:<path>' | 'top' | 'h:<index>'
  let err = $state('');
  let busy = $state(false);
  let openSet = $state<Set<string>>(new Set());
  let input: HTMLInputElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();

  const src = $derived(store.refileSource());
  const below = $derived(src ? src.f.headings.filter((h) => h.line > src.h.line && h.line < src.h.end).length : 0);
  const rootName = $derived(store.dir ? store.dir.split('/').pop()! : 'заметки');

  // ---- step 1 ----
  const files = $derived<FileRow[]>(
    step === 1
      ? fileRows(store.files, {
          q, root: rootName, recent: store.refileRecentFiles(req.path),
          ...(fromPalette ? { self: req.path } : { exclude: req.path }),
        })
      : [],
  );
  // ---- step 2 ----
  const target = $derived(store.files.find((f) => f.path === path));
  const tree = $derived(
    step === 2 && target
      ? treeRows(target.headings, openSet, q, target.path === req.path && src ? { line: src.h.line, end: src.h.end } : undefined)
      : { rows: [] as TreeRow[], matches: 0 },
  );
  const fileName = $derived(target ? displayName(target.name) : '');

  const pickable = $derived(
    step === 1 ? files.map((f) => 'f:' + f.path) : ['top', ...tree.rows.filter((r) => !r.blocked).map((r) => 'h:' + r.i)],
  );

  onMount(() => {
    sel = pickable[0] ?? '';
    input?.focus();
    // the palette that opened this gives the focus back as it goes: take it again
    requestAnimationFrame(() => input?.focus());
  });

  const close = () => (store.refile = null);
  async function scroll() {
    await tick();
    list?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function typed() {
    err = '';
    if (step === 1) sel = pickable[0] ?? '';
    else {
      const first = q.trim() ? tree.rows.find((r) => !r.dim && !r.blocked) : undefined;
      sel = first ? 'h:' + first.i : 'top';
    }
  }
  function toStep2(p: string) {
    const f = store.files.find((x) => x.path === p);
    if (!f) {
      err = `Не удалось прочитать ${displayName(p.split('/').pop() ?? p)}`;
      return;
    }
    const last = store.refileRecent().find((x) => x.path === p)?.key || undefined;
    openSet = openMemo.get(p) ?? initialOpen(f.headings, last);
    path = p;
    step = 2;
    q = '';
    err = '';
    sel = 'top';
    void scroll();
  }
  function toStep1() {
    step = 1;
    q = '';
    err = '';
    sel = 'f:' + path;
    void scroll();
  }
  async function move(p: string, underIdx: number | null) {
    if (busy) return;
    const f = store.files.find((x) => x.path === p);
    const h = underIdx === null ? null : f?.headings[underIdx];
    if (!f || (underIdx !== null && !h)) return;
    busy = true;
    const r = await store.refileMove(p, h ? { key: keyOf(h), line: h.line } : null);
    busy = false;
    if (r === 'gone') {
      err = 'Заголовок изменился, выберите место ещё раз';
      if (step !== 2) toStep2(p);
      sel = 'top';
      input?.focus();
    }
  }
  function act(id: string, meta = false) {
    if (step === 1) {
      if (!id.startsWith('f:')) return;
      const p = id.slice(2);
      if (meta) void move(p, null);
      else toStep2(p);
    } else if (meta || id === 'top') void move(path, null);
    else if (id.startsWith('h:')) void move(path, +id.slice(2));
  }
  function setOpen(key: string, on: boolean) {
    const next = new Set(openSet);
    if (on) next.add(key);
    else next.delete(key);
    openSet = next;
    openMemo.set(path, next);
  }
  function toggle(r: TreeRow) {
    if (target && r.hasKids && !q.trim()) setOpen(keyOf(target.headings[r.i]), !r.open);
  }
  /** → opens a branch, or goes into an open one; ← closes it, or goes to the parent. */
  function side(right: boolean) {
    if (!target || !sel.startsWith('h:')) return;
    const i = +sel.slice(2);
    const at = tree.rows.findIndex((r) => r.i === i);
    const r = tree.rows[at];
    if (!r) return;
    if (right) {
      if (r.hasKids && !r.open) setOpen(keyOf(target.headings[i]), true);
      else if (r.open) {
        const child = tree.rows[at + 1];
        if (child && !child.blocked) sel = 'h:' + child.i;
      }
    } else if (r.open) setOpen(keyOf(target.headings[i]), false);
    else {
      const up = target.headings[i].parent;
      if (up >= 0 && !tree.rows.find((x) => x.i === up)?.blocked) sel = 'h:' + up;
    }
    void scroll();
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!pickable.length) return;
      const k = pickable.indexOf(sel);
      const d = e.key === 'ArrowDown' ? 1 : -1;
      sel = pickable[k < 0 ? 0 : (k + d + pickable.length) % pickable.length];
      void scroll();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (step === 2 && e.metaKey) act('top', true);
      else if (sel) act(sel, e.metaKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Backspace' && !q) {
      e.preventDefault();
      if (step === 2) toStep1();
      else if (fromPalette) {
        close();
        store.palette = { n: Date.now() };
      }
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && step === 2 && !q) {
      e.preventDefault();
      side(e.key === 'ArrowRight');
    } else if (e.key === 'Tab') e.preventDefault();
  }
  const keepFocus = (e: MouseEvent) => {
    if (e.target !== input) e.preventDefault();
  };
  const lvColor = (level: number) => (level <= 3 ? `var(--h${level})` : 'var(--fg2)');
  const FOOT1 = $derived([['↑ ↓', 'выбрать'], ['↩', 'к заголовкам файла'], ['⌘↩', 'сразу на 1-й уровень'], ...(fromPalette ? [['⌫', 'к командам']] : []), ['⎋', 'закрыть']]);
  const FOOT2 = [['↑ ↓', 'выбрать'], ['← →', 'свернуть / развернуть'], ['↩', 'перенести сюда'], ['⌘↩', 'на 1-й уровень'], ['⌫', 'к файлам'], ['⎋', 'закрыть']];
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="scrim" class:inbox={!fromPalette} onmousedown={(e) => { e.preventDefault(); close(); }}></div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pal" class:inbox={!fromPalette} role="dialog" aria-modal="true" aria-label={fromPalette ? 'Перенести заголовок' : 'Перенести задачу'} onmousedown={keepFocus}>
  {#if src}
    <div class="plate">
      <svg class="pi" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS.refile} /></svg>
      <div class="pt">
        <span class="cap">{fromPalette ? 'Переносится заголовок' : 'Переносится задача'}</span>
        <span class="ph">
          {#if src.h.keyword}<span class="kw tone-chip" style={toneStyle(toneFor(src.h.keyword, src.f.wf))}>{src.h.keyword}</span>{/if}
          <span class="ttl">{#if src.h.priority}<span class="pr">[#{src.h.priority}]</span>{' '}{/if}{bareTitle(src.h.title)}</span>
        </span>
      </div>
      <span class="right">{fromPalette && below ? `+${below} ${plural(below, 'подзаголовок', 'подзаголовка', 'подзаголовков')} · ` : ''}из {displayName(src.f.name)}</span>
    </div>
  {/if}

  <div class="field">
    {#if fromPalette}<svg class="lens" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5L17 17" /></svg>{/if}
    <span class="tok">
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={step === 1 ? ICONS.refile : ICONS.file} /></svg>
      {step === 1 ? 'Перенести в' : fileName}
    </span>
    <input bind:this={input} bind:value={q} oninput={typed} onkeydown={key} spellcheck="false" autocomplete="off"
      placeholder={step === 1 ? 'файл…' : `Заголовок в ${fileName}…`} aria-label={step === 1 ? 'Файл' : 'Заголовок'}
      role="combobox" aria-expanded="true" aria-controls="rf-list" aria-activedescendant={sel ? 'rf-' + sel : undefined} />
    {#if fromPalette && store.keyHint('palette')}<kbd>{store.keyHint('palette')}</kbd>{/if}
  </div>
  {#if err}<div class="err" role="alert">{err}</div>{/if}

  <div class="list" id="rf-list" role="listbox" aria-label={step === 1 ? 'Файлы' : 'Место в файле'} bind:this={list}>
    {#if step === 1}
      {#each files as f, i (f.path)}
        {#if f.group !== files[i - 1]?.group}<div class="gh" role="presentation">{f.group}</div>{/if}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="row" id={'rf-f:' + f.path} role="option" aria-selected={sel === 'f:' + f.path} class:on={sel === 'f:' + f.path}
          onmousemove={() => (sel = 'f:' + f.path)} onclick={() => act('f:' + f.path)}>
          <svg class="ic" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS.file} /></svg>
          <span class="t">{#each runs(f.label, f.at) as part}{#if part.hit}<b>{part.s}</b>{:else}{part.s}{/if}{/each}</span>
          <span class="hint">{f.sub}{f.self ? ' · этот файл' : ''}</span>
        </div>
      {:else}
        <div class="row empty" role="option" aria-selected="false" aria-disabled="true">Ничего не найдено</div>
      {/each}
    {:else if target}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="row" id="rf-top" role="option" aria-selected={sel === 'top'} class:on={sel === 'top'} onmousemove={() => (sel = 'top')} onclick={() => act('top')}>
        <svg class="ic" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={TOP} /></svg>
        <span class="t">Перенести на 1-й уровень</span>
        <span class="hint">в конец {fileName}</span>
        <span class="key">⌘↩</span>
      </div>
      <div class="gh" role="presentation">ЗАГОЛОВКИ · {fileName}{q.trim() ? ` — ${tree.matches} ${plural(tree.matches, 'совпадение', 'совпадения', 'совпадений')}` : ''}</div>
      {#each tree.rows as r (r.i)}
        {@const h = target.headings[r.i]}
        {@const on = sel === 'h:' + r.i}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="node" id={'rf-h:' + r.i} role="option" aria-selected={on} aria-disabled={r.blocked} class:on class:dim={r.dim} class:blocked={r.blocked}
          onmousemove={() => { if (!r.blocked) sel = 'h:' + r.i; }} onclick={() => { if (!r.blocked) act('h:' + r.i); }}>
          {#each { length: r.depth } as _}<span class="guide" aria-hidden="true"><span></span></span>{/each}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <svg class="chev" class:open={r.open} class:none={!r.hasKids} width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
            role="button" aria-label={r.open ? 'Свернуть' : 'Развернуть'} tabindex="-1" onclick={(e) => { e.stopPropagation(); toggle(r); }}><path d="M4.5 2.5l3.5 3.5-3.5 3.5" /></svg>
          <span class="lv" aria-hidden="true" style:background={r.dim ? 'var(--fg3)' : lvColor(h.level)}></span>
          {#if h.keyword}<span class="kw tone-chip" style={toneStyle(toneFor(h.keyword, target.wf))}>{h.keyword}</span>{/if}
          <span class="nt" class:l1={h.level === 1 && (!q.trim() || r.dim)}>{#each runs(bareTitle(h.title), r.at) as part}{#if part.hit}<b>{part.s}</b>{:else}{part.s}{/if}{/each}</span>
          {#if r.hasKids && !r.open}<span class="cnt">{r.kids}</span>{/if}
          {#if h.tags.length}<span class="tags">:{h.tags.join(':')}:</span>{/if}
          {#if on}<span class="will">станет {h.level + 1}-м уровнем</span>{/if}
        </div>
      {/each}
      {#if q.trim() && !tree.matches}<div class="row empty" role="option" aria-selected="false" aria-disabled="true">Ничего не найдено</div>{/if}
    {/if}
  </div>

  <div class="foot">
    {#each step === 1 ? FOOT1 : FOOT2 as [k, t]}<span><kbd>{k}</kbd>{t}</span>{/each}
  </div>
</div>

<style>
  .scrim { position: fixed; left: 0; right: 0; top: 52px; bottom: 0; z-index: 88; background: var(--scrim); }
  .scrim.inbox { top: 0; z-index: 94; }
  .pal {
    position: fixed; z-index: 89; top: 84px; left: 50%; transform: translateX(-50%); width: 640px; max-width: calc(100% - 32px);
    max-height: calc(100vh - 84px - 32px); display: flex; flex-direction: column; overflow: hidden; color: var(--fg);
    background: var(--pop); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 22px 60px rgba(0, 0, 0, 0.35);
  }
  .pal.inbox { z-index: 95; top: 110px; max-height: calc(100vh - 110px - 32px); }
  .plate { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--side); border-bottom: 1px solid var(--line); min-width: 0; }
  .pi { flex: 0 0 14px; color: var(--acc); }
  .pt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .cap { font-size: 11px; color: var(--fg2); }
  .ph { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13.5px; min-width: 0; }
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .ttl { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pr { color: var(--wait); }
  .right { flex: 0 0 auto; font-size: 11.5px; color: var(--fg2); }
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
</style>

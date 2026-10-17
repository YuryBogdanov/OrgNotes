<script module lang="ts">
  // where the focus goes back to; kept across a quick close and reopen (before the focus came back)
  let restoreTo: HTMLElement | null = null;
</script>

<script lang="ts">
  import { moved } from './pointer';
  import { onDestroy, onMount } from 'svelte';
  import { store } from './store.svelte';
  import { ICONS, bare, type Row } from './commands';
  import Calendar from './Calendar.svelte';
  import { runs } from './fuzzy';
  import { displayName } from './names';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import { PaletteCtl } from './paletteCtl.svelte';

  // The command palette (⇧⌘P): one window, a query field, grouped rows. A command with «…» replaces the rows with
  // its next step in the same window; Esc anywhere cancels the whole thing. Its workings: paletteCtl.svelte.ts.
  const ctl = new PaletteCtl();
  ctl.effects();
  const step = $derived(ctl.step);
  const rows = $derived(ctl.rows);
  const plate = $derived(ctl.plate);
  const current = $derived(ctl.current);

  let input: HTMLInputElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();
  ctl.onstep = () => input?.select();
  ctl.onmove = () => list?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  const active = document.activeElement as HTMLElement | null;
  const before = active && active !== document.body ? active : restoreTo;
  const tabBefore = store.tab?.id;
  onMount(() => {
    input?.focus();
    input?.select();
  });
  onDestroy(() => {
    restoreTo = before;
    // back to where it was (the caret too), at once so the next key lands there; not scrolled: a focused editor would
    // be brought into view from its top (#103)
    if (store.tab?.id === tabBefore && before?.isConnected) return before.focus({ preventScroll: true });
    // a command opened another tab: its editor is not there yet
    requestAnimationFrame(() => {
      if (!store.palette) document.querySelector<HTMLElement>('section.pane.active .cm-content')?.focus({ preventScroll: true });
    });
  });
  const close = ctl.close;
  const run = (r: Row | undefined) => ctl.run(r);
  const hover = (i: number) => ctl.hover(i);
  const keepFocus = (e: MouseEvent) => {
    if (e.target !== input) e.preventDefault();
  };
  const label = (r: Row) => [r.title, r.hint, r.plugin && `плагин «${r.plugin}»`, r.key].filter(Boolean).join(', ');
  const fileLine = (f: { name: string }, line: number) => `${displayName(f.name)} · строка ${line + 1}`;
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="block" onmousedown={(e) => { e.preventDefault(); close(); }}></div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" onmousedown={(e) => { e.preventDefault(); close(); }}></div>
<div class="pal" class:wide={!!step.calendar} role="dialog" aria-modal="true" aria-label="Командная палитра" onmousedown={keepFocus}>
  {#if plate?.kind === 'heading'}
    <div class="plate">
      <svg class="pi acc" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h12M4 10h8M4 14h5" /></svg>
      <div class="pt">
        <span class="cap">Действия применятся к заголовку</span>
        <span class="ph">
          {#if plate.h.keyword}<span class="kw tone-chip" style={toneStyle(toneFor(plate.h.keyword, plate.file.wf))}>{plate.h.keyword}</span>{/if}
          <span class="ttl">{#if plate.h.priority}<span class="pr">[#{plate.h.priority}]</span>{' '}{/if}{bare(plate.h.title)}</span>
        </span>
      </div>
      <span class="right">{fileLine(plate.file, plate.h.line)}</span>
    </div>
  {:else if plate?.kind === 'general'}
    <div class="plate small">
      <svg class="pi" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 6.5V10l2.5 1.5" /></svg>
      <span class="grow">Курсор не на заголовке — доступны только общие действия</span>
      <span class="right">{fileLine(plate.file, plate.line)}</span>
    </div>
  {:else if plate?.kind === 'headings'}
    <div class="plate small">
      <svg class="pi acc" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS.head} /></svg>
      <span class="grow">Переход к заголовку в текущем файле. Для другого файла уберите «#»</span>
      <span class="right">{displayName(plate.file.name)}</span>
    </div>
  {:else if plate?.kind === 'text'}
    <div class="plate small">
      <svg class="pi acc" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS.folder} /></svg>
      <span class="grow">{plate.text}</span>
      {#if plate.right}<span class="right">{plate.right}</span>{/if}
    </div>
  {/if}

  <div class="field">
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5L17 17" /></svg>
    {#if step.token}
      <span class="tok"><svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS[step.token.icon]} /></svg>{step.token.text}</span>
    {/if}
    <div class="box">
      <input bind:this={input} bind:value={ctl.q} oninput={ctl.typedDate} placeholder={step.placeholder} aria-label={step.placeholder} spellcheck="false" autocomplete="off"
        role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={current ? 'pal-' + current.id : undefined} onkeydown={ctl.key} />
      {#if step.ghost?.(ctl.q)}<span class="ghost" aria-hidden="true"><span class="mirror">{ctl.q}</span> {step.ghost(ctl.q)}</span>{/if}
    </div>
    {#if store.keyHint('palette')}<kbd>{store.keyHint('palette')}</kbd>{/if}
  </div>

  {#if step.calendar}
    <Calendar spec={step.calendar} sel={ctl.cal} view={ctl.view} bad={ctl.bad} busy={ctl.busy} onselect={(d) => (ctl.cal = d)} onpick={ctl.pickCal} onturn={ctl.turn} />
  {/if}
  <div class="list" id="pal-list" role="listbox" aria-label="Результаты" bind:this={list} class:none={!!step.calendar}>
    {#each rows as r, i (r.id + i)}
      {#if r.group && r.group !== rows[i - 1]?.group}<div class="gh" role="presentation">{r.group}{#if r.note}<span class="gn">{r.note}</span>{/if}</div>{/if}
      {#if r.run}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="row" id={'pal-' + r.id} role="option" aria-selected={current === r} aria-label={label(r)} class:on={current === r}
          style:padding-left={10 + (r.level ?? 0) * 18 + 'px'} onmousemove={(e) => moved(e) && hover(i)} onclick={() => run(r)}>
          {#if r.icon || r.iconPath}
            <span class="ico"><svg class="ic" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={r.iconPath ?? ICONS[r.icon!]} /></svg>{#if r.plugin}<i class="pm" title="Команда плагина"></i>{/if}</span>
          {/if}
          <span class="t" class:it={r.italic}>{#each runs(r.title, r.at ?? []) as part}{#if part.hit}<b>{part.s}</b>{:else}{part.s}{/if}{/each}</span>
          {#if r.hint}<span class="hint">{r.hint}</span>{/if}
          {#if r.plugin}<span class="plug">{r.plugin}</span>{/if}
          {#if r.key}<span class="key">{r.key}</span>{/if}
        </div>
      {:else}
        <div class="row empty" role="option" aria-selected="false" aria-disabled="true">{r.title}</div>
      {/if}
    {/each}
  </div>

  <div class="foot">
    {#each step.foot ?? [['↑ ↓', 'выбрать'], ['↩', 'выполнить'], ['⎋', 'закрыть']] as [k, t] (k)}<span><kbd>{k}</kbd>{t}</span>{/each}
  </div>
</div>

<style>
  .block { position: fixed; left: 0; right: 0; top: 0; height: 52px; z-index: 88; }
  .scrim { position: fixed; left: 0; right: 0; top: 52px; bottom: 0; z-index: 88; background: var(--scrim); }
  .pal {
    position: fixed; z-index: 89; top: 84px; left: 50%; transform: translateX(-50%); width: 640px; max-width: calc(100% - 32px); transition: width 0.15s;
    max-height: calc(100vh - 84px - 32px); display: flex; flex-direction: column; overflow: hidden;
    background: var(--pop); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 22px 60px rgba(0, 0, 0, 0.35);
  }
  .plate { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--side); border-bottom: 1px solid var(--line); min-width: 0; }
  .plate.small { padding: 9px 16px; font-size: 12px; color: var(--fg2); }
  .pi { flex: 0 0 14px; color: var(--fg2); }
  .pi.acc { color: var(--acc); }
  .pt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .cap { font-size: 11px; color: var(--fg2); }
  .ph { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13.5px; min-width: 0; }
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .ttl { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pr { color: var(--wait); }
  .right { flex: 0 0 auto; font-size: 11.5px; color: var(--fg2); }
  .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .field { flex: 0 0 52px; display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid var(--line); color: var(--fg2); }
  .box { position: relative; flex: 1; min-width: 0; display: flex; }
  input { width: 100%; border: 0; outline: none; background: transparent; color: var(--fg); font: 17px var(--ui); padding: 0; caret-color: var(--acc); -webkit-user-select: text; user-select: text; }
  input::placeholder { color: var(--fg3); }
  .ghost { position: absolute; left: 0; top: 50%; transform: translateY(-50%); font: 17px var(--ui); color: var(--fg3); pointer-events: none; white-space: pre; }
  .mirror { visibility: hidden; }
  kbd { font: 11px var(--mono); padding: 1px 6px; border: 1px solid var(--line); border-radius: 4px; color: var(--fg2); }
  .list { flex: 0 1 auto; min-height: 0; overflow-y: auto; padding: 6px 8px 8px; display: flex; flex-direction: column; }
  .gh { padding: 10px 10px 4px; font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  /* «ВЫДЕЛЕННАЯ ЗАДАЧА» and its task in grey (ТЗ 34) */
  .gn { margin-left: 8px; font-weight: 400; letter-spacing: 0; color: var(--fg3); }
  .row { flex: 0 0 40px; display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 10px; border-radius: 8px; color: var(--fg); cursor: default; }
  .row.on { background: var(--pacc); color: var(--onpacc); }
  .row.empty { color: var(--fg2); }
  .ic { flex: 0 0 17px; opacity: 0.9; }
  .t { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; }
  .t.it { font-style: italic; }
  .t b { font-weight: 700; }
  .hint { flex: 0 0 auto; font-size: 12px; color: var(--fg2); }
  .key { flex: 0 0 auto; display: flex; align-items: center; height: 20px; padding: 0 6px; border: 1px solid var(--line); border-radius: 4px; font: 11px var(--mono); color: var(--fg2); }
  .row.on .hint, .row.on .key { color: rgba(255, 255, 255, 0.85); }
  .row.on .key { border-color: rgba(255, 255, 255, 0.55); }
  .pal.wide { width: 800px; }
  .list.none { display: none; }
  .tok { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 9px; border-radius: 6px; background: color-mix(in srgb, var(--acc) 14%, transparent); color: var(--acc); font-size: 13px; font-weight: 600; }
  .foot { flex: 0 0 auto; display: flex; align-items: center; flex-wrap: wrap; row-gap: 4px; column-gap: 16px; padding: 8px 16px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); }
  .foot span { display: flex; align-items: center; gap: 5px; }
  .foot kbd { padding: 0 5px; color: var(--fg); }
  /* a plugin's command (ТЗ 37): a purple mark on its icon, its plugin's name as a capsule */
  .ico { position: relative; flex: 0 0 17px; display: flex; }
  .pm { position: absolute; right: -4px; bottom: -4px; width: 10px; height: 10px; box-sizing: border-box; border-radius: 3px; background: var(--purple); border: 2px solid var(--pop, var(--bg)); }
  .plug { flex: 0 0 auto; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--purple); background: color-mix(in srgb, var(--purple) 14%, transparent); }
  .row.on .pm { background: var(--onpacc); border-color: var(--pacc); }
  .row.on .plug { color: var(--onpacc); background: rgba(255, 255, 255, 0.22); }
</style>

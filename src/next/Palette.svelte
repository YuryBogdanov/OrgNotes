<script module lang="ts">
  // where the focus goes back to; kept across a quick close and reopen (before the focus came back)
  let restoreTo: HTMLElement | null = null;
</script>

<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { moved } from '../pointer';
  import { store } from '../store.svelte';
  import { ICONS, bare, type Row } from '../commands';
  import { runs } from '../fuzzy';
  import { displayName } from '../names';
  import { fmtLong, toneFor } from '../org';
  import { toneStyle } from '../colors';
  import { relWords } from '../calendar';
  import { PaletteCtl } from '../paletteCtl.svelte';
  import PaletteCalendar from './PaletteCalendar.svelte';

  // The palette of the new interface (ТЗ 44 §2): its look; its workings are the old one's (paletteCtl.svelte.ts,
  // commands.ts — ТЗ 09, 16, 20). 640 pt in the middle of the window, 84 pt from its top, the window dimmed. Over the
  // field — the plate of the context on `chip`; the field 52 pt with the step's label; rows of 40 pt by group; the
  // foot. A date's step: 800 pt, the result right in the field, the three months, the chips.
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
    if (store.tab?.id === tabBefore && before?.isConnected) return before.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      if (!store.palette) document.querySelector<HTMLElement>('[data-ui="next"] .cm-content')?.focus({ preventScroll: true });
    });
  });
  const keepFocus = (e: MouseEvent) => {
    if (e.target !== input) e.preventDefault();
  };
  const label = (r: Row) => [r.title, r.hint, r.plugin && `плагин «${r.plugin}»`, r.key].filter(Boolean).join(', ');
  const fileLine = (f: { name: string }, line: number) => `${displayName(f.name)} · строка ${line + 1}`;
  /** The foot: the step's own keys, else the palette's; on the right, the prefixes of the main step. */
  const DEFAULT_FOOT: [string, string][] = [['↑↓', 'выбрать'], ['↩', 'выполнить'], ['⌘↩', 'в новой вкладке']];
  const foot = $derived(step.foot ?? DEFAULT_FOOT);
  const main = $derived(!step.token && !step.calendar && !step.foot);
  /** A date's step: what the day chosen is, right in the field. */
  const dayWords = $derived(step.calendar ? (ctl.bad ? 'Не похоже на дату' : `${fmtLong(ctl.cal)} · ${relWords(ctl.cal)}`) : '');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dim" onmousedown={(e) => { e.preventDefault(); ctl.close(); }}></div>
<div class="pal" class:wide={!!step.calendar} role="dialog" aria-modal="true" aria-label="Командная палитра" tabindex="-1" onmousedown={keepFocus}>
  {#if plate?.kind === 'heading'}
    <div class="plate">
      <span class="cap">Действия применятся к заголовку</span>
      {#if plate.h.keyword}<span class="kw" style={toneStyle(toneFor(plate.h.keyword, plate.file.wf))}>{plate.h.keyword}</span>{/if}
      <b class="ttl">{#if plate.h.priority}<span class="pr">[#{plate.h.priority}]</span>{' '}{/if}{bare(plate.h.title)}</b>
      <span class="right">{fileLine(plate.file, plate.h.line)}</span>
    </div>
  {:else if plate?.kind === 'general'}
    <div class="plate"><span class="grow">Курсор не на заголовке — доступны только общие действия</span><span class="right">{fileLine(plate.file, plate.line)}</span></div>
  {:else if plate?.kind === 'headings'}
    <div class="plate"><span class="grow">Переход к заголовку в текущем файле. Для другого файла уберите «#»</span><span class="right">{displayName(plate.file.name)}</span></div>
  {:else if plate?.kind === 'text'}
    <div class="plate"><span class="grow">{plate.text}</span>{#if plate.right}<span class="right">{plate.right}</span>{/if}</div>
  {/if}

  <div class="field">
    <svg class="si" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></svg>
    {#if step.token}
      <span class="tok"><svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS[step.token.icon]} /></svg>{step.token.text}</span>
    {/if}
    <div class="box">
      <input bind:this={input} bind:value={ctl.q} oninput={ctl.typedDate} placeholder={step.placeholder} aria-label={step.placeholder} spellcheck="false" autocomplete="off"
        role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={current ? 'pal-' + current.id : undefined} onkeydown={ctl.key} />
      {#if step.ghost?.(ctl.q)}<span class="ghost" aria-hidden="true"><span class="mirror">{ctl.q}</span> {step.ghost(ctl.q)}</span>{/if}
    </div>
    {#if step.calendar}<span class="day" class:bad={ctl.bad} aria-live="polite">{dayWords}</span>{:else}<span class="esc">esc</span>{/if}
  </div>

  {#if step.calendar}
    {@const spec = step.calendar}
    <PaletteCalendar {spec} sel={ctl.cal} view={ctl.view} busy={ctl.busy} onselect={(d) => (ctl.cal = d)} onpick={ctl.pickCal} onturn={ctl.turn}
      onclear={() => { ctl.close(); spec.clear?.(); }} />
  {:else}
    <div class="list" id="pal-list" role="listbox" aria-label="Результаты" bind:this={list}>
      {#each rows as r, i (r.id + i)}
        {#if r.group && r.group !== rows[i - 1]?.group}<div class="gh" role="presentation">{r.group}{#if r.note}<span class="gn">{r.note}</span>{/if}</div>{/if}
        {#if r.run}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="row" id={'pal-' + r.id} role="option" tabindex="-1" aria-selected={current === r} aria-label={label(r)} class:on={current === r}
            style:padding-left={12 + (r.level ?? 0) * 18 + 'px'} onmousemove={(e) => moved(e) && ctl.hover(i)} onclick={() => ctl.run(r)}>
            {#if r.icon || r.iconPath}<svg class="ic" class:plug={!!r.plugin} width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={r.iconPath ?? ICONS[r.icon!]} /></svg>{/if}
            <span class="t" class:it={r.italic}>{#each runs(r.title, r.at ?? []) as part, pi (pi)}{#if part.hit}<b>{part.s}</b>{:else}{part.s}{/if}{/each}</span>
            {#if r.plugin}<span class="where">{r.plugin}</span>{/if}
            {#if r.hint}<span class="hint">{r.hint}</span>{/if}
            {#if r.key}<span class="key">{r.key}</span>{/if}
          </div>
        {:else}
          <div class="row empty" role="option" aria-selected="false" aria-disabled="true">{r.title}</div>
        {/if}
      {/each}
    </div>
  {/if}

  <div class="foot">
    <span class="keys">{#each foot as [k, t], fi (fi)}<span><kbd>{k}</kbd> {t}</span>{/each}</span>
    {#if main}<span class="pre"><b>&gt;</b> команды · <b>#</b> заголовки · <b>@</b> люди</span>{/if}
  </div>
</div>

<style>
  .dim { position: fixed; inset: 0; z-index: 88; background: var(--dim); }
  .pal {
    position: fixed; z-index: 89; top: 84px; left: 50%; transform: translateX(-50%); width: 640px; max-width: calc(100% - 32px);
    max-height: calc(100vh - 84px - 32px); display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;
    border: 1px solid var(--rule); border-radius: 12px; background: var(--card); box-shadow: var(--popshadow); color: var(--ink); font: 13px var(--ui);
    outline: none; animation: pal-in 120ms ease-out;
  }
  .pal.wide { width: 800px; }
  @keyframes pal-in { from { opacity: 0; transform: translate(-50%, -4px); } }
  @media (prefers-reduced-motion: reduce) { .pal { animation: none; } }
  .plate { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; margin: 10px 10px 0; padding: 8px 12px; border-radius: 8px; background: var(--chip); font-size: 12.5px; color: var(--ink2); min-width: 0; }
  .cap { flex: 0 0 auto; }
  .kw { flex: 0 0 auto; height: 18px; padding: 0 6px; border-radius: 4px; font: 700 10.5px/18px var(--ui); color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .ttl { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
  .pr { color: var(--wait); }
  .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .right { margin-left: auto; flex: 0 0 auto; font-size: 11.5px; color: var(--ink3); }
  .field { flex: 0 0 52px; display: flex; align-items: center; gap: 10px; padding: 0 18px; border-bottom: 1px solid var(--rule); }
  .si { flex: 0 0 auto; color: var(--ink3); }
  .tok { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 9px; border-radius: 6px; background: var(--lampsoft); color: var(--lampink); font: 600 12.5px var(--ui); white-space: nowrap; }
  .box { position: relative; flex: 1; min-width: 0; display: flex; }
  input { width: 100%; padding: 0; border: 0; outline: none; background: transparent; color: var(--ink); caret-color: var(--lamp); font: 17px var(--ui); -webkit-user-select: text; user-select: text; }
  input::placeholder { color: var(--ink3); }
  .ghost { position: absolute; left: 0; top: 50%; transform: translateY(-50%); font: 17px var(--ui); color: var(--ink3); pointer-events: none; white-space: pre; }
  .mirror { visibility: hidden; }
  .esc { flex: 0 0 auto; font: 11px var(--mono); color: var(--ink3); }
  .day { flex: 0 0 auto; font-size: 13px; color: var(--lampink); white-space: nowrap; }
  .day.bad { color: var(--todo); }
  .list { flex: 0 1 auto; min-height: 0; overflow-y: auto; padding: 6px 8px 8px; display: flex; flex-direction: column; }
  .gh { padding: 10px 12px 4px; font: 600 11px var(--ui); letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink3); }
  .gn { margin-left: 8px; font-weight: 400; letter-spacing: 0; text-transform: none; }
  .row { flex: 0 0 40px; height: 40px; display: flex; align-items: center; gap: 12px; padding: 0 12px; border-radius: 8px; color: var(--ink); cursor: default; }
  .row.on { background: var(--lamp); color: var(--onlamp); }
  .row.empty { color: var(--ink3); }
  .ic { flex: 0 0 17px; color: var(--ink3); }
  .ic.plug { color: var(--plug); }
  .t { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
  .t.it { font-style: italic; }
  .t b { font-weight: 700; }
  .where { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--ink3); }
  .hint { margin-left: auto; flex: 0 0 auto; font-size: 12px; color: var(--ink3); }
  .key { flex: 0 0 auto; height: 20px; display: flex; align-items: center; padding: 0 6px; border: 1px solid var(--rule); border-radius: 4px; font: 11px var(--mono); color: var(--ink3); }
  .hint + .key { margin-left: 0; }
  .t + .key, .where + .key { margin-left: auto; }
  .row.on .ic, .row.on .where, .row.on .hint, .row.on .key { color: var(--onlamp); }
  .row.on .key { border-color: color-mix(in srgb, var(--onlamp) 35%, transparent); }
  .foot { flex: 0 0 auto; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 16px; padding: 9px 18px; border-top: 1px solid var(--rule); font-size: 11.5px; color: var(--ink3); }
  .keys { display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .pre { margin-left: auto; }
  .pre b { font: 600 11.5px var(--mono); color: var(--ink2); }
  kbd { font: 11px var(--mono); color: var(--ink2); }
</style>

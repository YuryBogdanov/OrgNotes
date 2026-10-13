<script module lang="ts">
  // where the focus goes back to; kept across a quick close and reopen (before the focus came back)
  let restoreTo: HTMLElement | null = null;
</script>

<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { store } from './store.svelte';
  import { ICONS, bare, calStep, contextOf, gotoStep, headingStep, mainStep, nameStep, type Row, type Step, type Unit } from './commands';
  import Calendar from './Calendar.svelte';
  import { busyDays, shiftDate } from './calendar';
  import { parseDate } from './edits';
  import { runs } from './fuzzy';
  import { displayName } from './names';
  import { toneFor } from './org';
  import { toneStyle } from './colors';

  // The command palette (⇧⌘P): one window, a query field, grouped rows. A command with «…» replaces the rows with
  // its next step in the same window; Esc anywhere cancels the whole thing.
  const ctx = contextOf();
  const start = store.palette?.start;
  const cal0 = start === 'calendar' ? store.calReq : null;
  let step: Step = $state(
    cal0 ? calStep(cal0, () => cal0.plate ?? null)
    : start === 'step' && store.stepReq ? store.stepReq
    : start === 'goto' ? gotoStep() : start === 'newFile' ? nameStep(ctx, 'file') : start === 'newFolder' ? nameStep(ctx, 'folder') : start && start !== 'calendar' && start !== 'step' ? headingStep(ctx, start) : mainStep(ctx),
  );
  let q = $state(step.initial ?? '');
  let sel = $state(0); // an index into the selectable rows

  const rows = $derived(step.rows(q));
  const pickable = $derived(rows.flatMap((r, i) => (r.run ? [i] : [])));
  const plate = $derived(step.plate(q));
  const current = $derived(rows[pickable[sel] ?? -1]);
  // typing selects the first result (or the row the list prefers: the heading the cursor is in)
  $effect(() => {
    void q;
    sel = Math.max(0, pickable.findIndex((i) => rows[i].prefer));
  });

  let input: HTMLInputElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();
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

  const close = () => (store.palette = null);

  // ---- the calendar step: the chosen day, the month in the middle, the typed text read as a date ----------------
  let cal = $state(new Date());
  let view = $state(new Date());
  let bad = $state(false);
  let calOf: Step | null = null;
  $effect.pre(() => {
    if (step.calendar && calOf !== step) {
      calOf = step;
      cal = view = step.calendar.initial;
      bad = false;
    }
  });
  const busy = $derived(step.calendar ? busyDays(store.files) : new Map());
  function typedDate() {
    if (!step.calendar) return;
    if (!q.trim()) return void (bad = false);
    const d = parseDate(q);
    bad = !d;
    if (d) cal = view = d;
  }
  function moveCal(d: Date) {
    cal = view = d;
    q = ''; // ⇧ + arrows after typing go on from the typed date; the text goes
    bad = false;
  }
  function pickCal(d: Date) {
    const spec = step.calendar;
    close();
    spec?.pick(d);
  }
  const ARROWS: Record<string, [Unit, number]> = { ArrowLeft: ['day', -1], ArrowRight: ['day', 1], ArrowUp: ['week', -1], ArrowDown: ['week', 1] };
  /** ⇧ ← → a day, ⇧ ↑ ↓ a week; with ⌥ a month, a year (as org-read-date's S- and M-S-arrows). */
  const unitOf = (e: KeyboardEvent): [Unit, number] | null => {
    const a = ARROWS[e.key];
    if (!a || !e.shiftKey || e.metaKey || e.ctrlKey) return null;
    return e.altKey ? [a[0] === 'day' ? 'month' : 'year', a[1]] : a;
  };
  async function run(r: Row | undefined) {
    if (!r?.run) return; // «Ничего не найдено» and prompts do nothing
    const next = r.run();
    if (next) {
      step = next;
      q = next.initial ?? '';
      await tick();
      input?.select();
    } else close();
  }
  async function move(d: 1 | -1) {
    if (!pickable.length) return;
    sel = (sel + d + pickable.length) % pickable.length; // round the ends
    await tick();
    list?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function key(e: KeyboardEvent) {
    const u = unitOf(e);
    if (step.calendar) {
      if (u) {
        e.preventDefault();
        return moveCal(shiftDate(cal, u[0], u[1]));
      }
      if (e.key === '.' && !q) {
        e.preventDefault();
        return moveCal(new Date());
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        return pickCal(cal);
      }
      if (e.key === 'Backspace' && !q && step.calendar.back) {
        e.preventDefault();
        step = step.calendar.back();
        return;
      }
    } else if (u && step.shift) {
      e.preventDefault();
      step = step.shift(u[0], u[1]);
      q = '';
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(current);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') e.preventDefault(); // the focus stays in the field
  }
  // the pointer picks a row only when it moves, not when keyboard scrolling slides a row under it
  const hover = (i: number) => {
    const k = pickable.indexOf(i);
    if (k >= 0) sel = k;
  };
  const keepFocus = (e: MouseEvent) => {
    if (e.target !== input) e.preventDefault();
  };
  const label = (r: Row) => [r.title, r.hint, r.key].filter(Boolean).join(', ');
  const fileLine = (f: { name: string }, line: number) => `${displayName(f.name)} · строка ${line + 1}`;
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="block" onmousedown={(e) => { e.preventDefault(); close(); }}></div>
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="scrim" onmousedown={(e) => { e.preventDefault(); close(); }}></div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
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
      <input bind:this={input} bind:value={q} oninput={typedDate} placeholder={step.placeholder} aria-label={step.placeholder} spellcheck="false" autocomplete="off"
        role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={current ? 'pal-' + current.id : undefined} onkeydown={key} />
      {#if step.ghost?.(q)}<span class="ghost" aria-hidden="true"><span class="mirror">{q}</span> {step.ghost(q)}</span>{/if}
    </div>
    {#if store.keyHint('palette')}<kbd>{store.keyHint('palette')}</kbd>{/if}
  </div>

  {#if step.calendar}
    <Calendar spec={step.calendar} sel={cal} {view} {bad} {busy} onselect={(d) => (cal = d)} onpick={pickCal} onturn={(n) => (view = shiftDate(view, 'month', n))} />
  {/if}
  <div class="list" id="pal-list" role="listbox" aria-label="Результаты" bind:this={list} class:none={!!step.calendar}>
    {#each rows as r, i (r.id + i)}
      {#if r.group && r.group !== rows[i - 1]?.group}<div class="gh" role="presentation">{r.group}</div>{/if}
      {#if r.run}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="row" id={'pal-' + r.id} role="option" aria-selected={current === r} aria-label={label(r)} class:on={current === r}
          style:padding-left={10 + (r.level ?? 0) * 18 + 'px'} onmousemove={() => hover(i)} onclick={() => run(r)}>
          {#if r.icon}<svg class="ic" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS[r.icon]} /></svg>{/if}
          <span class="t" class:it={r.italic}>{#each runs(r.title, r.at ?? []) as part}{#if part.hit}<b>{part.s}</b>{:else}{part.s}{/if}{/each}</span>
          {#if r.hint}<span class="hint">{r.hint}</span>{/if}
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
</style>

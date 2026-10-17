<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { long, type Filter, type Row } from './state.svelte';
  import { reviewed, review, rowMenu, status, toggleWait } from './actions';
  import { GROUPS, ageWords, approxWords, dueWords, mattersWord, shortDay, tipOf, type Group } from './long';

  // The tab «Долгие дела» (ТЗ 40 §6): the header with its counts and the filter (kept with the tab), the bar of the
  // approximate dates, the list by groups — «Дело и последний статус», «Давность» with a bar to 160% of the norm,
  // «Проверить». ↑↓ choose, ↩ opens the heading, ⌘↩ beside; S R W O — the actions (actions.ts), the menu of a row.
  let { initial, setState }: { initial: Filter; setState: (f: Filter) => void } = $props();
  let filter = $state<Filter>((() => initial)());
  let list: HTMLDivElement | undefined = $state();
  let okOpen = $state(false);
  let approxSeen = $state(!!long.ctx.storage.local.get<{ approxSeen?: boolean }>()?.approxSeen);

  const rows = $derived(long.rows);
  const counts = $derived({
    all: rows.length,
    due: long.groups.due.length,
    waiting: long.groups.waiting.length,
    nostatus: rows.filter((r) => !r.m.note).length,
  });
  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Все' },
    { id: 'due', label: 'Пора' },
    { id: 'waiting', label: 'Ждём' },
    { id: 'nostatus', label: 'Без статуса' },
  ];
  const pass = (r: Row) => filter === 'all' || (filter === 'nostatus' ? !r.m.note : r.s.group === filter);
  const groups = $derived(GROUPS.map((g) => ({ ...g, rows: long.groups[g.id].filter(pass) })).filter((g) => g.rows.length));
  /** Nothing is due or awaited: «В норме» is the list, unfolded. */
  const allCalm = $derived(groups.length === 1 && groups[0].id === 'ok');
  /** «В норме» folds in the whole list; filtered or alone, it is open. */
  const folding = $derived(!allCalm && filter === 'all');
  const isOpen = (g: Group) => g !== 'ok' || okOpen || !folding;
  const visible = $derived(groups.flatMap((g) => (isOpen(g.id) ? g.rows : [])));
  /** The main file of the sources: its matters go without a path. */
  const home = $derived(long.settings.sources.find((s) => s.kind === 'file')?.file ?? null);

  function choose(f: Filter) {
    filter = f;
    setState(f);
  }
  async function select(key: string) {
    long.sel = key;
    await tick();
    list?.querySelector<HTMLElement>('.row.on')?.scrollIntoView({ block: 'nearest' });
  }
  function keydown(e: KeyboardEvent) {
    const i = visible.findIndex((r) => r.m.key === long.sel);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = visible[i < 0 ? 0 : Math.max(0, Math.min(visible.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) void select(next.m.key);
    } else if (e.key === 'Enter' && i >= 0) {
      e.preventDefault();
      if (e.metaKey) long.beside(visible[i].m);
      else long.reveal(visible[i].m);
    } else if (i >= 0 && !e.metaKey && !e.ctrlKey && !e.altKey && ACTIONS[e.code]) {
      // S R W O, by the key's place (a Russian layout too)
      e.preventDefault();
      ACTIONS[e.code](visible[i].m, under(visible[i].m.key));
    }
  }
  /** Under the row of the matter: where its popover and its menu go. */
  function under(key: string) {
    const el = [...(list?.querySelectorAll<HTMLElement>('.row') ?? [])].find((x) => x.dataset.key === key);
    const r = el?.querySelector('.nm')?.getBoundingClientRect() ?? el?.getBoundingClientRect();
    return r ? { x: Math.round(r.left), y: Math.round((el?.getBoundingClientRect().bottom ?? r.bottom) + 2) } : undefined;
  }
  const ACTIONS: Record<string, (m: Row['m'], at?: { x: number; y: number }) => void> = {
    KeyS: (m, at) => status(m, at),
    KeyR: (m, at) => void review(m, at),
    KeyW: (m) => toggleWait(m),
    KeyO: (m) => void reviewed(m),
  };
  function menu(e: MouseEvent, r: Row) {
    e.preventDefault();
    void select(r.m.key);
    rowMenu(r.m, { x: e.clientX, y: e.clientY }, under(r.m.key));
  }
  function dismiss() {
    approxSeen = true;
    void long.ctx.storage.local.set({ approxSeen: true });
  }
  onMount(() => {
    list?.focus();
    if (long.sel) void select(long.sel);
    long.shownTab = true;
    return () => (long.shownTab = false);
  });
  // the chosen matter's group folded (⌥-click in the navigator on one «В норме»): unfold it
  $effect(() => {
    const r = rows.find((x) => x.m.key === long.sel);
    if (r?.s.group === 'ok' && !okOpen) okOpen = true;
  });
  // an action from a menu or a sheet gave the focus away: the list takes it back once it is read again (S R W O go on)
  $effect(() => {
    void long.matters;
    if (document.activeElement === document.body) list?.focus({ preventScroll: true });
  });
  /** The bar of «Давность»: to 160% of the norm. */
  const fill = (r: Row) => (r.s.age === null ? 0 : Math.min(100, (r.s.age / (long.settings.norm * 1.6)) * 100));
  const NORM_AT = 100 / 1.6;
</script>

<div class="lmv">
  <header>
    <div class="title">
      <h1>Долгие дела</h1>
      <span class="sub">{mattersWord(counts.all)}{counts.due ? ` · ${counts.due} пора проверить` : ''}</span>
      <button class="src" onclick={() => long.openSources()}>Источники…</button>
      <button class="src walk" disabled={!counts.due} title={counts.due ? undefined : 'Проверять нечего'} onclick={() => void long.ctx.commands.run('long-matters.walk')}>Начать обход{#if long.ctx.commands.keyOf('long-matters.walk')}<kbd>{long.ctx.commands.keyOf('long-matters.walk')}</kbd>{/if}</button>
    </div>
    <div class="seg" role="tablist" aria-label="Показать">
      {#each FILTERS as f (f.id)}
        <button role="tab" aria-selected={filter === f.id} class:on={filter === f.id} onclick={() => choose(f.id)}>{f.label} · {counts[f.id]}</button>
      {/each}
    </div>
  </header>

  {#if long.progress}
    <p class="empty">Считаем касания… {long.progress.done} из {long.progress.total} файлов</p>
  {:else if !rows.length}
    <div class="empty">
      <p>Долгих дел пока нет. Добавьте тег :long: к заголовку или укажите файл в источниках.</p>
      <button class="btn" onclick={() => long.openSources()}>Источники…</button>
    </div>
  {:else}
    {#if long.mostlyApprox && !approxSeen}
      <div class="approx" role="note">
        <span>Даты восстановлены по :LOGBOOK: и датам файлов (≈). Они уточнятся, как только вы начнёте работать с делами.</span>
        <button class="btn" onclick={dismiss}>Понятно</button>
      </div>
    {/if}
    <div class="list" bind:this={list} tabindex="0" role="grid" aria-label="Долгие дела" onkeydown={keydown}>
      <div class="cols" role="row"><span role="columnheader">Дело и последний статус</span><span role="columnheader">Давность</span><span role="columnheader">Проверить</span></div>
      {#if allCalm && filter === 'all'}<div class="allcalm">Всё под присмотром</div>{/if}
      {#each groups as g (g.id)}
        <button class="grp" class:fold={g.id === 'ok' && folding} aria-expanded={isOpen(g.id)} onclick={() => g.id === 'ok' && folding && (okOpen = !okOpen)}>
          {#if g.id === 'ok' && folding}<svg class="chev" class:on={okOpen} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}
          <span>{g.title}</span><span class="n">{g.rows.length}</span>
        </button>
        {#if isOpen(g.id)}
          {#each g.rows as r (r.m.key)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="row" class:on={long.sel === r.m.key} class:dim={g.id === 'ok'} role="row" tabindex="-1" aria-selected={long.sel === r.m.key} title={tipOf(r.m, r.s)}
              data-key={r.m.key} onclick={() => void select(r.m.key)} ondblclick={() => long.reveal(r.m)} oncontextmenu={(e) => menu(e, r)}>
              <div class="what" role="gridcell">
                <div class="l1">
                  {#if r.m.keyword}<span class="kw tone-chip" style={r.m.tone}>{r.m.keyword}</span>{/if}
                  <span class="nm">{r.m.title}</span>
                  {#if r.m.waiting}<span class="wait">ждём: {r.m.waiting}</span>{/if}
                  {#if r.m.path !== home}<span class="path">{r.m.path}</span>{/if}
                </div>
                <div class="l2">
                  {#if r.m.note}<span class="nd">{shortDay(r.m.note.at)}</span><span class="nt">{r.m.note.text || '—'}</span>{:else}<span class="none">статуса нет</span>{/if}
                </div>
              </div>
              <div class="age {r.s.tone}" role="gridcell" title={approxWords(r.m) ?? undefined}>
                <span>{ageWords(r.s, r.m)} без касания</span>
                <span class="bar" aria-hidden="true"><i style:width="{fill(r)}%"></i><b style:left="{NORM_AT}%"></b></span>
              </div>
              <div class="due" class:late={r.s.left !== null && r.s.left < 0} role="gridcell">{dueWords(r.s)}</div>
            </div>
          {/each}
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .lmv { height: 100%; display: flex; flex-direction: column; background: var(--bg); color: var(--fg); font-size: 13px; }
  header { flex: 0 0 auto; display: flex; flex-direction: column; gap: 10px; padding: 18px 24px 12px; border-bottom: 1px solid var(--line); }
  .title { display: flex; align-items: baseline; gap: 10px; }
  h1 { margin: 0; font-size: 20px; font-weight: 700; }
  .sub { color: var(--fg3); }
  .src { margin-left: auto; height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12.5px; }
  .src:hover { background: var(--side); }
  .src.walk { margin-left: 0; display: inline-flex; align-items: center; gap: 6px; border-color: transparent; background: var(--acc); color: #fff; font-weight: 600; }
  .src.walk:disabled { opacity: 0.45; }
  .src.walk kbd { font: 11px inherit; opacity: 0.7; }
  .seg { align-self: flex-start; display: flex; padding: 2px; border-radius: 7px; background: var(--field); }
  .seg button { height: 24px; padding: 0 10px; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 12px; }
  .seg button.on { background: var(--bg); color: var(--fg); font-weight: 600; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
  .approx { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; margin: 12px 24px 0; padding: 9px 12px; border-radius: 8px; background: color-mix(in srgb, var(--acc) 9%, transparent); color: var(--fg2); font-size: 12.5px; line-height: 1.4; }
  .approx span { flex: 1; }
  .btn { flex: 0 0 auto; height: 26px; padding: 0 12px; border: 0; border-radius: 6px; background: var(--acc); color: var(--onacc); font-size: 12.5px; font-weight: 600; }
  .empty { margin: 0; padding: 32px 24px; color: var(--fg2); display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
  .empty p { margin: 0; max-width: 60ch; }
  .list { flex: 1; min-height: 0; overflow: auto; padding: 4px 16px 24px; outline: none; }
  .cols, .row { display: grid; grid-template-columns: minmax(0, 1fr) 190px 120px; align-items: center; column-gap: 16px; }
  .cols { position: sticky; top: 0; z-index: 1; height: 30px; padding: 0 8px; background: var(--bg); border-bottom: 1px solid var(--line); font-size: 11px; font-weight: 600; letter-spacing: 0.03em; color: var(--fg3); }
  .cols span:last-child { text-align: right; }
  .allcalm { padding: 12px 8px 2px; color: var(--done); font-weight: 600; }
  .grp { width: 100%; display: flex; align-items: center; gap: 6px; height: 30px; margin-top: 8px; padding: 0 8px; border: 0; background: transparent; color: var(--fg2); font-size: 12px; font-weight: 700; text-align: left; cursor: default; }
  .grp.fold { cursor: pointer; }
  .grp .n { color: var(--fg3); font-weight: 400; }
  .chev { color: var(--fg3); transition: transform 0.12s; }
  .chev.on { transform: rotate(90deg); }
  .row { min-height: 50px; padding: 6px 8px; border-radius: 8px; cursor: default; }
  .row:hover { background: color-mix(in srgb, var(--fg) 4%, transparent); }
  .row.on { background: var(--sel); }
  .row:focus { outline: none; }
  .row.dim > * { opacity: 0.6; }
  .row.dim.on > * { opacity: 1; }
  .what { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .l1, .l2 { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font: 600 10.5px var(--mono); }
  .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; font-weight: 600; }
  .wait { flex: 0 0 auto; padding: 1px 6px; border-radius: 4px; background: color-mix(in srgb, var(--wait) 16%, transparent); color: var(--wait); font-size: 11px; font-weight: 600; }
  .path { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg3); font-size: 11.5px; }
  .nd { flex: 0 0 auto; font: 11px var(--mono); color: var(--fg3); }
  .nt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg2); }
  .none { color: var(--fg3); }
  .age { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--fg2); font-variant-numeric: tabular-nums; }
  .bar { position: relative; height: 4px; border-radius: 2px; background: var(--field); }
  .bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: var(--fg3); }
  .bar b { position: absolute; top: -3px; bottom: -3px; width: 1.5px; margin-left: -0.75px; background: var(--fg2); }
  .age.late { color: var(--todo); }
  .age.late .bar i { background: var(--todo); }
  .age.soon { color: var(--wait); }
  .age.soon .bar i { background: var(--wait); }
  .due { text-align: right; white-space: nowrap; font-size: 12.5px; color: var(--fg2); font-variant-numeric: tabular-nums; }
  .due.late { color: var(--todo); font-weight: 600; }
</style>

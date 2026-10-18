<script lang="ts">
  import { store } from '../store.svelte';
  import { today } from '../todayState.svelte';
  import { todayBlockOf } from '../todayBlocks';
  import { dayProgress, isNow, untilRemind } from '../today';
  import { TodayCtl } from '../todayCtl.svelte';

  // The panel «Сегодня» of the sidebar (ТЗ 50 §4). By any other tab — the compact day: the progress of the day, the
  // screen's blocks in its order (meetings, «Главное», the overdue), five rows each; by the tab «Сегодня» — its
  // contents: a row a block, a click scrolls the screen to it, the one at the screen's top lit. The data are the
  // screen's (TodayCtl): the panel and the screen never differ. The rows are a list of tasks (ТЗ 34) of their own.
  let { full }: { full: boolean } = $props();
  let el: HTMLDivElement | undefined = $state();
  const c = new TodayCtl(() => store.layout.active, () => el, 'todayPanel');
  c.effects();

  const MAX = 5;
  const progress = $derived(dayProgress(c.focusRows, c.agenda, c.files, c.day));
  const until = $derived(untilRemind(today.local, c.now));
  const meetings = $derived(c.agenda.filter((a) => a.kind === 'event'));
  const focus = $derived(c.focusRows.flatMap((f) => (f.task ? [f.task] : [])));
  // no «Главное»: the first tasks of «Задачи»
  const main = $derived(focus.length ? focus : c.groups.flatMap((g) => g.rows).slice(0, MAX));
  const lateDays = (n: number) => `${n} дн.`;

  // ---- the screen's blocks, its contents ----
  const order = $derived(c.layout.rows.flatMap((r) => (r.kind === 'top' ? r.ids : r.kind === 'full' ? [r.id] : r.cols.flat())));
  const TITLES: Record<string, string> = { note: 'Записка со вчера', focus: 'Главное', agenda: 'Агенда на сегодня', tasks: 'Задачи', overdue: 'Просрочено', oneOnOne: '1-1 сегодня' };
  const titleOf = (id: string) => TITLES[id] ?? todayBlockOf(id)?.title ?? id;
  function numOf(id: string): { text: string; alert?: boolean } | null {
    if (id === 'focus') return focus.length ? { text: `${focus.filter((t) => t.done).length} из ${focus.length}` } : null;
    if (id === 'agenda') return c.agenda.length ? { text: String(c.agenda.length) } : null;
    if (id === 'tasks') return c.tasksTotal ? { text: String(c.tasksTotal) } : null;
    if (id === 'overdue') return c.late.length ? { text: String(c.late.length), alert: true } : null;
    if (id === 'oneOnOne') return c.meetings[0]?.time ? { text: c.meetings[0].time } : null;
    return null;
  }
  const screen = () => document.querySelector<HTMLElement>('.next .today[role="region"]');
  const blockEl = (id: string) => screen()?.querySelector<HTMLElement>(`[data-block="${id}"] > *`) ?? null;
  /** Scrolls the screen to a block (the screen may be coming: tried for a few frames). */
  function toBlock(id: string, tries = 20) {
    const b = blockEl(id);
    if (b) return b.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (tries > 0) requestAnimationFrame(() => toBlock(id, tries - 1));
  }
  /** «Ещё N ›»: the full version at that block. */
  function more(id: string) {
    today.open();
    toBlock(id);
  }
  // the block at the screen's top
  let atTop = $state('');
  $effect(() => {
    if (!full) return;
    void order;
    let sc: HTMLElement | null = null;
    let raf = 0;
    const look = () => {
      const s = screen();
      if (!s) return;
      // the block still seen at the top whose top is highest (the first in the order on a tie: the columns)
      const top = s.getBoundingClientRect().top + 8;
      let id = order[0] ?? '';
      let best = Infinity;
      for (const o of order) {
        const r = blockEl(o)?.getBoundingClientRect();
        if (r && r.bottom > top && r.top < best - 1) {
          best = r.top;
          id = o;
        }
      }
      atTop = id;
    };
    const attach = () => {
      sc = screen();
      if (!sc) return void (raf = requestAnimationFrame(attach));
      sc.addEventListener('scroll', look, { passive: true });
      look();
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      sc?.removeEventListener('scroll', look);
    };
  });
</script>

{#snippet cap(kw: string | null, path: string)}
  {#if kw}<span class="cap" style={c.tone(kw, path)}>{kw}</span>{/if}
{/snippet}
{#snippet group(title: string, n: number, alert = false)}
  <div class="gh" class:alert><span>{title}</span><span class="gn">{n}</span></div>
{/snippet}
{#snippet moreRow(id: string, rest: number)}
  <button class="row more" onclick={() => more(id)}>Ещё {rest} ›</button>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tp" bind:this={el} onkeydown={(e) => c.keydown(e)}>
  {#if full}
    <div class="body toc" role="navigation" aria-label="На экране">
      <div class="th">На экране</div>
      {#each order as id (id)}
        {@const n = numOf(id)}
        <button class="trow" class:on={atTop === id} onclick={() => toBlock(id)}>
          <span class="tn">{titleOf(id)}</span>{#if n}<span class="tc" class:alert={n.alert}>{n.text}</span>{/if}
        </button>
      {/each}
      <div class="sep"></div>
      <button class="cfg" onclick={() => store.openSettings('Сегодня')}>Настроить блоки…</button>
    </div>
  {:else}
    <div class="body">
      <div class="prog">
        <div class="pl"><span>Сделано {progress.done} из {progress.total}</span>{#if until}<span class="pr">{until}</span>{/if}</div>
        <div class="bar" role="progressbar" aria-label="Сделано за день" aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.done}>
          <i style:width="{progress.total ? (100 * progress.done) / progress.total : 0}%"></i>
        </div>
      </div>
      {#each order.filter((id) => id === 'agenda' || id === 'focus' || id === 'overdue') as id (id)}
        {#if id === 'agenda' && meetings.length}
          <section class="grp" aria-label="Встречи">
            {@render group('Встречи', meetings.length)}
            {#each meetings.slice(0, meetings.length > MAX ? MAX - 1 : MAX) as a (a.key)}
              {@const now = !a.past && isNow(a.time, c.now)}
              <button class="row" class:past={a.past} class:now class:sel={c.selKey === a.slot} data-k={a.slot} title={a.title}
                onclick={() => c.choose(a.slot)} ondblclick={() => c.openAgenda()} oncontextmenu={(e) => c.menu(e, a.slot)}>
                <span class="tm">{a.time.split(/[–-]/)[0]}</span><span class="t">{a.title}</span>{#if now}<span class="nw">сейчас</span>{/if}
              </button>
            {/each}
            {#if meetings.length > MAX}{@render moreRow(id, meetings.length - (MAX - 1))}{/if}
          </section>
        {:else if id === 'focus' && main.length}
          <section class="grp" aria-label="Главное">
            {@render group('Главное', main.length)}
            {#each main.slice(0, main.length > MAX ? MAX - 1 : MAX) as t (t.slot)}
              <button class="row" class:done={t.done} class:sel={c.selKey === t.slot} data-k={t.slot} title={t.title}
                onclick={() => c.choose(t.slot)} ondblclick={() => c.open(t.path, t.line)} oncontextmenu={(e) => c.menu(e, t.slot)}>
                {@render cap(t.kw, t.path)}<span class="t">{t.title}</span>
              </button>
            {/each}
            {#if main.length > MAX}{@render moreRow(focus.length ? id : 'tasks', main.length - (MAX - 1))}{/if}
          </section>
        {:else if id === 'overdue' && c.late.length}
          <section class="grp" aria-label="Просрочено">
            {@render group('Просрочено', c.late.length, true)}
            {#each c.late.slice(0, c.late.length > MAX ? MAX - 1 : MAX) as r (r.slot)}
              <button class="row" class:sel={c.selKey === r.slot} data-k={r.slot} title={r.title}
                onclick={() => c.choose(r.slot)} ondblclick={() => c.open(r.path, r.line)} oncontextmenu={(e) => c.menu(e, r.slot)}>
                {@render cap(r.kw, r.path)}<span class="t">{r.title}</span><span class="late">{lateDays(r.late)}</span>
              </button>
            {/each}
            {#if c.late.length > MAX}{@render moreRow(id, c.late.length - (MAX - 1))}{/if}
          </section>
        {/if}
      {/each}
    </div>
  {/if}
  <div class="foot">
    {#if !full}<button onclick={() => today.open()}>Полная версия</button>{/if}
    <button onclick={() => today.openEndDay()}>Завершить день</button>
  </div>
</div>

<style>
  .tp { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .body { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; padding: 0 0 8px; }
  .prog { display: flex; flex-direction: column; gap: 6px; padding: 2px 6px 10px; }
  .pl { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; color: var(--ink2); }
  .pr { margin-left: auto; color: var(--ink3); white-space: nowrap; }
  .bar { height: 4px; border-radius: 2px; background: var(--track); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 2px; background: var(--done); }
  .grp { display: flex; flex-direction: column; padding-top: 6px; }
  .gh { display: flex; align-items: baseline; gap: 6px; padding: 6px 6px 4px; font-size: 11.5px; font-weight: 600; color: var(--ink2); }
  .gh.alert { color: var(--todo); }
  .gn { font-weight: 400; color: var(--ink3); }
  .gh.alert .gn { color: var(--todo); }
  .row { flex: 0 0 26px; height: 26px; display: flex; align-items: center; gap: 7px; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font: 12.5px var(--ui); text-align: left; white-space: nowrap; min-width: 0; }
  .row:hover:not(.sel) { background: var(--chip); }
  .row.sel { background: var(--lampsoft); }
  .row:focus-visible { outline: 2px solid var(--lampline); outline-offset: -2px; }
  .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .tm { flex: 0 0 34px; font: 10.5px var(--mono); color: var(--ink3); }
  .row.past, .row.done { opacity: 0.5; }
  .row.past .t, .row.done .t { text-decoration: line-through; }
  .row.now { background: var(--lampsoft); }
  .nw { flex: 0 0 auto; font-size: 11px; color: var(--lampink); }
  .late { flex: 0 0 auto; font-size: 11.5px; color: var(--todo); }
  .cap { flex: 0 0 auto; display: inline-flex; align-items: center; height: 15px; padding: 0 4px; border-radius: 3px; font: 700 9px var(--ui); letter-spacing: 0.02em; color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .row.more { color: var(--lampink); }
  /* the contents of the screen */
  .th { padding: 4px 6px 4px; font-size: 11px; font-weight: 600; color: var(--ink3); }
  .trow { flex: 0 0 28px; height: 28px; display: flex; align-items: center; gap: 8px; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font: 12.5px var(--ui); text-align: left; white-space: nowrap; }
  .trow:hover:not(.on) { background: var(--chip); }
  .trow.on { background: var(--lampsoft); }
  .trow:focus-visible { outline: 2px solid var(--lampline); outline-offset: -2px; }
  .tn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .tc { flex: 0 0 auto; font-size: 11.5px; color: var(--ink3); font-variant-numeric: tabular-nums; }
  .tc.alert { color: var(--todo); font-weight: 600; }
  .sep { flex: 0 0 1px; margin: 8px 6px; background: var(--rule); }
  .cfg { align-self: flex-start; padding: 2px 6px; border: 0; background: none; color: var(--lampink); font: 12px var(--ui); }
  .cfg:hover { text-decoration: underline; }
  .foot { flex: 0 0 auto; display: flex; gap: 6px; padding: 10px 6px 12px; }
  .foot button { flex: 1; height: 28px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 500 12.5px var(--ui); white-space: nowrap; }
  .foot button:hover { background: var(--lampsoft); }
  .foot button:focus-visible { outline: 2px solid var(--lampline); outline-offset: 1px; }
</style>

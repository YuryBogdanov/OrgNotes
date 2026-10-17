<script lang="ts">
  import { slide } from 'svelte/transition';
  import { store } from './store.svelte';
  import { today } from './todayState.svelte';
  import { todayBlockOf } from './todayBlocks';
  import ListToast from './ListToast.svelte';
  import TodayNote from './TodayNote.svelte';
  import TodayMeetings from './TodayMeetings.svelte';
  import { dateTitle, kicker, overdueWords, whenChosen } from './today';
  import { LATE_CAP, TodayCtl } from './todayCtl.svelte';

  // «Сегодня» (ТЗ 32 §2): the morning's overview — the note from yesterday and the choice for today (from the
  // journal), the agenda of the day, the tasks, the overdue ones. A click on a row chooses its task, a double click
  // or ↩ opens it in a tab (ТЗ 34): the rows of all the blocks are one list of tasks. Its workings are
  // todayCtl.svelte.ts (the new interface draws them too, ТЗ 45).
  let { pane = 0 }: { pane?: number } = $props();
  let el: HTMLDivElement | undefined = $state();
  const c = new TodayCtl(() => pane, () => el);
  c.effects();
  const cfg = $derived(c.cfg);
  const day = $derived(c.day);
  const now = $derived(c.now);
  const files = $derived(c.files);
  const tone = c.tone;
  const base = (p: string) => p.split('/').pop() ?? p;
  const jd = $derived(c.jd);
  const journal = $derived(c.journal);
  const focus = $derived(c.focus);
  const focusRows2 = $derived(c.focusRows);
  const agenda = $derived(c.agenda);
  const groups = $derived(c.groups);
  const tasksTotal = $derived(c.tasksTotal);
  const late = $derived(c.late);
  const selKey = $derived(c.selKey);
  const meetings = $derived(c.meetings);
  const layout = $derived(c.layout);
  const resting = $derived(c.resting);
  const listId = $derived(c.listId);
  const review = $derived(c.review);
  const key = $derived(c.key);
  const choose = (k: string) => c.choose(k);
  const open = (path: string, line: number) => c.open(path, line);
  const menu = (e: MouseEvent, k: string) => c.menu(e, k);
  const keydown = (e: KeyboardEvent) => c.keydown(e);
  const clickEmpty = (e: MouseEvent) => c.clickEmpty(e);
  const tick = c.tick.bind(c);
  const move = c.move.bind(c);
  const shift = (n: number) => c.shift(n);
  const pick = c.pick.bind(c);
  const openAgenda = () => c.openAgenda();
  const isInbox = c.isInbox;
</script>

<div class="host">
<div class="today" role="region" aria-label="Сегодня" tabindex="-1" bind:this={el} onkeydown={keydown} onclick={clickEmpty}>
  <div class="wrap">
    <header>
      <div class="ttl">
        <div class="kick">{kicker(day)}</div>
        <h1>{dateTitle(day, now)}</h1>
      </div>
      <div class="acts">
        {#if key}<span class="hint">{key} — открыть «Сегодня»</span>{/if}
        <button class="btn" onclick={() => today.openEndDay()}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" /></svg>Завершить день…
        </button>
        <button class="ico" aria-label="Настроить экран" title="Настроить экран" onclick={() => store.openSettings('Сегодня')}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="2.6" /><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" /></svg>
        </button>
      </div>
    </header>

    {#each layout.rows as r, ri (ri)}
      {#if r.kind === 'top'}
        <div class="row">
          {#each r.ids as id (id)}{@render block(id)}{/each}
        </div>
      {:else if r.kind === 'full'}
        <!-- a plugin's row of the whole width (a banner, «Цели недели», API 1.7) -->
        <div class="row full">{@render block(r.id)}</div>
      {:else}
        <div class="row cols">
          {#each r.cols as col (col.join())}
            <div class="col">{#each col as id (id)}{@render block(id)}{/each}</div>
          {/each}
        </div>
      {/if}
    {/each}
    {#if resting.length}
      <div hidden>{#each resting as id (id)}{@const b = todayBlockOf(id)}{#if b?.component}<b.component id={b.id} />{/if}{/each}</div>
    {/if}
  </div>
</div>
<ListToast list={listId} bottom={16} />
</div>

{#snippet block(id: string)}
  {@const b = todayBlockOf(id)}
  {#if b?.component}
    <section class="tcard" aria-label={b.title}><b.component id={b.id} /></section>
  {:else if id === 'oneOnOne'}
    <TodayMeetings {meetings} {day} onopen={open} />
  {:else if id === 'note'}
    <TodayNote {jd} {journal} name={base(cfg.journal)} onopen={open} />
  {:else if id === 'focus'}
    <section class="tcard focus" aria-label="Главное на сегодня">
      <div class="tcard-head">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3.5" /></svg>
        <span class="tcard-name">Главное на сегодня</span>
        {#if jd && focus.length}<span class="tcard-sub">выбрано {whenChosen(jd.date, day)}</span>{/if}
      </div>
      {#each focusRows2 as f (f.id)}
        {#if f.task}
          {@const t = f.task}
          <div class="frow" class:done={t.done}>
            <button class="box" role="checkbox" aria-checked={t.done} aria-label="Выполнено: {t.title}" onclick={() => void tick(t)}>{#if t.done}✓{/if}</button>
            <button class="rowbtn" class:sel={selKey === t.slot} data-k={t.slot} onclick={() => choose(t.slot)} ondblclick={() => open(t.path, t.line)} oncontextmenu={(e) => menu(e, t.slot)}>
              <span class="kw tone" style={tone(t.kw, t.path)}>{t.kw}</span>
              <span class="t">{t.title}</span>
              <span class="meta" class:red={t.late && !t.done}>{t.meta}</span>
            </button>
          </div>
        {:else}
          <div class="frow lost"><span class="box off"></span><span class="t">Задача не найдена</span><span class="meta">{f.title}</span></div>
        {/if}
      {:else}
        <div class="tcard-none">Главное не выбрано. Вечером — «Завершить день…»</div>
      {/each}
    </section>
  {:else if id === 'agenda'}
    <section class="tcard" aria-label="Агенда на сегодня">
      <div class="tcard-head">
        <span class="tcard-name">Агенда на сегодня</span><span class="tcard-sub">{agenda.length}</span>
        <button class="tcard-link" onclick={openAgenda}>Открыть агенду ›</button>
      </div>
      {#each agenda as a (a.key)}
        <button class="arow" class:past={a.past} class:sel={selKey === a.slot} class:stale={a.stale} class:gone={a.gone} data-k={a.slot}
          onclick={() => choose(a.slot)} ondblclick={() => open(a.path, a.line)} oncontextmenu={(e) => menu(e, a.slot)}>
          <span class="time" class:strong={!a.past}>{a.time}</span>
          <span class="dot" class:ev={a.kind === 'event'}></span>
          <span class="t">{#if a.kind === 'task' && a.kw}<span class="kw tone" style={tone(a.kw, a.path)}>{a.kw}</span> {/if}{a.title}</span>
          {#if a.meeting}<span class="badge">1-1</span>{/if}
        </button>
      {:else}
        <div class="tcard-none">На сегодня ничего нет</div>
      {/each}
    </section>
  {:else if id === 'tasks'}
    <section class="tcard" aria-label="Задачи">
      <div class="tcard-head"><span class="tcard-name">Задачи</span><span class="tcard-sub">{cfg.statuses.join(', ')} · {tasksTotal}</span></div>
      {#each groups as g (g.file)}
        <div class="grp">
          <span>{g.file.toUpperCase()}</span><span class="n">{g.total || ''}</span>
          {#if isInbox(g.file) && review && !g.missing}<button class="tcard-link" onclick={() => review?.()}>Разобрать ›</button>{/if}
        </div>
        {#if g.missing}
          <div class="trow none">Файл не найден</div>
        {/if}
        {#each g.rows as r (r.key)}
          <button class="trow" class:sel={selKey === r.slot} class:stale={r.stale} class:gone={r.gone} data-k={r.slot}
            onclick={() => choose(r.slot)} ondblclick={() => open(r.path, r.line)} oncontextmenu={(e) => menu(e, r.slot)}>
            <span class="kwc"><span class="kw tone" style={tone(r.kw, r.path)}>{r.kw}</span></span>
            <span class="t">{r.title}</span>
            {#if r.prio}<span class="meta">[#{r.prio}]</span>{/if}
          </button>
        {/each}
        {#if g.more}
          {@const f = files.find((x) => x.name === g.file)}
          <button class="trow more" onclick={() => f && open(f.path, 0)}>Ещё {g.more} ›</button>
        {/if}
      {/each}
    </section>
  {:else if id === 'overdue'}
    <section class="tcard" aria-label="Просрочено">
      <div class="tcard-head"><span class="tcard-name">Просрочено</span><span class="count">{late.length}</span></div>
      {#each late.slice(0, LATE_CAP) as r (r.key)}
        <div class="orow" class:stale={r.stale} class:gone={r.gone} transition:slide={{ duration: 180 }}>
          <button class="rowbtn" class:sel={selKey === r.slot} data-k={r.slot} onclick={() => choose(r.slot)} ondblclick={() => open(r.path, r.line)} oncontextmenu={(e) => menu(e, r.slot)}>
            <span class="kw tone" style={tone(r.kw, r.path)}>{r.kw}</span><span class="t">{r.title}</span>
          </button>
          <div class="ofoot">
            <span class="when">{overdueWords(r)}</span>
            <button class="chip" onclick={() => void move(r, shift(0))}>Сегодня</button>
            <button class="chip" onclick={() => void move(r, shift(1))}>Завтра</button>
            <button class="chip" onclick={() => pick(r)}>Дата…</button>
          </div>
        </div>
      {/each}
      {#if late.length > LATE_CAP}
        <button class="trow more" onclick={() => store.showAgendaHere()}>Ещё {late.length - LATE_CAP} ›</button>
      {/if}
    </section>
  {/if}
{/snippet}

<style>
  .host { position: relative; height: 100%; container-type: inline-size; }
  .today:focus { outline: none; }
  .today { height: 100%; overflow: auto; background: var(--stage); color: var(--fg); font-family: var(--ui); font-size: 13px; }
  .wrap { max-width: 1340px; margin: 0 auto; padding: 22px 32px 28px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; }
  header { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
  .ttl { flex: 1 1 auto; min-width: 0; }
  .kick { font-size: 12px; font-weight: 600; letter-spacing: 0.05em; color: var(--fg3); }
  h1 { margin: 2px 0 0; font-size: 26px; font-weight: 700; line-height: 1.2; }
  .acts { display: flex; align-items: center; gap: 8px; }
  .hint { font-size: 12px; color: var(--fg3); }
  .btn { height: 30px; display: flex; align-items: center; gap: 6px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font: inherit; }
  .btn:hover { background: var(--field); }
  .ico { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg2); padding: 0; }
  .ico:hover { color: var(--fg); }
  .row { display: flex; gap: 16px; flex-wrap: wrap; }
  .row.cols { align-items: flex-start; }
  .row.full > :global(.tcard) { flex: 1 1 100%; }
  .row:not(.cols) > :global(.tcard:first-child) { flex: 1.25 1 420px; }
  .row:not(.cols) > :global(.tcard) { flex: 1 1 360px; }
  .col { flex: 1 1 360px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .focus { padding: 14px 18px 10px; }
  .none { color: var(--fg2); padding: 8px 0 6px; } /* a row of «нет задач» (.trow.none); a card's own: .tcard-none */
  .count { font-size: 11px; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: color-mix(in srgb, var(--todo) 12%, transparent); color: var(--todo); }
  /* a status as a capsule (ТЗ 32, the design's update): as the marks of statuses in the navigator and the agenda */
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font-size: 10.5px; font-weight: 700; line-height: 15px; letter-spacing: 0.02em; color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .kwc { flex: 0 0 46px; display: flex; }
  .t .kw { display: inline-block; vertical-align: 1px; margin-right: 2px; }
  .t { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: left; }
  .meta { flex: 0 0 auto; font-size: 11.5px; color: var(--fg3); }
  .meta.red { color: var(--todo); }
  button.arow, button.trow, button.rowbtn { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none; padding: 0; font: inherit; color: inherit; text-align: left; cursor: default; }
  .arow:hover .t, .trow:hover .t, .rowbtn:hover .t { color: var(--acc); }
  /* a row is a task of the list (ТЗ 34): chosen — the selection's colour and a ring while the screen has the focus */
  [data-k] { margin-inline: -6px; padding-inline: 6px !important; width: calc(100% + 12px) !important; box-sizing: border-box; border-radius: 6px; }
  .frow [data-k] { margin-inline: 0 -6px; width: calc(100% + 6px) !important; padding-inline: 4px 6px !important; }
  [data-k]:focus { outline: none; }
  [data-k].sel { background: color-mix(in srgb, var(--fg) 9%, transparent); }
  .today:focus-within [data-k].sel { background: var(--sel); box-shadow: inset 0 0 0 1.5px var(--acc); }
  /* changed from the list, no longer of the screen: dimmed until a refresh; done: struck through too */
  .stale { opacity: 0.55; }
  .gone .t { text-decoration: line-through; }


  .frow { display: flex; align-items: center; gap: 10px; min-height: 34px; }
  .frow + .frow { border-top: 1px solid var(--line); }
  .frow .rowbtn .t { font-size: 13.5px; }
  .frow.done .t { color: var(--fg3); text-decoration: line-through; }
  .frow.done .kw { opacity: 0.6; }
  .frow.lost .t { color: var(--fg3); }
  .box { flex: 0 0 16px; width: 16px; height: 16px; box-sizing: border-box; padding: 0; border-radius: 5px; border: 1.5px solid var(--fg3); background: transparent; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; font-weight: 700; }
  .frow.done .box { border-color: var(--done); background: var(--done); }
  .box.off { opacity: 0.4; }

  .arow { min-height: 32px; border-top: 1px solid var(--line) !important; gap: 10px !important; }
  .arow.past { opacity: 0.55; }
  .time { flex: 0 0 86px; white-space: nowrap; font-size: 12.5px; font-variant-numeric: tabular-nums; color: var(--fg3); }
  .time.strong { color: var(--fg); font-weight: 600; }
  .dot { flex: 0 0 6px; width: 6px; height: 6px; border-radius: 3px; background: var(--todo); }
  .dot.ev { background: var(--acc); }
  .badge { font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: var(--sel); color: var(--acc); }

  .grp { display: flex; align-items: center; gap: 6px; height: 28px; margin-top: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--fg3); }
  .grp .n { font-weight: 400; }
  .grp .tcard-link { letter-spacing: 0; font-weight: 500; }
  .trow { min-height: 30px; border-top: 1px solid var(--line) !important; }
  .trow.none { display: flex; align-items: center; padding: 0; }
  .trow.more { color: var(--acc); font-size: 12px; }

  .orow { border-top: 1px solid var(--line); padding: 7px 0; }
  .ofoot { display: flex; align-items: center; gap: 6px; margin-top: 5px; }
  .when { margin-right: auto; font-size: 11.5px; color: var(--todo); }
  .chip { height: 22px; display: inline-flex; align-items: center; padding: 0 8px; border: 0; border-radius: 5px; background: var(--field); color: var(--fg); font: inherit; font-size: 11.5px; }
  .chip:hover { background: var(--sel); }

  /* «1-1 сегодня» */
</style>

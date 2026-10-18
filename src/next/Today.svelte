<script lang="ts">
  import { slide } from 'svelte/transition';
  import { store } from '../store.svelte';
  import { today } from '../todayState.svelte';
  import { todayBlockOf } from '../todayBlocks';
  import { fmtDay } from '../org';
  import { displayName } from '../names';
  import { dateTitle, kicker, noteLines, noteWhen, overdueWords, whenChosen } from '../today';
  import { LATE_CAP, TodayCtl } from '../todayCtl.svelte';
  import { MeetingsCtl } from '../meetingsCtl.svelte';
  import Compat from './Compat.svelte';

  // «Сегодня» in the new interface (ТЗ 45 §2): on `bg` with the grid; the kicker in IBM Plex Mono, the title in Yeseva
  // One; «⇧⌘H», «Завершить день…», the gear. The blocks as ТЗ 32 lays them out, each a card — `card`, `rule`, 12 pt;
  // its head 13.5 pt semibold, a number or a word grey, a link in `lampink`; rows from 32 pt with a line above, the
  // status capsule in a 46 pt column. A plugin's block: the core's card, its content the plugin's in the compatibility
  // layer. The workings are todayCtl.svelte.ts, shared with the old screen: the rows are one list of tasks (ТЗ 34).
  let { pane = 0 }: { pane?: number } = $props();
  let el: HTMLDivElement | undefined = $state();
  const c = new TodayCtl(() => pane, () => el);
  c.effects();
  const meet = new MeetingsCtl(() => ({ meetings: c.meetings, day: c.day, onopen: (p, l) => c.open(p, l) }));
  meet.effects();
  const name = (rel: string) => displayName(rel);
  /** A row's note: a file's name without «.org» (ТЗ 44 §11), else as it is (a time, «дедлайн сегодня»). */
  const metaOf = (m: string) => (m.endsWith('.org') ? name(m) : m);
</script>

{#snippet cap(kw: string | null, path: string)}
  {#if kw}<span class="cap" style={c.tone(kw, path)}>{kw}</span>{/if}
{/snippet}

<div class="host">
<!-- the screen is a list of tasks: ↑↓ move in its rows (ТЗ 34) -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="today" role="region" aria-label="Сегодня" tabindex="-1" bind:this={el} onkeydown={(e) => c.keydown(e)} onclick={(e) => c.clickEmpty(e)}>
  <div class="wrap">
    <header>
      <div class="ttl">
        <div class="kick">{kicker(c.day)}</div>
        <h1>{dateTitle(c.day, c.now)}</h1>
      </div>
      {#if c.key}<span class="hint">{c.key}</span>{/if}
      <button class="btn" onclick={() => today.openEndDay()}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" /></svg>Завершить день…
      </button>
      <button class="ico" aria-label="Настроить экран" title="Настроить экран" onclick={() => store.openSettings('Сегодня')}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="2.6" /><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" /></svg>
      </button>
    </header>

    {#each c.layout.rows as r, ri (ri)}
      {#if r.kind === 'top'}
        <div class="row top">{#each r.ids as id (id)}<div class="bw" data-block={id}>{@render block(id)}</div>{/each}</div>
      {:else if r.kind === 'full'}
        <div class="row full"><div class="bw" data-block={r.id}>{@render block(r.id)}</div></div>
      {:else}
        <div class="row cols">
          {#each r.cols as col (col.join())}<div class="col">{#each col as id (id)}<div class="bw" data-block={id}>{@render block(id)}</div>{/each}</div>{/each}
        </div>
      {/if}
    {/each}
    {#if c.resting.length}
      <div hidden><Compat>{#each c.resting as id (id)}{@const b = todayBlockOf(id)}{#if b?.component}<b.component id={b.id} />{/if}{/each}</Compat></div>
    {/if}
  </div>
</div>
</div>

{#snippet head(title: string, sub?: string, link?: { label: string; run: () => void })}
  <div class="bh">
    <span class="bn">{title}</span>{#if sub}<span class="bs">{sub}</span>{/if}
    {#if link}<button class="link" onclick={link.run}>{link.label}</button>{/if}
  </div>
{/snippet}

{#snippet block(id: string)}
  {@const b = todayBlockOf(id)}
  {#if b?.component}
    <section class="card plug" aria-label={b.title}><Compat><b.component id={b.id} /></Compat></section>
  {:else if id === 'note'}
    {@const jd = c.jd}
    <section class="card note" aria-label="Записка со вчера">
      {@render head('Записка со вчера', jd?.note ? noteWhen(jd.date, jd.note.time) : undefined, jd?.note && c.journal ? { label: `${name(c.cfg.journal)} ›`, run: () => c.open(c.journal!.path, jd.note!.line) } : undefined)}
      {#if jd?.note}
        <div class="ntext">
          {#each noteLines(jd.note.text) as l, i (i)}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- a line of the note escaped by today.ts noteLines -->
            <div class="nl" style:padding-left="{l.depth * 18}px">{#if l.item}<span class="mk">–</span>{/if}<span>{@html l.html}</span></div>
          {/each}
        </div>
      {:else}
        <div class="none">Вчера записки не было. Вечером — «Завершить день…»</div>
      {/if}
    </section>
  {:else if id === 'focus'}
    <section class="card" aria-label="Главное на сегодня">
      {@render head('Главное на сегодня', c.jd && c.focus.length ? `выбрано ${whenChosen(c.jd.date, c.day)}` : undefined)}
      {#each c.focusRows as f (f.id)}
        {#if f.task}
          {@const t = f.task}
          <div class="row1 frow" class:done={t.done}>
            <button class="box" role="checkbox" aria-checked={t.done} aria-label="Выполнено: {t.title}" onclick={() => void c.tick(t)}>{#if t.done}✓{/if}</button>
            <button class="rb" class:sel={c.selKey === t.slot} data-k={t.slot} onclick={() => c.choose(t.slot)} ondblclick={() => c.open(t.path, t.line)} oncontextmenu={(e) => c.menu(e, t.slot)}>
              <span class="kc">{@render cap(t.kw, t.path)}</span>
              <span class="t">{t.title}</span>
              <span class="meta" class:red={t.late && !t.done}>{metaOf(t.meta)}</span>
            </button>
          </div>
        {:else}
          <div class="row1 frow lost"><span class="box off"></span><span class="t">Задача не найдена</span><span class="meta">{f.title}</span></div>
        {/if}
      {:else}
        <div class="none">Главное не выбрано. Вечером — «Завершить день…»</div>
      {/each}
    </section>
  {:else if id === 'agenda'}
    <section class="card" aria-label="Агенда на сегодня">
      {@render head('Агенда на сегодня', String(c.agenda.length), { label: 'Открыть агенду ›', run: () => c.openAgenda() })}
      {#each c.agenda as a (a.key)}
        <button class="row1 rb arow" class:past={a.past} class:sel={c.selKey === a.slot} class:stale={a.stale} class:gone={a.gone} data-k={a.slot}
          onclick={() => c.choose(a.slot)} ondblclick={() => c.open(a.path, a.line)} oncontextmenu={(e) => c.menu(e, a.slot)}>
          <span class="time">{a.time}</span>
          <i class="dot" class:ev={a.kind === 'event'}></i>
          <span class="t">{#if a.kind === 'task' && a.kw}{@render cap(a.kw, a.path)} {/if}{a.title}</span>
          {#if a.meeting}<span class="badge">1-1</span>{/if}
        </button>
      {:else}
        <div class="none">На сегодня ничего нет</div>
      {/each}
    </section>
  {:else if id === 'oneOnOne'}
    {#each c.meetings as m (m.key)}
      {@const ex = meet.extras[m.key] ?? []}
      <section class="card" aria-label="1-1 сегодня: {m.name}">
        {@render head('1-1 сегодня', m.time ?? undefined)}
        <div class="who">
          <span class="av" aria-hidden="true">{m.initials}</span>
          <div class="wl"><div class="wn">{m.name}</div><div class="ws">{[name(m.file), m.every, m.last ? `прошлая — ${fmtDay(m.last)}` : ''].filter(Boolean).join(' · ')}</div></div>
        </div>
        {#if ex.some((e) => e.line) || m.open}
          <div class="facts">
            {#each ex.filter((e) => e.line) as e, i (i)}<div class="fact"><i class="fd wait"></i><span>{e.line}</span></div>{/each}
            {#if m.open}<div class="fact"><i class="fd red"></i><span>Открытые договорённости с прошлой 1-1: {m.open}</span></div>{/if}
          </div>
        {/if}
        <div class="btns">
          <button class="b main" onclick={() => void meet.meeting(m)}>{m.today !== null ? 'Открыть встречу' : 'Новая встреча'}</button>
          <button class="b" onclick={() => c.open(m.path, m.line)}>Открыть файл</button>
          {#each ex.filter((e) => e.action) as e, i (i)}<button class="b" onclick={() => e.action!.run()}>{e.action!.label}</button>{/each}
        </div>
      </section>
    {/each}
  {:else if id === 'tasks'}
    <section class="card" aria-label="Задачи">
      {@render head('Задачи', `${c.cfg.statuses.join(', ')} · ${c.tasksTotal}`)}
      {#each c.groups as g (g.file)}
        <div class="grp">
          <span>{name(g.file).toUpperCase()}</span><span class="n">{g.total || ''}</span>
          {#if c.isInbox(g.file) && c.review && !g.missing}<button class="link" onclick={() => c.review?.()}>Разобрать ›</button>{/if}
        </div>
        {#if g.missing}<div class="row1 none">Файл не найден</div>{/if}
        {#each g.rows as r (r.key)}
          <button class="row1 rb" class:sel={c.selKey === r.slot} class:stale={r.stale} class:gone={r.gone} data-k={r.slot}
            onclick={() => c.choose(r.slot)} ondblclick={() => c.open(r.path, r.line)} oncontextmenu={(e) => c.menu(e, r.slot)}>
            <span class="kc">{@render cap(r.kw, r.path)}</span><span class="t">{r.title}</span>
            {#if r.prio}<span class="meta">#{r.prio}</span>{/if}
          </button>
        {/each}
        {#if g.more}
          {@const f = c.files.find((x) => x.name === g.file)}
          <button class="row1 rb more" onclick={() => f && c.open(f.path, 0)}>Ещё {g.more} ›</button>
        {/if}
      {/each}
    </section>
  {:else if id === 'overdue'}
    <section class="card" aria-label="Просрочено">
      <div class="bh"><span class="bn">Просрочено</span><span class="count">{c.late.length}</span></div>
      {#each c.late.slice(0, LATE_CAP) as r (r.key)}
        <div class="orow" class:stale={r.stale} class:gone={r.gone} transition:slide={{ duration: 180 }}>
          <button class="row1 rb" class:sel={c.selKey === r.slot} data-k={r.slot} onclick={() => c.choose(r.slot)} ondblclick={() => c.open(r.path, r.line)} oncontextmenu={(e) => c.menu(e, r.slot)}>
            <span class="kc">{@render cap(r.kw, r.path)}</span>
            <span class="tt"><span class="t">{r.title}</span><span class="when">{overdueWords(r)}</span></span>
          </button>
          <div class="chips">
            <button class="chip" onclick={() => void c.move(r, c.shift(0))}>Сегодня</button>
            <button class="chip" onclick={() => void c.move(r, c.shift(1))}>Завтра</button>
            <button class="chip" onclick={() => c.pick(r)}>Дата…</button>
          </div>
        </div>
      {/each}
      {#if c.late.length > LATE_CAP}<button class="row1 rb more" onclick={() => store.showAgendaHere()}>Ещё {c.late.length - LATE_CAP} ›</button>{/if}
    </section>
  {/if}
{/snippet}

<style>
  /* a block's place, for the sidebar's contents (ТЗ 50 §4.2): no box of its own */
  .bw { display: contents; }
  .host { position: relative; height: 100%; container-type: inline-size; }
  .today { height: 100%; overflow: auto; color: var(--ink); font: 13px/1.45 var(--ui); background-color: var(--bg);
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 24px 24px; background-position: -1px -1px; }
  .today:focus { outline: none; }
  .wrap { max-width: 1340px; margin: 0 auto; padding: 26px 36px 32px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; }
  header { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; margin-bottom: 2px; }
  .ttl { flex: 1 1 auto; min-width: 0; }
  .kick { margin-bottom: 8px; font: 500 11px var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink3); }
  h1 { margin: 0; font: 400 36px/1.05 var(--title); }
  .hint { font: 11px var(--mono); color: var(--ink3); }
  .btn { height: 32px; display: inline-flex; align-items: center; gap: 7px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 13px var(--ui); }
  .btn svg { color: var(--lampink); }
  .ico { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 7px; background: var(--chip); color: var(--ink2); }
  .btn:focus-visible, .ico:focus-visible, .link:focus-visible, .b:focus-visible, .chip:focus-visible, .box:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }

  .row { display: flex; gap: 16px; flex-wrap: wrap; }
  .row.top > .bw:first-child > :global(.card) { flex: 1.4 1 420px; }
  .row.top > .bw:not(:first-child) > :global(.card) { flex: 1 1 360px; }
  .row.full > .bw > :global(.card) { flex: 1 1 100%; }
  .row.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
  .col { min-width: 0; display: flex; flex-direction: column; gap: 16px; }

  .card { min-width: 0; box-sizing: border-box; padding: 14px 16px 12px; border-radius: 12px; background: var(--card); border: 1px solid var(--rule); }
  .card.note { background: var(--lampsoft); border-color: var(--lampline); }
  .card.plug { padding: 12px 16px 8px; }
  .bh { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .bn { font-weight: 700; font-size: 13.5px; }
  .bs { font-size: 12px; color: var(--ink3); }
  .link { margin-left: auto; padding: 0; border: 0; background: none; color: var(--lampink); font: 12px var(--ui); white-space: nowrap; }
  .none { padding: 6px 0 4px; color: var(--ink3); }
  .count { height: 18px; min-width: 18px; box-sizing: border-box; padding: 0 6px; border-radius: 9px; background: var(--todo); color: var(--bg); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }

  .ntext { display: flex; flex-direction: column; gap: 2px; font: 500 18px/1.5 var(--text); color: var(--ink); }
  .nl { display: flex; gap: 8px; }
  .mk { color: var(--ink3); }
  .ntext :global(.lnk) { color: var(--lampink); }
  .ntext :global(code) { font: 0.8em var(--mono); }

  .cap { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 4px; font: 700 10.5px var(--ui); letter-spacing: 0.02em; white-space: nowrap; color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .kc { flex: 0 0 46px; display: flex; }
  .t { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: left; font-size: 13.5px; }
  .t .cap { margin-right: 4px; vertical-align: 1px; }
  .meta { flex: 0 0 auto; font-size: 11.5px; color: var(--ink3); white-space: nowrap; }
  .meta.red { color: var(--todo); }

  /* a row: from 32 pt, a line above; a task of the list (ТЗ 34) — chosen on `lampsoft` */
  .row1 { display: flex; align-items: center; gap: 9px; min-height: 32px; border-top: 1px solid var(--rule); padding: 3px 0; box-sizing: border-box; }
  button.rb { display: flex; align-items: center; gap: 9px; width: 100%; border: 0; border-top: 1px solid var(--rule); background: none; color: inherit; font: inherit; text-align: left; cursor: default; }
  .frow button.rb { border-top: 0; padding: 0; min-height: 0; }
  [data-k] { margin-inline: -6px; padding-inline: 6px !important; width: calc(100% + 12px) !important; border-radius: 7px; }
  .frow [data-k] { margin-inline: 0 -6px; width: calc(100% + 6px) !important; padding-inline: 4px 6px !important; }
  [data-k]:focus { outline: none; }
  [data-k].sel { background: var(--chip); }
  .today:focus-within [data-k].sel { background: var(--lampsoft); }
  .rb:hover .t { color: var(--lampink); }
  .stale { opacity: 0.55; }
  .gone .t { text-decoration: line-through; }
  .more { color: var(--lampink); font-size: 12px; }

  .frow.done { opacity: 0.5; }
  .frow.done .t { text-decoration: line-through; }
  .frow.lost .t { color: var(--ink3); }
  .box { flex: 0 0 16px; width: 16px; height: 16px; box-sizing: border-box; padding: 0; border-radius: 4px; border: 1.5px solid var(--ink3); background: transparent; display: flex; align-items: center; justify-content: center; color: var(--card); font-size: 10px; font-weight: 800; }
  .frow.done .box { border-color: var(--done); background: var(--done); }
  .box.off { opacity: 0.4; }

  .arow { gap: 9px; }
  .arow.past { opacity: 0.55; }
  .time { flex: 0 0 86px; white-space: nowrap; font: 11.5px var(--mono); color: var(--ink3); }
  .dot { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 4px; background: var(--todo); }
  .dot.ev { background: var(--lampink); }
  .badge { font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: var(--lampsoft); color: var(--lampink); }

  .grp { display: flex; align-items: center; gap: 6px; margin: 10px 0 4px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; color: var(--ink3); }
  .grp:first-of-type { margin-top: 2px; }
  .grp .n { font-weight: 400; }
  .grp .link { letter-spacing: 0; font-weight: 500; }

  .orow { padding-bottom: 6px; }
  .tt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .when { font-size: 11.5px; color: var(--todo); }
  .chips { display: flex; gap: 5px; margin-left: 55px; }
  .chip { height: 22px; display: inline-flex; align-items: center; padding: 0 8px; border: 0; border-radius: 5px; background: var(--chip2); color: var(--ink); font: 11.5px var(--ui); white-space: nowrap; }

  .who { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .av { flex: 0 0 34px; width: 34px; height: 34px; border-radius: 17px; background: var(--chip2); color: var(--ink); font-size: 12.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .wl { min-width: 0; }
  .wn { font-weight: 600; }
  .ws { font-size: 11.5px; color: var(--ink3); }
  .facts { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 12.5px; }
  .fact { display: flex; align-items: baseline; gap: 7px; }
  .fd { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 4px; }
  .fd.wait { background: var(--wait); }
  .fd.red { background: var(--todo); }
  .btns { display: flex; flex-wrap: wrap; gap: 6px; }
  .b { height: 24px; padding: 0 8px; border: 0; border-radius: 6px; background: var(--chip2); color: var(--ink); font: 11.5px var(--ui); white-space: nowrap; }
  .b.main { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
</style>

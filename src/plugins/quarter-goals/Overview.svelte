<script lang="ts">
  import { goals, type GoalPerson } from './state.svelte';
  import { openAdd, openCarry, openForm, openReport, startReview } from './actions';
  import Wheel from './Wheel.svelte';
  import {
    GOAL_STATES, GOAL_TONES, goalNote, goalsIn, isDone, quarterLabel, quarterOf, cmpQuarter, quarterSub, quarterTitle, resultLine, shiftQuarter, shortDay,
    qEnd, days, activeWord, type Goal,
  } from './goals';

  // «Цели» in a pane (ТЗ 23): «Обзор квартала» (every source) or the goals of one person. A summary of four tiles
  // (a click filters), a group per person, a row per goal: status, title and «Результат: …», deadline, last mark.
  // `wheel` (ТЗ 47 §3.5): the overview as the wheel, the tab keeps it (`setWheel`)
  let { who, wheel: wheelAt = false, setWheel }: { who: string | null; wheel?: boolean; setWheel?: (on: boolean) => void } = $props();
  // svelte-ignore state_referenced_locally
  let wheel = $state(wheelAt);
  function showWheel(on: boolean) {
    wheel = on;
    setWheel?.(on);
  }

  const key = $derived(who ?? '*');
  const q = $derived(goals.goalsQuarter);
  const all = $derived(key === '*');
  const people = $derived.by(() => {
    const list = all ? goals.goalPeople : goals.goalPeople.filter((p) => p.key === key);
    // the team by name, «Мои цели» at the end (as on the mockup)
    return [...list].sort((a, b) => Number(!!a.src.me) - Number(!!b.src.me) || a.name.localeCompare(b.name, 'ru'));
  });
  const person = $derived(all ? null : (people[0] ?? null));
  const done = (p: GoalPerson) => p.file?.wf.done ?? ['COMPLETED'];

  type Filter = 'active' | 'done' | 'backlog' | 'silent' | null;
  let filter = $state<Filter>(null);
  const kind = (g: Goal, p: GoalPerson): Filter =>
    isDone(g, done(p)) ? 'done' : g.keyword === GOAL_STATES.backlog ? 'backlog' : g.keyword === GOAL_STATES.active ? 'active' : null;
  const counts = $derived.by(() => {
    const c = { active: 0, done: 0, backlog: 0, silent: 0 };
    for (const p of people)
      for (const g of goalsIn(p.data, q)) {
        const k = kind(g, p);
        if (k) c[k]++;
        if (goals.goalSilent(g)) c.silent++;
      }
    return c;
  });
  const tiles = $derived([
    { f: 'active' as const, n: counts.active, t: 'активных', c: 'var(--next)' },
    { f: 'done' as const, n: counts.done, t: counts.done % 10 === 1 && counts.done % 100 !== 11 ? 'закрыта' : 'закрыто', c: 'var(--done)' },
    { f: 'backlog' as const, n: counts.backlog, t: 'в бэклоге', c: goals.ctx.ui.look === 'next' ? 'var(--ink3)' : 'var(--fg2)' },
    { f: 'silent' as const, n: counts.silent, t: counts.silent === 1 ? 'молчит больше 2 недель' : 'молчат больше 2 недель', c: 'var(--wait)' },
  ]);
  const shown = (g: Goal, p: GoalPerson) => !filter || (filter === 'silent' ? goals.goalSilent(g) : kind(g, p) === filter);
  const leftDays = $derived(Math.round((+qEnd(q) - +new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 86400000));
  const sub = $derived(
    person
      ? `${person.src.file.split('/').pop()} › ${person.src.heading} › ${quarterTitle(q)}${leftDays >= 0 && leftDays < 100 ? ` · осталось ${days(leftDays)}` : ''}`
      : quarterSub(q),
  );
  const summary = (p: GoalPerson) => {
    const gs = goalsIn(p.data, q);
    const a = gs.filter((g) => g.keyword === GOAL_STATES.active).length;
    const c = gs.filter((g) => isDone(g, done(p))).length;
    return activeWord(a) + (c ? ` · ${c} ${c % 10 === 1 && c % 100 !== 11 ? 'закрыта' : 'закрыто'}` : '');
  };
  // the goals' own colours (ACTIVE blue, BACKLOG grey, COMPLETED green), a status of another set its own
  // a quarter gone by: its open goals can go on to the next one
  const past = $derived(cmpQuarter(q, quarterOf(new Date())) < 0);
  const openLeft = $derived(people.some((p) => goals.openGoalsOf(p).length));
  // ---- the new interface (ТЗ 47 §3.2–§3.4): the header of the new screens, the tiles, the list by people ----
  const next = goals.ctx.ui.look === 'next';
  const isNow = $derived(cmpQuarter(q, quarterOf(new Date())) === 0);
  /** «Платформа · 1on1/boris»: the heading and the file, as the person's line. */
  const whereOf = (p: GoalPerson) => `${p.src.heading} · ${p.src.file.replace(/\.org$/, '')}`;
  const chip = (kw: string | null, p: GoalPerson) =>
    !kw ? '' : GOAL_TONES[kw] ? `color:${GOAL_TONES[kw]};background:color-mix(in srgb, ${GOAL_TONES[kw]} 15%, transparent)` : goals.toneStyle(kw, p.file!.path);
</script>

<div class="goals" class:next>
  {#if next}
    <header class="nh">
      <div class="ttl">
        <div class="kick">{person ? sub : quarterSub(q)}</div>
        <h1>{person ? person.name : 'Цели квартала'}</h1>
      </div>
      <div class="tools">
        <div class="nq" role="group" aria-label="Квартал">
          <button aria-label="Предыдущий квартал" onclick={() => (goals.goalsQuarter = shiftQuarter(q, -1))}>‹ Q{shiftQuarter(q, -1).q}</button>
          <span class="cur" class:now={isNow}>{quarterLabel(q)}</span>
          <button aria-label="Следующий квартал" onclick={() => (goals.goalsQuarter = shiftQuarter(q, 1))}>Q{shiftQuarter(q, 1).q} ›</button>
        </div>
        {#if !person}
          <div class="vseg" role="tablist" aria-label="Вид">
            <button role="tab" aria-selected={!wheel} class:on={!wheel} onclick={() => showWheel(false)}>Список</button>
            <button role="tab" aria-selected={wheel} class:on={wheel} onclick={() => showWheel(true)}>Колесо</button>
          </div>
        {/if}
        {#if person}<button class="chip2" disabled={!person.found} onclick={() => startReview(person.key)}>Разобрать цели</button>{/if}
        {#if past && openLeft}<button class="chip2" onclick={() => openCarry(person?.key ?? '*')}>Перенести незакрытые в {quarterLabel(shiftQuarter(q, 1))}</button>{/if}
        <button class="chip2" disabled={!goals.goalPeople.length} onclick={() => openReport(person?.key ?? '*')}>Отчёт за квартал</button>
        <button class="main" disabled={!goals.goalPeople.length} onclick={() => openForm(person?.key ?? null)}>+ Новая цель</button>
      </div>
    </header>
  {:else}
  <header>
    <div class="ttl">
      <h1>{person ? person.name : 'Обзор квартала'}</h1>
      <span>{sub}</span>
    </div>
    <div class="qs" role="group" aria-label="Квартал">
      <button aria-label="Предыдущий квартал" onclick={() => (goals.goalsQuarter = shiftQuarter(q, -1))}>‹ Q{shiftQuarter(q, -1).q}</button>
      <span class="cur">{quarterLabel(q)}</span>
      <button aria-label="Следующий квартал" onclick={() => (goals.goalsQuarter = shiftQuarter(q, 1))}>Q{shiftQuarter(q, 1).q} ›</button>
    </div>
    <button class="pri" disabled={!goals.goalPeople.length} onclick={() => openForm(person?.key ?? null)}>+ Новая цель</button>
    {#if person}<button class="sec" disabled={!person.found} onclick={() => startReview(person.key)}>Разобрать цели</button>{/if}
    <button class="sec" disabled={!goals.goalPeople.length} onclick={() => openReport(person?.key ?? '*')}>Отчёт за квартал</button>
    {#if past && openLeft}<button class="sec" onclick={() => openCarry(person?.key ?? '*')}>Перенести незакрытые в {quarterLabel(shiftQuarter(q, 1))}</button>{/if}
  </header>
  {/if}

  {#if !goals.goalPeople.length}
    <div class="empty">
      <p>Целей пока нет. Укажите файл и заголовок, под которым хранятся цели — свои или тимлида.</p>
      <button class="pri" onclick={() => openAdd({ me: true })}>Указать, где мои цели</button>
      <button onclick={() => openAdd()}>Добавить цели человека</button>
    </div>
  {:else if next && wheel && !person}
    <Wheel />
  {:else}
    <div class="tiles">
      {#each tiles as t (t.f)}
        <button class="tile" class:on={filter === t.f} aria-pressed={filter === t.f} onclick={() => (filter = filter === t.f ? null : t.f)}>
          <b style="color:{t.c}">{t.n}</b><span>{t.t}</span>
        </button>
      {/each}
    </div>
    <div class="groups">
      {#each people as p (p.key)}
        {@const gs = goalsIn(p.data, q).filter((g) => shown(g, p))}
        {#if !filter || gs.length}
          <section class="grp" aria-label={p.name}>
            <div class="gh">
              {#if next}
                <span class="av" style="background:color-mix(in srgb, {p.color} 22%, var(--card));color:{p.color}" aria-hidden="true">{p.ini}</span>
                <span class="who"><span class="gn">{p.name}</span><span class="gs">{whereOf(p)}</span></span>
              {:else}
              <span class="av" style="background:{p.color}" aria-hidden="true">{p.ini}</span>
              <span class="gn">{p.name}</span><span class="gs">{p.src.file.split('/').pop()} › {p.src.heading}</span>
              {/if}
              <span class="sum">{p.found ? summary(p) : ''}</span>
              {#if all && p.found}<button class="rv" onclick={() => startReview(p.key)}>Разобрать цели</button>{/if}
              <button class="plus" aria-label="Новая цель: {p.name}" title="Новая цель" disabled={!p.found} onclick={() => openForm(p.key)}>+</button>
            </div>
            {#if !p.found}
              <div class="lost">
                {p.file ? `Заголовок «${p.src.heading}» не найден в ${p.src.file}` : `Файл ${p.src.file} не найден`}. Цели в файле не потеряны.
                <button onclick={() => openAdd({ replace: p.key, file: p.src.file, me: p.src.me })}>Выбрать заново</button>
              </div>
            {:else if !gs.length}
              <div class="none">В {quarterLabel(q)} целей нет</div>
            {:else}
              {#each gs as g (g.line)}
                {@const closed = isDone(g, done(p))}
                {@const soon = goals.goalSoon(g, done(p))}
                {@const silent = goals.goalSilent(g)}
                <button class="row" class:closed title="⌥-клик — разобрать с этой цели" onclick={(e) => (e.altKey && !closed ? startReview(p.key, g.title) : goals.openGoalFile(p.key, g.line))}>
                  <span class="st" class:tone-chip={!!g.keyword && !GOAL_TONES[g.keyword]} style={chip(g.keyword, p)}>{g.keyword ?? '—'}</span>
                  <span class="tt"><span class="t" class:closed>{g.title}</span>{#if resultLine(g)}<span class="res">Результат: {resultLine(g)}</span>{/if}</span>
                  {#if closed && g.closed}
                    <span class="dl">закрыта {shortDay(g.closed)}</span>
                  {:else if g.deadline}
                    <span class="dl" class:soon>
                      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17V3M5 4h10l-2 3 2 3H5" /></svg>{shortDay(g.deadline)}
                    </span>
                  {/if}
                  <span class="note" class:silent>{goalNote(g, done(p), new Date(), goals.goalSettings.silent)}</span>
                </button>
              {/each}
            {/if}
          </section>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .goals { flex: 1; min-height: 0; overflow: auto; background: var(--bg); }
  header { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 18px 24px 12px; }
  .ttl { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  h1 { margin: 0; font-size: 20px; font-weight: 700; }
  .ttl span { color: var(--fg2); }
  .qs { margin-left: auto; display: flex; align-items: center; padding: 2px; background: var(--field); border-radius: 7px; gap: 2px; }
  .qs button { height: 24px; padding: 0 10px; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 12.5px; }
  .qs button:hover { color: var(--fg); }
  .qs .cur { height: 24px; padding: 0 10px; display: flex; align-items: center; border-radius: 5px; background: var(--segon); box-shadow: var(--shadow); font-size: 12.5px; font-weight: 600; }
  .pri { height: 28px; padding: 0 12px; border: 0; border-radius: 7px; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .pri:disabled { opacity: 0.5; }
  .sec { height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); }
  .rv { height: 24px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12px; }
  .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; padding: 0 24px 14px; }
  .tile { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; border-radius: 9px; background: var(--side); border: 1px solid var(--line); text-align: left; color: var(--fg); }
  .tile.on { border-color: var(--acc); box-shadow: inset 0 0 0 1px var(--acc); }
  .tile b { font-size: 22px; font-weight: 700; }
  .tile span { font-size: 12px; color: var(--fg2); }
  .groups { display: flex; flex-direction: column; gap: 16px; padding: 0 24px 24px; }
  .grp { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .gh { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--side); border-bottom: 1px solid var(--line); min-width: 0; }
  .av { flex: 0 0 24px; width: 24px; height: 24px; border-radius: 12px; color: #ffffff; font-size: 10.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .gn { font-weight: 600; white-space: nowrap; }
  .gs { font-size: 12px; color: var(--fg2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sum { margin-left: auto; font-size: 12px; color: var(--fg2); white-space: nowrap; }
  .plus { width: 24px; height: 24px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg2); font-size: 15px; }
  .plus:disabled { opacity: 0.4; }
  .row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-height: 40px; padding: 6px 12px; border: 0; background: transparent; color: var(--fg); text-align: left; }
  .row + .row { border-top: 1px solid var(--line); }
  .row:hover { background: var(--cur-line); }
  .row:focus-visible, .tile:focus-visible, .plus:focus-visible, .pri:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .st { flex: 0 0 auto; height: 19px; padding: 0 6px; border-radius: 5px; display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 700; letter-spacing: 0.02em; }
  .tt { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
  .t.closed { color: var(--fg2); }
  .res { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; color: var(--fg2); }
  .dl { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 6px; background: var(--field); font-size: 12px; }
  .dl.soon { color: var(--wait); background: color-mix(in srgb, var(--wait) 14%, transparent); }
  .note { flex: 0 0 150px; text-align: right; font-size: 12px; color: var(--fg2); }
  .note.silent { color: var(--wait); font-weight: 600; }
  .none, .lost { padding: 10px 12px; font-size: 12.5px; color: var(--fg2); }
  .lost { color: var(--wait); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .lost button, .empty button:not(.pri) { height: 24px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12px; }
  .empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 10px 24px; max-width: 520px; }
  .empty p { margin: 0; color: var(--fg2); line-height: 1.5; }

  /* ---- the new interface (ТЗ 47 §3.2–§3.4) ---- */
  .goals.next { color: var(--ink); font-family: var(--ui); }
  .nh { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px 16px; padding: 26px 32px 18px; }
  .nh .ttl { flex: 1 1 auto; gap: 4px; }
  .kick { font: 500 11px var(--font-mono, ui-monospace, monospace); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink3); }
  .nh h1 { font: 400 38px/1.05 var(--font-display, Georgia, serif); color: var(--ink); }
  .tools { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .nq { display: flex; align-items: center; gap: 4px; }
  .nq button, .nq .cur { height: 28px; padding: 0 10px; display: inline-flex; align-items: center; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 12.5px var(--ui); }
  .nq .cur { background: var(--chip); font-weight: 600; }
  .nq .cur.now { background: var(--lampsoft); color: var(--lampink); }
  .vseg { display: flex; padding: 2px; gap: 2px; border-radius: 8px; background: var(--chip); }
  .vseg button { height: 24px; padding: 0 12px; border: 0; border-radius: 6px; background: transparent; color: var(--ink2); font: 12.5px var(--ui); }
  .vseg button.on { background: var(--segon); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); }
  .tools .chip2, .tools .main { height: 28px; padding: 0 12px; border: 0; border-radius: 7px; font: 12.5px var(--ui); }
  .tools .chip2 { background: var(--chip2); color: var(--ink); }
  .tools .main { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .tools button:disabled { opacity: 0.45; }
  .next .tiles { gap: 12px; padding: 0 32px 20px; }
  .next .tile { padding: 12px 16px; border: 1px solid var(--rule); border-radius: 12px; background: var(--card); color: var(--ink); }
  .next .tile.on { background: var(--lampsoft); border-color: var(--lampline); box-shadow: none; }
  .next .tile b { font: 400 30px/1.1 var(--font-display, Georgia, serif); }
  .next .tile span { font-size: 12px; color: var(--ink3); }
  .next .groups { gap: 26px; padding: 0 32px 32px; }
  .next .grp { border: 0; border-radius: 0; overflow: visible; }
  .next .gh { gap: 12px; padding: 0 0 10px; background: none; border: 0; }
  .next .gh .av { flex: 0 0 30px; width: 30px; height: 30px; border-radius: 15px; font-size: 11px; }
  .who { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .next .gn { font-size: 15px; font-weight: 600; }
  .next .gs { font-size: 11.5px; color: var(--ink3); }
  .next .sum { font-size: 12.5px; color: var(--ink2); }
  .next .rv { height: 26px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 12px var(--ui); }
  .next .plus { border: 0; background: var(--chip2); color: var(--ink2); }
  .next .row { min-height: 50px; display: grid; grid-template-columns: 84px minmax(0, 1fr) auto 150px; align-items: center; column-gap: 12px; padding: 8px 6px; border-top: 1px solid var(--rule); color: var(--ink); }
  .next .row > .st { grid-column: 1; justify-self: start; }
  .next .row > .tt { grid-column: 2; }
  .next .row > .dl { grid-column: 3; }
  .next .row > .note { grid-column: 4; }
  .next .row + .row { border-top: 1px solid var(--rule); }
  .next .row:hover { background: var(--chip); }
  .next .row.closed > * { opacity: 0.6; }
  .next .st { max-width: 84px; box-sizing: border-box; overflow: hidden; font: 600 10.5px var(--font-mono, ui-monospace, monospace); }
  .next .t { font-size: 14px; font-weight: 500; }
  .next .t.closed { color: var(--ink); }
  .next .res { font-size: 12px; color: var(--ink3); }
  .next .dl { background: var(--chip); color: var(--ink2); font-size: 12px; }
  .next .dl.soon { background: color-mix(in srgb, var(--wait) 14%, transparent); color: var(--wait); }
  .next .note { font-size: 12px; color: var(--ink2); }
  .next .note.silent { color: var(--wait); font-weight: 600; }
  .next .none, .next .lost { padding: 10px 6px; border-top: 1px solid var(--rule); color: var(--ink3); }
  .next .lost { color: var(--wait); }
  .next .empty { padding: 0 32px; }
  .next .empty p { color: var(--ink2); }
</style>

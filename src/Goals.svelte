<script lang="ts">
  import { goals, type GoalPerson } from './features/goals.svelte';
  import { store, } from './store.svelte';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import {
    GOAL_STATES, GOAL_TONES, goalNote, goalsIn, isDone, quarterLabel, quarterOf, cmpQuarter, quarterSub, quarterTitle, resultLine, shiftQuarter, shortDay,
    qEnd, days, activeWord, type Goal,
  } from './goals';
  import type { Tab } from './layout';

  // «Цели» in a pane (ТЗ 23): «Обзор квартала» (every source) or the goals of one person. A summary of four tiles
  // (a click filters), a group per person, a row per goal: status, title and «Результат: …», deadline, last mark.
  let { tab }: { tab: Tab } = $props();

  const key = $derived(tab.goals ?? '*');
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
    { f: 'backlog' as const, n: counts.backlog, t: 'в бэклоге', c: 'var(--fg2)' },
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
  const chip = (kw: string | null, p: GoalPerson) =>
    !kw ? '' : GOAL_TONES[kw] ? `color:${GOAL_TONES[kw]};background:color-mix(in srgb, ${GOAL_TONES[kw]} 15%, transparent)` : toneStyle(toneFor(kw, p.file!.wf));
</script>

<div class="goals">
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
    <button class="pri" disabled={!goals.goalPeople.length} onclick={() => goals.openGoalForm(person?.key ?? null)}>+ Новая цель</button>
    {#if person}<button class="sec" disabled={!person.found} onclick={() => goals.startGoalReview(person.key)}>Разобрать цели</button>{/if}
    <button class="sec" disabled={!goals.goalPeople.length} onclick={() => goals.openGoalReport(person?.key ?? '*')}>Отчёт за квартал</button>
    {#if past && openLeft}<button class="sec" onclick={() => goals.openGoalCarry(person?.key ?? '*')}>Перенести незакрытые в {quarterLabel(shiftQuarter(q, 1))}</button>{/if}
  </header>

  {#if !goals.goalPeople.length}
    <div class="empty">
      <p>Целей пока нет. Укажите файл и заголовок, под которым хранятся цели — свои или тимлида.</p>
      <button class="pri" onclick={() => goals.openGoalAdd({ me: true })}>Указать, где мои цели</button>
      <button onclick={() => goals.openGoalAdd()}>Добавить цели человека</button>
    </div>
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
              <span class="av" style="background:{p.color}" aria-hidden="true">{p.ini}</span>
              <span class="gn">{p.name}</span><span class="gs">{p.src.file.split('/').pop()} › {p.src.heading}</span>
              <span class="sum">{p.found ? summary(p) : ''}</span>
              {#if all && p.found}<button class="rv" onclick={() => goals.startGoalReview(p.key)}>Разобрать цели</button>{/if}
              <button class="plus" aria-label="Новая цель: {p.name}" title="Новая цель" disabled={!p.found} onclick={() => goals.openGoalForm(p.key)}>+</button>
            </div>
            {#if !p.found}
              <div class="lost">
                {p.file ? `Заголовок «${p.src.heading}» не найден в ${p.src.file}` : `Файл ${p.src.file} не найден`}. Цели в файле не потеряны.
                <button onclick={() => goals.openGoalAdd({ replace: p.key, file: p.src.file, me: p.src.me })}>Выбрать заново</button>
              </div>
            {:else if !gs.length}
              <div class="none">В {quarterLabel(q)} целей нет</div>
            {:else}
              {#each gs as g (g.line)}
                {@const closed = isDone(g, done(p))}
                {@const soon = goals.goalSoon(g, done(p))}
                {@const silent = goals.goalSilent(g)}
                <button class="row" title="⌥-клик — разобрать с этой цели" onclick={(e) => (e.altKey && !closed ? goals.startGoalReview(p.key, g.title) : goals.openGoalFile(p.key, g.line))}>
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
</style>

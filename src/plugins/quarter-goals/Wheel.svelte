<script lang="ts">
  import { goals, type GoalPerson } from './state.svelte';
  import { startReview } from './actions';
  import { GOAL_STATES, GOAL_TONES, goalNote, goalsIn, isDone, quietDays, resultLine, shortDay, type Goal } from './goals';

  // «Цели квартала — колесо» (ТЗ 47 §3.5): who has not talked over their goals for long, before the 1-1s. A segment per
  // person (with «Я»), in the panel's order, the name outside; a dot per active goal — the farther from the centre, the
  // longer without a mark (to 5 weeks, past them at the edge); the silent ones (as the list says them, the setting's
  // threshold — the dashed ring) in `todo` with a ring; the segment filled by the share of the fresh goals (`lamp`
  // 3–18 %), framed `todo` when it has silent ones; in the centre their number. A click on a segment chooses the
  // person — a ray, their goals in a column on the right; a click on a dot opens the goal in the file.
  const q = $derived(goals.goalsQuarter);
  const people = $derived([...goals.goalPeople.filter((p) => p.src.me), ...goals.goalPeople.filter((p) => !p.src.me)].filter((p) => p.found));
  const done = (p: GoalPerson) => p.file?.wf.done ?? ['COMPLETED'];
  const silentWeeks = $derived(Math.max(1, Math.round(goals.goalSettings.silent / 7)));
  const MAXW = 5;
  // the geometry, in the SVG's units
  const C = 300;
  const R0 = 46; // the centre's disc
  const R1 = 236; // the edge of the segments
  const rOf = (weeks: number) => R0 + 14 + (R1 - R0 - 24) * Math.min(1, weeks / MAXW);
  const polar = (r: number, a: number) => [C + r * Math.sin(a), C - r * Math.cos(a)] as const;

  type Dot = { g: Goal; x: number; y: number; silent: boolean };
  const segs = $derived.by(() => {
    const n = people.length || 1;
    const span = (2 * Math.PI) / n;
    return people.map((p, i) => {
      const a0 = i * span;
      const a1 = a0 + span;
      const active = goalsIn(p.data, q).filter((g) => g.keyword === GOAL_STATES.active);
      const sorted = [...active].sort((a, b) => (quietDays(a) ?? 0) - (quietDays(b) ?? 0));
      const dots: Dot[] = sorted.map((g, k) => {
        const a = a0 + (span * (k + 1)) / (sorted.length + 1);
        const [x, y] = polar(rOf((quietDays(g) ?? MAXW * 7) / 7), a);
        return { g, x, y, silent: goals.goalSilent(g) };
      });
      const silent = dots.filter((d) => d.silent).length;
      const fresh = active.length ? (active.length - silent) / active.length : 0;
      const [lx, ly] = polar(R1 + 26, (a0 + a1) / 2);
      return { p, a0, a1, dots, silent, fill: 3 + 15 * fresh, lx, ly, mid: (a0 + a1) / 2 };
    });
  });
  const totalActive = $derived(segs.reduce((s, x) => s + x.dots.length, 0));
  const totalSilent = $derived(segs.reduce((s, x) => s + x.silent, 0));
  /** A ring's sector between two angles. */
  function sector(a0: number, a1: number, r0 = R0, r1 = R1) {
    const [x0, y0] = polar(r1, a0);
    const [x1, y1] = polar(r1, a1);
    const [x2, y2] = polar(r0, a1);
    const [x3, y3] = polar(r0, a0);
    const big = a1 - a0 > Math.PI ? 1 : 0;
    if (segs.length === 1) return `M ${C} ${C - r1} A ${r1} ${r1} 0 1 1 ${C - 0.01} ${C - r1} Z M ${C} ${C - r0} A ${r0} ${r0} 0 1 0 ${C - 0.01} ${C - r0} Z`;
    return `M ${x0} ${y0} A ${r1} ${r1} 0 ${big} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${big} 0 ${x3} ${y3} Z`;
  }

  let chosen = $state<string | null>(null);
  const sel = $derived(segs.find((s) => s.p.key === chosen) ?? null);
  const selGoals = $derived(sel ? goalsIn(sel.p.data, q) : []);
  const chip = (kw: string | null, p: GoalPerson) =>
    !kw ? '' : GOAL_TONES[kw] ? `color:${GOAL_TONES[kw]};background:color-mix(in srgb, ${GOAL_TONES[kw]} 15%, transparent)` : goals.toneStyle(kw, p.file!.path);
  /** «2+ недели», «5+ недель». */
  const weeksWord = (n: number) => (n % 10 >= 1 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'недели' : 'недель');
  const tip = (d: Dot) => `${d.g.title} — ${quietDays(d.g) === null ? 'нет отметок' : `${quietDays(d.g)} дн. без отметки`}`;
</script>

<div class="wheel">
  <div class="stage">
    <svg viewBox="0 0 600 600" role="group" aria-label="Колесо целей: {totalSilent} из {totalActive} без отметки {silentWeeks}+ {weeksWord(silentWeeks)}">
      {#each segs as s (s.p.key)}
        <path class="seg" class:silent={s.silent > 0} class:on={chosen === s.p.key} d={sector(s.a0, s.a1)} style="fill:color-mix(in srgb, var(--lamp) {s.fill}%, transparent)"
          role="button" tabindex="0" aria-label="{s.p.name}: {s.dots.length} активных, {s.silent} молчат" onclick={() => (chosen = chosen === s.p.key ? null : s.p.key)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), (chosen = chosen === s.p.key ? null : s.p.key))}></path>
      {/each}
      <circle class="ring" cx={C} cy={C} r={rOf(silentWeeks)} />
      <!-- the frames over the neighbours: the silent ones `todo`, the chosen one `lampink` -->
      {#each segs.filter((x) => x.silent > 0 && x.p.key !== chosen) as s (s.p.key)}<path class="frame silent" d={sector(s.a0, s.a1)} />{/each}
      {#if sel}<path class="frame on" d={sector(sel.a0, sel.a1)} />{/if}
      {#if sel}
        {@const [x, y] = polar(R1, sel.mid)}
        <line class="ray" x1={C} y1={C} x2={x} y2={y} />
      {/if}
      {#each segs as s (s.p.key)}
        <text class="name" class:on={chosen === s.p.key} x={s.lx} y={s.ly} text-anchor={Math.abs(Math.sin(s.mid)) < 0.2 ? 'middle' : Math.sin(s.mid) > 0 ? 'start' : 'end'} dominant-baseline="middle">{s.p.src.me ? 'Я' : s.p.name}</text>
        {#each s.dots as d (d.g.line)}
          <g class="dot" class:silent={d.silent} role="button" tabindex="0" aria-label={tip(d)} onclick={() => goals.openGoalFile(s.p.key, d.g.line)}
            onkeydown={(e) => e.key === 'Enter' && goals.openGoalFile(s.p.key, d.g.line)}>
            <title>{tip(d)}</title>
            {#if d.silent}<circle class="halo" cx={d.x} cy={d.y} r="9" />{/if}
            <circle cx={d.x} cy={d.y} r="5" />
          </g>
        {/each}
      {/each}
      <circle class="hub" cx={C} cy={C} r={R0} />
      <text class="hk" x={C} y={C - 16} text-anchor="middle">ЦЕЛИ Q{q.q}</text>
      <text class="hn" x={C} y={C + 18} text-anchor="middle">{totalSilent}</text>
    </svg>
    <p class="cap">из {totalActive} без отметки {silentWeeks}+ {weeksWord(silentWeeks)}</p>
    <p class="legend">Сегмент — человек, точка — активная цель: чем дальше от центра, тем дольше без отметки (до {MAXW} недель). Красные — без отметки {silentWeeks}+ {weeksWord(silentWeeks)}, пунктир — эта граница. Заливка — доля свежих целей.</p>
  </div>
  <aside class="col" aria-label={sel ? sel.p.name : 'Человек не выбран'}>
    {#if sel}
      <div class="ch">
        <span class="av" style="background:color-mix(in srgb, {sel.p.color} 22%, var(--card));color:{sel.p.color}" aria-hidden="true">{sel.p.ini}</span>
        <span class="who"><b>{sel.p.name}</b><span>{sel.dots.length} активных{sel.silent ? ` · ${sel.silent} молчат` : ''}</span></span>
      </div>
      <div class="btns">
        {#if !sel.p.src.me}<button class="main" onclick={() => startReview(sel.p.key)}>Разобрать цели</button>{/if}
        <button onclick={() => goals.openGoalFile(sel.p.key)}>Открыть файл</button>
      </div>
      {#each selGoals as g (g.line)}
        {@const closed = isDone(g, done(sel.p))}
        <button class="g" class:closed onclick={() => goals.openGoalFile(sel.p.key, g.line)}>
          <span class="st" style={chip(g.keyword, sel.p)}>{g.keyword ?? '—'}</span>
          <span class="gt">{g.title}</span>
          {#if resultLine(g)}<span class="gr">Результат: {resultLine(g)}</span>{/if}
          <span class="gn" class:silent={goals.goalSilent(g)}>{g.deadline && !closed ? `⚑ ${shortDay(g.deadline)} · ` : ''}{goalNote(g, done(sel.p), new Date(), goals.goalSettings.silent)}</span>
        </button>
      {:else}
        <p class="none">Целей в Q{q.q} нет</p>
      {/each}
    {:else}
      <p class="none">Нажмите на сегмент, чтобы увидеть цели человека.</p>
    {/if}
  </aside>
</div>

<style>
  .wheel { display: flex; gap: 24px; padding: 0 32px 32px; min-height: 0; }
  .stage { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  svg { width: 100%; max-width: 620px; height: auto; overflow: visible; }
  .seg { stroke: var(--rule); stroke-width: 1; cursor: pointer; transition: fill 0.12s; }
  .seg:hover { stroke: var(--lampline); }
  .frame { fill: none; pointer-events: none; }
  .frame.silent { stroke: var(--todo); stroke-width: 1.5; }
  .frame.on { stroke: var(--lampink); stroke-width: 2.5; }
  .seg:focus-visible { outline: none; stroke: var(--lamp); stroke-width: 2.5; }
  .ring { fill: none; stroke: var(--ink3); stroke-width: 1; stroke-dasharray: 4 4; pointer-events: none; }
  .ray { stroke: var(--lampink); stroke-width: 2; pointer-events: none; }
  .name { font: 15px var(--ui); fill: var(--ink2); pointer-events: none; }
  .name.on { fill: var(--ink); font-weight: 600; }
  .dot { cursor: pointer; }
  .dot circle { fill: var(--ink); }
  .dot.silent circle { fill: var(--todo); }
  .dot .halo { fill: none !important; stroke: var(--todo); stroke-width: 1.5; }
  .dot:focus-visible { outline: none; }
  .dot:focus-visible circle:last-child { stroke: var(--lamp); stroke-width: 3; }
  .hub { fill: var(--card); stroke: var(--rule); }
  .hk { font: 500 10px var(--font-mono, ui-monospace, monospace); letter-spacing: 0.08em; fill: var(--ink3); }
  .hn { font: 400 44px var(--font-display, Georgia, serif); fill: var(--todo); }
  .cap { margin: 0; font-size: 12.5px; color: var(--ink2); }
  .legend { margin: 6px 0 0; max-width: 560px; text-align: center; font-size: 11.5px; line-height: 1.45; color: var(--ink3); }
  .col { flex: 0 0 340px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .ch { display: flex; align-items: center; gap: 10px; }
  .av { flex: 0 0 30px; width: 30px; height: 30px; border-radius: 15px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
  .who { display: flex; flex-direction: column; min-width: 0; }
  .who b { font-size: 15px; font-weight: 600; }
  .who span { font-size: 12px; color: var(--ink3); }
  .btns { display: flex; gap: 6px; margin-bottom: 4px; }
  .btns button { height: 28px; padding: 0 12px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 12.5px var(--ui); }
  .btns .main { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .g { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 9px 4px; border: 0; border-top: 1px solid var(--rule); background: none; color: var(--ink); text-align: left; font: 12px var(--ui); }
  .g:hover { background: var(--chip); }
  .g.closed { opacity: 0.6; }
  .st { height: 17px; padding: 0 6px; display: inline-flex; align-items: center; border-radius: 4px; font: 600 10px var(--font-mono, ui-monospace, monospace); }
  .gt { font-size: 13.5px; font-weight: 500; }
  .gr { font-size: 11.5px; color: var(--ink3); }
  .gn { font-size: 11.5px; color: var(--ink2); }
  .gn.silent { color: var(--wait); font-weight: 600; }
  .none { margin: 0; color: var(--ink3); font-size: 12.5px; }
</style>

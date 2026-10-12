<script lang="ts">
  import { goals } from './features/goals.svelte';
  import { store } from './store.svelte';
  import { GOAL_TONES, dayLabel, finalMark, goalsIn, lastMarks, quarterLabel, reportText, shiftQuarter, shortDay, statusWords, cmpQuarter, quarterOf } from './goals';

  // «Отчёт за квартал» (ТЗ 23, 6.1): every person or one; for each goal the status, the deadline, the expected result
  // in full, the last three marks and the final one. Copied as text or Markdown, «Название / Что делал / Результат /
  // Срок / Статус», to paste on the platform.
  const req = goals.goalReport!;
  const q = goals.goalsQuarter;
  let who = $state(req.key);
  const people = $derived(
    goals.goalPeople.filter((p) => p.found && (who === '*' || p.key === who)).sort((a, b) => Number(!!a.src.me) - Number(!!b.src.me) || a.name.localeCompare(b.name, 'ru')),
  );
  const rows = $derived(people.map((p) => ({ p, goals: goalsIn(p.data, q), done: p.file?.wf.done ?? [] })));
  const past = cmpQuarter(q, quarterOf(new Date())) < 0;
  const openLeft = $derived(rows.some((r) => r.goals.some((g) => !r.done.includes(g.keyword ?? ''))));
  async function copy(format: 'text' | 'md') {
    const t = reportText(rows.map((r) => ({ name: r.p.name, goals: r.goals, done: r.done })), q, format);
    try {
      await navigator.clipboard.writeText(t);
      store.note(format === 'md' ? 'Отчёт скопирован как Markdown' : 'Отчёт скопирован', undefined, 2000);
    } catch (e) {
      store.say('Не удалось скопировать: ' + e);
    }
  }
  const chip = (kw: string | null) => (kw && GOAL_TONES[kw] ? `color:${GOAL_TONES[kw]};background:color-mix(in srgb, ${GOAL_TONES[kw]} 15%, transparent)` : '');
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      goals.goalReport = null;
    }
  }
</script>

<div class="scrim" aria-hidden="true"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="rep" role="dialog" aria-modal="true" aria-label="Отчёт за квартал" tabindex="-1" onkeydown={key}>
  <header>
    <b>Отчёт за квартал · {quarterLabel(q)}</b>
    <select bind:value={who} aria-label="Чей отчёт">
      <option value="*">Все люди</option>
      {#each goals.goalPeople.filter((p) => p.found) as p (p.key)}<option value={p.key}>{p.name}</option>{/each}
    </select>
    <span class="sp"></span>
    <button onclick={() => copy('text')}>Скопировать как текст</button>
    <button onclick={() => copy('md')}>Скопировать как Markdown</button>
  </header>
  <div class="body">
    {#each rows as r (r.p.key)}
      <section aria-label={r.p.name}>
        <h2><span class="av" style="background:{r.p.color}" aria-hidden="true">{r.p.ini}</span>{r.p.name}</h2>
        {#each r.goals as g (g.line)}
          {@const fin = finalMark(g)}
          <article>
            <div class="gt"><span class="st" style={chip(g.keyword)}>{g.keyword ?? '—'}</span><b>{g.title}</b><span class="dl">{g.deadline ? `срок ${shortDay(g.deadline)}` : 'без срока'} · {statusWords(g, r.done)}</span></div>
            {#if g.result.trim()}<div class="f"><span class="k">Ожидаемый результат</span><span class="v">{g.result}</span></div>{/if}
            {#if lastMarks(g).length}
              <div class="f"><span class="k">Последние отметки</span>
                {#each lastMarks(g) as m (m.line)}<span class="v"><b>{dayLabel(m.date)}</b> {m.text}</span>{/each}
              </div>
            {/if}
            {#if fin}<div class="f"><span class="k">Итог</span><span class="v">{fin.text.replace(/^итог\s*:\s*/i, '')}</span></div>{/if}
          </article>
        {:else}
          <p class="none">В {quarterLabel(q)} целей нет</p>
        {/each}
      </section>
    {/each}
  </div>
  <footer>
    {#if past && openLeft}<button onclick={() => goals.openGoalCarry(who)}>Перенести незакрытые в {quarterLabel(shiftQuarter(q, 1))}</button>{/if}
    <span class="sp"></span>
    <button class="pri" onclick={() => (goals.goalReport = null)}>Готово</button>
  </footer>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.42); }
  .rep { position: fixed; z-index: 71; left: 50%; top: 36px; bottom: 36px; transform: translateX(-50%); width: min(880px, calc(100% - 48px)); display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5); overflow: hidden; outline: none; }
  header { flex: 0 0 auto; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 20px; background: var(--bar); border-bottom: 1px solid var(--line); }
  header b { font-size: 15px; }
  .sp { flex: 1; }
  select { height: 28px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); padding: 0 6px; }
  header button, footer button { height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); }
  .pri { border: 0 !important; background: var(--acc) !important; color: var(--onacc) !important; font-weight: 600; }
  .body { flex: 1 1 0; min-height: 0; overflow: auto; padding: 8px 20px 20px; display: flex; flex-direction: column; gap: 18px; -webkit-user-select: text; user-select: text; }
  h2 { display: flex; align-items: center; gap: 8px; margin: 12px 0 6px; font-size: 15px; }
  .av { width: 22px; height: 22px; border-radius: 11px; color: #ffffff; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  article { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; margin-bottom: 8px; }
  .gt { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .st { height: 19px; padding: 0 6px; border-radius: 5px; display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 700; }
  .dl { margin-left: auto; font-size: 12px; color: var(--fg2); }
  .f { display: flex; flex-direction: column; gap: 3px; }
  .k { font-size: 11px; font-weight: 600; letter-spacing: 0.03em; color: var(--fg2); text-transform: uppercase; }
  .v { white-space: pre-wrap; line-height: 1.45; }
  .v b { color: var(--fg2); font-weight: 600; margin-right: 4px; }
  .none { color: var(--fg2); margin: 0; }
  footer { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--line); background: var(--side); }
</style>

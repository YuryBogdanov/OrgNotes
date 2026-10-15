<script lang="ts">
  import { goals } from './state.svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { quarterLabel, shiftQuarter, shortDay, cmpQuarter, quarterOf } from './goals';

  // «Перенести незакрытые» (ТЗ 23, 6.2): the open goals of the quarter, all ticked; the ticked ones go under the next
  // quarter, a deadline of the old quarter becomes the last day of the new one, and each gets a mark «Перенесена из …».
  let { key: reqKey, close }: { key: string; close: () => void } = $props();
  const req = { key: reqKey };
  const q = goals.goalsQuarter;
  const to = shiftQuarter(q, 1);
  const people = goals.goalPeople
    .filter((p) => p.found && (req.key === '*' || p.key === req.key))
    .map((p) => ({ p, goals: goals.openGoalsOf(p) }))
    .filter((x) => x.goals.length);
  const ticked = new SvelteMap<string, boolean>(people.flatMap((x) => x.goals.map((g) => [x.p.key + '|' + g.title, true] as const)));
  const count = $derived([...ticked.values()].filter(Boolean).length);
  let busy = $state(false);
  async function go() {
    busy = true;
    const chosen = new Map(people.map((x) => [x.p.key, x.goals.filter((g) => ticked.get(x.p.key + '|' + g.title)).map((g) => g.title)]));
    const n = await goals.carryGoals(chosen);
    busy = false;
    if (n) close();
  }
  const word = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'цель' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'цели' : 'целей');
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }
</script>

<div class="carry" role="dialog" aria-modal="true" aria-label="Перенести незакрытые" tabindex="-1" onkeydown={key}>
  <header>
    <b>Перенести незакрытые в {quarterLabel(to)}</b>
    <span>Цели уйдут под «Квартал Q{to.q} {to.y}»; срок в {quarterLabel(q)} станет последним днём нового квартала; в отметки — «Перенесена из {quarterLabel(q)}»</span>
  </header>
  <div class="body">
    {#each people as x (x.p.key)}
      <div class="grp">
        <span class="nm"><span class="av" style="background:{x.p.color}" aria-hidden="true">{x.p.ini}</span>{x.p.name}</span>
        {#each x.goals as g (g.title)}
          {@const k = x.p.key + '|' + g.title}
          <label class="row">
            <input type="checkbox" checked={ticked.get(k)} onchange={(e) => ticked.set(k, e.currentTarget.checked)} />
            <span class="st">{g.keyword ?? '—'}</span>
            <span class="t">{g.title}</span>
            <span class="dl">{g.deadline ? (cmpQuarter(quarterOf(g.deadline), q) === 0 ? `${shortDay(g.deadline)} → ${shortDay(new Date(to.y, to.q * 3, 0))}` : shortDay(g.deadline)) : 'без срока'}</span>
          </label>
        {/each}
      </div>
    {:else}
      <p class="none">В {quarterLabel(q)} незакрытых целей нет</p>
    {/each}
  </div>
  <footer>
    <button onclick={close}>Отмена</button>
    <button class="pri" disabled={!count || busy} onclick={go}>Перенести {count} {word(count)}</button>
  </footer>
</div>

<style>
  .carry { position: fixed; z-index: 71; left: 50%; top: 48px; max-height: calc(100% - 96px); transform: translateX(-50%); width: min(640px, calc(100% - 48px)); display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5); overflow: hidden; outline: none; }
  header { display: flex; flex-direction: column; gap: 3px; padding: 14px 20px; background: var(--bar); border-bottom: 1px solid var(--line); }
  header b { font-size: 15px; }
  header span { font-size: 12px; color: var(--fg2); line-height: 1.45; }
  .body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px 20px; display: flex; flex-direction: column; gap: 12px; }
  .nm { display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 4px; }
  .av { width: 20px; height: 20px; border-radius: 10px; color: #ffffff; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  .row { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 0 4px 0 28px; }
  .st { font-size: 10.5px; font-weight: 700; color: var(--fg2); }
  .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dl { font-size: 12px; color: var(--fg2); white-space: nowrap; }
  .none { color: var(--fg2); }
  footer { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--line); background: var(--side); }
  footer button { height: 30px; padding: 0 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); }
  .pri { border: 0 !important; background: var(--acc) !important; color: var(--onacc) !important; font-weight: 600; }
  .pri:disabled { opacity: 0.5; }
</style>

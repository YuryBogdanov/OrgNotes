<script lang="ts">
  import { goals, type GoalPerson } from './state.svelte';
  import { openAdd } from './actions';
  import { GOAL_ICON, GOAL_STATES, goalsIn, goalsWord, lastMark, quarterLabel, activeWord } from './goals';

  // The navigator in the «Цели» mode (ТЗ 23): «Мои цели» pinned on top, «Обзор квартала», the team, «Добавить ещё
  // цели». A click shows the goals in the active pane; a double click opens the file at the heading.
  const q = $derived(goals.goalsQuarter);
  const mine = $derived(goals.goalPeople.find((p) => p.src.me));
  const team = $derived(goals.goalPeople.filter((p) => !p.src.me));
  const shown = $derived(goals.shownKey);
  const stat = (p: GoalPerson) => {
    const gs = goalsIn(p.data, q);
    return { n: gs.length, active: gs.filter((g) => g.keyword === GOAL_STATES.active).length, silent: gs.some((g) => goals.goalSilent(g)) };
  };
  const total = $derived(goals.goalPeople.reduce((s, p) => s + goalsIn(p.data, q).length, 0));
  // the new interface (ТЗ 47 §3.1): «Мои цели» a card with «4 цели · отметка 6 дней назад», the team's avatars in the
  // person's colour over `card`, «+ Добавить ещё цели» dashed; no hint at the bottom
  const next = goals.ctx.ui.look === 'next';
  function markWords(p: GoalPerson) {
    const gs = goalsIn(p.data, q);
    const last = gs.map(lastMark).filter((d): d is Date => !!d).sort((a, b) => +b - +a)[0];
    if (!last) return goalsWord(gs.length);
    const n = Math.round((+new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) - +new Date(last.getFullYear(), last.getMonth(), last.getDate())) / 86400000);
    const ago = n <= 0 ? 'сегодня' : n === 1 ? 'вчера' : `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дня' : 'дней'} назад`;
    return `${goalsWord(gs.length)} · отметка ${ago}`;
  }

  // ---- right click: open, rename, another heading, remove ------------------------------------------------------
  let renaming = $state<string | null>(null);
  function personMenu(e: MouseEvent, p: GoalPerson) {
    e.preventDefault();
    goals.ctx.ui.menu([
      { label: 'Открыть файл', disabled: !p.file, run: () => goals.openGoalFile(p.key) },
      { label: 'Переименовать…', disabled: !!p.src.me, run: () => (renaming = p.key) },
      { label: 'Сменить заголовок…', run: () => openAdd({ replace: p.key, file: p.src.file, me: p.src.me }) },
      'sep',
      { label: 'Удалить из целей', danger: true, run: () => void goals.removeGoalSource(p.key) },
    ], { x: e.clientX, y: e.clientY });
  }
  function focusSelect(el: HTMLInputElement) {
    el.focus();
    el.select();
  }
  function renameKey(e: KeyboardEvent, key: string) {
    if (e.key === 'Enter') {
      void goals.renameGoalSource(key, (e.currentTarget as HTMLInputElement).value);
      renaming = null;
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      renaming = null;
    }
  }
</script>

{#snippet avatar(p: GoalPerson, size: number)}
  {#if next}
    <span class="av" style="width:{size}px;height:{size}px;border-radius:{size / 2}px;background:color-mix(in srgb, {p.color} 22%, var(--card));color:{p.color};font-size:{size > 24 ? 11 : 10}px" aria-hidden="true">{p.ini}</span>
  {:else}
    <span class="av" style="width:{size}px;height:{size}px;border-radius:{size / 2}px;background:{p.color};font-size:{size > 24 ? 11 : 10}px" aria-hidden="true">{p.ini}</span>
  {/if}
{/snippet}

<nav class="goals" class:next aria-label="Цели">
  <div class="pin">
    {#if mine}
      {@const st = stat(mine)}
      <button class="mine" class:on={shown === mine.key} aria-current={shown === mine.key ? 'true' : undefined}
        onclick={() => goals.openGoals(mine.key)} ondblclick={() => goals.openGoalFile(mine.key)} oncontextmenu={(e) => personMenu(e, mine)}>
        {@render avatar(mine, next ? 30 : 28)}
        <span class="mt"><b>Мои цели</b><span>{!mine.found ? 'Заголовок не найден' : next ? markWords(mine) : `${quarterLabel(q)} · ${activeWord(st.active)}`}</span></span>
        {#if st.silent}<span class="dot" title="Есть цели без отметок больше 2 недель"></span>{/if}
      </button>
    {:else}
      <button class="setmine" onclick={() => openAdd({ me: true })}>Указать, где мои цели</button>
    {/if}
  </div>
  <div class="lst">
    <button class="row" class:on={shown === '*'} aria-current={shown === '*' ? 'true' : undefined} onclick={() => goals.openGoals('*')}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={next ? GOAL_ICON : 'M3 4h6v6H3zM11 4h6v6h-6zM3 12h6v4H3zM11 12h6v4h-6z'} /></svg>
      <span class="nm">Обзор квартала</span><span class="n">{total}</span>
    </button>
    <div class="cap">КОМАНДА</div>
    {#each team as p (p.key)}
      {@const st = stat(p)}
      {#if renaming === p.key}
        <div class="row">{@render avatar(p, 20)}<input class="rn" aria-label="Название в навигаторе" value={p.src.title} use:focusSelect onkeydown={(e) => renameKey(e, p.key)} onblur={() => (renaming = null)} /></div>
      {:else}
        <button class="row" class:on={shown === p.key} aria-current={shown === p.key ? 'true' : undefined} title={p.found ? `${p.src.file} › ${p.src.heading}` : 'Заголовок не найден'}
          onclick={() => goals.openGoals(p.key)} ondblclick={() => goals.openGoalFile(p.key)} oncontextmenu={(e) => personMenu(e, p)}>
          {@render avatar(p, next ? 22 : 20)}
          <span class="nm">{p.name}</span>
          {#if !p.found}<span class="lost">не найден</span>{:else}
            {#if st.silent}<span class="dot" title="Есть цели без отметок больше 2 недель"></span>{/if}
            <span class="n">{st.n}</span>
          {/if}
        </button>
      {/if}
    {/each}
    <button class="add" onclick={() => openAdd()}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
      Добавить ещё цели
    </button>
  </div>
  {#if !next}<p class="hint">Цели хранятся в файле под выбранным заголовком 1-го уровня: кварталы — 2-й уровень, цели — 3-й. Всё создаётся отсюда.</p>{/if}
</nav>


<style>
  .goals { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .pin { flex: 0 0 auto; padding: 10px 8px 6px; }
  .mine { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 9px; background: var(--bg); border: 1px solid var(--line); color: var(--fg); text-align: left; }
  .mine.on { background: var(--sel); border-color: var(--acc); }
  .mine.on b { color: var(--acc); }
  .mt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .mt span { font-size: 11.5px; color: var(--fg2); }
  .setmine { width: 100%; height: 40px; border: 1px dashed var(--acc); border-radius: 9px; background: transparent; color: var(--acc); font-weight: 600; }
  .av { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; color: #ffffff; font-weight: 700; }
  .lst { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; padding: 0 6px 8px; }
  .row { flex: 0 0 30px; display: flex; align-items: center; gap: 8px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--fg); text-align: left; font-size: 13px; }
  .row.on { background: var(--sel); color: var(--acc); font-weight: 600; }
  .row:focus-visible, .mine:focus-visible, .add:focus-visible, .setmine:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n { font-size: 11px; color: var(--fg3); }
  .lost { font-size: 11px; color: var(--wait); }
  .dot { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 4px; background: var(--wait); }
  .cap { padding: 12px 8px 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.05em; color: var(--fg3); }
  .add { flex: 0 0 30px; display: flex; align-items: center; gap: 8px; margin-top: 6px; padding: 0 8px; border: 1px dashed var(--line); border-radius: 6px; background: transparent; color: var(--acc); text-align: left; }
  .add:hover { border-color: var(--acc); }
  .rn { flex: 1; min-width: 0; height: 22px; padding: 0 4px; border: 1px solid var(--acc); border-radius: 4px; background: var(--bg); outline: none; -webkit-user-select: text; user-select: text; }
  /* ---- the new interface (ТЗ 47 §3.1) ---- */
  .next { color: var(--ink); font-family: var(--ui); }
  .next .pin { padding: 4px 4px 8px; }
  .next .mine { gap: 10px; padding: 10px; border: 1px solid var(--rule); border-radius: 10px; background: var(--card); color: var(--ink); }
  .next .mine.on { background: var(--lampsoft); border-color: var(--lampline); }
  .next .mine.on b { color: var(--ink); }
  .next .mt b { font-size: 13px; font-weight: 600; }
  .next .mt span { font-size: 11.5px; color: var(--ink3); }
  .next .av { font-weight: 700; }
  .next .lst { padding: 0 4px 8px; }
  .next .row { flex-basis: 30px; gap: 9px; border-radius: 7px; color: var(--ink); font-size: 12.5px; }
  .next .row:hover { background: var(--chip); }
  .next .row.on { background: var(--lampsoft); color: var(--ink); }
  .next .row svg { color: var(--ink2); }
  .next .cap { padding: 14px 8px 6px; font-size: 10.5px; color: var(--ink3); }
  .next .n { color: var(--ink3); }
  .next .dot { background: var(--wait); }
  .next .add { flex-basis: 32px; margin-top: 10px; border: 1.5px dashed var(--rule); border-radius: 8px; color: var(--lampink); font: 12.5px var(--ui); }
  .next .add:hover { border-color: var(--lampline); }
  .next .setmine { border-color: var(--lampline); color: var(--lampink); }
  .hint { flex: 0 0 auto; margin: 0; padding: 10px 14px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); line-height: 1.45; }
</style>

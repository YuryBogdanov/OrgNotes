<script lang="ts">
  import { goals, type GoalPerson } from './features/goals.svelte';
  import { store, } from './store.svelte';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import { GOAL_STATES, goalsIn, quarterLabel, activeWord } from './goals';

  // The navigator in the «Цели» mode (ТЗ 23): «Мои цели» pinned on top, «Обзор квартала», the team, «Добавить ещё
  // цели». A click shows the goals in the active pane; a double click opens the file at the heading.
  const q = $derived(goals.goalsQuarter);
  const mine = $derived(goals.goalPeople.find((p) => p.src.me));
  const team = $derived(goals.goalPeople.filter((p) => !p.src.me));
  const shown = $derived(store.tab?.kind === 'goals' ? store.tab.goals : null);
  const stat = (p: GoalPerson) => {
    const gs = goalsIn(p.data, q);
    return { n: gs.length, active: gs.filter((g) => g.keyword === GOAL_STATES.active).length, silent: gs.some((g) => goals.goalSilent(g)) };
  };
  const total = $derived(goals.goalPeople.reduce((s, p) => s + goalsIn(p.data, q).length, 0));

  // ---- right click: open, rename, another heading, remove ------------------------------------------------------
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let renaming = $state<string | null>(null);
  function personMenu(e: MouseEvent, p: GoalPerson) {
    e.preventDefault();
    menu = {
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Открыть файл', disabled: !p.file, action: () => goals.openGoalFile(p.key) },
        { label: 'Переименовать…', disabled: !!p.src.me, action: () => (renaming = p.key) },
        { label: 'Сменить заголовок…', action: () => goals.openGoalAdd({ replace: p.key, file: p.src.file, me: p.src.me }) },
        'sep',
        { label: 'Удалить из целей', danger: true, action: () => void goals.removeGoalSource(p.key) },
      ],
    };
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
  <span class="av" style="width:{size}px;height:{size}px;border-radius:{size / 2}px;background:{p.color};font-size:{size > 24 ? 11 : 10}px" aria-hidden="true">{p.ini}</span>
{/snippet}

<nav class="goals" aria-label="Цели">
  <div class="pin">
    {#if mine}
      {@const st = stat(mine)}
      <button class="mine" class:on={shown === mine.key} aria-current={shown === mine.key ? 'true' : undefined}
        onclick={() => goals.openGoals(mine.key)} ondblclick={() => goals.openGoalFile(mine.key)} oncontextmenu={(e) => personMenu(e, mine)}>
        {@render avatar(mine, 28)}
        <span class="mt"><b>Мои цели</b><span>{mine.found ? `${quarterLabel(q)} · ${activeWord(st.active)}` : 'Заголовок не найден'}</span></span>
        {#if st.silent}<span class="dot" title="Есть цели без отметок больше 2 недель"></span>{/if}
      </button>
    {:else}
      <button class="setmine" onclick={() => goals.openGoalAdd({ me: true })}>Указать, где мои цели</button>
    {/if}
  </div>
  <div class="lst">
    <button class="row" class:on={shown === '*'} aria-current={shown === '*' ? 'true' : undefined} onclick={() => goals.openGoals('*')}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h6v6H3zM11 4h6v6h-6zM3 12h6v4H3zM11 12h6v4h-6z" /></svg>
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
          {@render avatar(p, 20)}
          <span class="nm">{p.name}</span>
          {#if !p.found}<span class="lost">не найден</span>{:else}
            {#if st.silent}<span class="dot" title="Есть цели без отметок больше 2 недель"></span>{/if}
            <span class="n">{st.n}</span>
          {/if}
        </button>
      {/if}
    {/each}
    <button class="add" onclick={() => goals.openGoalAdd()}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
      Добавить ещё цели
    </button>
  </div>
  <p class="hint">Цели хранятся в файле под выбранным заголовком 1-го уровня: кварталы — 2-й уровень, цели — 3-й. Всё создаётся отсюда.</p>
</nav>

{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}

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
  .hint { flex: 0 0 auto; margin: 0; padding: 10px 14px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); line-height: 1.45; }
</style>

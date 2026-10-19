<script lang="ts">
  import { long, type Row } from './state.svelte';
  import { GROUPS, ageWords, tipOf, type Group } from './long';
  import { rowMenu } from './actions';

  // The navigator in the mode «Долгие дела» (ТЗ 40 §5): «ДОЛГИЕ ДЕЛА · 14» and «⋯», the groups with their numbers
  // («В норме» folded), a row of 28 pt — the status, the title, the age by its tone. A click opens the heading in the
  // editor; ⌥-click — the tab «Долгие дела» with this matter.
  let open = $state<Record<Group, boolean>>({ due: true, waiting: true, ok: false, backlog: false });
  const total = $derived(long.rows.length);

  function click(e: MouseEvent, r: Row) {
    if (e.altKey) long.openList(r.m.key);
    else long.reveal(r.m);
  }
  function more(e: MouseEvent) {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    long.ctx.ui.menu(
      [
        { label: 'Открыть список', run: () => long.openList() },
        { label: 'Источники…', run: () => long.openSources() },
      ],
      { x: b.left, y: b.bottom + 4 },
    );
  }
</script>

<nav class="lm" aria-label="Долгие дела">
  <div class="head">
    <span class="cap">ДОЛГИЕ ДЕЛА{total ? ` · ${total}` : ''}</span>
    <button class="more" aria-label="Ещё" title="Ещё" onclick={more}>⋯</button>
  </div>
  <div class="lst">
    {#if long.progress}
      <p class="note">Считаем касания… {long.progress.done} из {long.progress.total} файлов</p>
    {:else if !total}
      <p class="note">Долгих дел пока нет. Добавьте тег :long: к заголовку или укажите файл в источниках.</p>
    {:else}
      {#each GROUPS as g (g.id)}
        {@const rows = long.groups[g.id]}
        {#if rows.length}
          <button class="grp" aria-expanded={open[g.id]} onclick={() => (open[g.id] = !open[g.id])}>
            <svg class="chev" class:on={open[g.id]} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <span>{g.title}</span><span class="n">{rows.length}</span>
          </button>
          {#if open[g.id]}
            {#each rows as r (r.m.key)}
              <button class="row" class:on={long.shownTab && long.sel === r.m.key} title={tipOf(r.m, r.s)} onclick={(e) => click(e, r)}
                oncontextmenu={(e) => {
                  e.preventDefault();
                  const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  rowMenu(r.m, { x: e.clientX, y: e.clientY }, { x: Math.round(b.left), y: Math.round(b.bottom + 2) });
                }}>
                {#if r.m.keyword}<span class="kw tone-chip" style={r.m.tone}>{r.m.keyword}</span>{/if}
                <span class="nm">{r.m.title}</span>
                <span class="age {r.s.tone}">{ageWords(r.s, r.m)}</span>
              </button>
            {/each}
          {/if}
        {/if}
      {/each}
    {/if}
  </div>
  <button class="all" onclick={() => long.openList()}>Открыть список ›</button>
</nav>

<style>
  .lm { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .head { flex: 0 0 auto; display: flex; align-items: center; padding: 10px 8px 4px 14px; }
  .cap { flex: 1; font-size: 11px; font-weight: 600; letter-spacing: 0.05em; color: var(--fg3); }
  .more { width: 24px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 15px; line-height: 1; }
  .more:hover { background: color-mix(in srgb, var(--fg) 8%, transparent); }
  .lst { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; padding: 0 6px 8px; }
  .grp { flex: 0 0 26px; display: flex; align-items: center; gap: 6px; margin-top: 6px; padding: 0 8px 0 4px; border: 0; background: transparent; color: var(--fg2); font-size: 12px; font-weight: 600; text-align: left; }
  .chev { color: var(--fg3); transition: transform 0.12s; }
  .chev.on { transform: rotate(90deg); }
  .grp .n { margin-left: auto; font-weight: 400; color: var(--fg3); font-size: 11px; }
  .row { flex: 0 0 28px; display: flex; align-items: center; gap: 7px; padding: 0 8px 0 20px; border: 0; border-radius: 6px; background: transparent; color: var(--fg); text-align: left; font-size: 13px; }
  .row:hover { background: color-mix(in srgb, var(--fg) 5%, transparent); }
  .row.on { background: var(--sel); }
  .row:focus-visible, .grp:focus-visible, .all:focus-visible, .more:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font: 600 10px var(--mono); }
  .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .age { flex: 0 0 auto; font-size: 11.5px; font-variant-numeric: tabular-nums; color: var(--fg3); }
  .age.late { color: var(--todo); font-weight: 600; }
  .age.soon { color: var(--wait); }
  .note { margin: 8px 8px; font-size: 12px; line-height: 1.45; color: var(--fg2); }
  .all { flex: 0 0 34px; margin: 0; padding: 0 14px; border: 0; border-top: 1px solid var(--line); background: transparent; color: var(--acc); text-align: left; font-size: 12.5px; }
  .all:hover { text-decoration: underline; }
</style>

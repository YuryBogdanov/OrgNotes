<script lang="ts">
  import { draggedHeading, setDragged } from './dragData';
  import { store } from './store.svelte';
  import { tasksCount } from './agendas';
  import ListToast from './ListToast.svelte';
  import { AgendaListCtl } from './agendaListCtl.svelte';

  // An agenda's tab (ТЗ 05, 34): the built-in list of the next 30 days, or a custom agenda's blocks. The pane the
  // agenda lives in: a task opens in the neighbour pane (↩, double click) or here (⌥↩). Its workings are
  // agendaListCtl.svelte.ts (the new interface draws them too, ТЗ 45 §3.3).
  let { pane = 0 }: { pane?: number } = $props();
  // the colours of the priorities, as the board's (ТЗ 33): A — TODO's, B — WAIT's, C — the secondary
  const PRIO: Record<string, string> = { A: 'var(--todo)', B: 'var(--wait)', C: 'var(--fg2)' };
  let list: HTMLDivElement | undefined = $state();
  const c = new AgendaListCtl(() => pane, () => list);
  c.effects();
  const custom = $derived(c.custom);
  const sections = $derived(c.sections);
  const items = $derived(c.items);
  const total = $derived(c.total);
  const sourcesWord = $derived(c.sourcesWord);
  const sel = $derived(c.sel);
  const listId = $derived(c.listId);
  const hints = $derived(c.hints);
  const choose = (i: number) => c.choose(i);
  const openItem = (i: number, mode: 'neighbor' | 'neighbor-focus' | 'here') => c.openItem(i, mode);
  const keydown = (e: KeyboardEvent) => c.keydown(e);
  const clickEmpty = (e: MouseEvent) => c.clickEmpty(e);
</script>

<div class="agenda">

  <div class="view">
    <header class:custom={!!custom}>
      <div>
        <div class="h1">{custom ? custom.name : 'Агенда'}</div>
        <div class="sub">{custom ? `${tasksCount(total)} · ${sourcesWord}` : `${total} записей · ближайшие 30 дней`}</div>
      </div>
      {#if custom}<button class="edit" onclick={(e) => store.editAgenda(custom.id, e.currentTarget)}>Редактировать…</button>{/if}
    </header>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="scroll" bind:this={list} role="listbox" tabindex="0" aria-label="Задачи агенды" aria-activedescendant={sel >= 0 ? `ag-${pane}-${sel}` : undefined}
      onkeydown={keydown} onclick={clickEmpty}>
      {#each sections as g (g.key)}
        <div class="gh" class:l2={g.level === 2} data-block={g.level === 1 && custom ? g.title : undefined}>
          {#if g.dot}<span class="bdot tone-bg" style={g.dot}></span>{/if}
          <span class="gt" class:tone={!!g.dot} style={g.dot ? g.dot : `color:var(${g.tone})`}>{g.title}</span>
          {#if g.sub && !custom}<span class="gs">{g.sub}</span>{/if}
          <span class="rule"></span>
          <span class="gs">{custom ? g.sub : g.items.length}</span>
        </div>
        {#if g.empty}<div class="none">нет задач</div>{/if}
        {#each g.items as it (it.key)}
          {@const i = items.indexOf(it)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="item" class:sel={i === sel} class:stale={it.stale} class:done={it.done} id="ag-{pane}-{i}" data-i={i} role="option" aria-selected={i === sel}
            onclick={() => choose(i)} ondblclick={() => openItem(i, 'neighbor-focus')}
            draggable="true" ondragstart={(e) => { const d = draggedHeading(it.path, it.line); if (d) setDragged(e.dataTransfer, d); }}
            oncontextmenu={(e) => c.menu(e, i)}>
            <span class="time">{it.time}</span>
            {#if it.kw}
              <span class="kw tone-chip" style={it.tone}>{it.kw}</span>
            {:else}
              <span class="kw ev">СОБ.</span>
            {/if}
            <div class="main">
              <span class="ttl">{#if it.prio}<span class="prio" style:--c={PRIO[it.prio] ?? 'var(--fg2)'} aria-label="Приоритет {it.prio}">#{it.prio}</span>{/if}{it.title}</span>
              <span class="src">{it.src}</span>
            </div>
            {#if it.tags}<span class="tag">{it.tags}</span>{/if}
            <span class="mark" class:late={it.late}>{it.mark}</span>
            <svg class="go" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" /></svg>
          </div>
        {/each}
        {#if g.more}<div class="none">и ещё {g.more}</div>{/if}
      {/each}
    </div>
    <ListToast list={listId} />
    <div class="foot">
      {#each hints as [k, t] (t)}<span class="hk"><span class="kk">{k}</span>{t}</span>{/each}
      <span class="who">{custom ? `Агенда «${custom.name}»` : 'Агенда'}</span>
    </div>
  </div>
</div>

<style>
  .agenda { height: 100%; display: flex; min-width: 0; background: var(--bg); }
  .edit:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }

  .view { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; container-type: inline-size; }
  header { display: flex; align-items: flex-end; gap: 12px; padding: 18px 24px 14px; border-bottom: 1px solid var(--line); }
  header > div { flex: 1; min-width: 0; }
  .h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { color: var(--fg2); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .edit { flex: 0 0 auto; height: 26px; padding: 0 12px; border: 0; border-radius: 6px; background: var(--field); font-size: 12.5px; }
  .scroll { flex: 1; overflow: auto; padding: 6px 14px 20px; }
  .gh { display: flex; align-items: baseline; gap: 10px; padding: 16px 10px 6px; }
  .gh.l2 { padding: 8px 10px 4px 28px; }
  .gh.l2 .gt { font-weight: 600; font-size: 12.5px; }
  .bdot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 4px; align-self: center; }
  .gt { font-weight: 700; }
  .gs { font-size: 12px; color: var(--fg2); }
  .rule { flex: 1; height: 1px; background: var(--line); align-self: center; }
  .none { padding: 4px 10px 6px 28px; font-size: 12.5px; color: var(--fg2); }
  .item { display: flex; align-items: center; gap: 12px; min-height: 46px; padding: 6px 10px; border-radius: 7px; }
  .item:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
  /* the chosen task (ТЗ 34): the list in focus — the selection's colour and a ring of the accent; else grey only */
  .item.sel { background: color-mix(in srgb, var(--fg) 9%, transparent); }
  .scroll:focus-within .item.sel { background: var(--sel); box-shadow: inset 0 0 0 1.5px var(--acc); }
  .scroll:focus { outline: none; }
  /* changed from the list and no longer fitting it: dimmed until a refresh; done: struck through too */
  .item.stale { opacity: 0.55; }
  .item.done .ttl { text-decoration: line-through; }
  .go { flex: 0 0 13px; color: var(--acc); opacity: 0; }
  .scroll:focus-within .item.sel .go { opacity: 1; }
  .view { position: relative; }
  .foot { flex: 0 0 24px; display: flex; align-items: center; gap: 16px; padding: 0 14px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); white-space: nowrap; overflow: hidden; }
  .hk { display: inline-flex; align-items: center; gap: 5px; }
  .kk { font-family: var(--mono); color: var(--fg); }
  .who { margin-left: auto; overflow: hidden; text-overflow: ellipsis; }
  .time { flex: 0 0 42px; font-size: 12px; color: var(--fg2); font-family: var(--mono); }
  /* as wide as the status needs (MEETING, IN-PROGRESS…), at least the column of the short ones */
  .kw { flex: 0 0 auto; min-width: 52px; box-sizing: border-box; text-align: center; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; }
  .kw.ev { color: var(--fg2); background: var(--field); }
  .main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .ttl { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* the priority as on the board (ТЗ 33): a capsule in its colour, apart from the title */
  .prio { display: inline-block; margin-right: 6px; padding: 0 4px; border-radius: 4px; vertical-align: 1px; font-size: 10.5px; font-weight: 700; line-height: 16px; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); }
  .src { font-size: 11.5px; color: var(--fg2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag { font-size: 11.5px; color: var(--tagfg); background: var(--tagbg); padding: 1px 8px; border-radius: 9px; }
  .mark { flex: 0 0 170px; text-align: right; font-size: 12px; color: var(--fg2); }
  .mark.late { color: var(--todo); }
  /* in a pane next to a file: the compact rows of the design, one line each, no big header */
  @container (max-width: 760px) {
    header:not(.custom) { display: none; }
    /* a custom agenda keeps a slim header: its name and «Редактировать…» */
    header.custom { align-items: center; padding: 8px 12px 8px 18px; }
    header.custom .h1 { font-size: 14px; }
    header.custom .sub { display: none; }
    header.custom .edit { height: 22px; padding: 0 10px; font-size: 12px; }
    .scroll { padding: 4px 10px 12px; }
    .gh { padding: 12px 8px 5px; gap: 8px; }
    .gt { font-size: 12.5px; }
    .gs { font-size: 11.5px; }
    .item { min-height: 36px; padding: 4px 8px; gap: 10px; }
    .time { flex-basis: 38px; font-size: 11.5px; }
    .kw { min-width: 40px; }
    .main { flex-direction: row; align-items: baseline; gap: 10px; }
    .ttl { flex: 1 1 auto; min-width: 0; font-size: 13px; }
    .src { flex: 0 1 auto; max-width: 45%; }
    .mark, .tag { display: none; }
  }

</style>

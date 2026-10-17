<script lang="ts">
  import { draggedHeading, setDragged } from '../dragData';
  import { store } from '../store.svelte';
  import { tasksCount } from '../agendas';
  import { isPreset } from '../builtinAgendas';
  import { displayName } from '../names';
  import { AgendaListCtl } from '../agendaListCtl.svelte';
  import ListToast from './ListToast.svelte';

  // An agenda of blocks in the new interface (ТЗ 45 §3.3): a custom one of the builder, or one of the built-in
  // «Неделя», «Сегодня», «Все задачи». The kicker «МОЯ АГЕНДА · 9 ЗАДАЧ · ВСЕ ФАЙЛЫ», the name in Yeseva One,
  // «Редактировать…»; a block's head — its colour's dot, the name, its conditions in IBM Plex Mono, a line, the number;
  // rows of 44 pt — the time, the capsule («СОБ.» for an event), the title and its file under it, the mark on the right
  // (`todo` when late); the chosen on `lampsoft` with `lampline`. Its workings are agendaListCtl.svelte.ts, shared with
  // the old screen: the rows are one list of tasks (ТЗ 34).
  let { pane = 0 }: { pane?: number } = $props();
  let list: HTMLDivElement | undefined = $state();
  const c = new AgendaListCtl(() => pane, () => list);
  c.effects();
  const preset = $derived(isPreset(c.custom?.id));
  const kicker = $derived(`${preset ? 'Агенда' : 'Моя агенда'} · ${tasksCount(c.total)} · ${c.sourcesWord}`);
  const fileOf = (it: { path: string }) => displayName(store.files.find((f) => f.path === it.path)?.name ?? '');
</script>

<div class="host">
<!-- the screen is a list of tasks: ↑↓ move in its rows (ТЗ 34) -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="ablocks" role="region" aria-label={c.custom?.name ?? 'Агенда'} tabindex="-1" bind:this={list} onkeydown={(e) => c.keydown(e)} onclick={(e) => c.clickEmpty(e, '.row')}>
  <div class="wrap">
    <header>
      <div class="ttl"><div class="kick">{kicker}</div><h1>{c.custom?.name}</h1></div>
      {#if c.custom && !preset}<button class="btn" onclick={(e) => store.editAgenda(c.custom!.id, e.currentTarget)}>Редактировать…</button>{/if}
    </header>
    {#each c.sections as g (g.key)}
      {#if g.level === 1}
        <div class="bh" data-block={g.title}>
          <i class="dot" style={g.dot}></i><span class="bn">{g.title}</span>{#if g.cond}<span class="cond">{g.cond}</span>{/if}
          <span class="rule"></span><span class="n">{g.total ?? g.items.length}</span>
        </div>
      {:else}
        <div class="gh"><span>{g.title}</span><span class="n">{g.sub}</span></div>
      {/if}
      {#if g.empty}<div class="none">нет задач</div>{/if}
      {#each g.items as it (it.key)}
        {@const i = c.items.indexOf(it)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="row" class:sel={i === c.sel} class:stale={it.stale} class:done={it.done} data-i={i} role="option" aria-selected={i === c.sel} tabindex="-1"
          onclick={() => c.choose(i)} ondblclick={() => c.openItem(i, 'neighbor-focus')}
          draggable="true" ondragstart={(e) => { const d = draggedHeading(it.path, it.line); if (d) setDragged(e.dataTransfer, d); }}
          oncontextmenu={(e) => c.menu(e, i)}>
          <span class="time">{it.time}</span>
          <span class="kc">{#if it.kw}<span class="cap" style={it.tone}>{it.kw}</span>{:else}<span class="cap ev">СОБ.</span>{/if}</span>
          <div class="main">
            <span class="t">{#if it.prio}<span class="prio">#{it.prio}</span>{/if}{it.title}</span>
            <span class="file">{fileOf(it)}</span>
          </div>
          {#if it.tags}<span class="tag">{it.tags}</span>{/if}
          <span class="mark" class:late={it.late}>{it.mark}</span>
        </div>
      {/each}
      {#if g.more}<div class="more">и ещё {g.more}</div>{/if}
    {/each}
  </div>
</div>
<ListToast list={c.listId} />
</div>

<style>
  .host { position: relative; height: 100%; container-type: inline-size; }
  .ablocks { height: 100%; overflow: auto; box-sizing: border-box; padding: 26px 36px 32px; color: var(--ink); font: 13px/1.45 var(--ui); background-color: var(--bg);
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 24px 24px; background-position: -1px -1px; }
  .ablocks:focus { outline: none; }
  .wrap { max-width: 980px; }
  header { display: flex; align-items: flex-end; gap: 14px; margin-bottom: 6px; }
  .ttl { flex: 1; min-width: 0; }
  .kick { margin-bottom: 8px; font: 500 11px var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink3); }
  h1 { margin: 0; font: 400 36px/1.05 var(--title); }
  .btn { height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 13px var(--ui); }
  .btn:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
  .bh { display: flex; align-items: center; gap: 9px; padding: 18px 12px 4px; }
  .dot { flex: 0 0 9px; width: 9px; height: 9px; border-radius: 5px; background: var(--tl, var(--ink3)); }
  .bn { font-size: 15px; font-weight: 700; white-space: nowrap; }
  .cond { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 11px var(--mono); color: var(--ink3); }
  .rule { flex: 1; min-width: 12px; height: 1px; background: var(--rule); }
  .n { font-size: 12px; color: var(--ink3); }
  .gh { display: flex; align-items: center; gap: 6px; padding: 10px 12px 2px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink3); }
  .gh .n { font-weight: 400; font-size: 10.5px; }
  .none { padding: 8px 12px; color: var(--ink3); }
  .more { padding: 6px 12px; color: var(--ink3); font-size: 12px; }
  .row { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; border-radius: 8px; cursor: default; }
  .row:hover { background: var(--chip); }
  .row.sel { background: var(--chip); }
  .ablocks:focus-within .row.sel { background: var(--lampsoft); box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .row:focus { outline: none; }
  .row.stale { opacity: 0.55; }
  .row.done .t { text-decoration: line-through; }
  .time { flex: 0 0 86px; font: 11.5px var(--mono); color: var(--ink3); white-space: nowrap; }
  .kc { flex: 0 0 48px; display: flex; }
  .cap { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 4px; font: 700 10.5px var(--ui); letter-spacing: 0.02em; white-space: nowrap; color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .cap.ev { color: var(--lampink); background: var(--lampsoft); }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .t { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .prio { margin-right: 6px; font-size: 11px; font-weight: 700; color: var(--ink3); }
  .file { font-size: 11.5px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag { flex: 0 0 auto; font: 11px var(--mono); color: var(--ink3); }
  .mark { flex: 0 0 auto; min-width: 110px; text-align: right; font-size: 12px; color: var(--ink3); white-space: nowrap; }
  .mark.late { color: var(--todo); }
</style>

<script lang="ts">
  import { store } from './store.svelte';
  import { dayDiff, fmtDay, fmtLong, occurrences, repeaterLabel, toJs, toneFor, weekdayName } from './org';
  import { toneStyle } from './colors';
  import { displayName } from './names';

  // the pane the agenda lives in: a task opens in the neighbour pane (↩, click) or here (⌥↩)
  let { pane = 0 }: { pane?: number } = $props();

  type Item = {
    day: number; // days from today
    time: string; kw: string | null; tone: string; ev: boolean; pr: boolean;
    title: string; src: string; tags: string; mark: string; file: number; line: number; order: number;
  };

  const items = $derived.by(() => {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const horizon = new Date(from); horizon.setDate(horizon.getDate() + 30);
    const out: Item[] = [];
    store.files.forEach((f, fi) => {
      for (const h of f.headings) {
        const isOpen = !!h.keyword && f.wf.open.includes(h.keyword);
        const isEvent = !h.keyword && !!h.event;
        if (!isOpen && !isEvent) continue;
        const base = {
          kw: h.keyword, tone: h.keyword ? toneStyle(toneFor(h.keyword, f.wf)) : '', ev: isEvent, pr: h.priority === 'A',
          title: h.title, src: [displayName(f.name), ...h.path].join(' › '), tags: h.tags.join(' '),
          file: fi, line: h.line,
        };
        const push = (d: Date, time: string, mark: string, order: number) =>
          out.push({ ...base, day: dayDiff(d, from), time, mark, order });
        if (h.event) {
          const rep = repeaterLabel(h.event.repeater);
          for (const d of occurrences(h.event, from, horizon)) push(d, h.event.time ?? '', rep || 'Событие', 1);
        }
        if (h.scheduled) {
          const base0 = toJs(h.scheduled);
          const overdue = dayDiff(base0, from);
          if (overdue < 0) push(base0, h.scheduled.time ?? '', `Запланировано ${fmtDay(base0)}`, 0);
          else if (base0 <= horizon) push(base0, h.scheduled.time ?? '', h.scheduled.repeater ? repeaterLabel(h.scheduled.repeater) : 'Запланировано', 1);
        }
        if (h.deadline) {
          const d = toJs(h.deadline);
          const n = dayDiff(d, from);
          if (n < 0) push(d, '', `Дедлайн ${fmtDay(d)}`, 0);
          else if (d <= horizon) push(d, '', `Дедлайн ${fmtDay(d)} · ${n === 0 ? 'сегодня' : `через ${n} дн.`}`, 2);
        }
      }
    });
    return out.sort((a, b) => a.day - b.day || a.order - b.order || a.time.localeCompare(b.time));
  });

  const groups = $derived.by(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    type G = { key: string; title: string; sub: string; tone: string; items: Item[] };
    const map = new Map<string, G>();
    for (const it of items) {
      const d = new Date(today); d.setDate(d.getDate() + it.day);
      let key: string, title: string, sub: string, tone = '--fg';
      if (it.day < 0) { key = 'over'; title = 'Просрочено'; sub = ''; tone = '--todo'; }
      else if (it.day === 0) { key = 'today'; title = 'Сегодня'; sub = fmtLong(d); }
      else if (it.day === 1) { key = 'd' + it.day; title = 'Завтра'; sub = fmtDay(d); }
      else if (it.day <= 7) { key = 'd' + it.day; title = weekdayName(d); sub = fmtDay(d); }
      else { key = 'later'; title = 'Позже'; sub = 'ближайшие 30 дней'; }
      if (!map.has(key)) map.set(key, { key, title, sub, tone, items: [] });
      map.get(key)!.items.push(it);
    }
    return [...map.values()];
  });

  const count = $derived(items.length);

  // ---- choosing a task -----------------------------------------------------------------------
  // `items` is already in display order (by day, then kind, then time), so an index into it is the row order
  let sel = $state(-1);
  let list: HTMLDivElement | undefined = $state();
  const key = (it: Item) => `${it.file}:${it.line}:${it.day}:${it.order}`;
  let selKey = $state('');
  // the selection follows its task when the list is recomputed (a status change, a save)
  $effect(() => {
    const i = items.findIndex((it) => key(it) === selKey);
    if (selKey && i >= 0 && i !== sel) sel = i;
  });
  function choose(i: number) {
    sel = Math.max(0, Math.min(items.length - 1, i));
    selKey = items[sel] ? key(items[sel]) : '';
    queueMicrotask(() => list?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }));
  }
  function openItem(i: number, mode: 'neighbor' | 'neighbor-focus' | 'here') {
    const it = items[i];
    if (!it) return;
    choose(i);
    store.openFromAgenda(pane, it.file, it.line, mode);
    if (mode === 'neighbor') queueMicrotask(() => list?.focus()); // the focus stays in the agenda
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      choose(sel + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      choose(sel < 0 ? 0 : sel - 1);
    } else if (e.key === 'Enter' && sel >= 0) {
      e.preventDefault();
      openItem(sel, e.altKey ? 'here' : 'neighbor');
    }
  }
</script>

<div class="agenda">
  <header>
    <div>
      <div class="h1">Агенда</div>
      <div class="sub">{count} записей · ближайшие 30 дней</div>
    </div>
  </header>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="scroll" bind:this={list} role="listbox" tabindex="0" aria-label="Задачи агенды" aria-activedescendant={sel >= 0 ? `ag-${pane}-${sel}` : undefined}
    onkeydown={keydown}>
    {#each groups as g (g.key)}
      <div class="gh">
        <span class="gt" style="color:var({g.tone})">{g.title}</span>
        {#if g.sub}<span class="gs">{g.sub}</span>{/if}
        <span class="rule"></span>
        <span class="gs">{g.items.length}</span>
      </div>
      {#each g.items as it}
        {@const i = items.indexOf(it)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="item" class:sel={i === sel} id="ag-{pane}-{i}" data-i={i} role="option" aria-selected={i === sel}
          onclick={() => openItem(i, 'neighbor')} ondblclick={() => openItem(i, 'neighbor-focus')}>
          <span class="time">{it.time}</span>
          {#if it.kw}
            <span class="kw tone-chip" style={it.tone}>{it.kw}</span>
          {:else}
            <span class="kw ev">СОБ.</span>
          {/if}
          <div class="main">
            <span class="ttl">{#if it.pr}<b class="pr">[#A] </b>{/if}{it.title}</span>
            <span class="src">{it.src}</span>
          </div>
          {#if it.tags}<span class="tag">{it.tags}</span>{/if}
          <span class="mark" class:late={it.day < 0}>{it.mark}</span>
          <svg class="go" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" /></svg>
        </div>
      {/each}
    {/each}
  </div>
  <div class="foot"><span>↩ открыть в соседней панели</span><span>⌥↩ открыть здесь</span></div>
</div>

<style>
  .agenda { height: 100%; display: flex; flex-direction: column; min-width: 0; background: var(--bg); container-type: inline-size; }
  header { padding: 18px 24px 14px; border-bottom: 1px solid var(--line); }
  .h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.01em; }
  .sub { color: var(--fg2); margin-top: 2px; }
  .scroll { flex: 1; overflow: auto; padding: 6px 14px 20px; }
  .gh { display: flex; align-items: baseline; gap: 10px; padding: 16px 10px 6px; }
  .gt { font-weight: 700; }
  .gs { font-size: 12px; color: var(--fg2); }
  .rule { flex: 1; height: 1px; background: var(--line); align-self: center; }
  .item { display: flex; align-items: center; gap: 12px; min-height: 46px; padding: 6px 10px; border-radius: 7px; }
  .item:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
  .item.sel { background: var(--sel); }
  .scroll:focus { outline: none; }
  .scroll:focus-visible .item.sel { box-shadow: inset 0 0 0 1.5px var(--acc); }
  .go { flex: 0 0 13px; color: var(--acc); opacity: 0; }
  .item.sel .go { opacity: 1; }
  .foot { flex: 0 0 26px; display: flex; align-items: center; gap: 14px; padding: 0 12px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); }
  .time { flex: 0 0 42px; font-size: 12px; color: var(--fg2); font-family: var(--mono); }
  .kw { flex: 0 0 52px; text-align: center; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; }
  .kw.ev { color: var(--fg2); background: var(--field); }
  .main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .ttl { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pr { color: var(--wait); }
  .src { font-size: 11.5px; color: var(--fg2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag { font-size: 11.5px; color: var(--tagfg); background: var(--tagbg); padding: 1px 8px; border-radius: 9px; }
  .mark { flex: 0 0 170px; text-align: right; font-size: 12px; color: var(--fg2); }
  .mark.late { color: var(--todo); }
  /* in a pane next to a file: the compact rows of the design, one line each, no big header */
  @container (max-width: 760px) {
    header { display: none; }
    .scroll { padding: 4px 10px 12px; }
    .gh { padding: 12px 8px 5px; gap: 8px; }
    .gt { font-size: 12.5px; }
    .gs { font-size: 11.5px; }
    .item { min-height: 36px; padding: 4px 8px; gap: 10px; }
    .time { flex-basis: 38px; font-size: 11.5px; }
    .kw { flex-basis: 40px; }
    .main { flex-direction: row; align-items: baseline; gap: 10px; }
    .ttl { flex: 1 1 auto; min-width: 0; font-size: 13px; }
    .src { flex: 0 1 auto; max-width: 45%; }
    .mark, .tag { display: none; }
  }
</style>

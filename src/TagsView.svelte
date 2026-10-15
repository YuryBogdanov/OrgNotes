<script lang="ts">
  import Segmented from './Segmented.svelte';
  import { draggedHeading, setDragged } from './dragData';
  import { untrack } from 'svelte';
  import { store } from './store.svelte';
  import { dayDiff, fmtDay, toJs, toneFor, type OrgDate } from './org';
  import { toneStyle } from './colors';
  import { displayName } from './names';
  import { lists } from './taskLists.svelte';
  import ListToast from './ListToast.svelte';
  import { foundText, headingsWith, oftenWith, type HeadTag } from './tags';
  import { tagsState as ts, type TagTab } from './tagsState.svelte';
  import { newAgenda, newBlock, newCond, type Cond } from './agendas';
  import type { Tab } from './layout';

  // The tab «Тег» (ТЗ 38 §2–4): the headings that have all the tags of its filter (И), by file — with inheritance or
  // not, all of them, the tasks or the open ones; the tags often found with them; saved as an agenda. Its rows are a
  // list of tasks (ТЗ 34): a click chooses, ↩ opens, the menu, the keys; a row changed stays until ⌘R.
  let { tab, pane }: { tab: Tab; pane: number } = $props();
  const st = $derived((tab.data as TagTab | undefined) ?? { tags: [], show: 'all', inherit: true });
  const set = (p: Partial<TagTab>) => (tab.data = { ...st, ...p });
  const midnight = $derived(new Date(store.today.getFullYear(), store.today.getMonth(), store.today.getDate()));
  const key = (t: string) => t.toLowerCase();
  const want = $derived(new Set(st.tags.map(key)));

  interface Row {
    key: string;
    path: string;
    file: number;
    line: number;
    title: string;
    n: number;
    kw: string | null;
    tone: string;
    done: boolean;
    src: string;
    tags: HeadTag[];
    date: string;
    late: boolean;
    dk: 'SCHEDULED' | 'DEADLINE' | null;
    stale?: boolean;
  }
  interface Group {
    path: string;
    name: string;
    rows: Row[];
  }

  const found = $derived(headingsWith(store.agendaFiles, st.tags, st.inherit, ts.noInheritSet));
  function dateOf(d: OrgDate | undefined, word: string) {
    return d ? `${word}${fmtDay(toJs(d))}` : '';
  }
  const live = $derived.by<Group[]>(() =>
    found
      .map((g) => {
        const fi = store.files.findIndex((f) => f.name === g.file.name);
        const f = store.files[fi];
        const seen = new Map<string, number>();
        const rows = g.hits
          .filter((hit) => {
            if (st.show === 'all') return true;
            if (!hit.h.keyword) return false;
            return st.show === 'tasks' || !f.wf.done.includes(hit.h.keyword);
          })
          .map((hit): Row => {
            const h = hit.h;
            const n = seen.get(h.title) ?? 0;
            seen.set(h.title, n + 1);
            const done = !!h.keyword && f.wf.done.includes(h.keyword);
            const d = h.deadline ?? h.scheduled;
            return {
              key: `${f.path}|${h.title}|${n}`, path: f.path, file: fi, line: h.line, title: h.title, n, kw: h.keyword,
              tone: h.keyword ? toneStyle(toneFor(h.keyword, f.wf)) : '', done,
              src: [displayName(f.name), ...h.path].join(' › '),
              tags: hit.tags.filter((t) => st.inherit || t.from === 'own'),
              date: done ? dateOf(h.closed, '') : h.deadline ? dateOf(h.deadline, 'дедлайн ') : dateOf(h.scheduled, ''),
              late: !done && !!d && dayDiff(toJs(d), midnight) < 0,
              dk: h.deadline ? 'DEADLINE' : h.scheduled ? 'SCHEDULED' : null,
            };
          });
        return { path: f.path, name: displayName(f.name), rows };
      })
      .filter((g) => g.rows.length)
      .sort((a, b) => b.rows.length - a.rows.length),
  );
  const often = $derived(oftenWith(found, st.tags));

  // ---- rows changed from the list stay until ⌘R (ТЗ 34) ------------------------------------------------------------
  let frozen = $state.raw<{ groups: Group[]; texts: Map<string, string> } | null>(null);
  function freeze() {
    if (!frozen) frozen = { groups: live, texts: new Map(store.files.map((f) => [f.path, f.text])) };
  }
  function refresh() {
    frozen = null;
  }
  const groups = $derived.by<Group[]>(() => {
    if (!frozen) return live;
    const now = new Map(live.flatMap((g) => g.rows.map((r) => [r.key, r] as const)));
    return frozen.groups.map((g) => ({ ...g, rows: g.rows.map((r) => now.get(r.key) ?? { ...r, stale: true }) }));
  });
  $effect(() => {
    const fz = frozen;
    if (!fz) return;
    if (lists.changedOutside(store.files, fz.texts)) untrack(refresh);
  });
  // another filter: the list again, the selection gone
  $effect(() => {
    void st.tags.join('\u0000');
    void st.show;
    void st.inherit;
    untrack(() => (refresh(), clear()));
  });

  const items = $derived(groups.flatMap((g) => g.rows));
  const total = $derived(found.reduce((n, g) => n + g.hits.length, 0));

  // ---- choosing and opening ----------------------------------------------------------------------------------------
  let sel = $state(-1);
  let selKey = $state('');
  let list: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (!selKey) return;
    const i = items.findIndex((r) => r.key === selKey);
    if (i < 0) clear();
    else if (i !== sel) sel = i;
  });
  function choose(i: number) {
    if (!items.length) return;
    sel = Math.max(0, Math.min(items.length - 1, i));
    selKey = items[sel]?.key ?? '';
    queueMicrotask(() => list?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }));
  }
  function clear() {
    sel = -1;
    selKey = '';
  }
  function openRow(i: number, mode: 'neighbor' | 'neighbor-focus' | 'here') {
    const r = items[i];
    if (!r || r.file < 0) return;
    choose(i);
    store.openFromAgenda(pane, r.file, r.line, mode);
    if (mode === 'neighbor') queueMicrotask(() => list?.focus());
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      choose(sel + 1);
    } else if (e.key === 'ArrowUp' && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      choose(sel < 0 ? 0 : sel - 1);
    } else if (e.code === 'KeyZ' && e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && lists.canUndo) {
      e.preventDefault();
      void lists.undo();
    }
  }
  const listId = $derived('tags:' + pane);
  $effect(() => {
    const id = 'tags:' + pane;
    return untrack(() =>
      lists.register({
        id,
        el: () => list,
        tab: () => tab,
        selected: () => {
          const r = items[sel];
          return r ? { path: r.path, line: r.line, title: r.title, dk: r.dk } : null;
        },
        open: (other) => openRow(sel, other ? 'here' : 'neighbor'),
        otherLabel: 'Открыть здесь',
        clear,
        refresh,
        freeze,
      }),
    );
  });

  // ---- the filter --------------------------------------------------------------------------------------------------
  const remove = (t: string) => set({ tags: st.tags.filter((x) => key(x) !== key(t)) });
  const addTag = (t: string) => !want.has(key(t)) && set({ tags: [...st.tags, t] });
  let adding = $state(false);
  let addText = $state('');
  let addCur = $state(0);
  const suggestions = $derived.by(() => {
    const q = addText.trim().replace(/:/g, '').toLowerCase();
    return ts.list.filter((t) => !want.has(key(t.tag)) && (!q || t.tag.toLowerCase().includes(q))).slice(0, 8);
  });
  function addKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      addCur = Math.max(0, Math.min(suggestions.length - 1, addCur + (e.key === 'ArrowDown' ? 1 : -1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = suggestions[addCur];
      if (s) addTag(s.tag);
      addText = '';
      adding = false;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      addText = '';
      adding = false;
    }
  }
  const tint = (t: string) => {
    const c = ts.colorOf(t);
    return `color-mix(in srgb, ${c ? `var(--p-${c})` : 'var(--acc)'} 16%, transparent)`;
  };
  const fromWord = (t: HeadTag) => (t.from === 'file' ? 'от #+FILETAGS' : t.from === 'parent' ? `от раздела «${t.parent}»` : '');

  /** «Сохранить как агенду…»: the builder with «теги: все из …» and what the tab shows. */
  function saveAsAgenda(e: MouseEvent) {
    const block = { ...newBlock(), name: st.tags.map((t) => `:${t}:`).join(' '), conds: [{ ...newCond('tag'), op: 'all', values: [...st.tags] } as Cond] };
    if (st.show === 'open') block.conds.push({ ...newCond('done'), op: 'no' });
    store.newAgendaInBuilder(e.currentTarget as Element, { ...newAgenda(), name: `Теги: ${st.tags.map((t) => `:${t}:`).join(' и ')}`, blocks: [block] });
  }
</script>

<div class="tv">
  {#if !st.tags.length}
    <div class="empty">
      <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h6.5l7.5 7.5-6 6L3.5 9.5zM6.8 6.8h.01" /></svg>
      <p>Выберите тег в навигаторе</p>
    </div>
  {:else}
    <div class="head">
      <div class="r1">
        {#each st.tags as t, i (t)}
          {#if i}<span class="and">И</span>{/if}
          <span class="chip" style:background={tint(t)}>:{t}:<button aria-label="Убрать тег {t}" onclick={() => remove(t)}>×</button></span>
        {/each}
        <span class="add">
          {#if adding}
            <!-- svelte-ignore a11y_autofocus -->
            <input bind:value={addText} autofocus placeholder="тег" aria-label="Добавить тег к фильтру" spellcheck="false" onkeydown={addKey} oninput={() => (addCur = 0)} onblur={() => setTimeout(() => (adding = false), 150)} />
            {#if suggestions.length}
              <div class="sug" role="listbox" aria-label="Теги">
                {#each suggestions as s, i (s.tag)}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div role="option" aria-selected={i === addCur} class:on={i === addCur} onmousedown={(e) => e.preventDefault()} onclick={() => ((adding = false), (addText = ''), addTag(s.tag))}><span>:{s.tag}:</span><i>{s.n}</i></div>
                {/each}
              </div>
            {/if}
          {:else}
            <button class="plus" onclick={() => (adding = true)}>+ тег</button>
          {/if}
        </span>
        <span class="sum">{foundText(found)}</span>
        <button class="save" onclick={saveAsAgenda}>Сохранить как агенду…</button>
      </div>
      <div class="r2">
        <Segmented label="Какие заголовки" value={st.show} onchange={(v) => set({ show: v as TagTab['show'] })} options={[{ value: 'all' as const, label: 'Все заголовки' }, { value: 'tasks' as const, label: 'Задачи' }, { value: 'open' as const, label: 'Только открытые' }]} />
        <button class="sw" role="switch" aria-checked={st.inherit} onclick={() => set({ inherit: !st.inherit })}><span class="tr"><span></span></span>с наследованием</button>
        {#if often.length}
          <span class="dot">·</span>
          <span class="ow">Часто вместе:</span>
          {#each often as o (o.tag)}<button class="co" onclick={() => addTag(o.tag)}>:{o.tag}: <i>{o.n}</i></button>{/each}
        {/if}
      </div>
    </div>
    <div class="list" role="listbox" aria-label="Заголовки с тегом" tabindex="0" bind:this={list} onkeydown={keydown}
      onclick={(e) => !(e.target as HTMLElement).closest('.row') && clear()}>
      {#each groups as g (g.path)}
        <div class="gh"><b>{g.name}</b><span>{g.rows.length}</span><i></i></div>
        {#each g.rows as r (r.key)}
          {@const i = items.indexOf(r)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="row" class:sel={i === sel} class:done={r.done} class:stale={r.stale} data-i={i} role="option" aria-selected={i === sel}
            onclick={() => choose(i)} ondblclick={() => openRow(i, 'neighbor-focus')}
            draggable="true" ondragstart={(e) => { const d = draggedHeading(r.path, r.line); if (d) setDragged(e.dataTransfer, d); }}
            oncontextmenu={(e) => { choose(i); list?.focus({ preventScroll: true }); const sp = lists.spec(listId); if (sp) lists.openMenu(e, sp); }}>
            <span class="kwc">{#if r.kw}<span class="kw tone-chip" style={r.tone}>{r.kw}</span>{/if}</span>
            <div class="main"><span class="ttl">{r.title}</span><span class="src">{r.src}</span></div>
            <span class="tgs">
              {#each r.tags as t (t.tag)}
                <span class="tg" class:hl={want.has(key(t.tag))} class:inh={t.from !== 'own'} title={fromWord(t)} style:background={want.has(key(t.tag)) ? tint(t.tag) : null}>:{t.tag}:</span>
              {/each}
            </span>
            <span class="date" class:late={r.late}>{r.date}</span>
          </div>
        {/each}
      {:else}
        <p class="none">{total ? 'Среди найденных нет таких заголовков' : 'Нет заголовков со всеми этими тегами'}</p>
      {/each}
    </div>
    <ListToast list={listId} />
  {/if}
</div>

<style>
  .tv { flex: 1; min-height: 0; height: 100%; display: flex; flex-direction: column; background: var(--bg); color: var(--fg); font-size: 13px; }
  .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--fg3); }
  .empty p { margin: 0; font-size: 13px; }
  .head { flex: 0 0 auto; padding: 14px 22px 10px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid var(--line); }
  .r1, .r2 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 6px 0 10px; border-radius: 6px; font: 600 14px var(--mono); }
  .chip button { width: 18px; height: 18px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--fg2); font-size: 14px; line-height: 1; }
  .chip button:hover { background: color-mix(in srgb, var(--fg) 10%, transparent); }
  .and { font-size: 12px; color: var(--fg3); }
  .add { position: relative; }
  .plus { height: 24px; padding: 0 8px; border: 1px dashed var(--line); border-radius: 6px; background: transparent; color: var(--fg2); font-size: 12.5px; }
  .add input { width: 130px; height: 24px; box-sizing: border-box; padding: 0 8px; border: 2px solid var(--acc); border-radius: 6px; background: var(--bg); color: var(--fg); font: 12.5px var(--mono); outline: none; }
  .sug { position: absolute; z-index: 20; top: 28px; left: 0; width: 220px; padding: 4px; background: var(--pop, var(--bg)); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); }
  .sug div { display: flex; justify-content: space-between; height: 26px; align-items: center; padding: 0 8px; border-radius: 5px; font: 12.5px var(--mono); }
  .sug div.on { background: var(--sel); }
  .sug i { font: 11.5px var(--ui, system-ui); font-style: normal; color: var(--fg3); }
  .sum { font-size: 12.5px; color: var(--fg2); }
  .save { margin-left: auto; height: 26px; padding: 0 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12.5px; }
  .sw { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: var(--fg2); font-size: 12px; }
  .tr { position: relative; width: 26px; height: 15px; border-radius: 8px; background: var(--field); box-shadow: inset 0 0 0 1px var(--line); }
  .tr span { position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 6px; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
  .sw[aria-checked='true'] .tr { background: var(--acc); box-shadow: none; }
  .sw[aria-checked='true'] .tr span { transform: translateX(11px); }
  .dot, .ow { font-size: 12px; color: var(--fg3); }
  .co { height: 22px; padding: 0 8px; border: 0; border-radius: 5px; background: var(--tagbg); color: var(--tagfg); font: 12px var(--mono); }
  .co i { font-style: normal; color: var(--fg3); font-family: var(--ui, system-ui); }
  .co:hover { background: var(--sel); }
  .list { flex: 1; min-height: 0; overflow: auto; padding: 6px 14px 18px; outline: none; }
  .gh { display: flex; align-items: center; gap: 8px; padding: 12px 8px 4px; font-size: 12.5px; }
  .gh span { color: var(--fg3); font-size: 12px; }
  .gh i { flex: 1; height: 1px; background: var(--line); }
  .row { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 3px 8px; border-radius: 7px; }
  .row:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
  .row.sel { background: var(--sel); box-shadow: inset 0 0 0 1.5px var(--acc); }
  .row.done { opacity: 0.55; }
  .row.done .ttl { text-decoration: line-through; }
  .row.stale { opacity: 0.45; }
  .kwc { flex: 0 0 64px; display: flex; }
  .kw { min-width: 52px; box-sizing: border-box; text-align: center; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ttl { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .src { font-size: 11.5px; color: var(--fg2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tgs { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; max-width: 40%; }
  .tg { padding: 1px 6px; border-radius: 4px; background: var(--tagbg); color: var(--tagfg); font: 11px var(--mono); white-space: nowrap; }
  .tg.hl { color: var(--fg); font-weight: 700; }
  .tg.inh { opacity: 0.6; border: 1px dashed color-mix(in srgb, var(--fg) 25%, transparent); padding: 0 5px; }
  .date { flex: 0 0 120px; text-align: right; font-size: 12px; color: var(--fg2); }
  .date.late { color: var(--todo); }
  .none { margin: 20px 8px; font-size: 12.5px; color: var(--fg3); }
</style>

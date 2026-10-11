<script lang="ts">
  import { tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { store } from './store.svelte';
  import Editor from './Editor.svelte';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import { ICONS } from './commands';
  import { ageDays, agePill, deferDates, short, withDay } from './review';
  import type { Tab } from './layout';

  // «Разбор Inbox»: one task at a time on a card — a real editor narrowed to its subtree, quick buttons above it,
  // the actions below; the summary when the queue is through. The queue and the actions live in the store.
  let { tab }: { tab: Tab } = $props();

  const review = $derived(store.review);
  const item = $derived(store.reviewItem);
  const found = $derived(item ? store.reviewHeading(item) : null);
  const h = $derived(found?.h);
  const f = $derived(found?.f);
  const total = $derived(review?.items.length ?? 0);
  const fileName = $derived(f ? f.name.split('/').pop() : '');
  // the lines the task takes now (trailing blank lines left out)
  const lastLine = $derived.by(() => {
    if (!f || !h) return 0;
    const lines = f.text.split('\n');
    let last = Math.min(h.end, lines.length) - 1;
    while (last > h.line && !lines[last].trim()) last--;
    return last;
  });
  const age = $derived(item ? ageDays(item.created) : null);
  const stale = $derived(age !== null && age > store.inboxCfg.stale);
  const doneKw = $derived(item ? store.reviewStatus(item, 'done') : null);
  const cancelKw = $derived(item ? store.reviewStatus(item, 'cancel') : null);
  const inInbox = $derived(!!item && item.path === store.inboxFile?.path);

  // a card change: the caret at the end of the task's text
  let rev = $state<{ line: number; n: number; focus: boolean; col: number } | null>(null);
  let shownFor = '';
  $effect(() => {
    const key = item ? item.id + '|' + item.path : '';
    if (key === shownFor) return;
    shownFor = key;
    if (item && h) rev = { line: lastLine, n: Date.now(), focus: true, col: 1e9 };
  });
  // a change on disk: tasks gone from their file leave the queue
  $effect(() => {
    void store.files;
    store.reviewSync();
  });

  // ---- the quick buttons: the same choices as the palette's heading commands ----------------------------------
  const quick = $derived.by(() => {
    if (!h || !f) return [];
    const d = (o?: { y: number; m: number; d: number }) => (o ? short(new Date(o.y, o.m - 1, o.d)) : '—');
    return [
      { start: 'status' as const, icon: ICONS.status, label: 'Статус', val: h.keyword ?? '—', style: h.keyword ? toneStyle(toneFor(h.keyword, f.wf)) : '', tone: !!h.keyword, tip: 'Статус · ⇧← ⇧→ в тексте' },
      { start: 'priority' as const, icon: ICONS.prio, label: 'Приоритет', val: h.priority ?? '—', style: '', tone: false, tip: 'Приоритет · ⇧↑ ⇧↓ на заголовке' },
      { start: 'schedule' as const, icon: ICONS.sched, label: 'Запланировано', val: d(h.scheduled), style: '', tone: false, date: !!h.scheduled, tip: 'Запланировать · ⇧⌘P' },
      { start: 'deadline' as const, icon: ICONS.dead, label: 'Дедлайн', val: d(h.deadline), style: '', tone: false, date: !!h.deadline, tip: 'Дедлайн · ⇧⌘P' },
      { start: 'tags' as const, icon: ICONS.tag, label: 'Теги', val: h.tags.join(', ') || '—', style: '', tone: false, tip: 'Теги · ⇧⌘P' },
    ];
  });
  const openStep = (start: 'status' | 'priority' | 'schedule' | 'deadline' | 'tags') => {
    if (h) store.setTabCursor(tab, h.line, 0); // the palette works on the heading under the caret
    store.openPalette(start);
  };

  // ---- «Отложить до…» --------------------------------------------------------------------------------------
  let defer = $state<{ sel: number } | null>(null);
  let deferEl: HTMLDivElement | undefined = $state();
  const options = $derived(deferDates());
  async function openDefer() {
    defer = { sel: 0 };
    await tick();
    deferEl?.focus();
  }
  function pickDefer(d: Date) {
    defer = null;
    void store.reviewDefer(d);
  }
  function deferKey(e: KeyboardEvent) {
    if (!defer) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      defer = null;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      defer.sel = (defer.sel + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pickDefer(options[defer.sel].date);
    } else if (/^[1-4]$/.test(e.key)) {
      e.preventDefault();
      pickDefer(options[+e.key - 1].date);
    }
  }

  // ---- the actions ------------------------------------------------------------------------------------------
  let confirmDel = $state(false);
  let more = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  function del() {
    if (item?.hasDetails && !confirmDel) {
      confirmDel = true;
      return;
    }
    confirmDel = false;
    void store.reviewDelete();
  }
  function moreMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    more = {
      x: r.right - 220, y: r.top - 76,
      items: [
        { label: 'Открыть в файле', action: () => store.reviewOpenInFile() },
        'sep',
        { label: 'Удалить…', danger: true, action: del },
      ],
    };
  }
  /** ⌥⌘1…⌥⌘5 the actions, ⌥⌘[ the card before (⌘1, ⌘2, ⌘[ belong to the menu «Вид»). */
  function keys(e: KeyboardEvent) {
    if (store.tab !== tab || !review || store.palette || store.refile || defer || confirmDel) return;
    // the summary has no editor: ⌘Z takes the last action of the review back
    if (review.cur < 0 && e.metaKey && !e.altKey && !e.shiftKey && e.code === 'KeyZ' && store.reviewUndoLast) {
      e.preventDefault();
      store.reviewUndoLast();
      return;
    }
    if (!(e.metaKey && e.altKey) || e.shiftKey || e.ctrlKey) return;
    if (e.code === 'BracketLeft') {
      e.preventDefault();
      store.reviewBack();
      return;
    }
    if (!item) return;
    const n = /^Digit([1-5])$/.exec(e.code)?.[1];
    if (!n) return;
    e.preventDefault();
    if (n === '1') void store.reviewClose('done');
    else if (n === '2') void store.reviewClose('cancel');
    else if (n === '3') store.reviewMove();
    else if (n === '4') void openDefer();
    else store.reviewSkip();
  }

  // ---- the summary ------------------------------------------------------------------------------------------
  const count = (r: string) => review?.items.filter((x) => x.result === r).length ?? 0;
  const stats = $derived([
    { n: count('done'), t: 'выполнено', c: 'var(--done)' },
    { n: count('cancel'), t: 'отменено', c: 'var(--fg2)' },
    { n: count('move'), t: 'перенесено', c: 'var(--acc)' },
    { n: count('defer'), t: 'отложено', c: 'var(--ts)' },
    { n: count('skip'), t: 'пропущено', c: 'var(--wait)' },
  ]);
  const skipped = $derived(review?.items.filter((x) => x.result === 'skip') ?? []);
  const added = $derived(review && review.cur < 0 ? store.reviewAdded : []);
  /** «Осталась 1 пропущенная задача», «Осталось 3 пропущенные задачи», «Осталось 5 пропущенных задач». */
  function skippedText(n: number) {
    const one = n % 10 === 1 && n % 100 !== 11;
    const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
    const words = one ? 'пропущенная задача' : few ? 'пропущенные задачи' : 'пропущенных задач';
    return `${one ? 'Осталась' : 'Осталось'} ${n} ${words}. ${one ? 'Её' : 'Их'} можно разобрать сейчас или в следующий раз.`;
  }
  function again(list: typeof skipped) {
    store.startReview(list.map((x) => ({ ...x, result: null, note: undefined })));
  }
</script>

<svelte:window onkeydown={keys} />

<div class="review">
  <div class="stage">
    {#if review && item && f && h}
      {#key item.id + '|' + item.path}
        <div class="card" in:fly={{ y: 8, duration: 150 }}>
          <div class="chead">
            <span class="k">Задача {review.cur + 1} из {total}</span>
            <span class="where">{fileName} · строки {h.line + 1}–{lastLine + 1}</span>
            {#if item.result === 'move' && item.note}<span class="moved">Перенесена в {item.note.replace(/^→ /, '')}</span>{/if}
            {#if item.created && inInbox}<span class="age" class:stale>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 1.5" /></svg>
              {agePill(item.created)}</span>{/if}
          </div>
          <div class="quick" role="toolbar" aria-label="Быстрые действия">
            {#each quick as q (q.label)}
              <button title={q.tip} onclick={() => openStep(q.start)}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={q.icon} /></svg>
                <span>{q.label}</span>
                <span class="qv" class:tone-chip={q.tone} class:date={q.date} style={q.style}>{q.val}</span>
              </button>
            {/each}
          </div>
          <div class="ed">
            <Editor text={f.text} fileKey={'review|' + item.id + '|' + f.path} wf={f.wf} reveal={rev} narrow={{ line: h.line, end: h.end }} drawers={false} levels={store.levels}
              onchange={(t) => store.setText(t, f.path)} oncursor={(line, col) => store.setTabCursor(tab, line, col)}
              onnarrow={(line) => store.reviewAt(item, line)} onfollow={(l) => store.follow(l)} />
          </div>
        </div>
      {/key}
    {:else if review && review.cur < 0}
      <div class="done" in:fly={{ y: 8, duration: 150 }}>
        <span class="okc" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg></span>
        <h2>Разбор закончен</h2>
        <p>{skipped.length ? skippedText(skipped.length) : 'Inbox разобран.'}</p>
        <div class="stats">
          {#each stats as s (s.t)}<div class="stat"><span class="n" style:color={s.c}>{s.n}</span><span>{s.t}</span></div>{/each}
        </div>
        {#if added.length}
          <div class="added">Добавлено во время разбора: {added.length} <button class="lnk" onclick={() => store.startReview(added)}>Разобрать и их</button></div>
        {/if}
        <div class="btns">
          {#if skipped.length}<button class="pri" onclick={() => again(skipped)}>Разобрать {skipped.length === 1 ? 'пропущенную' : 'пропущенные'}</button>{/if}
          <button onclick={() => store.endReview()}>Закончить</button>
        </div>
        <span class="fine">Все изменения уже записаны в файлы. ⌘Z отменяет последнее действие разбора.</span>
      </div>
    {:else}
      <div class="none">Разбор не идёт. Начать — «Разобрать» в разделе Inbox.</div>
    {/if}
  </div>

  {#if review && item}
    <div class="bar">
      <button class="back" disabled={review.cur <= 0} onclick={() => store.reviewBack()}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l-6 6 6 6" /></svg>Назад<kbd>⌥⌘[</kbd>
      </button>
      <div class="acts">
        <button class="a done-b" disabled={!doneKw} onclick={() => store.reviewClose('done')}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>Выполнено<span class="hint">{doneKw}</span><kbd>⌥⌘1</kbd>
        </button>
        <button class="a" disabled={!cancelKw} title={cancelKw ? '' : 'В наборе нет статуса для отмены'} onclick={() => store.reviewClose('cancel')}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>Отменить<span class="hint">{cancelKw ?? ''}</span><kbd>⌥⌘2</kbd>
        </button>
        <button class="a move-b" onclick={() => store.reviewMove()}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS.refile} /></svg>Перенести…<kbd>⌥⌘3</kbd>
        </button>
        <div class="dwrap">
          <button class="a" class:on={!!defer} aria-haspopup="dialog" onclick={() => (defer ? (defer = null) : openDefer())}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 6.5V10l2.5 1.5" /></svg>Отложить…<kbd>⌥⌘4</kbd>
          </button>
          {#if defer}
            {@const d = defer}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div class="defer" role="dialog" aria-label="Отложить до" tabindex="0" bind:this={deferEl} onkeydown={deferKey}>
              <span class="dh"><b>Отложить до…</b><span>ставит SCHEDULED</span></span>
              <div class="opts" role="listbox" aria-label="Когда">
                {#each options as o, i (o.label)}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div class="opt" class:on={d.sel === i} role="option" aria-selected={d.sel === i} tabindex="-1" onmousemove={() => (d.sel = i)} onclick={() => pickDefer(o.date)}>
                    <span class="ol">{o.label}</span><span class="od">{withDay(o.date)}</span><kbd>{i + 1}</kbd>
                  </div>
                {/each}
                <label class="opt pick">Выбрать дату…
                  <input type="date" aria-label="Выбрать дату" onchange={(e) => { const v = e.currentTarget.value; if (v) { const [y, m, dd] = v.split('-').map(Number); pickDefer(new Date(y, m - 1, dd)); } }} />
                </label>
              </div>
              <span class="dn">Задача останется в Inbox с датой и вернётся в разбор, когда дата наступит. Дальше — следующая карточка.</span>
            </div>
          {/if}
        </div>
        <button class="a" onclick={() => store.reviewSkip()}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5l6 5-6 5M13 5v10" /></svg>Пропустить<kbd>⌥⌘5</kbd>
        </button>
      </div>
      <button class="dots" aria-label="Ещё: удалить, открыть в файле" title="Ещё" onclick={moreMenu}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="10" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="15" cy="10" r="1.4" /></svg>
      </button>
    </div>
  {/if}
</div>

{#if defer}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dscrim" onmousedown={() => (defer = null)}></div>
{/if}
{#if more}<ContextMenu x={more.x} y={more.y} items={more.items} onclose={() => (more = null)} />{/if}
{#if confirmDel && item}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal" onmousedown={() => (confirmDel = false)}>
    <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Удаление задачи" onmousedown={(e) => e.stopPropagation()}>
      <h2>Удалить задачу «{item.title}» вместе с деталями?</h2>
      <p>Заголовок удаляется из файла со всем, что под ним. Вернуть можно кнопкой «Отменить» в подсказке внизу.</p>
      <div class="mb">
        <button onclick={() => (confirmDel = false)}>Отмена</button>
        <button class="danger-b" onclick={del}>Удалить</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .review { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .stage { flex: 1 1 0; min-height: 0; overflow: auto; background: var(--stage); padding: 28px 24px; display: flex; justify-content: center; align-items: flex-start; }
  .card { width: 100%; max-width: 820px; display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1); overflow: hidden; }
  .chead { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--line); font-size: 13px; }
  .k { font-weight: 600; }
  .where { color: var(--fg2); }
  .moved { color: var(--acc); font-weight: 600; }
  .age { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px; border-radius: 11px; font-size: 12px; font-weight: 600; color: var(--fg2); background: color-mix(in srgb, var(--fg2) 12%, transparent); }
  .age.stale { color: var(--wait); background: color-mix(in srgb, var(--wait) 14%, transparent); }
  .quick { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 10px 18px; border-bottom: 1px solid var(--line); background: var(--side); }
  .quick button { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12.5px; }
  .quick button svg { color: var(--fg2); }
  .qv { font-weight: 600; color: var(--fg3); }
  .qv.tone-chip { background: none; }
  .qv.date { color: var(--ts); }
  .ed { padding: 8px 0 12px; min-height: 120px; }
  .ed :global(.cm-editor) { width: 100%; }
  .done { width: 100%; max-width: 560px; margin-top: 40px; padding: 36px 32px 28px; display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1); }
  .okc { width: 52px; height: 52px; border-radius: 26px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--done) 16%, transparent); color: var(--done); }
  .done h2 { margin: 0; font-size: 20px; font-weight: 700; }
  .done p { margin: 0; color: var(--fg2); }
  .stats { width: 100%; margin: 6px 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
  .stat { display: flex; flex-direction: column; gap: 2px; padding: 10px 6px; border-radius: 8px; background: var(--side); font-size: 12px; color: var(--fg2); }
  .stat .n { font-size: 22px; font-weight: 700; }
  .added { font-size: 12.5px; color: var(--fg2); }
  .lnk { border: 0; background: none; color: var(--acc); font-weight: 600; padding: 0 2px; }
  .btns { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .btns button { height: 32px; padding: 0 16px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); }
  .btns .pri { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .fine { font-size: 11.5px; color: var(--fg3); }
  .none { margin-top: 60px; color: var(--fg2); }
  .bar { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bar); border-top: 1px solid var(--line); }
  .back { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: var(--fg2); }
  .back:disabled { opacity: 0.45; }
  .acts { flex: 1 1 auto; min-width: 0; display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; }
  .a { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font-size: 13px; font-weight: 600; }
  .a:disabled { opacity: 0.45; }
  .a.on { background: var(--sel); border-color: var(--acc); }
  .done-b { background: var(--done); border-color: var(--done); color: var(--onacc); }
  .move-b { background: var(--acc); border-color: var(--acc); color: var(--onacc); }
  .hint { font-weight: 400; font-size: 11.5px; opacity: 0.8; }
  kbd { font: 10.5px var(--mono); padding: 0 4px; border: 1px solid color-mix(in srgb, currentColor 35%, transparent); border-radius: 4px; font-weight: 400; }
  .dots { width: 34px; height: 34px; border: 0; border-radius: 7px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; padding: 0; }
  .dwrap { position: relative; }
  .defer { position: absolute; bottom: 44px; left: 50%; transform: translateX(-50%); z-index: 41; width: 300px; padding: 12px; display: flex; flex-direction: column; gap: 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 14px 40px rgba(0, 0, 0, 0.28); outline: none; font-size: 13px; }
  .dh { display: flex; align-items: baseline; gap: 8px; }
  .dh span { font-size: 11.5px; color: var(--fg2); }
  .opts { display: flex; flex-direction: column; gap: 1px; }
  .opt { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 8px; border-radius: 6px; cursor: default; }
  .opt.on { background: var(--acc); color: var(--onacc); }
  .ol { flex: 1; }
  .od { font-size: 12px; opacity: 0.8; }
  .pick input { margin-left: auto; height: 24px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12px; }
  .dn { font-size: 11.5px; color: var(--fg2); line-height: 1.45; }
  .dscrim { position: fixed; inset: 0; z-index: 40; }
  .modal { position: fixed; inset: 0; z-index: 110; background: rgba(0, 0, 0, 0.28); display: flex; align-items: flex-start; justify-content: center; padding-top: 14vh; }
  .dlg { width: 420px; max-width: calc(100% - 32px); padding: 18px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35); }
  .dlg h2 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  .dlg p { margin: 0 0 14px; color: var(--fg2); line-height: 1.45; font-size: 12.5px; }
  .mb { display: flex; justify-content: flex-end; gap: 8px; }
  .mb button { height: 28px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--field); }
  .mb .danger-b { background: var(--todo); color: var(--onacc); font-weight: 600; }
  @media (prefers-reduced-motion: reduce) { .card, .done { animation: none; } }
</style>

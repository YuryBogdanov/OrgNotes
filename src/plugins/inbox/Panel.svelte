<script lang="ts">
  import { tick } from 'svelte';
  import { data } from './state.svelte';
  import { session } from './session.svelte';
  import { ago, type InboxItem } from './list';
  import { ageDays, ageShort, days, subLabel, tasksWord, type ReviewItem } from './review';

  // The navigator in the «Inbox» mode: the unsorted tasks of the Inbox file and what to do with them — open, move,
  // date, done, delete. Not set up yet (or the file is gone): a stub to choose or create the file. During a review:
  // its queue.
  const ctx = data.ctx;
  const cfg = $derived(data.settings);
  const file = $derived(data.file);
  const items = $derived(data.list);
  const missing = $derived(!!data.chosen && !file);
  const titled = (t: string, id: string) => (ctx.commands.keyOf(id) ? `${t} (${ctx.commands.keyOf(id)})` : t);
  /** «Работа/journal.org» → «journal». */
  const shortName = (p: string) => p.split('/').pop()!.replace(/\.org$/, '');

  let sel = $state(0);
  let list: HTMLDivElement | undefined = $state();
  let now = $state(new Date());
  $effect(() => {
    const t = setInterval(() => (now = new Date()), 30_000); // «5 мин» keeps counting
    return () => clearInterval(t);
  });
  $effect(() => {
    if (sel >= items.length) sel = Math.max(0, items.length - 1);
  });

  const ref = (it: InboxItem) => data.refOf(it);
  let leaving = $state<number | null>(null); // the line of a task going away (a short fade)
  const fade = async (line: number) => {
    leaving = line;
    await new Promise((r) => setTimeout(r, 180));
    leaving = null;
  };
  async function done(it: InboxItem) {
    const kw = data.doneOf(it.keyword);
    await fade(it.line);
    if (kw) await ctx.edit!.transaction(`Выполнено: ${it.title}`, (tx) => tx.setStatus(ref(it), kw));
    list?.focus();
  }
  let confirmDel = $state<InboxItem | null>(null);
  async function del(it: InboxItem) {
    if (it.hasDetails && confirmDel !== it) {
      confirmDel = it;
      return;
    }
    confirmDel = null;
    await ctx.edit!.transaction(`Удалено: ${it.title}`, (tx) => tx.remove(ref(it)));
    list?.focus();
  }
  /** «Перенести…»: the core's move, the row fading out just before the write. */
  const refile = (it: InboxItem) => void ctx.ui.refile(ref(it), { before: () => fade(it.line) });
  /** «Открыть»: the Inbox file in the editor, at the task. */
  const openItem = (it: InboxItem) => void ctx.commands.run('file.open', { path: data.path, line: it.line });

  // ---- «Разбор» ---------------------------------------------------------------------------------------------
  const review = $derived(session.run);
  const pending = $derived(file ? data.pending : []);
  const oldest = $derived(Math.max(0, ...pending.map((x) => ageDays(x.created) ?? 0)));
  const handled = $derived(review ? review.items.filter((x) => x.result && x.result !== 'skip').length : 0);
  const skippedN = $derived(review ? review.items.filter((x) => x.result === 'skip').length : 0);
  const MARK: Record<string, string> = { done: 'var(--done)', cancel: 'var(--fg3)', move: 'var(--acc)', defer: 'var(--ts)', delete: 'var(--fg3)', next: 'var(--acc)' };
  const SEG: Record<string, string> = { ...MARK, skip: 'var(--wait)' };
  const segColor = (it: ReviewItem, i: number) => (it.result ? SEG[it.result] : i === review?.cur ? 'var(--fg2)' : 'var(--field)');
  const closed = (it: ReviewItem) => it.result === 'done' || it.result === 'cancel' || it.result === 'move' || it.result === 'delete';
  const isStale = (it: ReviewItem) => !closed(it) && (ageDays(it.created) ?? 0) > cfg.stale;

  // ---- the date popover ----------------------------------------------------------------------------------------
  let datePop = $state<{ it: InboxItem; x: number; y: number; kind: 'SCHEDULED' | 'DEADLINE' } | null>(null);
  function openDate(e: { currentTarget: EventTarget | null; clientX?: number; clientY?: number }, it: InboxItem) {
    const el = e.currentTarget as HTMLElement | null;
    const r = el?.getBoundingClientRect?.() ?? { left: e.clientX ?? 0, bottom: e.clientY ?? 0 };
    datePop = { it, x: Math.min(r.left, window.innerWidth - 260), y: r.bottom + 6, kind: 'SCHEDULED' };
  }
  const day = (n: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return d;
  };
  /** «На неделе»: the coming Friday (after Thursday: the next week's). */
  const thisWeek = () => {
    const wd = day(0).getDay();
    return day(wd >= 5 || wd === 0 ? ((5 - wd + 7) % 7 || 7) : 5 - wd);
  };
  async function setDate(d: Date | null) {
    const p = datePop;
    datePop = null;
    if (p) await ctx.edit!.transaction(`Дата: ${p.it.title}`, (tx) => tx.setPlanning(ref(p.it), p.kind, d));
  }
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // ---- keys and the context menu ---------------------------------------------------------------------------------
  function key(e: KeyboardEvent) {
    const it = items[sel];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(0, Math.min(items.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
      void tick().then(() => list?.querySelector('.row.sel')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'Enter' && it) {
      e.preventDefault();
      openItem(it);
    }
  }
  function context(e: MouseEvent, it: InboxItem, i: number) {
    e.preventDefault();
    sel = i;
    const at = { currentTarget: null, clientX: e.clientX, clientY: e.clientY };
    ctx.ui.menu(
      [
        { label: 'Открыть', run: () => openItem(it) },
        { label: 'Перенести…', run: () => refile(it) },
        { label: 'Дата…', run: () => openDate(at, it) },
        { label: 'Готово', run: () => void done(it) },
        'sep',
        { label: 'Удалить…', danger: true, run: () => void del(it) },
      ],
      { x: e.clientX, y: e.clientY },
    );
  }
</script>


<div class="inbox">
  <div class="head">
    <span class="title" title={file?.path}>{file ? `INBOX · ${items.length}` : 'INBOX'}</span>
    {#if file && review}
      <button class="rv stop" onclick={() => session.end()}>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h10v10H5z" /></svg>Закончить</button>
    {:else if file}
      <button class="rv" disabled={!pending.length} title={pending.length ? titled('Разобрать Inbox', 'inbox.review') : 'Нечего разбирать'} onclick={() => session.start()}>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.5l9 5.5-9 5.5z" /></svg>Разобрать</button>
    {/if}
    <button class="plus" aria-label={titled('Новая задача в Inbox', 'capture')} title={titled('Новая задача в Inbox', 'capture')} onclick={() => ctx.commands.run('capture.open')}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
    </button>
  </div>

  {#if !file}
    <div class="stub">
      <svg class="box" width="40" height="40" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l2-7h10l2 7v5H3zM3 11h4l1 2h4l1-2h4" /></svg>
      <div class="st">Inbox пока не настроен</div>
      {#if missing}<div class="warn">Файл {shortName(data.chosen!)} не найден</div>{/if}
      <div class="sd">Выберите файл, в который будут попадать быстрые задачи</div>
      <button class="primary" onclick={() => ctx.commands.run('inbox.pickFile')}>Выбрать файл…</button>
      <button class="link" onclick={() => ctx.commands.run('inbox.createFile')}>Создать inbox.org в рабочей папке</button>
    </div>
  {:else if review}
    <div class="prog">
      <div class="pt"><span>Разобрано {handled} из {review.items.length}</span><span>{review.cur < 0 ? (skippedN ? `${skippedN} ${skippedN === 1 ? 'пропущена' : 'пропущено'}` : 'всё') : `осталось ${review.items.length - handled}`}</span></div>
      <div class="segs" aria-hidden="true">{#each review.items as it, i (it.id)}<span style:background={segColor(it, i)}></span>{/each}</div>
    </div>
    <div class="list rlist" role="listbox" aria-label="Очередь разбора">
      {#each review.items as it, i (it.id)}
        {@const c = MARK[it.result ?? '']}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="rrow" class:cur={i === review.cur} class:closed={closed(it)} role="option" aria-selected={i === review.cur} tabindex="-1" onclick={() => session.show(i)}>
          <span class="mark" class:skip={it.result === 'skip'} style:background={c ?? 'transparent'} style:border-color={c ?? (it.result === 'skip' ? 'var(--wait)' : 'var(--fg3)')} aria-hidden="true">
            {#if it.result === 'done'}<svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
            {:else if it.result === 'cancel' || it.result === 'delete'}<svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>
            {:else if it.result === 'next'}<svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h11M11 5l5 5-5 5" /></svg>
            {:else if it.result === 'move'}<svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h11M11 6l4 4-4 4" /></svg>
            {:else if it.result === 'defer'}<svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M10 5v5l3 2" /></svg>{/if}
          </span>
          <div class="main">
            <span class="t" class:strike={it.result === 'done' || it.result === 'cancel' || it.result === 'delete'}>{it.title}</span>
            <span class="sub" style:color={it.result === 'skip' ? 'var(--wait)' : it.result === 'move' || it.result === 'next' ? 'var(--acc)' : it.result === 'defer' ? 'var(--ts)' : ''}>{subLabel(it, i === review.cur)}</span>
          </div>
          <span class="when" class:stale={isStale(it)}>{ageShort(it.created)}</span>
        </div>
      {/each}
    </div>
    <div class="foot">Порядок — {cfg.reviewOrder === 'old' ? 'от старых к новым' : 'от новых к старым'}. Задача старше {days(cfg.stale)} помечена цветом.</div>
  {:else if !items.length}
    <div class="empty">Inbox разобран: задач нет.<br />Новая — кнопкой «+»{ctx.commands.keyOf('capture') ? ` или ${ctx.commands.keyOf('capture')}` : ''}.</div>
  {:else}
    {#if pending.length}
      <div class="prog"><div class="pt"><span>{tasksWord(pending.length)}</span>{#if oldest}<span>самой старой {days(oldest)}</span>{/if}</div></div>
    {/if}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="list" bind:this={list} role="listbox" tabindex="0" aria-label="Задачи Inbox" aria-activedescendant="ib-{sel}" onkeydown={key}>
      {#each items as it, i (it.line + ':' + it.title)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="row" class:sel={i === sel} class:leaving={leaving === it.line} id="ib-{i}" role="option" aria-selected={i === sel} data-line={it.line}
          onclick={() => { sel = i; list?.focus(); }} ondblclick={() => openItem(it)} oncontextmenu={(e) => context(e, it, i)}>
          <button class="check" aria-label="Готово: {it.title}" title="Готово" onclick={(e) => { e.stopPropagation(); void done(it); }}></button>
          <div class="main">
            <div class="line1">
              <span class="t">{it.title}</span>
              <span class="when">{ago(it.created, now)}</span>
              <div class="acts">
                <button aria-label="Перенести" title="Перенести…" onclick={(e) => { e.stopPropagation(); refile(it); }}>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10h11M10 5.5l4.5 4.5-4.5 4.5M17 4v12" /></svg>
                </button>
                <button aria-label="Дата" title="Дата…" onclick={(e) => { e.stopPropagation(); sel = i; openDate(e, it); }}>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="2.5" /><path d="M3 8h14M7 2.5v3M13 2.5v3" /></svg>
                </button>
                <button aria-label="Удалить" title="Удалить" onclick={(e) => { e.stopPropagation(); void del(it); }}>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" /></svg>
                </button>
              </div>
            </div>
            {#if cfg.details && it.details}<div class="det">{it.details}</div>{/if}
          </div>
        </div>
      {/each}
    </div>
    <div class="foot">↩ открыть · ⌘Z отменить · правый клик — все действия</div>
  {/if}
</div>

{#if datePop}
  {@const dp = datePop}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onmousedown={() => (datePop = null)}></div>
  <div class="pop" role="dialog" aria-label="Дата задачи" style="left:{dp.x}px;top:{dp.y}px">
    <div class="seg" role="radiogroup" aria-label="Какая дата">
      <button role="radio" aria-checked={dp.kind === 'SCHEDULED'} class:on={dp.kind === 'SCHEDULED'} onclick={() => (dp.kind = 'SCHEDULED')}>Запланировано</button>
      <button role="radio" aria-checked={dp.kind === 'DEADLINE'} class:on={dp.kind === 'DEADLINE'} onclick={() => (dp.kind = 'DEADLINE')}>Дедлайн</button>
    </div>
    <button class="q" onclick={() => setDate(day(0))}>Сегодня</button>
    <button class="q" onclick={() => setDate(day(1))}>Завтра</button>
    <button class="q" onclick={() => setDate(thisWeek())}>На неделе <span class="qd">{thisWeek().toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'short' })}</span></button>
    <label class="cal">Дата <input type="date" value={iso(day(0))} aria-label="Выбрать дату" onchange={(e) => { const v = e.currentTarget.value; if (v) { const [y, m, d] = v.split('-').map(Number); void setDate(new Date(y, m - 1, d)); } }} /></label>
    <button class="q rm" onclick={() => setDate(null)}>Убрать дату</button>
  </div>
{/if}

{#if confirmDel}
  {@const it = confirmDel}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal" onmousedown={() => (confirmDel = null)}>
    <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Удаление задачи" onmousedown={(e) => e.stopPropagation()}>
      <h2>Удалить задачу «{it.title}» вместе с деталями?</h2>
      <p>Заголовок удаляется из файла со всем, что под ним. Вернуть можно ⌘Z в списке Inbox.</p>
      <div class="btns">
        <button onclick={() => (confirmDel = null)}>Отмена</button>
        <button class="danger-b" onclick={() => del(it)}>Удалить</button>
      </div>
    </div>
  </div>
{/if}


<style>
  .inbox { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .head { display: flex; align-items: center; gap: 8px; padding: 8px 8px 4px 14px; }
  .title { font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .title { flex: 1; min-width: 0; }
  .rv { display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: var(--acc); color: var(--onacc); font-size: 12.5px; font-weight: 600; }
  .rv:disabled { opacity: 0.45; }
  .rv.stop { border: 1px solid var(--line); background: var(--bg); color: var(--fg); }
  .prog { display: flex; flex-direction: column; gap: 6px; padding: 0 14px 10px; }
  .pt { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--fg2); }
  .segs { display: flex; gap: 3px; height: 4px; }
  .segs span { flex: 1; border-radius: 2px; }
  .rlist { border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 1px; }
  .rrow { display: flex; align-items: flex-start; gap: 8px; min-height: 44px; padding: 6px 8px; border-radius: 7px; cursor: default; }
  .rrow:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
  .rrow.cur { background: var(--sel); box-shadow: inset 0 0 0 1px var(--acc); }
  .rrow.cur .t { font-weight: 600; }
  .rrow.closed .t { color: var(--fg2); }
  .rrow .main { gap: 2px; }
  .mark { flex: 0 0 16px; height: 16px; margin-top: 1px; box-sizing: border-box; border-radius: 8px; border: 1.5px solid; color: var(--onacc); display: flex; align-items: center; justify-content: center; }
  .strike { text-decoration: line-through; }
  .sub { font-size: 11.5px; color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when.stale { color: var(--wait); }
  .plus { margin-left: 0; width: 26px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; }
  .plus:hover { background: var(--field); color: var(--acc); }
  .stub { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 20px 18px 60px; text-align: center; }
  .box { color: var(--fg3); margin-bottom: 4px; }
  .st { font-size: 14px; font-weight: 600; }
  .sd { font-size: 12px; color: var(--fg2); line-height: 1.45; max-width: 220px; }
  .warn { font-size: 12px; color: var(--wait); }
  .primary { margin-top: 6px; height: 28px; padding: 0 16px; border: 0; border-radius: 6px; background: var(--acc); color: var(--onacc); font-weight: 600; font-size: 12.5px; }
  .link { border: 0; background: none; color: var(--acc); font-size: 12px; padding: 2px; }
  .empty { padding: 18px 16px; font-size: 12.5px; color: var(--fg2); line-height: 1.5; }
  .list { flex: 1; min-height: 0; overflow: auto; padding: 2px 6px 8px; outline: none; }
  .row { position: relative; display: flex; align-items: flex-start; gap: 9px; padding: 7px 8px; border-radius: 7px; transition: opacity 0.18s, transform 0.18s; }
  .row:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
  .row.sel { background: var(--sel); }
  .list:focus-visible .row.sel { box-shadow: inset 0 0 0 1.5px var(--acc); }
  .row.leaving { opacity: 0; transform: translateX(12px); }
  @media (prefers-reduced-motion: reduce) { .row { transition: none; } }
  .check { flex: 0 0 15px; width: 15px; height: 15px; margin-top: 1px; padding: 0; border: 1.5px solid var(--fg3); border-radius: 4px; background: transparent; }
  .check:hover { border-color: var(--done); background: color-mix(in srgb, var(--done) 18%, transparent); }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .line1 { display: flex; align-items: baseline; gap: 8px; }
  .t { flex: 1; min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { flex: 0 0 auto; font-size: 11px; color: var(--fg3); }
  .det { font-size: 11.5px; color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* on hover and on the selected row the actions take the place of the time */
  .acts { flex: 0 0 auto; display: none; gap: 2px; margin: -3px -2px -3px 0; }
  .row:hover .acts, .row.sel .acts { display: flex; }
  .row:hover .when, .row.sel .when { display: none; }
  .acts button { width: 24px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; }
  .acts button:hover { background: var(--field); color: var(--acc); }
  .foot { padding: 6px 14px 8px; font-size: 11px; color: var(--fg3); border-top: 1px solid var(--line); }
  .scrim { position: fixed; inset: 0; z-index: 90; }
  .pop { position: fixed; z-index: 91; width: 240px; padding: 8px; display: flex; flex-direction: column; gap: 2px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25); font-size: 13px; }
  .seg { display: flex; padding: 2px; margin-bottom: 4px; background: var(--field); border-radius: 7px; gap: 2px; }
  .seg button { flex: 1; height: 24px; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 12px; }
  .seg button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); font-weight: 500; }
  .q { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; text-align: left; font-size: 13px; color: var(--fg); }
  .q:hover { background: var(--acc); color: var(--onacc); }
  .qd { margin-left: auto; font-size: 11.5px; color: var(--fg3); }
  .q:hover .qd { color: inherit; }
  .q.rm { color: var(--todo); }
  .cal { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 8px; font-size: 13px; }
  .cal input { height: 26px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); padding: 0 6px; font-size: 12.5px; }
  .modal { position: fixed; inset: 0; z-index: 110; background: rgba(0, 0, 0, 0.28); display: flex; align-items: flex-start; justify-content: center; padding-top: 14vh; }
  .dlg { width: 420px; max-width: calc(100% - 32px); padding: 18px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35); }
  .dlg h2 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  .dlg p { margin: 0 0 14px; color: var(--fg2); line-height: 1.45; font-size: 12.5px; }
  .btns { display: flex; justify-content: flex-end; gap: 8px; }
  .btns button { height: 28px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--field); }
  .btns .danger-b { background: var(--todo); color: var(--onacc); font-weight: 600; }
</style>

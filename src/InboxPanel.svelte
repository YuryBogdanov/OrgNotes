<script lang="ts">
  import { tick } from 'svelte';
  import { store } from './store.svelte';
  import { ago, type InboxItem } from './inbox';
  import { displayName } from './names';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';

  // The navigator in the «Inbox» mode: the unsorted tasks of the Inbox file and what to do with them — open, move,
  // date, done, delete. Not set up yet (or the file is gone): a stub to choose or create the file.
  const cfg = $derived(store.inboxCfg);
  const file = $derived(store.inboxFile);
  const items = $derived(store.inboxList);
  const missing = $derived(!!cfg.file && !file);

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

  let leaving = $state<number | null>(null); // the line of a task going away («Готово»: a short fade)
  async function done(it: InboxItem) {
    leaving = it.line;
    await new Promise((r) => setTimeout(r, 180));
    leaving = null;
    await store.inboxDone(it);
    list?.focus();
  }
  let confirmDel = $state<InboxItem | null>(null);
  async function del(it: InboxItem) {
    if (it.hasDetails && confirmDel !== it) {
      confirmDel = it;
      return;
    }
    confirmDel = null;
    await store.inboxDelete(it);
    list?.focus();
  }
  const refile = (it: InboxItem) => store.startRefile('inbox', it);

  // ---- the date popover ----------------------------------------------------------------------------------------
  let datePop = $state<{ it: InboxItem; x: number; y: number; kind: 'SCHEDULED' | 'DEADLINE' } | null>(null);
  function openDate(e: MouseEvent, it: InboxItem) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
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
    if (p) await store.inboxDate(p.it, p.kind, d);
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
      store.openInboxItem(it);
    } else if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      void store.undoInbox();
    }
  }
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  function context(e: MouseEvent, it: InboxItem, i: number) {
    e.preventDefault();
    sel = i;
    const at = e;
    menu = {
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Открыть', action: () => store.openInboxItem(it) },
        { label: 'Перенести…', action: () => refile(it) },
        { label: 'Дата…', action: () => openDate(at, it) },
        { label: 'Готово', action: () => void done(it) },
        'sep',
        { label: 'Удалить…', danger: true, action: () => void del(it) },
      ],
    };
  }
</script>

<div class="inbox">
  <div class="head">
    <span class="title">INBOX</span>
    {#if file}<span class="fname" title={file.name}>{displayName(file.name)}</span>{/if}
    <button class="plus" aria-label="Новая задача в Inbox (⇧⌘I)" title="Новая задача в Inbox (⇧⌘I)" onclick={() => store.openCapture()}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
    </button>
  </div>

  {#if !file}
    <div class="stub">
      <svg class="box" width="40" height="40" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l2-7h10l2 7v5H3zM3 11h4l1 2h4l1-2h4" /></svg>
      <div class="st">Inbox пока не настроен</div>
      {#if missing}<div class="warn">Файл {displayName(cfg.file!)} не найден</div>{/if}
      <div class="sd">Выберите файл, в который будут попадать быстрые задачи</div>
      <button class="primary" onclick={() => (store.pickInbox = Date.now())}>Выбрать файл…</button>
      <button class="link" onclick={() => store.createInboxFile()}>Создать inbox.org в рабочей папке</button>
    </div>
  {:else if !items.length}
    <div class="empty">Inbox разобран: задач нет.<br />Новая — кнопкой «+» или ⇧⌘I.</div>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="list" bind:this={list} role="listbox" tabindex="0" aria-label="Задачи Inbox" aria-activedescendant="ib-{sel}" onkeydown={key}>
      {#each items as it, i (it.line + ':' + it.title)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="row" class:sel={i === sel} class:leaving={leaving === it.line || store.inboxLeaving === it.line} id="ib-{i}" role="option" aria-selected={i === sel} data-line={it.line}
          onclick={() => { sel = i; list?.focus(); }} ondblclick={() => store.openInboxItem(it)} oncontextmenu={(e) => context(e, it, i)}>
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

{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}

<style>
  .inbox { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .head { display: flex; align-items: center; gap: 8px; padding: 8px 8px 4px 14px; }
  .title { font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .fname { flex: 1; min-width: 0; font-size: 11.5px; color: var(--fg3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plus { margin-left: auto; width: 26px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; }
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

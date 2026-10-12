<script lang="ts">
  import { store } from './store.svelte';
  import { headingAt } from './org';
  import Editor from './Editor.svelte';
  import Agenda from './Agenda.svelte';
  import Review from './Review.svelte';
  import RichMenu from './RichMenu.svelte';
  import FindBar from './FindBar.svelte';
  import { setPlanning, weekdayNames } from './edits';
  import type { RichPick } from './orgRich';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import { parseHeadings } from './org';
  import { targetOf, type Tab } from './layout';
  import { displayName, displayPath } from './names';

  // One editor pane: an accent bar when active (only with two panes: alone it is always the active one), its own tabs, and the content of the active tab.
  let { pi }: { pi: number } = $props();

  const pane = $derived(store.layout.panes[pi]);
  const tab = $derived(pane?.tabs[pane.active]);
  const active = $derived(store.layout.active === pi);
  const two = $derived(store.layout.panes.length > 1);
  const file = $derived(store.fileOf(tab));
  const crumbs = $derived.by(() => {
    if (!file || !tab) return [] as string[];
    const h = file.headings[headingAt(file.headings, tab.cursor.line)];
    return h ? [...h.path, h.title] : [];
  });
  const label = (t: Tab) => (t.kind === 'agenda' ? 'Агенда' : t.kind === 'review' ? 'Разбор Inbox' : t.kind === 'untitled' ? (t.title ?? 'Без названия') : displayName(t.path ?? ''));
  // a file deleted on disk stays open: an italic name, and the tooltip says why
  const gone = (t: Tab) => t.kind === 'file' && !!store.orphans[t.path ?? ''];
  const dirty = (t: Tab) => {
    if (t.kind === 'untitled') return !!t.text?.trim(); // spaces and blank lines are not worth a dot
    const f = store.fileOf(t);
    return !!f && f.text !== f.disk;
  };
  // an untitled tab shows heading crumbs only once its text has a heading
  const draftCrumbs = $derived.by(() => {
    if (tab?.kind !== 'untitled' || !tab.text) return [] as string[];
    const hs = parseHeadings(tab.text, store.untitledWf);
    let k = -1;
    for (let i = 0; i < hs.length; i++) if (hs[i].line <= tab.cursor.line) k = i;
    const h = hs[k];
    return h ? [...h.path, h.title] : [];
  });

  // ---- ⌘F: this pane's fb (it stays across the tabs of the pane; the other pane has its own) -------------------
  let fb = $state({ open: false, q: '', go: 0, dir: 1 as 1 | -1, at: null as number | null, global: false, focusN: 0 });
  let found = $state<{ total: number; cur: number; folded: number; wrapped: boolean } | null>(null);
  let api: { selection: () => string } | null = null;
  let lastReq = 0;
  const findProp = $derived(fb.q ? { q: fb.q, cs: store.findCase, word: store.findWord, show: fb.open, at: fb.at, go: fb.go, dir: fb.dir } : null);
  const oneLine = () => {
    const s = api?.selection() ?? '';
    return s && !s.includes('\n') ? s : '';
  };
  const focusText = () => requestAnimationFrame(() => document.querySelector<HTMLElement>(`section.pane[data-pane="${pi}"] .cm-content`)?.focus());
  function step(dir: 1 | -1) {
    if (!fb.q) return void openBar();
    fb.at = null;
    fb.dir = dir;
    fb.go++;
  }
  function openBar() {
    const s = oneLine();
    if (s) fb.q = s;
    fb.at = null;
    fb.global = false;
    fb.open = true;
    fb.focusN++;
  }
  function closeBar() {
    fb.open = false;
    fb.global = false;
    focusText();
  }
  $effect(() => {
    const r = store.findReq;
    if (!r || r.pane !== pi || r.n === lastReq) return;
    lastReq = r.n;
    if (r.kind === 'open') openBar();
    else if (r.kind === 'next' || r.kind === 'prev') step(r.kind === 'next' ? 1 : -1);
    else if (r.kind === 'useSel') {
      const s = oneLine();
      if (s) {
        fb.q = s;
        fb.at = null;
      }
    } else if (r.kind === 'jump' && r.at && r.q) {
      // from the search in every file: the file is open now; the match there becomes the current one
      const f = store.files.find((x) => x.path === r.at!.path);
      if (!f) return;
      const lines = f.text.split('\n');
      let pos = 0;
      for (let k = 0; k < r.at.line; k++) pos += lines[k].length + 1;
      Object.assign(fb, { q: r.q, at: pos + r.at.col, open: true, global: true });
    }
  });

  let richPick = $state<{ pick: RichPick; path: string } | null>(null); // a click on a drawn status or priority
  /** A drawn date opens the palette's calendar for its heading; a status or a priority, a small menu. */
  function richChoice(pick: RichPick, path: string) {
    if (pick.kind !== 'date') return void (richPick = { pick, path });
    const f = store.files.find((x) => x.path === path);
    const h = f?.headings.find((x) => x.line === pick.line);
    if (!f || !h) return;
    const kind = pick.date ?? 'SCHEDULED';
    const old = new RegExp(`${kind}:\\s*(<[^>]*>)`).exec(f.text.split('\n')[h.line + 1] ?? '')?.[1];
    store.openCalendar({
      kind, initial: pick.value ?? new Date(), current: pick.value ?? null, old, names: weekdayNames(f.text), plate: { kind: 'heading', h, file: f },
      pick: (d) => store.patchAt(path, pick.line, (t, hh) => setPlanning(t, hh, kind, d)),
    });
  }

  // ---- the tab context menu ------------------------------------------------------------------
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let menuTab = $state<string | null>(null); // highlighted, with its cross, while the menu is open
  function tabMenu(e: MouseEvent, t: Tab, ti: number) {
    e.preventDefault();
    const to = targetOf(store.layout, pi);
    const arrow = to > pi ? '→' : '←';
    const hasFile = t.kind === 'file';
    const items: MenuItem[] = [
      { label: 'Закрыть', shortcut: '⌘W', action: () => store.closeTab(pi, idx(t)) },
      { label: 'Закрыть остальные', shortcut: '⌥⌘W', disabled: pane.tabs.length < 2, action: () => store.closeOthers(pi, idx(t)) },
      'sep',
      { label: 'Переместить в соседний редактор', shortcut: `⌃⌘${arrow}`, disabled: to < 0, action: () => store.moveTab(pi, idx(t)) },
      { label: 'Продублировать в соседнем редакторе', shortcut: `⌥⌃⌘${arrow}`, disabled: to < 0 || t.kind === 'untitled' || t.kind === 'review', action: () => store.duplicateTab(pi, idx(t)) },
    ];
    if (hasFile) {
      items.push('sep');
      items.push({ label: 'Показать в навигаторе', shortcut: '⇧⌘J', action: () => store.revealInNavigator(t) });
      items.push({ label: 'Скопировать путь', shortcut: '⌥⌘C', action: () => store.copyPath(t) });
    }
    menuTab = t.id;
    menu = { x: e.clientX, y: e.clientY, items };
    void ti;
  }
  const idx = (t: Tab) => pane.tabs.findIndex((x) => x.id === t.id);

  // ---- the tab row: scrolls when the tabs do not fit at their minimum width ---------------------------------
  let strip: HTMLDivElement | undefined = $state();
  let over = $state(false); // more tabs than room: the row scrolls and "⌵" lists them all
  let fadeL = $state(false);
  let fadeR = $state(false);
  function edges() {
    if (!strip) return;
    const max = strip.scrollWidth - strip.clientWidth;
    over = max > 1;
    fadeL = strip.scrollLeft > 1;
    fadeR = strip.scrollLeft < max - 1;
  }
  $effect(() => {
    if (!strip) return;
    const el = strip;
    const ro = new ResizeObserver(edges);
    ro.observe(el);
    // a mouse wheel scrolls the row sideways too (a trackpad already does)
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', wheel);
    };
  });
  // the active tab is always scrolled into view: a new one, one picked from the list or with the keyboard
  $effect(() => {
    const id = tab?.id;
    void pane.tabs.length;
    if (!id || !strip) return;
    queueMicrotask(() => {
      const el = strip?.querySelector<HTMLElement>(`[data-tab="${id}"]`);
      if (strip && el) {
        // clear of the faded edges, not just inside the row
        const FADE = 24;
        const left = el.offsetLeft; // the row is the tabs' offset parent
        const right = left + el.offsetWidth;
        if (left < strip.scrollLeft + FADE) strip.scrollLeft = left - FADE;
        else if (right > strip.scrollLeft + strip.clientWidth - FADE) strip.scrollLeft = right - strip.clientWidth + FADE;
      }
      edges();
    });
  });
  // a double click on the free part of the row (not on a tab) opens an untitled tab
  function stripDblClick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    if (el.closest('.tab') || el.closest('button')) return;
    store.newUntitled(pi);
  }
  function listMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const items: MenuItem[] = pane.tabs.map((t, ti) => ({
      label: t.kind === 'file' ? displayName(t.path ?? '') : label(t),
      icon: t.kind, italic: t.kind === 'untitled', dot: dirty(t), checked: ti === pane.active,
      action: () => store.activateTab(pi, ti),
    }));
    menu = { x: r.right - 240, y: r.bottom + 2, items };
  }

  // ---- the full path on disk after a second over a file tab ------------------------------------------------------
  let tip = $state<{ text: string; x: number; y: number } | null>(null);
  let tipTimer: ReturnType<typeof setTimeout> | undefined;
  function tipStart(e: MouseEvent, t: Tab) {
    tipEnd();
    if (t.kind !== 'file' || !t.path) return;
    const el = e.currentTarget as HTMLElement;
    tipTimer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      tip = { text: gone(t) ? `Файла нет на диске: ${t.path} · ⌘S создаст его снова` : t.path!, x: r.left, y: r.bottom + 4 };
    }, 1000);
  }
  function tipEnd() {
    clearTimeout(tipTimer);
    tip = null;
  }

  // ---- bottom bars: what goes when the pane is narrow -----------------------------------------------------------
  // Measured, not ellipsised: a hint or a label leaves whole, the cursor position and the save state never do.
  let font = $state('');
  const cv = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  const tw = (str: string) => {
    if (!cv || !font) return 0;
    cv.font = font;
    return Math.ceil(cv.measureText(str).width);
  };
  const GAP = 16; // .status gap
  let sw = $state(0); // the status bar's width
  const cursorText = $derived(tab ? `Стр. ${tab.cursor.line + 1}, кол. ${tab.cursor.col}` : '');
  const savedText = $derived(store.notice || (tab && gone(tab) ? 'Файла нет на диске' : store.saveState === 'saving' ? 'Сохранение…' : store.saveState === 'saved' ? 'Сохранено' : 'Только в памяти (браузер)'));
  const status = $derived.by(() => {
    const parts = file ? displayPath(file.name) : [];
    const name = parts[parts.length - 1] ?? '';
    const fixed = 28 + tw(cursorText) + tw(savedText) + 2 * GAP; // padding, cursor, saved, the gaps around the path
    const room = (org: boolean, utf: boolean) => sw - fixed - (org ? tw('Org') + GAP : 0) - (utf ? tw('UTF-8') + GAP : 0);
    // first the folders of the path go, from the start; then UTF-8, then Org
    const org = !font || tw(name) <= room(true, false);
    const utf = !font || tw(name) <= room(true, true);
    const r = room(org, utf);
    let path = name;
    for (let k = 0; k < parts.length - 1; k++) {
      const tail = parts.slice(k).join('/');
      const t = k ? '…/' + tail : tail;
      if (!font || tw(t) <= r) {
        path = t;
        break;
      }
    }
    return { org, utf, path };
  });
  let uw = $state(0); // the untitled bar's width
  let btnW = $state(0);
  const HINT = 'Файл появится на диске после «Сохранить как…»';
  const bar = $derived.by(() => {
    // dot 7 + gap + "Не сохранено" + gap + the button, inside 12 px padding; the hint goes first, then ⌘S
    const fixed = 24 + 7 + 10 + tw('Не сохранено') + 10 + btnW;
    const keys = tw('⌘S') + 8;
    return { keys: !font || fixed + keys <= uw, hint: !font || fixed + keys + 10 + tw(HINT) + 10 <= uw };
  });
  let bottom: HTMLElement | undefined = $state();
  $effect(() => {
    if (bottom && !font) font = getComputedStyle(bottom).font;
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section class="pane" class:active aria-label={active ? 'Активная панель' : 'Панель'} data-pane={pi}
  onmousedowncapture={() => store.setActivePane(pi)} onfocusin={() => store.setActivePane(pi)}>
  {#if two}<div class="accent" aria-hidden="true"></div>{/if}
  <div class="bar">
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="strip" class:fl={fadeL} class:fr={fadeR} role="tablist" aria-label="Вкладки" bind:this={strip} ondblclick={stripDblClick} onscroll={() => { edges(); tipEnd(); }}>
    {#each pane.tabs as t, ti (t.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="tab" class:on={ti === pane.active} class:dirty={dirty(t)} class:untitled={t.kind === 'untitled'} class:gone={gone(t)} class:menu={menuTab === t.id}
        role="tab" aria-selected={ti === pane.active} tabindex={ti === pane.active ? 0 : -1} data-tab={t.id}
        onmouseenter={(e) => tipStart(e, t)} onmouseleave={tipEnd} onmousedown={tipEnd}
        onclick={(e) => { if (e.ctrlKey) return tabMenu(e, t, ti); store.activateTab(pi, ti); }}
        oncontextmenu={(e) => tabMenu(e, t, ti)}
        onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); store.closeTab(pi, ti); } }}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); store.activateTab(pi, ti); } }}>
        {#if t.kind === 'untitled'}
          <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2.2 2" aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
        {:else if t.kind === 'agenda'}
          <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="2.5" /><path d="M3 8h14M7 2.5v3M13 2.5v3" /></svg>
        {:else if t.kind === 'review'}
          <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l2-7h10l2 7v5H3zM3 11h4l1 2h4l1-2h4" /></svg>
        {:else}
          <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
        {/if}
        <span class="lbl">{label(t)}</span>
        <span class="slot">
          <span class="dot" aria-hidden="true"></span>
          <button class="x" aria-label="Закрыть вкладку {label(t)}" title="Закрыть вкладку" tabindex="-1"
            onclick={(e) => { e.stopPropagation(); store.closeTab(pi, ti); }}>
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" /></svg>
          </button>
        </span>
      </div>
    {/each}
    <div class="fill"></div>
  </div>
  {#if over}
    <button class="more" aria-label="Все вкладки" aria-haspopup="menu" title="Все вкладки" onclick={listMenu}>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" /></svg>
    </button>
  {/if}
  </div>

  {#if tab?.kind === 'agenda'}
    <div class="content"><Agenda pane={pi} /></div>
  {:else if tab?.kind === 'review'}
    <div class="content"><Review {tab} /></div>
  {:else if file && tab}
    <div class="crumbs" aria-label="Заголовок">
      {#each crumbs as c, i}
        {#if i}<span class="sep" aria-hidden="true">›</span>{/if}<span class:last={i === crumbs.length - 1}>{c}</span>
      {/each}
      <div class="vt" role="group" aria-label="Вид текста">
        <button aria-pressed={!store.rich} class:on={!store.rich} onclick={() => store.setRich(false)}>Текст</button>
        <button aria-pressed={store.rich} class:on={store.rich} onclick={() => store.setRich(true)}>Оформление</button>
      </div>
    </div>
    {#if fb.open}
      <FindBar bind:q={() => fb.q, (v) => { fb.q = v; fb.at = null; fb.global = false; }} info={found} global={fb.global} focusN={fb.focusN}
        onnext={() => step(1)} onprev={() => step(-1)} onclose={closeBar} />
    {/if}
    <div class="ed">
      <Editor text={file.text} fileKey={tab.id + '|' + file.path} wf={file.wf} reveal={tab.reveal} initial={tab.cursor} resetOn={store.diskGen[file.path] ?? 0} levels={store.levels} drawers={store.foldDrawers} rich={store.rich} richNumbers={store.richNumbers}
        onrich={(pick) => richChoice(pick, file.path)} find={findProp} onfound={(i) => (found = i)} onapi={(a) => (api = a)}
        onchange={(t) => store.setText(t, file.path)} oncursor={(line, col) => store.setTabCursor(tab, line, col)} onfollow={(l) => store.follow(l)} />
    </div>
    {#if tab.fromAgenda}
      <div class="caption">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="2.5" /><path d="M3 8h14M7 2.5v3M13 2.5v3" /></svg>
        Открыто из агенды: <span class="ct">{tab.fromAgenda.title}</span>
      </div>
    {/if}
    <div class="status" bind:clientWidth={sw} bind:this={bottom}>
      <span class="keep">{cursorText}</span>{#if status.org}<span class="keep">Org</span>{/if}{#if status.utf}<span class="keep">UTF-8</span>{/if}
      <span class="grow keep">{savedText}</span>
      <span class="where" title={file.path}>{status.path}</span>
    </div>
  {:else if tab?.kind === 'untitled'}
    {#if draftCrumbs.length}
      <div class="crumbs" aria-label="Заголовок">
        {#each draftCrumbs as c, i}
          {#if i}<span class="sep" aria-hidden="true">›</span>{/if}<span class:last={i === draftCrumbs.length - 1}>{c}</span>
        {/each}
      </div>
    {/if}
    <div class="ed">
      <Editor text={tab.text ?? ''} fileKey={tab.id} wf={store.untitledWf} reveal={tab.reveal} initial={tab.cursor} hint="Начните писать…" levels={store.levels} drawers={store.foldDrawers}
        onchange={(t) => (tab.text = t)} oncursor={(line, col) => store.setTabCursor(tab, line, col)} onfollow={(l) => store.follow(l)} />
    </div>
    <div class="unsaved" bind:clientWidth={uw} bind:this={bottom}>
      <span class="odot" aria-hidden="true"></span>
      <span class="us">Не сохранено</span>
      {#if store.draftNotice}<span class="hint err">{store.draftNotice}</span>{:else if bar.hint}<span class="hint">{HINT}</span>{/if}
      <span class="usr">{#if bar.keys}<span>⌘S</span>{/if}<button bind:offsetWidth={btnW} onclick={() => store.saveAs(tab)}>Сохранить как…</button></span>
    </div>
  {:else}
    <div class="empty">
      <p>Нет открытых вкладок</p>
      <p class="sub">Выберите файл в навигаторе</p>
    </div>
  {/if}
</section>

{#if tip}
  <div class="tip" role="tooltip" style="left:{tip.x}px;top:{tip.y}px">{tip.text}</div>
{/if}
{#if richPick}<RichMenu pick={richPick.pick} path={richPick.path} onclose={() => (richPick = null)} />{/if}
{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => { menu = null; menuTab = null; }} />
{/if}

<style>
  .pane { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; background: var(--bg); }
  .accent { flex: 0 0 2px; background: transparent; }
  .pane.active .accent { background: var(--acc); }
  /* the line under the row is a shadow, so the active tab (drawn above it) joins the editor */
  .bar { flex: 0 0 34px; display: flex; align-items: stretch; background: var(--side); box-shadow: inset 0 -1px 0 var(--line); }
  .strip {
    position: relative;
    flex: 1 1 auto; min-width: 0; display: flex; align-items: flex-end; gap: 2px; padding: 0 8px;
    overflow-x: auto; overflow-y: hidden; scrollbar-width: none;
    --fl: 0px; --fr: 0px;
    -webkit-mask-image: linear-gradient(to right, transparent 0, #000 var(--fl), #000 calc(100% - var(--fr)), transparent 100%);
    mask-image: linear-gradient(to right, transparent 0, #000 var(--fl), #000 calc(100% - var(--fr)), transparent 100%);
  }
  .strip.fl { --fl: 24px; }
  .strip.fr { --fr: 24px; }
  .more { align-self: center; flex: 0 0 22px; height: 22px; margin: 0 6px 0 2px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; }
  .more:hover { background: var(--field); color: var(--fg); }
  .tip { position: fixed; z-index: 95; max-width: 520px; padding: 3px 7px; border-radius: 5px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); font-size: 11.5px; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18); pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .strip::-webkit-scrollbar { display: none; }
  .tab {
    position: relative; flex: 0 1 auto; min-width: 110px; max-width: 240px; height: 30px; display: flex; align-items: center; gap: 7px;
    padding: 0 6px 0 12px; border: 1px solid transparent; border-bottom: 0; border-radius: 7px 7px 0 0;
    font-size: 12.5px; color: var(--fg2); cursor: default;
  }
  .tab:hover:not(.on), .tab.menu:not(.on) { background: var(--field); color: var(--fg); }
  .tab.untitled .lbl, .tab.gone .lbl { font-style: italic; }
  .tab.menu .x { opacity: 1; }
  .tab.menu .dot { opacity: 0; }
  .tab.on { background: var(--bg); border-color: var(--line); color: var(--fg2); }
  .pane.active .tab.on { color: var(--fg); }
  .tab:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .ic { flex: 0 0 auto; color: var(--acc); }
  .tab:not(.on) .ic { color: var(--fg3); }
  .lbl { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* the slot is always there, so the tab does not change width on hover */
  .slot { position: relative; flex: 0 0 16px; width: 16px; height: 16px; margin-left: 2px; }
  .dot { position: absolute; left: 5px; top: 5px; width: 6px; height: 6px; border-radius: 3px; background: var(--fg2); opacity: 0; }
  .tab.dirty .dot { opacity: 1; }
  .x { position: absolute; inset: 0; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--fg2); display: flex; align-items: center; justify-content: center; opacity: 0; }
  .tab:hover .x { opacity: 1; }
  .tab:hover .dot { opacity: 0; }
  .x:hover { background: rgba(128, 128, 128, 0.28); }
  .fill { flex: 1 1 auto; align-self: stretch; min-width: 12px; }
  .vt { margin-left: auto; flex: 0 0 auto; display: flex; padding: 1px; background: var(--field); border-radius: 7px; gap: 2px; }
  .vt button { height: 19px; padding: 0 9px; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 11.5px; }
  .vt button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); }
  .crumbs { flex: 0 0 24px; display: flex; align-items: center; gap: 6px; padding: 0 12px; font-size: 11.5px; color: var(--fg2); border-bottom: 1px solid var(--line); white-space: nowrap; overflow: hidden; }
  .crumbs .sep { color: var(--fg3); }
  .crumbs .last { color: var(--fg); }
  .ed { flex: 1; min-height: 0; }
  .content { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .caption { flex: 0 0 28px; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); }
  .caption .ct { color: var(--fg); }
  .status { flex: 0 0 24px; display: flex; align-items: center; gap: 16px; padding: 0 14px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); white-space: nowrap; overflow: hidden; }
  .keep { flex: 0 0 auto; }
  .grow { margin-left: auto; }
  .where { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .unsaved .hint { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .unsaved .err { color: var(--todo); }
  .unsaved { flex: 0 0 30px; display: flex; align-items: center; gap: 10px; padding: 0 12px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); white-space: nowrap; overflow: hidden; }
  .odot { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 4px; background: var(--wait); }
  .us { flex: 0 0 auto; color: var(--fg); }
  .usr { flex: 0 0 auto; margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .usr button { height: 22px; padding: 0 10px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); border-radius: 5px; font-size: 11.5px; }
  .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--fg2); }
  .empty p { margin: 2px 0; }
  .empty .sub { font-size: 12px; color: var(--fg3); }
</style>

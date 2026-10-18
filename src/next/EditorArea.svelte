<script lang="ts">
  import { store } from '../store.svelte';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { plugins } from '../api/host.svelte';
  import { fileViewOf, viewOf } from '../views';
  import { fileTypeOf } from '../fileTypes.svelte';
  import { OFF_ICON, isCore, tabLabel } from '../tabLabels';
  import { pickDate } from '../richPick';
  import type { RichPick } from '../orgRich';
  import { touches } from '../touchIndex.svelte';
  import { narrowRangeOf } from '../narrowTab';
  import Editor from './Editor.svelte';
  import Structure from './Structure.svelte';
  import Today from './Today.svelte';
  import AgendaDay from './AgendaDay.svelte';
  import AgendaBlocks from './AgendaBlocks.svelte';
  import { TODAY } from '../todayState.svelte';
  import FileCard from './FileCard.svelte';
  import { FileCardsCtl, caretHeading } from './fileCards.svelte';
  import FindPanel from './FindPanel.svelte';
  import { nextPrefs } from '../nextPrefs.svelte';
  import { PluginFileView } from './bridges';
  import StatusMenu from './StatusMenu.svelte';
  import Compat from './Compat.svelte';
  import { fileReview } from './fileReview.svelte';
  import { iconOf } from '../api/manifest';
  import SessionCard from './SessionCard.svelte';
  import ReviewQueue from './ReviewQueue.svelte';
  import ReviewCalendar from './ReviewCalendar.svelte';
  import ListToast from './ListToast.svelte';
  import Menu from './ui/Menu.svelte';
  import type { MenuItem } from '../menuItems';

  // What the active tab shows in the new interface (ТЗ 42.5): a file — the editor (or a plugin's view of it, the
  // board, the canvas); an untitled tab — the editor on its text; a plugin's tab — its view; none — a word.
  // The agenda and the second pane come with later parts.
  const pane = $derived(store.layout.panes[0]);
  const tab = $derived(pane?.tabs[pane.active]);
  const file = $derived(store.fileOf(tab));
  const fview = $derived(tab?.kind === 'file' ? store.viewOf(tab) : '');
  let richPick = $state<{ pick: RichPick; path: string } | null>(null);
  // ⌃X N S (§5.8): the lines of the heading the tab is narrowed to; the heading gone, the narrowing goes
  const narrowed = $derived(file && tab?.narrow ? narrowRangeOf(file.headings, tab.narrow) : null);
  $effect(() => {
    if (tab?.narrow && file && !narrowed) store.widenTab(tab);
  });
  // ⌘F (§5.7): the query, its steps, the replacements; ⌥⌘F opens it with «Заменить на…»
  let fb = $state({ open: false, q: '', re: false, go: 0, dir: 1 as 1 | -1, at: null as number | null, focusN: 0, replacing: false, rep: null as { text: string; all: boolean; n: number } | null });
  let found = $state<{ total: number; cur: number; folded: number; wrapped: boolean } | null>(null);
  let api: { selection: () => string } | null = null;
  let lastReq = 0;
  const findProp = $derived(fb.q ? { q: fb.q, cs: store.findCase, word: store.findWord, re: fb.re, show: fb.open, at: fb.at, go: fb.go, dir: fb.dir, rep: fb.rep } : null);
  const oneLine = () => {
    const s = api?.selection() ?? '';
    return s && !s.includes('\n') ? s : '';
  };
  function openFind(replacing = false) {
    const s = oneLine();
    if (s) fb.q = s;
    fb.at = null;
    fb.open = true;
    fb.replacing = fb.replacing || replacing;
    fb.focusN++;
  }
  function step(dir: 1 | -1) {
    if (!fb.q) return void openFind();
    fb.at = null;
    fb.dir = dir;
    fb.go++;
  }
  function closeFind() {
    fb.open = false;
    fb.replacing = false;
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-ui="next"] .cm-content')?.focus({ preventScroll: true }));
  }
  $effect(() => {
    const r = store.findReq;
    if (!r || r.n === lastReq) return;
    lastReq = r.n;
    if (r.kind === 'open') openFind();
    else if (r.kind === 'replace') openFind(true);
    else if (r.kind === 'next' || r.kind === 'prev') step(r.kind === 'next' ? 1 : -1);
    else if (r.kind === 'useSel') {
      const s = oneLine();
      if (s) fb.q = s;
    } else if (r.kind === 'jump' && r.at && r.q) {
      // from the search in every file (the sidebar's «Поиск»): the file is open now; the match there is the current
      const f = store.files.find((x) => x.path === r.at!.path);
      if (!f) return;
      const lines = f.text.split('\n');
      let pos = 0;
      for (let k = 0; k < r.at.line; k++) pos += lines[k].length + 1;
      Object.assign(fb, { q: r.q, re: !!r.re, at: pos + r.at.col, open: true });
    }
  });
  // the strip's moves (ТЗ 46 §2), none with «Уменьшить движение»
  const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stripIn = $derived({ duration: still() ? 0 : 180, easing: cubicOut });
  const stripOut = $derived({ duration: still() ? 0 : 150, easing: cubicOut });
  const crumb = $derived(narrowed && file ? [file.name.replace(/\.org$/, '').split('/').pop()!, ...narrowed.path].join(' › ') : '');
  // «Структура» right of the editor (§7): on by the preference, and when the area is 900 pt wide or more
  let areaW = $state(0);
  const structure = $derived(nextPrefs.structure && areaW >= 900);
  // the plugins' cards of the file over «Структура» (ТЗ 44 §5–§7): the column 268 pt with one at least, else 220
  const cardsCtl = new FileCardsCtl(() => (structure && file && tab?.kind === 'file' && !fileViewOf(fview) && !fileTypeOf(tab.path) ? file.name : null));
  cardsCtl.effects();
  const caret = $derived.by(() => {
    void tab?.cursor.line;
    void file?.headings;
    return caretHeading();
  });
  // a review in the file in this tab (ТЗ 41 §1): its strip, its card first, its queue for «Структура»; the plugin's
  // own card of the file not shown meanwhile (ТЗ 46 §3)
  const session = $derived(fileReview.on && tab?.id === fileReview.tabId ? fileReview.run : null);
  const shownCards = $derived(session ? cardsCtl.cards.filter((c) => c.plugin !== session.plugin) : cardsCtl.cards);
  const sessionIcon = $derived(session ? (iconOf(plugins.manifest(session.plugin) ?? ({ contributes: { navSections: [], views: [], fileViews: [] } } as never)) ?? '') : '');
  const sessionNext = $derived(session?.spec.actions.find((a) => a.command && store.keyHint(a.command) === '⌘↩'));
  const colW = $derived(cardsCtl.cards.length || session ? 268 : 220);
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  function actsMenu(e: MouseEvent) {
    const r = session;
    const c = fileReview.card;
    if (!r || !c) return;
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const items: MenuItem[] = r.spec.actions.filter((a) => !a.hidden).map((a) => ({
      label: a.label + (a.sub ? ` · ${a.sub}` : ''), shortcut: a.command ? store.keyHint(a.command) || undefined : undefined,
      disabled: !!a.disabled && plugins.guard(r.plugin, () => a.disabled!(c.info), false), action: () => void plugins.reviewAct(a.id),
    }));
    items.push('sep', { label: '← Назад', shortcut: r.spec.backCommand ? store.keyHint(r.spec.backCommand) || undefined : undefined, disabled: r.cur === 0, action: () => fileReview.back() });
    menu = { x: b.left, y: b.bottom + 4, items };
  }
  // «Midterm.org · изменён 2 мин назад» (§5.2): the file's last change, as the index of touches knows it
  function eyebrow(): string | null {
    if (!file) return null;
    const name = file.name.split('/').pop()!;
    let at = 0;
    for (const r of Object.values(touches.records)) if (r.file === file.name && !r.approx && r.at > at) at = r.at;
    return at ? `${name} · изменён ${ago(at)}` : name;
  }
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  function ago(at: number) {
    const min = Math.round((Date.now() - at) / 60_000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} мин назад`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} ч назад`;
    const d = new Date(at);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
  function rich(pick: RichPick, path: string) {
    if (!pickDate(pick, path)) richPick = { pick, path };
  }
</script>

<div class="area">
  {#if tab?.kind === TODAY}
    <!-- «Сегодня» in the new style (ТЗ 45 §2) -->
    <div class="view"><Today pane={0} /></div>
  {:else if tab && !isCore(tab.kind)}
    {@const v = viewOf(tab.kind)}
    {#if v}
      <!-- «Сегодня», «Тег», a review, a plugin's view: old screens in the compatibility layer (ТЗ 43 §4) -->
      <div class="view"><Compat><v.component {tab} pane={0} /></Compat></div>
    {:else}
      {@const pe = plugins.pluginOfView(tab.kind)}
      <div class="word" role="status">
        <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={OFF_ICON} /></svg>
        <b>{pe?.manifest ? `Плагин «${pe.manifest.name}» выключен` : 'Функция выключена'}</b>
        <span>Вкладка «{tabLabel(tab)}» вернётся, когда {pe?.manifest ? 'плагин' : 'функцию'} включат.</span>
        {#if pe?.manifest && !pe.problems.length && !plugins.failed.has(pe.manifest.id)}<button onclick={() => void plugins.setEnabled(pe.manifest!.id, true)}>Включить</button>{/if}
      </div>
    {/if}
  {:else if tab && file && (fileViewOf(fview) || fileTypeOf(tab.path))}
    <div class="view"><Compat><PluginFileView id={fview} path={file.name} {tab} pane={0} /></Compat></div>
  {:else if file && tab}
    {#if narrowed}
      <!-- it comes out from the top in 180 ms, goes in 150; the column and the text move down and up with it (ТЗ 46 §2) -->
      <div class="narrow" role="status" aria-label={session ? session.spec.title : 'Сужено'} in:slide={stripIn} out:slide={stripOut}>
        {#if session}
          <!-- a review's: the plugin's icon, its word, the path; «⌘↩ дальше», «Закончить ⎋» (ТЗ 46 §2, ТЗ 41 §1.1) -->
          {#if sessionIcon}<svg class="si" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={sessionIcon} /></svg>{/if}
          <b>{session.spec.title.split(' ')[0]}</b><span class="np" title={crumb}>{crumb}</span>
          {#if fileReview.otherFile}<span class="chipf">другой файл</span>{/if}
          {#if !structure && session.cur >= 0}
            <!-- the column hidden (a narrow window, ⌥⌘0): the count and the card's actions here (ТЗ 46 §2) -->
            <span class="cnt">{session.cur + 1} из {session.refs.length}</span>
            <button class="acts" aria-haspopup="menu" onclick={(e) => actsMenu(e)}>Действия ▾</button>
          {/if}
          {#if sessionNext}<span class="k">{store.keyHint(sessionNext.command!)} дальше</span>{/if}
          <button onclick={() => fileReview.finish()}>Закончить <span class="kk">⎋</span></button>
        {:else}
          <b>Сужено</b><span class="np" title={crumb}>{crumb}</span>
          <span class="k">{store.keyHint('widen')}</span>
          <button onclick={() => store.widenTab(tab)}>Показать весь файл</button>
        {/if}
      </div>
    {/if}
    <div class="with grid" bind:clientWidth={areaW} style:--sw={structure ? `${colW}px` : '0px'}>
    <!-- the review's summary: typing in the text is done with it (ТЗ 46 §5); a change from outside is not -->
    <div class="ed" onkeydown={(e) => { if (session && session.cur < 0 && !e.metaKey && !e.ctrlKey && (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace')) fileReview.finish(); }} role="presentation">
      {#if fb.open}
        <FindPanel bind:q={() => fb.q, (v) => { fb.q = v; fb.at = null; }} bind:re={() => fb.re, (v) => (fb.re = v)} replacing={fb.replacing} info={found} focusN={fb.focusN}
          onnext={() => step(1)} onprev={() => step(-1)} onreplace={(text, all) => (fb.rep = { text, all, n: (fb.rep?.n ?? 0) + 1 })} onclose={closeFind} />
      {/if}
      <Editor text={file.text} fileKey={tab.id + '|' + file.path + (narrowed ? '|n:' + narrowed.title : '')}
        narrow={narrowed ? { line: narrowed.line, end: narrowed.end } : null} onnarrow={(l) => { if (tab.narrow) tab.narrow.line = l; if (session) plugins.reviewEdited(l); }}
        onnarrowTo={(l) => store.narrowTab(tab, l)} onwiden={() => store.widenTab(tab)}
        find={findProp} onfound={(i) => (found = i)} onapi={(a) => (api = a)} path={file.name} wf={file.wf} reveal={tab.reveal} initial={tab.cursor} initialTop={tab.top}
        ontop={(l) => store.setTabTop(tab, l)} initialFolds={tab.folds} onfolds={(l) => store.setTabFolds(tab, l)} resetOn={store.diskGen[file.path] ?? 0}
        levels={store.levels} drawers={store.foldDrawers} rich={store.rich} richNumbers={store.richNumbers} onrich={(p) => rich(p, file.path)} {eyebrow}
        onchange={(t) => store.setText(t, file.path)} oncursor={(line, col) => store.setTabCursor(tab, line, col)} onfollow={(l) => store.follow(l)} />
      <!-- an empty file in «Оформление» (§5.4): the word over the column, the caret still in it -->
      {#if store.rich && !file.text.trim()}<div class="empty" aria-hidden="true"><span class="et">Пустой файл</span><span>Начните с <code>* </code> — это заголовок</span></div>{/if}
    </div>
    {#if structure}
      <Structure range={narrowed} width={colW} queue={session ? queue : undefined}>
        {#snippet cards()}
          {#if session}<SessionCard />{#if session.spec.calendar && session.cur >= 0 && plugins.live('calendar')}<ReviewCalendar />{/if}{/if}
          {#each shownCards as c (c.id)}
            <FileCard card={c} path={file.name} heading={caret} folded={cardsCtl.folded.has(c.id)} ontoggle={() => cardsCtl.toggle(c.id)} />
          {/each}
        {/snippet}
      </Structure>
    {/if}
    </div>
  {:else if tab?.kind === 'untitled'}
    <div class="ed grid">
      <Editor text={tab.text ?? ''} fileKey={tab.id} wf={store.untitledWf} reveal={tab.reveal} initial={tab.cursor} hint="Начните писать…" levels={store.levels} drawers={store.foldDrawers}
        rich={store.rich} onchange={(t) => (tab.text = t)} oncursor={(line, col) => store.setTabCursor(tab, line, col)} onfollow={(l) => store.follow(l)} />
    </div>
  {:else if tab?.kind === 'agenda' && !store.agendaOf(tab)}
    <!-- the built-in «Агенда» in the mode «День» (ТЗ 45 §3.2) -->
    <div class="view"><AgendaDay pane={0} /></div>
  {:else if tab?.kind === 'agenda'}
    <!-- a custom agenda, «Неделя», «Сегодня», «Все задачи»: blocks in the new style (ТЗ 45 §3.3) -->
    <div class="view"><AgendaBlocks pane={0} /></div>
  {:else}
    <div class="word" role="status"><b class="title">Нет открытых вкладок</b><span>Откройте файл в сайдбаре или создайте новый.</span></div>
  {/if}
  <!-- the toast after a change in a list (ТЗ 48 §1): one, at the bottom of the tab's area -->
  <ListToast />
</div>
{#snippet queue()}<ReviewQueue />{/snippet}
{#if menu}<Menu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}
{#if richPick}<StatusMenu pick={richPick.pick} path={richPick.path} onclose={() => (richPick = null)} />{/if}

<style>
  .area { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .ed, .view { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .ed { position: relative; min-width: 0; }
  /* §7.1: the editor scrolls up to the window's edge, its bar there; «Структура» lies over the right part of it, the
     text kept clear of it by the scroller's padding (--sw, the column's width) */
  .with { position: relative; flex: 1; min-height: 0; display: flex; }
  .with :global(.cm-scroller) { padding-right: var(--sw); }
  /* the grid of 24 pt under the text and «Структура» alike (the mockup's PEditor, PEditorSrc): one ground, no seam */
  .grid {
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px);
    background-size: 24px 24px; background-position: -1px -1px;
  }
  /* the narrowing's strip (§5.8): 40 pt of the lamp over the column */
  .narrow { flex: 0 0 auto; height: 40px; overflow: hidden; display: flex; align-items: center; gap: 10px; padding: 0 20px; box-sizing: border-box; background: var(--lampsoft); border-bottom: 1px solid var(--lampline); font-size: 12.5px; color: var(--ink2); }
  .narrow b { color: var(--lampink); }
  .narrow .np { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .narrow .k { font: 11px var(--mono); color: var(--ink3); }
  .narrow .si { flex: 0 0 15px; color: var(--lampink); }
  .narrow .chipf { height: 20px; display: inline-flex; align-items: center; padding: 0 7px; border-radius: 5px; background: var(--chip2); color: var(--ink2); font-size: 11px; }
  .narrow .kk { font-size: 11px; opacity: 0.65; }
  .narrow .cnt { font-size: 12px; color: var(--ink2); white-space: nowrap; }
  .narrow button.acts { background: var(--chip2); }
  .narrow button { height: 26px; padding: 0 12px; border: 0; border-radius: 6px; background: var(--card); color: var(--ink); font: 12.5px var(--ui); }
  .empty { position: absolute; inset: 0 var(--sw, 0px) 0 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; pointer-events: none; color: var(--ink3); font: 500 17px var(--text); }
  .empty .et { font: 400 28px/1.2 var(--title); color: var(--ink2); }
  .empty code { padding: 0 4px; border-radius: 4px; font: 0.85em var(--mono); background: var(--chip); }
  .ed :global(.cm-editor) { height: 100%; }
  .word { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; color: var(--ink2); text-align: center; }
  .word b { color: var(--ink); font-size: 15px; }
  .word .title { font: 400 28px/1.2 var(--title); }
  .word span { max-width: 46ch; line-height: 1.5; }
  .word button { height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--lamp); color: var(--onlamp); font-weight: 600; }
</style>

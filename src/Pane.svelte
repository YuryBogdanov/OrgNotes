<script lang="ts">
  import { fitStatus, fitUntitledBar, UNTITLED_HINT } from './statusFit';
  import { store } from './store.svelte';
  import { headingAt } from './org';
  import Editor from './Editor.svelte';
  import Agenda from './Agenda.svelte';
  import { plugins } from './api/host.svelte';
  import { fileViewOf, viewOf } from './views';
  import PluginFileView from './PluginFileView.svelte';
  import { fileTypeOf } from './fileTypes.svelte';
  import RichMenu from './RichMenu.svelte';
  import FindBar from './FindBar.svelte';
  import PaneTabs from './PaneTabs.svelte';
  import { OFF_ICON, isCore as core, isGone as gone, tabLabel as label } from './tabLabels';
  import { setPlanning, weekdayNames } from './edits';
  import type { RichPick } from './orgRich';
  import { parseHeadings } from './org';
  import { displayPath } from './names';

  // One editor pane: an accent bar when active (only with two panes: alone it is always the active one), its own tabs, and the content of the active tab.
  let { pi }: { pi: number } = $props();

  const pane = $derived(store.layout.panes[pi]);
  const tab = $derived(pane?.tabs[pane.active]);
  const active = $derived(store.layout.active === pi);
  const two = $derived(store.layout.panes.length > 1);
  const file = $derived(store.fileOf(tab));
  // a view of the file a plugin draws («Доска», ТЗ 33); '' — the text
  const fview = $derived(tab?.kind === 'file' ? store.viewOf(tab) : '');
  const fviewSpec = $derived(fileViewOf(fview));
  // the file's name while its view is shown: kept through a reread of the files (the view is not drawn anew)
  let fviewPath = $state('');
  $effect(() => {
    if (file) fviewPath = file.name;
  });
  const crumbs = $derived.by(() => {
    if (!file || !tab) return [] as string[];
    const h = file.headings[headingAt(file.headings, tab.cursor.line)];
    return h ? [...h.path, h.title] : [];
  });
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
  const focusText = () => requestAnimationFrame(() => document.querySelector<HTMLElement>(`section.pane[data-pane="${pi}"] .cm-content`)?.focus({ preventScroll: true }));
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



  // ---- bottom bars: what goes when the pane is narrow -----------------------------------------------------------
  // Measured, not ellipsised: a hint or a label leaves whole, the cursor position and the save state never do.
  let font = $state('');
  const cv = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  const tw = (str: string) => {
    if (!cv || !font) return 0;
    cv.font = font;
    return Math.ceil(cv.measureText(str).width);
  };
  let sw = $state(0); // the status bar's width
  const cursorText = $derived(tab ? `Стр. ${tab.cursor.line + 1}, кол. ${tab.cursor.col}` : '');
  const savedText = $derived(store.notice || (tab && gone(tab) ? 'Файла нет на диске' : store.saveState === 'saving' ? 'Сохранение…' : store.saveState === 'saved' ? 'Сохранено' : 'Только в памяти (браузер)'));
  const status = $derived(fitStatus(file ? displayPath(file.name) : [], sw, cursorText, savedText, font ? tw : null));
  let uw = $state(0); // the untitled bar's width
  let btnW = $state(0);
  const bar = $derived(fitUntitledBar(uw, btnW, store.keyHint('save'), font ? tw : null));
  let bottom: HTMLElement | undefined = $state();
  $effect(() => {
    if (bottom && !font) font = getComputedStyle(bottom).font;
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section class="pane" class:active aria-label={active ? 'Активная панель' : 'Панель'} data-pane={pi}
  onmousedowncapture={() => store.setActivePane(pi)} onfocusin={() => store.setActivePane(pi)}>
  {#if two}<div class="accent" aria-hidden="true"></div>{/if}
  <PaneTabs {pi} />

  {#if tab?.kind === 'agenda'}
    <div class="content"><Agenda pane={pi} /></div>
  {:else if tab && !core(tab.kind)}
    {@const v = viewOf(tab.kind)}
    {#if v}
      <div class="content"><v.component {tab} pane={pi} /></div>
    {:else}
      {@const pe = plugins.pluginOfView(tab.kind)}
      <div class="content off" role="status">
        <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={OFF_ICON} /></svg>
        {#if pe?.manifest}
          <b>Плагин «{pe.manifest.name}» выключен</b>
          {#if pe.problems.length}<span>{pe.problems[0]}</span>
          {:else if plugins.failed.has(pe.manifest.id)}<span>После ошибки: {plugins.failed.get(pe.manifest.id)}</span>
          {:else}<span>Вкладка «{label(tab)}» вернётся, когда плагин включат.</span>
            <button class="on" onclick={() => void plugins.setEnabled(pe.manifest!.id, true)}>Включить</button>{/if}
        {:else}
          <b>Функция выключена</b>
          <span>Вкладка «{label(tab)}» появится снова, когда функцию включат.</span>
        {/if}
      </div>
    {/if}
  {:else if tab && (fviewSpec || fileTypeOf(tab.path)) && (file || fviewPath)}
    <!-- one component, not the spec's: a spec registered anew (the plugins declared again) must not draw the view anew -->
    <div class="content"><PluginFileView id={fview} path={file?.name ?? fviewPath} {tab} pane={pi} /></div>
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
      <Editor text={file.text} fileKey={tab.id + '|' + file.path} path={file.name} wf={file.wf} reveal={tab.reveal} initial={tab.cursor} initialTop={tab.top} ontop={(l) => store.setTabTop(tab, l)} initialFolds={tab.folds} onfolds={(l) => store.setTabFolds(tab, l)} resetOn={store.diskGen[file.path] ?? 0} levels={store.levels} drawers={store.foldDrawers} rich={store.rich} richNumbers={store.richNumbers}
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
      {#if store.draftNotice}<span class="hint err">{store.draftNotice}</span>{:else if bar.hint}<span class="hint">{UNTITLED_HINT}</span>{/if}
      <span class="usr">{#if bar.keys && store.keyHint('save')}<span>{store.keyHint('save')}</span>{/if}<button bind:offsetWidth={btnW} onclick={() => store.saveAs(tab)}>Сохранить как…</button></span>
    </div>
  {:else}
    <div class="empty">
      <p>Нет открытых вкладок</p>
      <p class="sub">Выберите файл в навигаторе</p>
    </div>
  {/if}
</section>

{#if richPick}<RichMenu pick={richPick.pick} path={richPick.path} onclose={() => (richPick = null)} />{/if}

<style>
  .pane { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; background: var(--bg); }
  .accent { flex: 0 0 2px; background: transparent; }
  .pane.active .accent { background: var(--acc); }
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
  .off { align-items: center; justify-content: center; gap: 8px; color: var(--fg2); text-align: center; padding: 24px; }
  .off b { color: var(--fg); font-size: 15px; }
  .off .on { margin-top: 6px; height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--acc); color: var(--onacc); font-weight: 600; }
</style>

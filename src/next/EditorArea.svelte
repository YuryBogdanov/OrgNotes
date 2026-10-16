<script lang="ts">
  import { store } from '../store.svelte';
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
  import { nextPrefs } from './prefs.svelte';
  import { PluginFileView, RichMenu } from './bridges';

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
  const crumb = $derived(narrowed && file ? [file.name.replace(/\.org$/, '').split('/').pop()!, ...narrowed.path].join(' › ') : '');
  // «Структура» right of the editor (§7): on by the preference, and when the area is 900 pt wide or more
  let areaW = $state(0);
  const structure = $derived(nextPrefs.structure && areaW >= 900);
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
  {#if tab && !isCore(tab.kind)}
    {@const v = viewOf(tab.kind)}
    {#if v}
      <div class="view"><v.component {tab} pane={0} /></div>
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
    <div class="view"><PluginFileView id={fview} path={file.name} {tab} pane={0} /></div>
  {:else if file && tab}
    {#if narrowed}
      <div class="narrow" role="status" aria-label="Сужено">
        <b>Сужено</b><span class="np" title={crumb}>{crumb}</span>
        <span class="k">{store.keyHint('widen')}</span>
        <button onclick={() => store.widenTab(tab)}>Показать весь файл</button>
      </div>
    {/if}
    <div class="with" bind:clientWidth={areaW}>
    <div class="ed">
      <Editor text={file.text} fileKey={tab.id + '|' + file.path + (narrowed ? '|n:' + narrowed.title : '')}
        narrow={narrowed ? { line: narrowed.line, end: narrowed.end } : null} onnarrow={(l) => { if (tab.narrow) tab.narrow.line = l; }}
        onnarrowTo={(l) => store.narrowTab(tab, l)} onwiden={() => store.widenTab(tab)} path={file.name} wf={file.wf} reveal={tab.reveal} initial={tab.cursor} initialTop={tab.top}
        ontop={(l) => store.setTabTop(tab, l)} initialFolds={tab.folds} onfolds={(l) => store.setTabFolds(tab, l)} resetOn={store.diskGen[file.path] ?? 0}
        levels={store.levels} drawers={store.foldDrawers} rich={store.rich} richNumbers={store.richNumbers} onrich={(p) => rich(p, file.path)} {eyebrow}
        onchange={(t) => store.setText(t, file.path)} oncursor={(line, col) => store.setTabCursor(tab, line, col)} onfollow={(l) => store.follow(l)} />
      <!-- an empty file in «Оформление» (§5.4): the word over the column, the caret still in it -->
      {#if store.rich && !file.text.trim()}<div class="empty" aria-hidden="true"><span class="et">Пустой файл</span><span>Начните с <code>* </code> — это заголовок</span></div>{/if}
    </div>
    {#if structure}<Structure range={narrowed} />{/if}
    </div>
  {:else if tab?.kind === 'untitled'}
    <div class="ed">
      <Editor text={tab.text ?? ''} fileKey={tab.id} wf={store.untitledWf} reveal={tab.reveal} initial={tab.cursor} hint="Начните писать…" levels={store.levels} drawers={store.foldDrawers}
        rich={store.rich} onchange={(t) => (tab.text = t)} oncursor={(line, col) => store.setTabCursor(tab, line, col)} onfollow={(l) => store.follow(l)} />
    </div>
  {:else if tab?.kind === 'agenda'}
    <div class="word" role="status"><b>Агенда</b><span>В новом интерфейсе агенда появится позже. Пока она есть в старом.</span></div>
  {:else}
    <div class="word" role="status"><b class="title">Нет открытых вкладок</b><span>Откройте файл в сайдбаре или создайте новый.</span></div>
  {/if}
</div>
{#if richPick}<RichMenu pick={richPick.pick} path={richPick.path} onclose={() => (richPick = null)} />{/if}

<style>
  .area { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .ed, .view { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .ed { position: relative; min-width: 0; }
  .with { flex: 1; min-height: 0; display: flex; }
  /* the narrowing's strip (§5.8): 40 pt of the lamp over the column */
  .narrow { flex: 0 0 40px; display: flex; align-items: center; gap: 10px; padding: 0 20px; box-sizing: border-box; background: var(--lampsoft); border-bottom: 1px solid var(--lampline); font-size: 12.5px; color: var(--ink2); }
  .narrow b { color: var(--lampink); }
  .narrow .np { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .narrow .k { font: 11px var(--mono); color: var(--ink3); }
  .narrow button { height: 26px; padding: 0 12px; border: 0; border-radius: 6px; background: var(--card); color: var(--ink); font: 12.5px var(--ui); }
  .empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; pointer-events: none; color: var(--ink3); font: 500 17px var(--text); }
  .empty .et { font: 400 28px/1.2 var(--title); color: var(--ink2); }
  .empty code { padding: 0 4px; border-radius: 4px; font: 0.85em var(--mono); background: var(--chip); }
  .ed :global(.cm-editor) { height: 100%; }
  .word { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; color: var(--ink2); text-align: center; }
  .word b { color: var(--ink); font-size: 15px; }
  .word .title { font: 400 28px/1.2 var(--title); }
  .word span { max-width: 46ch; line-height: 1.5; }
  .word button { height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--lamp); color: var(--onlamp); font-weight: 600; }
</style>

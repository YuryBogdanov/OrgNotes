<script lang="ts">
  import { store } from '../store.svelte';
  import { plugins } from '../api/host.svelte';
  import { fileViewOf, viewOf } from '../views';
  import { fileTypeOf } from '../fileTypes.svelte';
  import { OFF_ICON, isCore, tabLabel } from '../tabLabels';
  import { pickDate } from '../richPick';
  import type { RichPick } from '../orgRich';
  import Editor from './Editor.svelte';
  import { PluginFileView, RichMenu } from './bridges';

  // What the active tab shows in the new interface (ТЗ 42.5): a file — the editor (or a plugin's view of it, the
  // board, the canvas); an untitled tab — the editor on its text; a plugin's tab — its view; none — a word.
  // The agenda and the second pane come with later parts.
  const pane = $derived(store.layout.panes[0]);
  const tab = $derived(pane?.tabs[pane.active]);
  const file = $derived(store.fileOf(tab));
  const fview = $derived(tab?.kind === 'file' ? store.viewOf(tab) : '');
  let richPick = $state<{ pick: RichPick; path: string } | null>(null);
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
    <div class="ed">
      <Editor text={file.text} fileKey={tab.id + '|' + file.path} path={file.name} wf={file.wf} reveal={tab.reveal} initial={tab.cursor} initialTop={tab.top}
        ontop={(l) => store.setTabTop(tab, l)} initialFolds={tab.folds} onfolds={(l) => store.setTabFolds(tab, l)} resetOn={store.diskGen[file.path] ?? 0}
        levels={store.levels} drawers={store.foldDrawers} rich={store.rich} richNumbers={store.richNumbers} onrich={(p) => rich(p, file.path)}
        onchange={(t) => store.setText(t, file.path)} oncursor={(line, col) => store.setTabCursor(tab, line, col)} onfollow={(l) => store.follow(l)} />
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
  .ed :global(.cm-editor) { height: 100%; }
  .word { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; color: var(--ink2); text-align: center; }
  .word b { color: var(--ink); font-size: 15px; }
  .word .title { font: 400 28px/1.2 var(--title); }
  .word span { max-width: 46ch; line-height: 1.5; }
  .word button { height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--lamp); color: var(--onlamp); font-weight: 600; }
</style>

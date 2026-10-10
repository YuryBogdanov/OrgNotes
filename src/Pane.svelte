<script lang="ts">
  import { store } from './store.svelte';
  import { headingAt } from './org';
  import Editor from './Editor.svelte';
  import Agenda from './Agenda.svelte';

  // One editor pane: an accent bar when active, its own tabs, and the content of the active tab.
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
  const label = (t: (typeof pane.tabs)[number]) => (t.kind === 'agenda' ? 'Агенда' : (t.path ?? '').split('/').pop()!);
  const dirty = (t: (typeof pane.tabs)[number]) => {
    const f = store.fileOf(t);
    return !!f && f.text !== f.disk;
  };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section class="pane" class:active aria-label={active ? 'Активная панель' : 'Панель'} data-pane={pi}
  onmousedowncapture={() => store.setActivePane(pi)} onfocusin={() => store.setActivePane(pi)}>
  <div class="accent" aria-hidden="true"></div>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="strip" role="tablist" aria-label="Вкладки">
    {#each pane.tabs as t, ti (t.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="tab" class:on={ti === pane.active} class:dirty={dirty(t)} role="tab" aria-selected={ti === pane.active} tabindex={ti === pane.active ? 0 : -1}
        title={t.path ?? 'Агенда'} onclick={() => store.activateTab(pi, ti)}
        onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); store.closeTab(pi, ti); } }}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); store.activateTab(pi, ti); } }}>
        {#if t.kind === 'agenda'}
          <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="2.5" /><path d="M3 8h14M7 2.5v3M13 2.5v3" /></svg>
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
    {#if two}<button class="closepane" aria-label="Закрыть панель" title="Закрыть панель" onclick={() => store.closePane(pi)}>×</button>{/if}
  </div>

  {#if tab?.kind === 'agenda'}
    <div class="content"><Agenda pane={pi} /></div>
  {:else if file && tab}
    <div class="crumbs" aria-label="Заголовок">
      {#each crumbs as c, i}
        {#if i}<span class="sep" aria-hidden="true">›</span>{/if}<span class:last={i === crumbs.length - 1}>{c}</span>
      {/each}
    </div>
    <div class="ed">
      <Editor text={file.text} fileKey={tab.id + '|' + file.path} wf={file.wf} reveal={tab.reveal} initial={tab.cursor}
        onchange={(t) => store.setText(t, file.path)} oncursor={(line, col) => store.setTabCursor(tab, line, col)} onfollow={(l) => store.follow(l)} />
    </div>
    {#if tab.fromAgenda}
      <div class="caption">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="2.5" /><path d="M3 8h14M7 2.5v3M13 2.5v3" /></svg>
        Открыто из агенды: <span class="ct">{tab.fromAgenda.title}</span>
      </div>
    {/if}
    <div class="status">
      <span>Стр. {tab.cursor.line + 1}, кол. {tab.cursor.col}</span><span>Org</span><span>UTF-8</span>
      <span class="grow">{store.notice || (store.saveState === 'saving' ? 'Сохранение…' : store.saveState === 'saved' ? 'Сохранено' : 'Только в памяти (браузер)')}</span>
      <span>{file.name}</span>
    </div>
  {:else}
    <div class="empty">
      <p>Нет открытых вкладок</p>
      <p class="sub">Выберите файл в навигаторе</p>
    </div>
  {/if}
</section>

<style>
  .pane { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; background: var(--bg); }
  .accent { flex: 0 0 2px; background: transparent; }
  .pane.active .accent { background: var(--acc); }
  .strip { flex: 0 0 34px; display: flex; align-items: flex-end; gap: 2px; padding: 0 8px; background: var(--side); border-bottom: 1px solid var(--line); overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
  .strip::-webkit-scrollbar { display: none; }
  .tab {
    position: relative; flex: 0 1 auto; min-width: 100px; max-width: 240px; height: 30px; display: flex; align-items: center; gap: 7px;
    padding: 0 6px 0 12px; border: 1px solid transparent; border-bottom: 0; border-radius: 7px 7px 0 0; margin-bottom: -1px;
    font-size: 12.5px; color: var(--fg2); cursor: default;
  }
  .tab:hover:not(.on) { background: var(--field); color: var(--fg); }
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
  .closepane { align-self: center; flex: 0 0 24px; width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--fg3); font-size: 16px; line-height: 1; padding: 0; margin-bottom: 3px; }
  .closepane:hover { background: var(--field); color: var(--fg); }
  .crumbs { flex: 0 0 24px; display: flex; align-items: center; gap: 6px; padding: 0 12px; font-size: 11.5px; color: var(--fg2); border-bottom: 1px solid var(--line); white-space: nowrap; overflow: hidden; }
  .crumbs .sep { color: var(--fg3); }
  .crumbs .last { color: var(--fg); }
  .ed { flex: 1; min-height: 0; }
  .content { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .caption { flex: 0 0 28px; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); }
  .caption .ct { color: var(--fg); }
  .status { flex: 0 0 24px; display: flex; align-items: center; gap: 16px; padding: 0 14px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); white-space: nowrap; overflow: hidden; }
  .grow { margin-left: auto; }
  .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--fg2); }
  .empty p { margin: 2px 0; }
  .empty .sub { font-size: 12px; color: var(--fg3); }
</style>

<script lang="ts">
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { store } from './store.svelte';
  import { settingsOf } from './views';
  import SchemaSettings from './SchemaSettings.svelte';
  import TagsSettings from './TagsSettings.svelte';
  import KeysSettings from './KeysSettings.svelte';
  import AppearanceSettings from './AppearanceSettings.svelte';
  import ThemeEditor from './ThemeEditor.svelte';
  import Picker from './Picker.svelte';
  import RemovePlugin from './RemovePlugin.svelte';
  import SettingsGeneral from './SettingsGeneral.svelte';
  import SettingsInbox from './SettingsInbox.svelte';
  import SettingsAgendas from './SettingsAgendas.svelte';
  import StatusesSettings from './StatusesSettings.svelte';
  import { iconOf, layerOpen, settingsSections, stepSection, currentSection } from './settingsNav.svelte';

  // The settings: a sheet over the main window (as the agenda builder), sections on the left. Changes apply at once.


  /** ⎋ closes (an open popover, dialog or edit takes it first), ⌘[ ⌘] go to the section before / after. */
  function key(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
      if (confirmAgenda) confirmAgenda = null;
      else if (!pickFile && !layerOpen()) store.closeSettings();
      e.preventDefault();
      return;
    }
    if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      e.preventDefault();
      step(e.code === 'BracketLeft' ? -1 : 1);
    }
  }
  const step = (d: -1 | 1, focus = false) => stepSection(sections, d, focus);
  function sideKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(e.key === 'ArrowUp' ? -1 : 1, true);
    }
  }
  // three groups (ТЗ 37): what comes with Panopticon, «ПЛАГИНЫ», «НАСТРОЙКИ ПЛАГИНОВ» — the plugins' own sections; a
  // plugin turned on while the sheet is open brings its section at once (the registry is reactive)
  const nav = $derived(settingsSections());
  const sections = $derived(nav.all);
  const HEADS: Record<string, string> = $derived({ ...(nav.plugins.length ? { Плагины: 'ПЛАГИНЫ' } : {}), ...(nav.ofPlugins.length ? { [nav.ofPlugins[0]]: 'НАСТРОЙКИ ПЛАГИНОВ' } : {}) });
  const READY = $derived(nav.ready);
  const tab = $derived(currentSection());
  // another section starts at its top
  let contentEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    void tab;
    if (contentEl) contentEl.scrollTop = 0;
  });

  let pickFile = $state(false); // Inbox's «Выбрать…»: the palette of files, the same as in the Inbox stub
  // ---- Агенды: «Мои агенды» -----------------------------------------------------------------------------
  let confirmAgenda = $state<{ id: string; name: string } | null>(null);
</script>

<svelte:window onkeydown={(e) => { if (!store.keyRecording) key(e); }} />

<div class="scrim" aria-hidden="true"></div>
<div class="win" role="dialog" aria-modal="true" aria-label="Настройки">
    <header>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="2.6" /><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" /></svg>
      <div class="ttl"><span class="t1">Настройки</span><span class="t2">{tab}{tab === 'Оформление' && store.themeEditing ? ' › Тема редактора' : ''}{store.settingsCrumb ? ` › ${store.settingsCrumb}` : ''}</span></div>
      <span class="live">Изменения применяются сразу</span>
      <button class="done-b" onclick={() => store.closeSettings()}>Готово</button>
    </header>
    <div class="main">
    <div class="sections" role="tablist" aria-orientation="vertical" aria-label="Разделы настроек" tabindex="-1" onkeydown={sideKey}>
      {#each sections as t (t)}
        {#if HEADS[t]}<div class="shead" role="presentation">{HEADS[t]}</div>{/if}
        <button role="tab" data-section={t} aria-selected={t === tab} tabindex={t === tab ? 0 : -1} class:on={t === tab} disabled={!READY.includes(t)} title={READY.includes(t) ? '' : 'Пока не реализовано'} onclick={() => store.showSection(t)}>
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={iconOf(t)} /></svg>
          <span>{t}</span>
          {#if settingsOf(t)?.dot?.()}<i class="updot" aria-hidden="true" title="Есть обновления"></i>{/if}
        </button>
      {/each}
      <div class="sidehelp">{store.keyHint('settings') || '⌘,'} — открыть · ⎋ — закрыть<br />⌘[ ⌘] — предыдущий / следующий раздел</div>
    </div>

    <div class="content" class:wide={tab === 'Статусы'} class:fill={tab === 'Оформление' && !!store.themeEditing} bind:this={contentEl}>
    {#if tab === 'Клавиши'}
      <div class="page"><KeysSettings /></div>
    {:else if tab === 'Оформление' && store.themeEditing}
      <ThemeEditor name={store.themeEditing} />
    {:else if tab === 'Оформление'}
      <div class="page"><AppearanceSettings /></div>
    {:else if tab === 'Inbox'}
      <div class="body"><SettingsInbox onpick={() => (pickFile = true)} /></div>
    {:else if tab === 'Теги'}
      <TagsSettings />
    {:else if settingsOf(tab)}
      {@const spec = settingsOf(tab)!}
      {#if spec.schema}<SchemaSettings schema={spec.schema} plugin={spec.plugin} />{:else if spec.component}<spec.component />{/if}
    {:else if tab === 'Агенды'}
      <div class="body"><SettingsAgendas onremove={(a) => (confirmAgenda = a)} /></div>
    {:else if tab === 'Основные'}
      <div class="body"><SettingsGeneral /></div>
    {:else}
      <StatusesSettings />
    {/if}
    </div>
    </div>


    {#if pickFile}<Picker onclose={() => (pickFile = false)} />{/if}

    {#if confirmAgenda}
      {@const id = confirmAgenda.id}
      <ConfirmDialog label="Удаление агенды" title="Удалить агенду «{confirmAgenda.name}»?" onclose={() => (confirmAgenda = null)} actions={[{ label: 'Удалить', kind: 'danger', run: () => void store.deleteAgenda(id) }]}>
        Задачи и файлы не изменятся: удаляется только сама агенда.
      </ConfirmDialog>
    {/if}

</div>
<RemovePlugin />
<style>
  /* a sheet over the main window, as the agenda builder: clicks on the dimmed window do nothing */
  .scrim { position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.42); }
  .win {
    position: fixed; z-index: 71; left: 50%; top: 36px; bottom: 36px; transform: translateX(-50%); width: min(1100px, calc(100% - 72px));
    display: grid; grid-template-rows: 56px minmax(0, 1fr); grid-template-columns: minmax(0, 1fr); border-radius: 12px; overflow: hidden; background: var(--bg); border: 1px solid var(--line);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
  }
  header { display: flex; align-items: center; gap: 12px; padding: 0 16px 0 22px; background: var(--bar); border-bottom: 1px solid var(--line); }
  .ttl { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
  .t1 { font-size: 15px; font-weight: 700; }
  .t2 { font-size: 11.5px; color: var(--fg2); }
  .live { font-size: 11.5px; color: var(--fg3); }
  .done-b { height: 28px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .done-b:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .main { min-height: 0; min-width: 0; display: flex; }
  .sections { flex: 0 0 210px; box-sizing: border-box; background: var(--side); border-right: 1px solid var(--line); padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; overflow: auto; outline: none; }
  .sections button { display: flex; align-items: center; gap: 10px; height: 32px; flex: 0 0 32px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: var(--fg); text-align: left; }
  .sections button svg { flex: 0 0 17px; }
  .sections button.on { background: var(--sel); color: var(--acc); font-weight: 600; }
  .sections button:disabled { opacity: 0.45; }
  .sections button:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .sidehelp { margin-top: auto; padding: 10px 8px 2px; font-size: 11px; color: var(--fg3); line-height: 1.45; }
  /* the section: a column up to 760 in the middle with its own scroll; the statuses take the whole width */
  .content { flex: 1 1 0; min-width: 0; min-height: 0; overflow: auto; }
  .content:not(.wide) > :global(*) { max-width: 760px; margin: 0 auto; box-sizing: border-box; }
  .content.wide { display: flex; }
  .content.fill { display: flex; flex-direction: column; overflow: hidden; }
  .content.fill > :global(*) { max-width: none; flex: 1 1 0; min-height: 0; }
  .page { padding: 20px 28px 32px; }
  .body { flex: 1; min-height: 0; display: flex; }
  /* a narrow window: the sections go to a strip on top */
  @media (max-width: 820px) {
    .main { flex-direction: column; }
    .sections { flex: 0 0 auto; flex-direction: row; border-right: 0; border-bottom: 1px solid var(--line); overflow-x: auto; padding: 8px; }
    .sections button { flex: 0 0 auto; }
    .sidehelp { display: none; }
    .live { display: none; }
  }


  /* «По ID / По названию» (ТЗ 35) */
  .updot { margin-left: auto; width: 7px; height: 7px; border-radius: 50%; background: var(--acc); }
  .shead { padding: 14px 10px 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--fg3); }
</style>

<script lang="ts">
  import { store } from '../store.svelte';
  import { settingsOf } from '../views';
  import { currentSection, iconOf, layerOpen, PLUGINS, settingsSections, stepSection } from '../settingsNav.svelte';
  import Button from './ui/Button.svelte';
  import Compat from './Compat.svelte';
  import ConfirmSheet from './ConfirmSheet.svelte';
  import SchemaGroups from './SetSchema.svelte';
  import PluginHead from './SetPluginHead.svelte';
  import SetGeneral from './SetGeneral.svelte';
  import SetLook from './SetLook.svelte';
  import SetKeys from './SetKeys.svelte';
  import SetMini from './SetMini.svelte';
  import SetPlugins from './SetPlugins.svelte';
  import PluginRemoveSheet from './PluginRemoveSheet.svelte';
  import { plugins } from '../api/host.svelte';
  import { pluginUpdates as up } from '../pluginUpdates.svelte';
  import {
    Picker, SettingsAgendas, SettingsInbox, StatusesSettings,
    TagsSettings, ThemeEditor,
  } from './bridges';

  // The settings of the new interface (ТЗ 54 §1): the same sheet over the window — the head (the gear, «Настройки» and
  // the section, «Изменения применяются сразу», «Готово»), the column of the sections (the core's by `order`, «Настройки
  // плагинов», «Плагины» at the foot) and the section on the grid, its title in Yeseva One. The whole window is
  // dimmed under it. ⎋ closes (a section's layer first), ⌘[ ⌘] and ↑↓ in the column go over the sections.
  const nav = $derived(settingsSections());
  // the column's order: the own ones, the plugins' own sections, «Плагины» at the foot
  const order = $derived([...nav.own, ...nav.ofPlugins, ...nav.plugins]);
  const tab = $derived(currentSection());
  const ready = (t: string) => nav.ready.includes(t);
  const crumb = $derived(`${tab}${tab === 'Оформление' && store.themeEditing ? ' › Тема редактора' : ''}${store.settingsCrumb ? ` › ${store.settingsCrumb}` : ''}`);
  const wide = $derived(tab === 'Статусы' || tab === 'Клавиши');
  const fill = $derived(tab === 'Оформление' && !!store.themeEditing);

  let pickFile = $state(false); // Inbox's «Выбрать…»
  let confirmAgenda = $state<{ id: string; name: string } | null>(null);

  function key(e: KeyboardEvent) {
    if (e.defaultPrevented || store.keyRecording) return;
    if (e.key === 'Escape') {
      if (confirmAgenda || pickFile || up.removing || layerOpen()) return; // theirs
      e.preventDefault();
      store.closeSettings();
      return;
    }
    if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      e.preventDefault();
      stepSection(order, e.code === 'BracketLeft' ? -1 : 1);
    }
  }
  function sideKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      stepSection(order, e.key === 'ArrowUp' ? -1 : 1, true);
    }
  }
  // another section starts at its top
  let contentEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    void tab;
    if (contentEl) contentEl.scrollTop = 0;
  });
  const doneHint = $derived(`Готово — ${store.keyHint('settings') || '⌘,'} или ⎋ · ⌘[ ⌘] — предыдущий / следующий раздел`);
</script>

<svelte:window onkeydown={key} />

{#snippet row(t: string)}
  <button role="tab" class="si" data-section={t} aria-selected={t === tab} tabindex={t === tab ? 0 : -1} class:on={t === tab} disabled={!ready(t)} title={ready(t) ? undefined : 'Пока не реализовано'} onclick={() => store.showSection(t)}>
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={iconOf(t)} /></svg>
    <span class="nm">{t}</span>
    {#if settingsOf(t)?.dot?.()}<i class="updot" aria-hidden="true" title="Есть обновления"></i>{/if}
  </button>
{/snippet}

<div class="dim" aria-hidden="true"></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label="Настройки">
  <header>
    <svg class="gear" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
    <div class="ttl"><span class="t1">Настройки</span><span class="t2">{crumb}</span></div>
    <span class="live">Изменения применяются сразу</span>
    <Button kind="main" title={doneHint} onclick={() => store.closeSettings()}>Готово</Button>
  </header>
  <div class="main">
    <div class="sections" role="tablist" aria-orientation="vertical" aria-label="Разделы настроек" tabindex="-1" onkeydown={sideKey}>
      {#each nav.own as t (t)}{@render row(t)}{/each}
      {#if nav.ofPlugins.length}
        <div class="sgrp" role="presentation">Настройки плагинов</div>
        {#each nav.ofPlugins as t (t)}{@render row(t)}{/each}
      {/if}
      {#if nav.plugins.length}
        <div class="foot" role="presentation"></div>
        {@render row(PLUGINS)}
      {/if}
    </div>
    <div class="content" class:fill bind:this={contentEl}>
      {#if fill}
        <Compat><ThemeEditor name={store.themeEditing ?? ''} /></Compat>
      {:else}
        <div class="col" class:wide>
          <h1>{tab}</h1>
          {#if tab === 'Основные'}<SetGeneral />
          {:else if tab === 'Оформление'}<SetLook />
          {:else if tab === 'Клавиши'}<SetKeys />
          {:else if tab === 'Мини-окно'}<SetMini />
          {:else if tab === 'Плагины'}<SetPlugins />
          {:else if settingsOf(tab)?.schema}
            <!-- a feature's or a plugin's schema, in the new rows (ТЗ 54 §2) -->
            {@const spec = settingsOf(tab)!}
            {#if spec.plugin}<PluginHead id={spec.plugin} />{/if}
            <SchemaGroups schema={spec.schema!} />
            {#if spec.plugin && plugins.entry(spec.plugin) && !plugins.entry(spec.plugin)!.builtin}
              <Button kind="danger" onclick={() => (up.removing = plugins.entry(spec.plugin!) ?? null)}>Удалить плагин…</Button>
            {/if}
          {:else}
          <!-- the sections' own look is to come (ТЗ 54.2–54.7): the old ones in the compatibility layer meanwhile -->
          <div class="old">
            <Compat>
              {#if tab === 'Inbox'}<SettingsInbox onpick={() => (pickFile = true)} />
              {:else if tab === 'Теги'}<TagsSettings />
              {:else if settingsOf(tab)}
                {@const spec = settingsOf(tab)!}
                {#if spec.component}<spec.component />{/if}
              {:else if tab === 'Агенды'}<SettingsAgendas onremove={(a) => (confirmAgenda = a)} />
              {:else}<StatusesSettings />{/if}
            </Compat>
          </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
<!-- «Удалить плагин…» of a plugin's own section (the «Плагины» section has its own) -->
{#if tab !== 'Плагины'}<PluginRemoveSheet />{/if}
<Compat>
  {#if pickFile}<Picker onclose={() => (pickFile = false)} />{/if}
</Compat>
{#if confirmAgenda}
  {@const id = confirmAgenda.id}
  <ConfirmSheet label="Удаление агенды" title="Удалить агенду «{confirmAgenda.name}»?" onclose={() => (confirmAgenda = null)} actions={[{ label: 'Удалить', kind: 'danger', run: () => void store.deleteAgenda(id) }]}>
    Задачи и файлы не изменятся: удаляется только сама агенда.
  </ConfirmSheet>
{/if}

<style>
  /* the whole window dimmed, the sections' strip and the sidebar too; clicks on it do nothing */
  .dim { position: fixed; inset: 0; z-index: 70; background: var(--dim); }
  .sheet {
    position: fixed; z-index: 71; left: 0; right: 0; top: 36px; bottom: 36px; margin: 0 auto; width: min(1100px, calc(100% - 72px));
    /* no transform: a menu inside it is fixed to the window */
    display: flex; flex-direction: column; border: 1px solid var(--rule); border-radius: 14px; overflow: hidden; background: var(--card); box-shadow: var(--popshadow);
    color: var(--ink); font: 13px/1.45 var(--ui);
  }
  header { flex: 0 0 56px; height: 56px; box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 0 18px 0 20px; border-bottom: 1px solid var(--rule); }
  .gear { flex: 0 0 16px; color: var(--lampink); }
  .ttl { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
  .t1 { font-size: 14px; font-weight: 700; }
  .t2 { font-size: 12px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .live { font-size: 12px; color: var(--ink3); white-space: nowrap; }
  .main { flex: 1; min-height: 0; display: flex; }
  .sections { flex: 0 0 220px; box-sizing: border-box; display: flex; flex-direction: column; gap: 1px; padding: 12px 10px; overflow: auto; background: var(--side); border-right: 1px solid var(--rule); outline: none; }
  .si { flex: 0 0 30px; height: 30px; display: flex; align-items: center; gap: 9px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink2); font: 13px var(--ui); text-align: left; white-space: nowrap; }
  .si svg { flex: 0 0 16px; color: var(--ink3); }
  .si:hover:not(:disabled):not(.on) { background: var(--chip); }
  .si.on { background: var(--lampsoft); color: var(--ink); }
  .si.on svg { color: var(--lampink); }
  .si:disabled { opacity: 0.45; }
  .si:focus-visible { outline: 2px solid var(--lampline); outline-offset: -2px; }
  .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .updot { margin-left: auto; flex: 0 0 7px; width: 7px; height: 7px; border-radius: 50%; background: var(--lamp); }
  .sgrp { padding: 14px 10px 6px; font-size: 11px; font-weight: 600; color: var(--ink3); }
  /* «Плагины» at the foot, past a rule */
  .foot { flex: 1 0 12px; margin: 0 4px 6px; border-bottom: 1px solid var(--rule); }
  /* the section: on the grid, its own scroll, a column up to 720 (960 for «Статусы» and «Клавиши») */
  .content { flex: 1; min-width: 0; min-height: 0; overflow: auto; box-sizing: border-box; padding: 24px 32px; background-color: var(--bg);
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 24px 24px; background-position: -1px -1px; }
  .content.fill { padding: 0; display: flex; flex-direction: column; overflow: hidden; }
  .content.fill > :global(*) { flex: 1 1 0; min-height: 0; }
  .col { max-width: 720px; margin: 0 auto; }
  .col.wide { max-width: 960px; }
  h1 { margin: 0 4px 18px; font: 400 30px/1.05 var(--title); color: var(--ink); }
  .old { display: flex; flex-direction: column; min-height: 0; }
  /* a narrow window: the sections go to a strip on top */
  @media (max-width: 820px) {
    .main { flex-direction: column; }
    .sections { flex: 0 0 auto; flex-direction: row; align-items: center; padding: 8px; border-right: 0; border-bottom: 1px solid var(--rule); overflow-x: auto; }
    .si { flex: 0 0 auto; }
    .sgrp { padding: 0 6px 0 12px; white-space: nowrap; }
    .foot { flex: 0 0 1px; align-self: stretch; margin: 4px 6px; border-bottom: 0; border-left: 1px solid var(--rule); }
    .live { display: none; }
  }
</style>

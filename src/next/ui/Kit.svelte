<script lang="ts">
  import { store } from '../../store.svelte';
  import { tokenVars, fontCss } from '../tokens';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import Sheet from './Sheet.svelte';
  import Menu from './Menu.svelte';
  import type { MenuItem } from '../../menuItems';

  // The kit of the new interface's controls (ТЗ 44.1) on one page: what the e2e and the acceptance shots look at.
  // Not in the app: a test mounts it over the window.
  let name = $state('Ольга Петрова');
  let wrong = $state('');
  let ran = $state('');
  let shown = $state(true);
  const items: MenuItem[] = [
    { label: 'Переименовать', shortcut: '↩', action: () => (ran = 'Переименовать') },
    { label: 'Цвет тега', action: () => {}, sub: [{ label: 'Красный', capsule: '--tl:var(--todo)', action: () => (ran = 'Красный') }, { label: 'Синий', checked: true, action: () => (ran = 'Синий') }] },
    'sep',
    { note: 'Действия плагинов' },
    { label: 'Удалить заголовок', danger: true, action: () => (ran = 'Удалить') },
  ];
</script>

<div class="next kit" data-ui="next" style="{tokenVars(store.theme.app)};--ui:{fontCss(store.theme.app.fonts.ui, 'ui')};--mono:{fontCss(store.theme.app.fonts.mono, 'mono')}">
  <div class="row">
    <Button kind="main" key="↩">Сохранить</Button>
    <Button key="esc">Отмена</Button>
    <Button kind="danger" key="⌘D">Не сохранять</Button>
    <Button small kind="main" key="⌃C K R">Проверить через…</Button>
    <Button small>Осмотрено</Button>
  </div>
  <div class="row"><Field bind:value={name} label="Имя файла" {wrong} oninput={() => (wrong = name.includes('/') ? 'В имени не может быть «/»' : '')} /></div>
  <p class="ran" aria-live="polite">{ran}</p>
  <Menu x={420} y={60} {items} onclose={() => (ran = ran || 'закрыто')} />
  {#if shown}
    <Sheet title="Сохранить изменения в 2 вкладках?" oncancel={() => (shown = false)} top={180}>
      {#snippet eyebrow()}Зонд{/snippet}
      <p>Если не сохранить, изменения пропадут.</p>
      {#snippet foot()}
        <Button kind="danger" key="⌘D">Не сохранять</Button>
        <span style="flex:1"></span>
        <Button key="esc" onclick={() => (shown = false)}>Отмена</Button>
        <Button kind="main" key="↩">Сохранить</Button>
      {/snippet}
    </Sheet>
  {/if}
</div>

<style>
  .kit { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; gap: 14px; padding: 24px; background: var(--bg); color: var(--ink); font: 13px var(--ui); }
  .row { display: flex; align-items: flex-start; gap: 8px; width: 360px; }
  .ran { margin: 0; color: var(--ink3); }
</style>

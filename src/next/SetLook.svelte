<script lang="ts">
  import { tick } from 'svelte';
  import { store } from '../store.svelte';
  import { nextPrefs, TEXT_FONTS, TEXT_WIDTHS } from '../nextPrefs.svelte';
  import { setLayer } from '../settingsNav.svelte';
  import type { MenuItem } from '../menuItems';
  import type { AppearanceChoice, Theme } from '../themes';
  import Group from './SetGroup.svelte';
  import Row from './SetRow.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Segments from './ui/Segments.svelte';
  import MenuButton from './ui/MenuButton.svelte';
  import Menu from './ui/Menu.svelte';
  import ConfirmSheet from './ConfirmSheet.svelte';

  // «Настройки → Оформление» of the new interface (ТЗ 54 §3): the appearance; the editor's theme for the light one as
  // cards in a row (a preview of 74 in its colours: a title, the text's and the lamp's bars; the name and «✓»), a
  // card's menu on a right click, «Импорт…» and «Новая тема» under them; the dark one's theme as a menu; «Текст» —
  // the font, the width, «Структура» right, the drawers folded on opening.
  const MODES: { value: AppearanceChoice; label: string }[] = [
    { value: 'system', label: 'Системное' },
    { value: 'light', label: 'Светлое' },
    { value: 'dark', label: 'Тёмное' },
  ];
  const lights = $derived(store.themes.filter((t) => t.appearance === 'light'));
  const darks = $derived(store.themes.filter((t) => t.appearance === 'dark'));
  const curLight = $derived(store.themeFor('light').name);
  const curDark = $derived(store.themeFor('dark').name);
  const tagOf = (t: Theme) => (t.plugin ? 'из плагина' : t.builtin ? 'встроенная' : 'своя');

  // ---- a card's menu, renaming in place, deleting ----
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let renaming = $state<string | null>(null);
  let draft = $state('');
  let confirmDel = $state<Theme | null>(null);
  $effect(() => setLayer('look', !!(menu || renaming || confirmDel)));
  $effect(() => () => setLayer('look', false));
  async function rename(t: Theme) {
    renaming = t.name;
    draft = t.name;
    await tick();
    const el = document.querySelector<HTMLInputElement>('.thcard input.rn');
    el?.focus();
    el?.select();
  }
  async function commitRename() {
    const t = store.themes.find((x) => x.name === renaming);
    renaming = null;
    if (t) await store.renameTheme(t, draft);
  }
  async function duplicate(t: Theme) {
    const c = await store.copyTheme(t);
    if (c) await rename(c);
  }
  /** «Новая тема»: a copy of the theme of the appearance shown, opened in the theme's editor. */
  async function newTheme() {
    const c = await store.copyTheme(store.themeFor(store.appearance));
    if (c) store.themeEditing = c.name;
  }
  function openMenu(e: MouseEvent, t: Theme) {
    e.preventDefault();
    menu = {
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Редактировать', action: () => void store.editTheme(t) },
        { label: 'Дублировать', action: () => void duplicate(t) },
        { label: 'Переименовать', action: () => void rename(t), disabled: t.builtin },
        { label: 'Экспорт…', action: () => void store.exportTheme(t) },
        'sep',
        { label: 'Удалить', action: () => (confirmDel = t), danger: true, disabled: t.builtin },
      ],
    };
  }
  function renameKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      renaming = null;
    }
  }
  function cardsKey(e: KeyboardEvent) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d || (e.target as HTMLElement).tagName === 'INPUT') return;
    e.preventDefault();
    const i = Math.max(0, Math.min(lights.length - 1, lights.findIndex((t) => t.name === curLight) + d));
    store.setThemeName('light', lights[i].name);
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-theme-card="light:${lights[i].name}"]`)?.focus());
  }
</script>

<Group caption="Оформление">
  <Row label="Оформление" id="set-look">
    <Segments value={store.appearanceChoice} options={MODES} labelledby="set-look" onchange={(v) => store.setAppearance(v)} />
  </Row>
</Group>
<Group caption="Тема редактора" note="при светлом оформлении">
  <div class="cards" role="radiogroup" aria-label="Тема при светлом оформлении" tabindex="-1" onkeydown={cardsKey}>
    {#each lights as t (t.name)}
      {@const on = t.name === curLight}
      {@const c = t.colors}
      <div class="thcard" class:on role="presentation" oncontextmenu={(e) => openMenu(e, t)}>
        <button class="pick" role="radio" aria-checked={on} aria-label={t.name} data-theme-card="light:{t.name}" tabindex={on ? 0 : -1} title={tagOf(t)} onclick={() => store.setThemeName('light', t.name)}>
          <span class="pv" style="background:{c.bg}">
            <span class="pt" style="color:{c.h1}">Переезд</span>
            <i style="width:60%;background:{c.fg};opacity:.35"></i>
            <i style="width:40%;background:{c.cursor}"></i>
          </span>
        </button>
        {#if renaming === t.name}
          <input class="rn" aria-label="Название темы" bind:value={draft} spellcheck="false" maxlength="80" onkeydown={renameKey} onblur={() => void commitRename()} />
        {:else}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <span class="nm" onclick={() => store.setThemeName('light', t.name)} ondblclick={() => !t.builtin && rename(t)}><span class="tn">{t.name}</span>{#if on}<span class="ck" aria-hidden="true">✓</span>{/if}</span>
        {/if}
      </div>
    {/each}
  </div>
  <div class="acts">
    <button class="lnk" onclick={() => void store.importTheme()}>Импорт…</button>
    <span class="sep" aria-hidden="true">/</span>
    <button class="lnk" title="Копия «{store.themeFor(store.appearance).name}» откроется в редакторе темы" onclick={() => void newTheme()}>Новая тема</button>
    <span class="hint">Правый клик по теме — другие действия</span>
  </div>
  <Row label="Тема при тёмном оформлении">
    <MenuButton value={curDark} options={darks.map((t) => ({ value: t.name, label: t.name }))} label="Тема при тёмном оформлении" width={220} onchange={(v) => store.setThemeName('dark', v)} />
  </Row>
</Group>
<Group caption="Текст">
  <Row label="Шрифт текста" hint="Заголовки, текст файла, карточки доски" changed={nextPrefs.font !== 'serif'}>
    <MenuButton value={nextPrefs.font} options={TEXT_FONTS.map((f) => ({ value: f.id, label: f.name }))} label="Шрифт текста" width={220} onchange={(v) => nextPrefs.setFont(v)} />
  </Row>
  <Row label="Ширина текста" id="set-width" changed={nextPrefs.width !== 'medium'}>
    <Segments value={nextPrefs.width} options={TEXT_WIDTHS.map((w) => ({ value: w.id, label: w.name }))} labelledby="set-width" onchange={(v) => nextPrefs.setWidth(v)} />
  </Row>
  <Row label="«Структура» справа" hint="Когда окно шире 900 pt · ⌥⌘0" id="set-struct" changed={!nextPrefs.structure}>
    <Toggle checked={nextPrefs.structure} labelledby="set-struct" onchange={() => nextPrefs.setStructure(!nextPrefs.structure)} />
  </Row>
  <Row label="Сворачивать ящики при открытии" hint=":PROPERTIES:, :LOGBOOK: — одной строкой с «…»; файл не меняется" id="set-drawers">
    <Toggle checked={store.foldDrawers} labelledby="set-drawers" onchange={() => store.setFoldDrawers(!store.foldDrawers)} />
  </Row>
</Group>

{#if menu}<Menu x={menu.x} y={menu.y} items={menu.items} label="Тема" onclose={() => (menu = null)} />{/if}
{#if confirmDel}
  {@const t = confirmDel}
  <ConfirmSheet label="Удаление темы" title="Удалить тему «{t.name}»?" onclose={() => (confirmDel = null)} actions={[{ label: 'Удалить', kind: 'danger', run: () => void store.deleteTheme(t) }]}>
    Файл темы удаляется из папки тем. {store.themeFor(t.appearance).name === t.name ? `Редактор вернётся к теме «${t.appearance === 'dark' ? 'Panopticon тёмная' : 'Panopticon светлая'}».` : ''}
  </ConfirmSheet>
{/if}

<style>
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; padding: 14px 16px 10px; outline: none; }
  .thcard { display: flex; flex-direction: column; min-width: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 0 0 1px var(--rule); background: var(--card); }
  .thcard.on { box-shadow: 0 0 0 2px var(--lamp); }
  .thcard .pick { display: block; width: 100%; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; text-align: left; }
  .pick:focus-visible { outline: 2px solid var(--lampline); outline-offset: -2px; }
  .pv { height: 74px; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; }
  .pt { font: 700 15px/1.1 Georgia, serif; margin-bottom: 2px; }
  .pv i { display: block; height: 4px; border-radius: 2px; }
  .nm { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 7px 10px; font-size: 12.5px; cursor: default; }
  .tn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ck { color: var(--lampink); }
  .rn { margin: 4px 6px; height: 24px; box-sizing: border-box; padding: 0 6px; border: 0; border-radius: 6px; background: var(--field); box-shadow: inset 0 0 0 1.5px var(--lampline); color: var(--ink); font: 12.5px var(--ui); outline: none; -webkit-user-select: text; user-select: text; }
  .acts { display: flex; align-items: baseline; gap: 6px; padding: 0 16px 12px; font-size: 12.5px; }
  .lnk { padding: 0; border: 0; background: none; color: var(--lampink); font: 12.5px var(--ui); }
  .lnk:hover { text-decoration: underline; }
  .lnk:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
  .sep { color: var(--ink3); }
  .hint { margin-left: auto; font-size: 11.5px; color: var(--ink3); }
  .acts + :global(.row) { border-top: 1px solid var(--rule); }
</style>

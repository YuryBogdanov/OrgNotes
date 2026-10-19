<script lang="ts">
  import { tick } from 'svelte';
  import { store } from '../store.svelte';
  import { defaultThemes } from '../appearance';
  import { plugins } from '../api/host.svelte';
  import { nextPrefs, TEXT_WIDTHS } from '../nextPrefs.svelte';
  import { setLayer } from '../settingsNav.svelte';
  import type { MenuItem } from '../menuItems';
  import type { Appearance, AppearanceChoice, Theme } from '../themes';
  import Group from './SetGroup.svelte';
  import Row from './SetRow.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Segments from './ui/Segments.svelte';
  import MenuButton from './ui/MenuButton.svelte';
  import Menu from './ui/Menu.svelte';
  import Button from './ui/Button.svelte';
  import ConfirmSheet from './ConfirmSheet.svelte';
  import ThemePreview from './ThemePreview.svelte';
  import FontMenu from './FontMenu.svelte';
  import { fontLabel, textFontOf } from './fontList.svelte';

  // «Настройки → Оформление» of the new interface (ТЗ 54 §3, ТЗ 57 §3): the appearance and the two places — the light
  // one and the dark one, any theme in either; the themes of the whole app as cards (the window in miniature, the
  // name with six dots of its colours, whose it is, the places it is in), a click puts one in the place in effect, a
  // right click its menu, a double click opens an own one in the theme's editor; «Импорт…» and «+ Новая тема».
  // «Текст» — the font, the width, «Структура» right, the drawers folded on opening.
  const MODES: { value: AppearanceChoice; label: string }[] = [
    { value: 'system', label: 'Системное' },
    { value: 'light', label: 'Светлое' },
    { value: 'dark', label: 'Тёмное' },
  ];
  /** «Бумага» and «Синька» first, then the others as they come (the classic ones, the plugins', the own). */
  const FIRST = ['Бумага', 'Синька'];
  const all = $derived([...store.themes].sort((a, b) => (FIRST.includes(b.name) ? 1 : 0) - (FIRST.includes(a.name) ? 1 : 0)));
  const cur = $derived({ light: store.themeFor('light').name, dark: store.themeFor('dark').name });
  const place = $derived(store.appearance);
  const placeWord = (a: Appearance) => (a === 'dark' ? 'тёмная' : 'светлая');
  const whose = (t: Theme) => (t.plugin ? plugins.name(t.plugin) : t.builtin ? 'встроенная' : 'своя');
  const dots = (t: Theme) => [t.app.base.bg, t.app.base.ink, t.app.base.accent, t.app.palette.red, t.app.palette.blue, t.app.palette.green];

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
  /** «Дублировать и изменить…»: «<тема> — копия», in the place in effect, opened in the theme's editor. */
  async function duplicate(t: Theme) {
    const c = await store.copyTheme(t, `${t.name} — копия`, place);
    if (c) store.themeEditing = c.name;
  }
  /** «+ Новая тема»: a copy of the theme in effect named «Новая тема», opened in the editor (ТЗ 57 §5). */
  async function newTheme() {
    const c = await store.copyTheme(store.theme, 'Новая тема', place);
    if (c) store.themeEditing = c.name;
  }
  const edit = (t: Theme) => (t.builtin ? void duplicate(t) : (store.themeEditing = t.name));
  function openMenu(e: MouseEvent, t: Theme) {
    e.preventDefault();
    menu = {
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Поставить для светлого', checked: cur.light === t.name, action: () => store.setThemeName('light', t.name) },
        { label: 'Поставить для тёмного', checked: cur.dark === t.name, action: () => store.setThemeName('dark', t.name) },
        'sep',
        ...(t.builtin ? [] : [{ label: 'Изменить…', action: () => edit(t) } as MenuItem]),
        { label: 'Дублировать и изменить…', action: () => void duplicate(t) },
        ...(t.builtin ? [] : [{ label: 'Переименовать', action: () => void rename(t) } as MenuItem]),
        { label: 'Экспорт…', action: () => void store.exportTheme(t) },
        ...(t.builtin ? [] : ['sep', { label: 'Удалить', action: () => (confirmDel = t), danger: true }] as MenuItem[]),
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
  /** ←→ one card, ↑↓ a row of four: the theme in the place in effect. */
  function cardsKey(e: KeyboardEvent) {
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 }[e.key];
    if (!d || (e.target as HTMLElement).tagName === 'INPUT') return;
    e.preventDefault();
    const i = Math.max(0, Math.min(all.length - 1, all.findIndex((t) => t.name === cur[place]) + d));
    store.setThemeName(place, all[i].name);
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-theme-card="${CSS.escape(all[i].name)}"]`)?.focus());
  }
  const options = $derived(all.map((t) => ({ value: t.name, label: t.name })));

  // «Шрифт текста» (ТЗ 57 §6) is the text font of the theme in effect: an own theme takes it; a built-in one is not
  // changed — first «Дублировать и изменить»
  let fontAsk = $state<string | null>(null);
  $effect(() => setLayer('lookFont', !!fontAsk));
  function setTextFont(f: string) {
    const t = store.theme;
    if (t.builtin) return void (fontAsk = f);
    store.setThemeApp(t.name, { ...t.app, fonts: { ...t.app.fonts, text: f } });
    nextPrefs.setFont('serif'); // the old choice of ТЗ 42 gives way
  }
  async function copyWithFont(f: string) {
    const c = await store.copyTheme(store.theme, `${store.theme.name} — копия`, place);
    if (!c) return;
    store.setThemeApp(c.name, { ...c.app, fonts: { ...c.app.fonts, text: f } });
    nextPrefs.setFont('serif');
    store.themeEditing = c.name;
  }
</script>

<Group caption="Оформление">
  <Row label="Оформление" hint={store.appearanceChoice === 'system' ? 'Тема меняется вместе с системой' : undefined} id="set-look">
    <Segments value={store.appearanceChoice} options={MODES} labelledby="set-look" onchange={(v) => store.setAppearance(v)} />
  </Row>
  <Row label="Светлая тема" hint={place === 'light' ? 'Действует сейчас' : undefined}>
    <MenuButton value={cur.light} {options} label="Светлая тема" width={220} onchange={(v) => store.setThemeName('light', v)} />
  </Row>
  <Row label="Тёмная тема" hint={place === 'dark' ? 'Действует сейчас' : undefined}>
    <MenuButton value={cur.dark} {options} label="Тёмная тема" width={220} onchange={(v) => store.setThemeName('dark', v)} />
  </Row>
</Group>
<Group caption="Темы" note="цвета всего приложения — фон, сайдбар, акцент, статусы, текст">
  {#snippet head()}
    <span class="hb">
      <Button small onclick={() => void store.importTheme()}>Импорт…</Button>
      <Button small kind="main" onclick={() => void newTheme()}>+ Новая тема</Button>
    </span>
  {/snippet}
  <div class="cards" role="radiogroup" aria-label="Темы" tabindex="-1" onkeydown={cardsKey}>
    {#each all as t (t.name)}
      {@const on = t.name === cur[place]}
      <div class="thcard" class:on role="presentation" oncontextmenu={(e) => openMenu(e, t)}>
        <button class="pick" role="radio" aria-checked={on} aria-label={t.name} data-theme-card={t.name} tabindex={on ? 0 : -1}
          onclick={() => store.setThemeName(place, t.name)} ondblclick={() => !t.builtin && edit(t)}>
          <ThemePreview theme={t.app} />
        </button>
        <div class="info">
          {#if renaming === t.name}
            <input class="rn" aria-label="Название темы" bind:value={draft} spellcheck="false" maxlength="80" onkeydown={renameKey} onblur={() => void commitRename()} />
          {:else}
            <div class="l1"><span class="tn" title={t.name}>{t.name}</span><span class="dots" aria-hidden="true">{#each dots(t) as c, i (i)}<i style:background={c}></i>{/each}</span></div>
          {/if}
          <div class="l2">
            <span class="sub">{placeWord(t.appearance)} · {whose(t)}</span>
            {#if cur.light === t.name}<span class="pl">светлая ✓</span>{/if}
            {#if cur.dark === t.name}<span class="pl">тёмная ✓</span>{/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
</Group>
<Group caption="Текст">
  <Row label="Шрифт текста" hint="Шрифт текста темы «{store.theme.name}»: заголовки, текст файла, карточки доски">
    <FontMenu value={textFontOf(store.theme)} role="text" label="Шрифт текста" onchange={setTextFont} />
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
{#if fontAsk}
  {@const f = fontAsk}
  <ConfirmSheet label="Шрифт встроенной темы" title="Тема «{store.theme.name}» встроенная" onclose={() => (fontAsk = null)} actions={[{ label: 'Дублировать и изменить', kind: 'primary', run: () => void copyWithFont(f) }]}>
    Встроенную тему изменить нельзя. Шрифт «{fontLabel(f)}» получит её копия «{store.theme.name} — копия».
  </ConfirmSheet>
{/if}
{#if confirmDel}
  {@const t = confirmDel}
  <ConfirmSheet label="Удаление темы" title="Удалить тему «{t.name}»?" onclose={() => (confirmDel = null)} actions={[{ label: 'Удалить', kind: 'danger', run: () => void store.deleteTheme(t) }]}>
    Файл темы удаляется из папки тем. {store.themeFor(t.appearance).name === t.name ? `Редактор вернётся к теме «${defaultThemes()[t.appearance]}».` : ''}
  </ConfirmSheet>
{/if}

<style>
  .hb { margin-left: auto; display: flex; gap: 8px; align-self: center; }
  .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; padding: 14px 16px; outline: none; }
  .thcard { display: flex; flex-direction: column; min-width: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 0 0 1px var(--rule); background: var(--card); }
  .thcard.on { box-shadow: 0 0 0 2px var(--lamp); }
  .thcard .pick { display: block; width: 100%; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; text-align: left; }
  .pick:focus-visible { outline: 2px solid var(--lampline); outline-offset: -2px; }
  .info { display: flex; flex-direction: column; gap: 3px; padding: 8px 10px 9px; border-top: 1px solid var(--rule); }
  .l1 { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .tn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
  .dots { flex: 0 0 auto; display: flex; gap: 1px; }
  .dots i { width: 9px; height: 9px; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--rule); }
  .l2 { display: flex; align-items: center; gap: 5px; min-width: 0; flex-wrap: wrap; }
  .sub { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: var(--ink3); }
  .pl { flex: 0 0 auto; padding: 0 6px; border-radius: 5px; background: var(--lampsoft); color: var(--lampink); font-size: 10.5px; line-height: 17px; }
  .rn { height: 22px; box-sizing: border-box; padding: 0 6px; border: 0; border-radius: 6px; background: var(--field); box-shadow: inset 0 0 0 1.5px var(--lampline); color: var(--ink); font: 600 13px var(--ui); outline: none; -webkit-user-select: text; user-select: text; }
</style>

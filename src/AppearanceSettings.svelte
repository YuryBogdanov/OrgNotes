<script lang="ts">
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { portal } from './portal';
  import { tick } from 'svelte';
  import { store } from './store.svelte';
  import { defaultThemes } from './appearance';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import type { Appearance, AppearanceChoice, Theme } from './themes';

  // «Настройки → Оформление» (ТЗ 25): the appearance of the app, and the editor theme for the light and for the
  // dark appearance. Both kept on this Mac; a change is applied at once.
  const MODES: { id: AppearanceChoice; t: string }[] = [
    { id: 'system', t: 'Системное' },
    { id: 'light', t: 'Светлое' },
    { id: 'dark', t: 'Тёмное' },
  ];
  // the mini window of a card: its ground, bar, sidebar and lines
  const WIN = { light: { bg: '#ffffff', bar: '#e6e6ea', side: '#f1f1f4', line: '#c9c9d0' }, dark: { bg: '#1e1e22', bar: '#34343b', side: '#2a2a30', line: '#55555e' } };
  function modeKey(e: KeyboardEvent) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = (MODES.findIndex((m) => m.id === store.appearanceChoice) + d + MODES.length) % MODES.length;
    store.setAppearance(MODES[i].id);
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-mode="${MODES[i].id}"]`)?.focus());
  }
  const SLOTS: { a: Appearance; t: string }[] = [
    { a: 'light', t: 'ТЕМА РЕДАКТОРА ПРИ СВЕТЛОМ ОФОРМЛЕНИИ' },
    { a: 'dark', t: 'ТЕМА РЕДАКТОРА ПРИ ТЁМНОМ ОФОРМЛЕНИИ' },
  ];
  const note = (a: Appearance) =>
    store.appearance !== a ? '' : store.appearanceChoice === 'system' ? `сейчас активна — системное оформление ${a === 'dark' ? 'тёмное' : 'светлое'}` : 'сейчас активна';
  function themeKey(e: KeyboardEvent, a: Appearance, list: Theme[]) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = Math.max(0, Math.min(list.length - 1, list.findIndex((t) => t.name === store.themeFor(a).name) + d));
    store.setThemeName(a, list[i].name);
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-theme-card="${a}:${list[i].name}"]`)?.focus());
  }

  // ---- own themes (part 2): «+ Новая тема», the menu of a card, renaming in place, deleting --------------------------
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let renaming = $state<string | null>(null); // the theme whose name is edited
  let draft = $state('');
  let confirmDel = $state<Theme | null>(null);
  async function rename(t: Theme) {
    renaming = t.name;
    draft = t.name;
    await tick();
    const el = document.querySelector<HTMLInputElement>('input.rn');
    el?.focus();
    el?.select();
  }
  async function commitRename() {
    const t = store.themes.find((x) => x.name === renaming);
    renaming = null;
    if (t) await store.renameTheme(t, draft);
  }
  /** «+ Новая тема»: a copy of the chosen theme, opened in the theme editor. */
  async function newTheme(a: Appearance) {
    const c = await store.copyTheme(store.themeFor(a));
    if (c) store.themeEditing = c.name;
  }
  async function duplicate(t: Theme) {
    const c = await store.copyTheme(t);
    if (c) await rename(c);
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
  // ⎋ closes what is open here first, not the whole settings sheet
  function escFirst(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !(menu || renaming || confirmDel)) return;
    e.preventDefault();
    if (renaming && !menu) renaming = null;
    if (confirmDel && !menu) confirmDel = null;
  }
</script>

<svelte:window onkeydowncapture={escFirst} />

{#snippet win(w: typeof WIN.light)}
  <span class="half" style="background:{w.bg}">
    <span class="wbar" style="background:{w.bar}"></span>
    <span class="wbody"><span class="wside" style="background:{w.side}"></span><span class="wtext">
      <i style="width:60%;background:{w.line}"></i><i style="width:80%;background:{w.line};opacity:0.6"></i><i style="width:45%;background:{w.line};opacity:0.6"></i>
    </span></span>
  </span>
{/snippet}

<section class="look" aria-label="Оформление">
  <div class="group">
    <div class="cap">ОФОРМЛЕНИЕ ПРИЛОЖЕНИЯ</div>
    <div class="modes" role="radiogroup" aria-label="Оформление приложения" tabindex="-1" onkeydown={modeKey}>
      {#each MODES as m (m.id)}
        {@const on = store.appearanceChoice === m.id}
        <button class="mode" role="radio" aria-checked={on} class:on data-mode={m.id} tabindex={on ? 0 : -1} onclick={() => store.setAppearance(m.id)}>
          <span class="mini">
            {@render win(m.id === 'dark' ? WIN.dark : WIN.light)}
            {#if m.id === 'system'}{@render win(WIN.dark)}{/if}
          </span>
          <span class="mt">{m.t}</span>
        </button>
      {/each}
    </div>
    <p class="help">Навигатор, панели, палитра и листы — только светлые или тёмные. Цвета текста в редакторе задаёт тема редактора ниже.</p>
  </div>

  {#each SLOTS as s (s.a)}
    {@const list = store.themes.filter((t) => t.appearance === s.a)}
    {@const cur = store.themeFor(s.a).name}
    <div class="group">
      <div class="cap">{s.t}{#if note(s.a)}<span class="now">{note(s.a)}</span>{/if}</div>
      <div class="grid" role="radiogroup" aria-label={s.a === 'light' ? 'Тема при светлом оформлении' : 'Тема при тёмном оформлении'} tabindex="-1" onkeydown={(e) => themeKey(e, s.a, list)}>
        {#each list as t (t.name)}
          {@const on = t.name === cur}
          {@const c = t.colors}
          <div class="cell" oncontextmenu={(e) => openMenu(e, t)} role="presentation">
            <button class="card" role="radio" aria-checked={on} aria-label={t.name} class:on data-theme-card="{s.a}:{t.name}" tabindex={on ? 0 : -1} onclick={() => store.setThemeName(s.a, t.name)}>
              <span class="pv" style="background:{c.bg}">
                <span style="color:{c.h1};font-weight:700">* Q4 2026</span>
                <span style="padding-left:1.2ch;color:{c.h2};font-weight:700">* <span style="color:{c.palette.red}">TODO</span> Бюджет</span>
                <span style="padding-left:3.2ch;color:{c.dim}">SCHED <span style="color:{c.date}">&lt;10-14&gt;</span></span>
                <span style="padding-left:2.2ch;color:{c.h3};font-weight:700">* <span style="color:{c.palette.green}">DONE</span> Заявки</span>
                <span style="padding-left:3.2ch;color:{c.fg}">Текст <span style="color:{c.link};text-decoration:underline">ссылка</span></span>
                {#if on}<span class="check" aria-hidden="true">✓</span>{/if}
              </span>
            </button>
            {#if renaming === t.name}
              <input class="rn" aria-label="Название темы" bind:value={draft} spellcheck="false" maxlength="80"
                onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commitRename(); } }} onblur={() => void commitRename()} />
            {:else}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <span class="nm" onclick={() => store.setThemeName(s.a, t.name)} ondblclick={() => !t.builtin && rename(t)}><span class="tn">{t.name}</span><span class="tag">{t.plugin ? 'из плагина' : t.builtin ? 'встроенная' : 'своя'}</span></span>
            {/if}
          </div>
        {/each}
        <button class="new" onclick={() => void newTheme(s.a)} title="Копия «{cur}» откроется в редакторе темы"><span class="plus">+</span><span>Новая тема</span></button>
      </div>
      <div class="acts">
        <button class="ghost" onclick={() => void store.editTheme(store.themeFor(s.a))}>Редактировать «{store.themeFor(s.a).name}»…</button>
        <button class="ghost plain" onclick={() => void store.importTheme()}>Импорт…</button>
        <span class="hint">Правый клик по теме — другие действия</span>
      </div>
    </div>
  {/each}
</section>

{#if menu}<div use:portal><ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} /></div>{/if}
{#if confirmDel}
  {@const t = confirmDel}
  <ConfirmDialog label="Удаление темы" title="Удалить тему «{t.name}»?" onclose={() => (confirmDel = null)} actions={[{ label: 'Удалить', kind: 'danger', run: () => void store.deleteTheme(t) }]}>
    Файл темы удаляется из папки тем. {store.themeFor(t.appearance).name === t.name ? `Редактор вернётся к теме «${defaultThemes()[t.appearance]}».` : ''}
  </ConfirmDialog>
{/if}

<style>
  .look { max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; gap: 22px; }
  .group { display: flex; flex-direction: column; gap: 8px; }
  .cap { display: flex; align-items: baseline; gap: 8px; padding: 0 4px; font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .now { font-weight: 400; letter-spacing: 0; color: var(--fg3); }
  .help { margin: 0; padding: 0 4px; font-size: 11.5px; color: var(--fg2); line-height: 1.45; }
  .modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; outline: none; }
  .mode { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 0; border: 0; background: transparent; color: var(--fg); }
  .mini { width: 100%; aspect-ratio: 16 / 10; display: flex; box-sizing: border-box; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .mode.on .mini { border: 2px solid var(--acc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 22%, transparent); }
  .mode:focus-visible { outline: none; }
  .mode:focus-visible .mini { box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 45%, transparent); }
  .mode.on .mt { font-weight: 600; color: var(--acc); }
  .half { flex: 1; display: flex; flex-direction: column; }
  .wbar { height: 16%; }
  .wbody { flex: 1; display: flex; }
  .wside { width: 28%; }
  .wtext { flex: 1; padding: 8% 7%; display: flex; flex-direction: column; gap: 9%; }
  .wtext i { height: 7%; min-height: 3px; border-radius: 2px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; outline: none; }
  .cell { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .card { display: flex; flex-direction: column; padding: 0; border: 0; background: transparent; color: var(--fg); text-align: left; min-width: 0; }
  .rn { height: 22px; margin: -1px 0; padding: 0 6px; border: 1.5px solid var(--acc); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12.5px; -webkit-user-select: text; user-select: text; outline: none; }
  .new { min-height: 102px; box-sizing: border-box; border: 1.5px dashed var(--line); border-radius: 9px; background: transparent; color: var(--acc); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 12px; align-self: start; aspect-ratio: auto; }
  .new .plus { font-size: 20px; line-height: 1; }
  .new:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .acts { display: flex; align-items: center; gap: 10px; padding: 0 2px; }
  .ghost { height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12.5px; }
  .ghost.plain { border: 0; background: transparent; color: var(--fg2); }
  .hint { font-size: 11.5px; color: var(--fg3); }
  .pv { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 9px 10px; box-sizing: border-box; border: 1px solid var(--line); border-radius: 9px; font: 10px/14px var(--mono); white-space: nowrap; overflow: hidden; }
  .card.on .pv { border: 2px solid var(--acc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 22%, transparent); padding: 8px 9px; }
  .card:focus-visible { outline: none; }
  .card:focus-visible .pv { box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 45%, transparent); }
  .check { position: absolute; top: 6px; right: 6px; width: 16px; height: 16px; border-radius: 8px; background: var(--acc); color: var(--onacc); font: 700 10px var(--ui); display: flex; align-items: center; justify-content: center; }
  /* the mark goes under the name when both do not fit */
  .nm { cursor: default; display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 6px; padding: 0 2px; }
  .tn { flex: 1 0 auto; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12.5px; }
  .tag { font-size: 11px; color: var(--fg3); }
</style>

<script lang="ts">
  import { store } from '../store.svelte';
  import { namedFor, resolveWorkflow } from '../org';
  import { NAMED, NAMED_RU, levelColor, lowContrast, ratioWords, themeVars, type ColorKey, type Named, type Theme, type ThemeColors } from '../themes';
  import type { MenuItem } from '../menuItems';
  import { setLayer } from '../settingsNav.svelte';
  import Editor from './Editor.svelte';
  import ColorPop from './ColorPop.svelte';
  import Menu from './ui/Menu.svelte';
  import Button from './ui/Button.svelte';
  import Segments from './ui/Segments.svelte';

  // The theme's editor of the new interface (ТЗ 54.8, ТЗ 25 §2), in place of «Настройки → Оформление»: the colours of
  // an own theme by groups (cards of rows: the swatch, the name, the hex), a live example of an org file in them in the
  // new editor. Every change shows at once, in the example and in the open editors if the theme is chosen; the file is
  // written a moment later.
  let { name }: { name: string } = $props();

  const theme = $derived(store.ownThemes.find((t) => t.name === name));
  const c = $derived(theme?.colors);
  const low = $derived(c ? lowContrast(c) : new Map<ColorKey, number>());

  // ---- the name ---------------------------------------------------------------------------------------------------
  let draft = $derived(name);
  const commitName = () => {
    if (theme && draft.trim() && draft.trim() !== name) void store.renameTheme(theme, draft);
    else draft = name;
  };

  // ---- the rows -----------------------------------------------------------------------------------------------------
  type Row = { key: ColorKey; t: string; alpha?: boolean };
  // the deep levels: shown when one of them is set, or asked for
  let deepAsked = $state<boolean | null>(null);
  const deepSet = $derived(!!c && (['h5', 'h6', 'h7', 'h8', 'h9'] as const).some((k) => !!c[k]));
  const deep = $derived(deepAsked ?? deepSet);
  $effect(() => {
    void name;
    deepAsked = null;
  });
  // where a named colour is used now: the statuses that have it, and the editor's own uses
  const uses = $derived.by(() => {
    const wf = resolveWorkflow('', 'пример.org', store.config);
    const m = new Map<string, string[]>();
    for (const sq of wf.sequences ?? []) for (const st of sq.states) (m.get(namedFor(st.name, wf)) ?? m.set(namedFor(st.name, wf), []).get(namedFor(st.name, wf))!).push(st.name);
    const extra: Partial<Record<Named, string>> = { red: 'дедлайны', orange: 'приоритет', green: 'прогресс', blue: 'чекбоксы' };
    return (n: Named) => [...(m.get(n) ?? []), ...(extra[n] ? [extra[n]!] : [])].join(', ');
  });
  const groups = $derived.by((): { title: string; rows: Row[]; link?: string }[] => [
    { title: 'Основа', rows: [{ key: 'bg', t: 'Фон' }, { key: 'fg', t: 'Текст' }, { key: 'dim', t: 'Приглушённый текст' }, { key: 'curLine', t: 'Текущая строка', alpha: true }, { key: 'selection', t: 'Выделение', alpha: true }, { key: 'cursor', t: 'Курсор' }] },
    {
      title: 'Заголовки',
      link: deep ? 'Скрыть уровни 5–9' : 'Настроить более низкие уровни (5–9)',
      rows: [{ key: 'h1', t: 'Уровень 1' }, { key: 'h2', t: 'Уровень 2' }, { key: 'h3', t: 'Уровень 3' }, { key: 'h4', t: deep ? 'Уровень 4' : 'Уровень 4 и глубже' },
        ...(deep ? ([5, 6, 7, 8, 9] as const).map((n): Row => ({ key: `h${n}`, t: `Уровень ${n}` })) : [])],
    },
    { title: 'Разметка', rows: [{ key: 'date', t: 'Даты' }, { key: 'tag', t: 'Теги' }, { key: 'link', t: 'Ссылки' }, { key: 'meta', t: '#+ключи и drawers' }, { key: 'code', t: 'Код и verbatim' }] },
    { title: 'Палитра статусов и тегов', rows: NAMED.map((n): Row => ({ key: `palette.${n}`, t: NAMED_RU[n] + (uses(n) ? ` — ${uses(n)}` : '') })) },
  ]);
  const isDeep = (k: ColorKey) => /^h[5-9]$/.test(k);
  /** The colour of a row; a deep level not set shows the one it inherits. */
  function get(k: ColorKey): string {
    if (!c) return '#000000';
    if (k.startsWith('palette.')) return c.palette[k.slice(8) as Named];
    if (isDeep(k)) return levelColor(c, +k.slice(1));
    return c[k as keyof ThemeColors] as string;
  }
  const inherited = (k: ColorKey) => !!c && isDeep(k) && !c[k as 'h5'];
  function set(k: ColorKey, v: string | undefined) {
    if (!c) return;
    const next: ThemeColors = { ...c, palette: { ...c.palette } };
    if (k.startsWith('palette.')) next.palette[k.slice(8) as Named] = v!;
    else if (v === undefined) delete next[k as 'h5'];
    else (next as unknown as Record<string, string>)[k] = v;
    store.setThemeColors(name, next);
  }

  // ---- the picker and the menu of a row ----------------------------------------------------------------------------
  let pick = $state<{ key: ColorKey; anchor: HTMLElement; alpha: boolean } | null>(null);
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  $effect(() => setLayer('themeEditor', !!(pick || menu)));
  $effect(() => () => setLayer('themeEditor', false));
  function rowMenu(e: MouseEvent, k: ColorKey) {
    if (!isDeep(k)) return;
    e.preventDefault();
    menu = { x: e.clientX, y: e.clientY, items: [{ label: 'Как уровень 4', action: () => set(k, undefined), disabled: inherited(k) }] };
  }

  // ---- the example ----------------------------------------------------------------------------------------------------
  let rich = $state(false);
  const SAMPLE = (deepLines: boolean) => `#+TITLE: Работа
#+FILETAGS: :work:
#+TODO: TODO NEXT WAIT | DONE CANCELLED

* Q4 2026  :planning:
** TODO [#A] Подготовить бюджет 2027 [1/3]
   DEADLINE: <2026-10-24 Сб>
   :PROPERTIES:
   :ID:       budget-2027
   :END:
   Свести заявки пяти команд — шаблон =budget.xlsx=
   Черновик: [[file:arch.org][Архитектура 2027]]
*** DONE Собрать заявки от тимлидов
    CLOSED: [2026-10-08 Чт 18:20]
*** NEXT Свести расходы по направлениям
    - [X] инфраструктура
    - [ ] найм
** WAIT Ответ CTO по архитектуре
** CANCELLED Внешний аудит
**** Уровень 4
${deepLines ? '***** Уровень 5\n' : ''}`;
  let sample = $derived(SAMPLE(deep));
  const wf = $derived(resolveWorkflow(sample, 'пример.org', store.config));
  const reveal = { line: 10, n: 1, col: 30 };
  const label = (t: Theme) => `${t.basedOn ? `на основе ${t.basedOn} · ` : ''}для ${t.appearance === 'dark' ? 'тёмного' : 'светлого'} оформления`;
  const lowWord = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'цвет' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'цвета' : 'цветов'} с низким контрастом`;
</script>

{#if theme && c}
  <div class="ted" aria-label="Редактор темы" role="region">
    <div class="top">
      <button class="back" onclick={() => (store.themeEditing = null)}>‹ Оформление</button>
      <input class="nm" aria-label="Название темы" bind:value={draft} spellcheck="false" maxlength="80"
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitName(); } }} onblur={commitName} />
      <span class="based">{label(theme)}</span>
      {#if low.size}
        <span class="warn" title="Текст ниже 4,5:1, заголовки ниже 3:1 по отношению к фону">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3l8 14H2zM10 8v4M10 14.5v.01" /></svg>{lowWord(low.size)}
        </span>
      {/if}
      <span class="sp"></span>
      <Button onclick={() => void store.exportTheme(theme)}>Экспорт…</Button>
      <Button title="Вернуть цвета темы «{theme.basedOn ?? 'Panopticon'}»" onclick={() => store.resetTheme(name)}>Сбросить</Button>
    </div>
    <div class="cols">
      <div class="list">
        {#each groups as g (g.title)}
          <section class="grp" aria-label={g.title}>
            <div class="cap">{g.title}</div>
            <div class="rows">
              {#each g.rows as r (r.key)}
                {@const v = get(r.key)}
                {@const inh = inherited(r.key)}
                <button class="row" class:on={pick?.key === r.key} data-key={r.key} aria-label="{r.t}: {v}"
                  onclick={(e) => (pick = pick?.key === r.key ? null : { key: r.key, anchor: e.currentTarget as HTMLElement, alpha: !!r.alpha })}
                  oncontextmenu={(e) => rowMenu(e, r.key)}>
                  <span class="sw" class:inh style="background:{v}"></span>
                  <span class="rt">{r.t}</span>
                  {#if low.has(r.key)}<span class="lw">{ratioWords(low.get(r.key)!)}</span>{/if}
                  {#if inh}<span class="as4">как уровень 4</span>{/if}
                  <span class="hex" class:dimhex={inh}>{v.toUpperCase()}</span>
                </button>
              {/each}
            </div>
            {#if g.link}<button class="lnk" onclick={() => (deepAsked = !deep)}>{g.link}</button>{/if}
          </section>
        {/each}
      </div>
      <div class="pv">
        <div class="pvh">
          <b>Пример</b><span>обновляется сразу</span>
          <span class="sp"></span>
          <Segments label="Вид примера" value={rich} onchange={(v) => (rich = v)} options={[{ value: false, label: 'Исходник' }, { value: true, label: 'Оформление' }]} />
        </div>
        <div class="pvbody" style={themeVars(c)}>
          {#key rich}
            <Editor text={sample} fileKey="theme-example" {wf} {reveal} {rich} levels={store.levels} onchange={(t) => (sample = t)} oncursor={() => {}} onfollow={() => {}} />
          {/key}
        </div>
      </div>
    </div>
  </div>
  <!-- an each, not an if: the picker keeps its row while it is taken down -->
  {#each pick ? [pick] : [] as p (p.key)}
    <ColorPop value={get(p.key)} alpha={p.alpha} swatches={NAMED.map((n) => c.palette[n])} anchor={p.anchor} onchange={(x) => set(p.key, x)} onclose={() => (pick = null)} />
  {/each}
  {#if menu}<Menu x={menu.x} y={menu.y} items={menu.items} label="Уровень" onclose={() => (menu = null)} />{/if}
{:else}
  <p class="gone">Темы «{name}» больше нет. <button class="lnk" onclick={() => (store.themeEditing = null)}>‹ Оформление</button></p>
{/if}

<style>
  .ted { height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--bg); color: var(--ink); font: 13px var(--ui); }
  .top { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; min-width: 0; padding: 12px 20px; border-bottom: 1px solid var(--rule); background: var(--card); }
  .back { flex: 0 0 auto; white-space: nowrap; height: 26px; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: var(--lampink); font: 13px var(--ui); }
  .back:hover { text-decoration: underline; }
  .nm { flex: 0 1 240px; height: 30px; min-width: 140px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 7px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); caret-color: var(--lamp); font: 600 13.5px var(--ui); outline: none; -webkit-user-select: text; user-select: text; }
  .nm:focus { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .based { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--ink3); }
  .warn { flex: 0 0 auto; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--wait); }
  .sp { flex: 1 0 0; }
  .cols { flex: 1 1 0; min-height: 0; display: flex; flex-wrap: wrap; overflow: auto; }
  .list { flex: 1 1 320px; min-width: 0; box-sizing: border-box; padding: 18px 20px 24px; display: flex; flex-direction: column; gap: 18px; border-right: 1px solid var(--rule); background-color: var(--bg);
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 24px 24px; background-position: -1px -1px; }
  .grp { display: flex; flex-direction: column; gap: 6px; }
  .cap { margin: 0 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink3); }
  .rows { display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--rule); border-radius: 12px; overflow: hidden; }
  .row { display: flex; align-items: center; gap: 10px; min-height: 38px; box-sizing: border-box; padding: 4px 14px; border: 0; border-top: 1px solid var(--rule); background: transparent; color: var(--ink); font: 13px var(--ui); text-align: left; }
  .row:first-child { border-top: 0; }
  .row:hover:not(.on) { background: var(--chip); }
  .row.on { background: var(--lampsoft); }
  .row:focus-visible { outline: 2px solid var(--lampline); outline-offset: -2px; }
  .sw { flex: 0 0 20px; width: 20px; height: 20px; box-sizing: border-box; border-radius: 5px; box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.35); }
  .sw.inh { border: 1.5px dashed var(--ink3); opacity: 0.55; }
  .rt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lw { font-size: 11px; font-weight: 600; color: var(--wait); }
  .as4 { font-size: 11px; color: var(--ink3); }
  .hex { font: 11.5px var(--mono); color: var(--ink2); }
  .hex.dimhex { color: var(--ink3); }
  .lnk { align-self: flex-start; height: 24px; padding: 0 4px; border: 0; background: transparent; color: var(--lampink); font: 12.5px var(--ui); }
  .pv { flex: 1.3 1 420px; min-width: 0; display: flex; flex-direction: column; }
  .pvh { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid var(--rule); background: var(--card); font-size: 12.5px; }
  .pvh span { color: var(--ink3); }
  .pvbody { flex: 1 1 0; min-height: 420px; display: flex; flex-direction: column; background: var(--ed-bg); }
  .gone { padding: 20px 28px; color: var(--ink2); }
</style>

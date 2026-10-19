<script lang="ts">
  import { RICH_ENABLED } from '../nextFlags';
  import { untrack } from 'svelte';
  import { store } from '../store.svelte';
  import { namedFor, resolveWorkflow } from '../org';
  import { NAMED, type Named, type Theme } from '../themes';
  import { contrastOf, deriveTokens, isDarkTheme, type AppTheme } from '../appTheme';
  import { setLayer } from '../settingsNav.svelte';
  import ColorPop from './ColorPop.svelte';
  import Button from './ui/Button.svelte';
  import Segments from './ui/Segments.svelte';
  import ThemePreview from './ThemePreview.svelte';
  import FontMenu from './FontMenu.svelte';
  import type { FontRole } from './fontList.svelte';

  // The theme's editor (ТЗ 57 §5), in place of the gallery of «Оформление»: «‹ Все темы», «Тема «…»»; on the left
  // 380 pt of settings — the name with «светлая / тёмная — по фону», «Основа» (the ground, the text, the accent with
  // their contrast), «Палитра» (the eight named colours, the user's statuses in them), «Детали» (the sidebar, the
  // grid, the headings); on the right the window in miniature, «Сбросить» (as it was when the editor opened) and
  // «Экспорт…». Every change is written at once and shows in the whole window. Own themes only: a built-in one is
  // duplicated first (the gallery's «Дублировать и изменить…»).
  let { name }: { name: string } = $props();

  const theme = $derived(store.ownThemes.find((t) => t.name === name));
  const app = $derived(theme?.app);
  /** As it was when the editor opened: «Сбросить». */
  let opened = $state.raw<Theme | undefined>(untrack(() => store.ownThemes.find((t) => t.name === name)));
  // renamed: the same theme as it was, by its new name
  $effect(() => {
    const n = name;
    untrack(() => {
      if (opened && opened.name !== n) opened = { ...opened, name: n, app: { ...opened.app, name: n } };
    });
  });
  const dark = $derived(!!app && isDarkTheme(app));
  const tk = $derived(app ? deriveTokens(app) : null);

  // ---- the name ---------------------------------------------------------------------------------------------------
  let draft = $derived(name);
  const commitName = () => {
    if (theme && draft.trim() && draft.trim() !== name) void store.renameTheme(theme, draft);
    else draft = name;
  };

  // ---- a change ----------------------------------------------------------------------------------------------------
  function put(f: (a: AppTheme) => AppTheme) {
    if (app) store.setThemeApp(name, f(app));
  }
  type Key = 'bg' | 'ink' | 'accent' | 'side' | `palette.${Named}` | `level.${number}`;
  function get(k: Key): string {
    if (!app) return '#000000';
    if (k === 'side') return app.details.side ?? tk!.side;
    if (k.startsWith('palette.')) return app.palette[k.slice(8) as Named];
    if (k.startsWith('level.')) return (app.details.levels ?? [app.base.ink, app.base.ink, app.base.ink, app.base.ink])[+k.slice(6)];
    return app.base[k as 'bg'];
  }
  function set(k: Key, v: string) {
    const c = v.slice(0, 7);
    put((a) => {
      if (k === 'side') return { ...a, details: { ...a.details, side: c } };
      if (k.startsWith('palette.')) return { ...a, palette: { ...a.palette, [k.slice(8)]: c } };
      if (k.startsWith('level.')) {
        const lv = [...(a.details.levels ?? [a.base.ink, a.base.ink, a.base.ink, a.base.ink])] as [string, string, string, string];
        lv[+k.slice(6)] = c;
        return { ...a, details: { ...a.details, levels: lv } };
      }
      return { ...a, base: { ...a.base, [k]: c } };
    });
  }

  // ---- the picker -------------------------------------------------------------------------------------------------
  let pick = $state<{ key: Key; anchor: HTMLElement } | null>(null);
  $effect(() => setLayer('themeEditor', !!pick));
  $effect(() => () => setLayer('themeEditor', false));
  const toggle = (k: Key, e: MouseEvent) => (pick = pick?.key === k ? null : { key: k, anchor: e.currentTarget as HTMLElement });

  // ---- the contrast -------------------------------------------------------------------------------------------------
  const ratio = (r: number) => `${(Math.floor(r * 10) / 10).toFixed(1)}:1`;
  const BASE: { key: 'bg' | 'ink' | 'accent'; t: string; hint: string }[] = [
    { key: 'bg', t: 'Фон', hint: 'Окно, редактор, экраны' },
    { key: 'ink', t: 'Текст', hint: 'Всё остальное — его оттенки' },
    { key: 'accent', t: 'Акцент', hint: 'Выбор, курсор, кнопки, ссылки' },
  ];
  /** The contrast with the ground: the text's for the ground and the text, `lampink`'s for the accent. */
  const contrastFor = (k: 'bg' | 'ink' | 'accent') => (app && tk ? contrastOf(k === 'accent' ? tk.lampink : app.base.ink, app.base.bg) : 0);

  // ---- the fonts (ТЗ 57 §6) ------------------------------------------------------------------------------------------
  const FONT_ROWS: { role: FontRole; t: string; hint: string }[] = [
    { role: 'title', t: 'Заголовки экранов', hint: '«Сегодня», «Агенда», крупные числа' },
    { role: 'text', t: 'Текст файла', hint: '«Оформление», карточки доски' },
    { role: 'ui', t: 'Интерфейс', hint: 'Всё остальное' },
    { role: 'mono', t: 'Моноширинный', hint: '«Исходник», даты, пути, терминал' },
  ];

  // ---- the palette and the user's statuses ----------------------------------------------------------------------------
  const SHORT: Record<Named, string> = { red: 'Красн.', orange: 'Оранж.', yellow: 'Жёлт.', green: 'Зелён.', teal: 'Голуб.', blue: 'Синий', purple: 'Фиол.', gray: 'Серый' };
  const statuses = $derived.by(() => {
    const wf = resolveWorkflow('', 'пример.org', store.config);
    const seen = new Set<string>();
    return (wf.sequences ?? []).flatMap((s) => s.states).filter((st) => !seen.has(st.name) && !!seen.add(st.name)).map((st) => ({ name: st.name, named: namedFor(st.name, wf) as Named }));
  });
</script>

{#if theme && app && tk}
  <div class="ted" aria-label="Редактор темы" role="region">
    <div class="head">
      <button class="back" onclick={() => (store.themeEditing = null)}>‹ Все темы</button>
      <h1>Тема «{name}»</h1>
    </div>
    <div class="cols">
      <div class="left">
        <div class="namerow">
          <input class="nm" aria-label="Название темы" bind:value={draft} spellcheck="false" maxlength="80"
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitName(); } }} onblur={commitName} />
          <span class="look">{dark ? 'тёмная' : 'светлая'} — по фону</span>
        </div>

        <section class="grp" aria-label="Основа">
          <div class="cap">Основа</div>
          <div class="card">
            {#each BASE as r (r.key)}
              {@const cr = contrastFor(r.key)}
              <div class="row" data-key={r.key}>
                <div class="rl"><span class="rt">{r.t}</span><span class="rh">{r.hint}</span></div>
                <span class="cr" class:ok={cr >= 4.5} title={r.key === 'accent' ? 'Ссылки и подписи акцентом к фону' : 'Текст к фону'}>{ratio(cr)} {cr >= 4.5 ? '✓' : 'мало'}</span>
                <span class="hex">{get(r.key).toUpperCase()}</span>
                <button class="sw big" class:on={pick?.key === r.key} style:background={get(r.key)} aria-label="{r.t}: {get(r.key)}" onclick={(e) => toggle(r.key, e)}></button>
              </div>
            {/each}
          </div>
        </section>

        <section class="grp" aria-label="Палитра">
          <div class="cap">Палитра · восемь именованных цветов</div>
          <div class="card pad">
            <div class="pal">
              {#each NAMED as n (n)}
                {@const c = app.palette[n]}
                {@const cr = contrastOf(c, app.base.bg)}
                <div class="pc">
                  <button class="sw pal-sw" class:on={pick?.key === `palette.${n}`} style:background={c} aria-label="{SHORT[n]}: {c}" title={cr < 4.5 ? `Контраст с фоном ${ratio(cr)} — меньше 4.5:1` : undefined}
                    onclick={(e) => toggle(`palette.${n}`, e)}></button>
                  <span class="pl">{SHORT[n]}</span>
                  {#if cr < 4.5}<i class="low" aria-label="Мало контраста"></i>{/if}
                </div>
              {/each}
            </div>
            {#if statuses.length}
              <div class="caps">{#each statuses as st (st.name)}<span class="capsule" style:--c={app.palette[st.named]}>{st.name}</span>{/each}</div>
            {/if}
            <p class="note">Цвет статуса выбирается в «Статусах» — тема задаёт его оттенок</p>
          </div>
        </section>

        <section class="grp" aria-label="Детали">
          <div class="cap">Детали</div>
          <div class="card">
            <div class="row" id="ted-side">
              <div class="rl"><span class="rt">Сайдбар</span></div>
              <Segments labelledby="ted-side" value={app.details.side ? 'own' : 'auto'} options={[{ value: 'auto', label: 'Авто' }, { value: 'own', label: 'Свой цвет' }]}
                onchange={(v) => put((a) => ({ ...a, details: { ...a.details, side: v === 'own' ? tk.side : undefined } }))} />
              {#if app.details.side}<button class="sw" class:on={pick?.key === 'side'} style:background={app.details.side} aria-label="Сайдбар: {app.details.side}" onclick={(e) => toggle('side', e)}></button>{/if}
            </div>
            <div class="row" id="ted-grid">
              <div class="rl"><span class="rt">Сетка</span></div>
              <Segments labelledby="ted-grid" value={app.details.grid} options={[{ value: 'none', label: 'Нет' }, { value: 'quiet', label: 'Тихая' }, { value: 'visible', label: 'Заметная' }]}
                onchange={(v) => put((a) => ({ ...a, details: { ...a.details, grid: v as AppTheme['details']['grid'] } }))} />
            </div>
            <div class="row" id="ted-heads">
              <div class="rl"><span class="rt">Заголовки</span></div>
              <Segments labelledby="ted-heads" value={app.details.headings} options={[{ value: 'ink', label: 'Цветом текста' }, { value: 'levels', label: 'По уровням' }]}
                onchange={(v) => put((a) => ({ ...a, details: { ...a.details, headings: v as AppTheme['details']['headings'], ...(v === 'levels' && !a.details.levels ? { levels: [a.palette.blue, a.palette.teal, a.palette.orange, a.palette.purple] as [string, string, string, string] } : {}) } }))} />
            </div>
            {#if app.details.headings === 'levels'}
              <div class="row lv">
                {#each [0, 1, 2, 3] as i (i)}
                  <span class="lvc"><button class="sw" class:on={pick?.key === `level.${i}`} style:background={get(`level.${i}`)} aria-label="Уровень {i + 1}: {get(`level.${i}`)}" onclick={(e) => toggle(`level.${i}`, e)}></button>{i + 1}</span>
                {/each}
              </div>
            {/if}
          </div>
        </section>
        <section class="grp" aria-label="Шрифты">
          <div class="cap">Шрифты</div>
          <div class="card">
            {#each FONT_ROWS.filter((r) => RICH_ENABLED || r.role !== 'text') as r (r.role)}
              <div class="row">
                <div class="rl"><span class="rt">{r.t}</span><span class="rh">{r.hint}</span></div>
                <FontMenu value={app.fonts[r.role]} role={r.role} label={r.t} onchange={(f) => put((a) => ({ ...a, fonts: { ...a.fonts, [r.role]: f } }))} />
              </div>
            {/each}
          </div>
        </section>
      </div>

      <div class="right">
        <div class="cap">Предпросмотр</div>
        <ThemePreview theme={app} big />
        <div class="acts">
          <Button disabled={!opened} title="Вернуть, как было при открытии редактора" onclick={() => opened && store.restoreTheme(opened)}>Сбросить</Button>
          <Button onclick={() => void store.exportTheme(theme)}>Экспорт…</Button>
        </div>
      </div>
    </div>
  </div>
  <!-- an each, not an if: the picker keeps its key while it is taken down -->
  {#each pick ? [pick] : [] as p (p.key)}
    <ColorPop value={get(p.key)} swatches={NAMED.map((n) => app.palette[n])} anchor={p.anchor} onchange={(x) => set(p.key, x)} onclose={() => (pick = null)} />
  {/each}
{:else}
  <p class="gone">Темы «{name}» больше нет. <button class="back" onclick={() => (store.themeEditing = null)}>‹ Все темы</button></p>
{/if}

<style>
  .ted { height: 100%; min-height: 0; overflow: auto; box-sizing: border-box; padding: 26px 32px 32px; color: var(--ink); font: 13px var(--ui); }
  .head { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin-bottom: 20px; }
  .back { height: 22px; padding: 0; border: 0; background: none; color: var(--lampink); font: 13px var(--ui); }
  .back:hover { text-decoration: underline; }
  h1 { margin: 0; font: 400 30px/1.1 var(--title); }
  .cols { display: flex; gap: 32px; align-items: flex-start; }
  .left { flex: 0 0 380px; min-width: 0; display: flex; flex-direction: column; gap: 18px; }
  .right { flex: 1 1 0; min-width: 260px; position: sticky; top: 0; display: flex; flex-direction: column; gap: 10px; }
  .namerow { display: flex; align-items: center; gap: 10px; }
  .nm { flex: 1; min-width: 0; height: 32px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 8px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); caret-color: var(--lamp); font: 600 14px var(--ui); outline: none; -webkit-user-select: text; user-select: text; }
  .nm:focus { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .look { flex: 0 0 auto; padding: 0 8px; border-radius: 6px; background: var(--chip); color: var(--ink2); font-size: 11.5px; line-height: 22px; }
  .grp { display: flex; flex-direction: column; gap: 6px; }
  .cap { margin: 0 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink3); }
  .card { display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--rule); border-radius: 12px; overflow: hidden; }
  .card.pad { padding: 12px 14px; gap: 10px; }
  .row { display: flex; align-items: center; gap: 10px; min-height: 52px; box-sizing: border-box; padding: 8px 14px; border-top: 1px solid var(--rule); }
  .row:first-child { border-top: 0; }
  .rl { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .rt { font-size: 13px; }
  .rh { font-size: 11.5px; color: var(--ink3); }
  .cr { flex: 0 0 auto; padding: 0 6px; border-radius: 5px; font-size: 11px; line-height: 18px; font-weight: 600; color: var(--todo); background: color-mix(in srgb, var(--todo) 12%, transparent); }
  .cr.ok { color: var(--done); background: color-mix(in srgb, var(--done) 12%, transparent); }
  .hex { flex: 0 0 auto; font: 11.5px var(--mono); color: var(--ink3); }
  .sw { flex: 0 0 auto; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.4); }
  .sw.big { width: 26px; height: 26px; border-radius: 7px; }
  .sw.on, .sw:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
  .pal { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; }
  .pc { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .pal-sw { width: 28px; height: 28px; border-radius: 7px; }
  .pl { font-size: 10.5px; color: var(--ink3); }
  .low { position: absolute; top: 30px; right: calc(50% - 18px); width: 6px; height: 6px; border-radius: 50%; background: var(--todo); }
  .caps { display: flex; flex-wrap: wrap; gap: 5px; }
  .capsule { padding: 1px 6px; border-radius: 5px; font: 700 10.5px/16px var(--ui); letter-spacing: 0.03em; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
  .note { margin: 0; font-size: 11.5px; color: var(--ink3); }
  .row.lv { justify-content: flex-end; min-height: 44px; gap: 14px; }
  .lvc { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--ink3); }
  .acts { display: flex; gap: 8px; }
  .gone { padding: 20px 28px; color: var(--ink2); }
</style>

<script lang="ts">
  import { deriveTokens, type AppTheme } from '../appTheme';
  import { fontCss, tokenVars } from './tokens';

  // A theme's window in miniature (ТЗ 57 §3): the bar of the sections, the sidebar, the tabs, the editor with a title,
  // headings and the capsules of statuses — in the theme's tokens and fonts, nothing in it to press. Static parts
  // rather than the live window scaled: a dozen cards draw at once (decided by trying).
  let { theme, big = false }: { theme: AppTheme; big?: boolean } = $props();
  const tk = $derived(deriveTokens(theme));
  const lv = $derived(theme.details.headings === 'levels' && theme.details.levels ? theme.details.levels : null);
  const style = $derived(
    `${tokenVars(theme)};--pt:${fontCss(theme.fonts.title, 'title')};--px:${fontCss(theme.fonts.text, 'text')};--pu:${fontCss(theme.fonts.ui, 'ui')};--pm:${fontCss(theme.fonts.mono, 'mono')}`,
  );
</script>

<div class="box" class:big><div class="pv" {style} inert aria-hidden="true">
  <div class="rail"><i class="on"></i><i></i><i></i><i></i></div>
  <div class="sb">
    <b>Файлы</b>
    <span class="f on">Midterm</span><span class="f">Команда</span><span class="f">Inbox</span>
  </div>
  <div class="main">
    <div class="tabs"><span class="tab">work</span><span class="tab on">Midterm</span></div>
    <div class="ed" class:grid={theme.details.grid !== 'none'}>
      <div class="kick">ПЯТНИЦА, 16 ОКТЯБРЯ</div>
      <div class="h0">Midterm</div>
      <div class="h1" style:color={lv?.[0]}>Платформа</div>
      <div class="ln"><span class="cap" style:--c={tk.todo}>TODO</span><span class="tx">Роадмап Q4</span></div>
      <div class="ln sel"><span class="cap" style:--c={tk.next}>NEXT</span><span class="tx">Переезд хранилища</span></div>
      <div class="ln"><span class="cap" style:--c={tk.done}>DONE</span><span class="tx">Ревью найма</span></div>
      <div class="bar"></div>
      <div class="foot"><span class="lnk">ссылка</span><span class="go">Готово</span></div>
    </div>
  </div>
</div></div>

<style>
  /* the type scales with the card: 2.4 % of its width */
  .box { container-type: inline-size; width: 100%; }
  .pv { position: relative; display: flex; width: 100%; aspect-ratio: 16 / 10; overflow: hidden; background: var(--bg); color: var(--ink); font: 2.4cqw/1.3 var(--pu); pointer-events: none; user-select: none; }
  .big .pv { border-radius: 10px; box-shadow: var(--popshadow); }
  .rail { flex: 0 0 7%; display: flex; flex-direction: column; align-items: center; gap: 6%; padding-top: 6%; background: var(--side); border-right: 1px solid var(--rule); }
  .rail i { width: 46%; aspect-ratio: 1; border-radius: 25%; background: var(--chip2); }
  .rail i.on { background: var(--lampsoft); box-shadow: inset 0 0 0 1px var(--lampline); }
  .sb { flex: 0 0 22%; display: flex; flex-direction: column; gap: 0.5em; padding: 1.4em 0.9em; background: var(--side); border-right: 1px solid var(--rule); }
  .sb b { font-weight: 700; font-size: 1.1em; }
  .f { padding: 0.25em 0.5em; border-radius: 0.5em; color: var(--ink2); white-space: nowrap; overflow: hidden; }
  .f.on { background: var(--lampsoft); color: var(--lampink); font-weight: 600; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .tabs { display: flex; height: 13%; background: var(--side); border-bottom: 1px solid var(--rule); }
  .tab { display: flex; align-items: center; padding: 0 1.2em; color: var(--ink3); border-right: 1px solid var(--rule); white-space: nowrap; }
  .tab.on { background: var(--bg); color: var(--ink); box-shadow: inset 0 2px 0 var(--lamp); }
  .ed { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 0.5em; padding: 1.3em 1.8em 1.1em; }
  .ed.grid { background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 1.6em 1.6em; }
  .kick { font: 0.85em var(--pm); letter-spacing: 0.06em; color: var(--ink3); }
  .h0 { font: 2.6em/1 var(--pt); }
  .h1 { font: 600 1.6em/1.1 var(--px); margin-top: 0.1em; }
    .ln { display: flex; align-items: center; gap: 0.6em; padding: 0.15em 0.3em; margin: 0 -0.3em; border-radius: 0.4em; font: 1.3em/1.2 var(--px); white-space: nowrap; overflow: hidden; }
  .ln.sel { background: var(--lampsoft); }
  .cap { flex: 0 0 auto; padding: 0.1em 0.45em; border-radius: 0.35em; font: 700 0.62em/1.3 var(--pu); letter-spacing: 0.04em; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
  .bar { height: 0.5em; width: 78%; border-radius: 0.25em; background: var(--ink); opacity: 0.18; }
  .foot { display: flex; align-items: center; gap: 1em; margin-top: auto; }
  .lnk { color: var(--lampink); text-decoration: underline; }
  .go { margin-left: auto; padding: 0.3em 0.9em; border-radius: 0.5em; background: var(--lamp); color: var(--onlamp); font-weight: 600; }
</style>

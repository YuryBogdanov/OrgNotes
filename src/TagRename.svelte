<script lang="ts">
  import { TagRenameCtl, pl } from './tagRenameCtl.svelte';
  import { portal } from './portal';

  // «Переименовать во всех файлах…» and «Объединить с…» (ТЗ 38 §5): `:from:` → a new name (or, to merge, one of the
  // tags there are), what changes and where, a warning when the name is taken (they merge); one edit, one ⌘Z.
  let { from, merge = false, onclose }: { from: string; merge?: boolean; onclose: () => void } = $props();
  // svelte-ignore state_referenced_locally
  const c = new TagRenameCtl(from, merge, onclose); // the tag of the dialog as it opened
  const sugg = $derived(c.sugg);
  const exists = $derived(c.exists);
  const bad = $derived(c.bad);
  const ok = $derived(c.ok);
  const p = $derived(c.preview);
  const to = $derived(c.to);
  const cur = $derived(c.cur);
  const busy = $derived(c.busy);
  const go = c.go;
  const key = c.key;
</script>

<div class="layer" use:portal>
  <div class="scrim" aria-hidden="true"></div>
  <div class="dlg" role="dialog" aria-modal="true" aria-label={merge ? 'Объединить тег' : 'Переименовать тег'} tabindex="-1" onkeydown={key}>
    <b class="t">{merge ? 'Объединить тег с другим' : 'Переименовать тег во всех файлах'}</b>
    <div class="ft">
      <span class="old">:{from}:</span>
      <span class="ar">→</span>
      <span class="new" class:badf={!!bad}>
        <i>:</i>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={c.text} autofocus placeholder={merge ? 'тег' : 'новое имя'} aria-label={merge ? 'С каким тегом объединить' : 'Новое имя тега'} spellcheck="false" oninput={() => (c.cur = 0)} />
        <i>:</i>
      </span>
    </div>
    {#if merge && sugg.length && !exists}
      <div class="sug" role="listbox" aria-label="Теги">
        {#each sugg as s, i (s.tag)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div role="option" aria-selected={i === cur} class:on={i === cur} onclick={() => (c.text = s.tag)}><span>:{s.tag}:</span><em>{s.n}</em></div>
        {/each}
      </div>
    {/if}
    {#if bad}<div class="err" role="alert">{bad}</div>{/if}
    <div class="pv" aria-label="Что изменится">
      <div>Изменится <b>{p.n} {pl(p.n, 'заголовок', 'заголовка', 'заголовков')} в {p.files} {pl(p.files, 'файле', 'файлах', 'файлах')}</b>.</div>
      {#if ok && p.have}<div class="warn">Тег :{to}: уже есть у {p.have} {pl(p.have, 'заголовка', 'заголовков', 'заголовков')} — теги объединятся.</div>{/if}
      {#if p.list}<div class="list">{p.list}</div>{/if}
    </div>
    <div class="fine">Одна правка во всех файлах: ⌘Z отменит её целиком. Цвет тега переедет вместе с ним.</div>
    <div class="row">
      <button class="b" onclick={onclose}>Отмена</button>
      <button class="b pri" disabled={!ok || busy} onclick={() => void go()}>{merge ? 'Объединить' : 'Переименовать'}</button>
    </div>
  </div>
</div>

<style>
  .layer { color: var(--fg); font: 13px var(--ui, -apple-system, system-ui, sans-serif); }
  .scrim { position: fixed; inset: 0; z-index: 90; background: rgba(0, 0, 0, 0.3); }
  .dlg { position: fixed; z-index: 91; left: 50%; top: 140px; transform: translateX(-50%); width: min(480px, calc(100% - 32px)); box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; padding: 18px 20px 16px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45); outline: none; }
  .t { font-size: 15px; }
  .ft { display: flex; align-items: center; gap: 10px; }
  .old { font: 600 14px var(--mono); padding: 4px 8px; border-radius: 6px; background: var(--tagbg); color: var(--tagfg); }
  .ar { color: var(--fg3); }
  .new { flex: 1; display: flex; align-items: center; height: 30px; padding: 0 8px; border: 2px solid var(--acc); border-radius: 7px; font: 14px var(--mono); }
  .new.badf { border-color: var(--todo); }
  .new i { font-style: normal; color: var(--fg3); }
  .new input { flex: 1; min-width: 0; border: 0; outline: none; background: none; color: var(--fg); font: inherit; }
  .sug { margin-top: -6px; padding: 4px; border: 1px solid var(--line); border-radius: 8px; }
  .sug div { display: flex; justify-content: space-between; height: 26px; align-items: center; padding: 0 8px; border-radius: 5px; font: 12.5px var(--mono); }
  .sug div.on { background: var(--sel); }
  .sug em { font: 11.5px var(--ui, system-ui); font-style: normal; color: var(--fg3); }
  .err { margin-top: -6px; font-size: 12px; color: var(--todo); }
  .pv { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 9px; background: var(--side); border: 1px solid var(--line); font-size: 13px; }
  .warn { color: var(--wait); }
  .list { font-size: 12px; color: var(--fg2); }
  .fine { font-size: 12px; color: var(--fg3); line-height: 1.5; }
  .row { display: flex; justify-content: flex-end; gap: 8px; }
  .b { height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font-size: 13px; }
  .b:disabled { opacity: 0.5; }
  .b.pri { border: 0; padding: 0 14px; background: var(--acc); color: var(--onacc); font-weight: 600; }
</style>

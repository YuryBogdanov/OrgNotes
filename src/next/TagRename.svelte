<script lang="ts">
  import { TagRenameCtl, pl } from '../tagRenameCtl.svelte';
  import Sheet from './ui/Sheet.svelte';
  import Button from './ui/Button.svelte';

  // «Переименовать во всех файлах…» / «Объединить с…» in the new interface (ТЗ 44 §4, ТЗ 38 §5): the old one's
  // workings (tagRenameCtl.svelte.ts), a sheet — `:from:` → the field, the tags offered to merge with, the reason in
  // `todo`, what changes and where, «Отмена» and the main one.
  let { from, merge = false, onclose }: { from: string; merge?: boolean; onclose: () => void } = $props();
  // svelte-ignore state_referenced_locally
  const c = new TagRenameCtl(from, merge, onclose); // the tag of the sheet as it opened
  const focus = (el: HTMLInputElement) => queueMicrotask(() => el.focus());
</script>

<Sheet title={merge ? 'Объединить тег с другим' : 'Переименовать тег во всех файлах'} label={merge ? 'Объединить тег' : 'Переименовать тег'} oncancel={onclose}>
  <div class="ft">
    <span class="old">:{from}:</span><span class="ar">→</span>
    <span class="new" class:bad={!!c.bad}>
      <i>:</i><input bind:value={c.text} placeholder={merge ? 'тег' : 'новое имя'} aria-label={merge ? 'С каким тегом объединить' : 'Новое имя тега'} spellcheck="false" autocomplete="off"
        oninput={() => (c.cur = 0)} onkeydown={c.key} use:focus /><i>:</i>
    </span>
  </div>
  {#if merge && c.sugg.length && !c.exists}
    <div class="sug" role="listbox" aria-label="Теги">
      {#each c.sugg as s, i (s.tag)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div role="option" tabindex="-1" aria-selected={i === c.cur} class:on={i === c.cur} onclick={() => (c.text = s.tag)}><span>{s.tag}</span><em>{s.n}</em></div>
      {/each}
    </div>
  {/if}
  {#if c.bad}<div class="err" role="alert">{c.bad}</div>{/if}
  <div class="pv" aria-label="Что изменится">
    <div>Изменится <b>{c.preview.n} {pl(c.preview.n, 'заголовок', 'заголовка', 'заголовков')} в {c.preview.files} {pl(c.preview.files, 'файле', 'файлах', 'файлах')}</b>.</div>
    {#if c.ok && c.preview.have}<div class="warn">Тег :{c.to}: уже есть у {c.preview.have} {pl(c.preview.have, 'заголовка', 'заголовков', 'заголовков')} — теги объединятся.</div>{/if}
    {#if c.preview.list}<div class="list">{c.preview.list}</div>{/if}
  </div>
  <div class="fine">Одна правка во всех файлах: ⌘Z отменит её целиком. Цвет тега переедет вместе с ним.</div>
  {#snippet foot()}
    <span style="flex:1"></span>
    <Button key="esc" onclick={onclose}>Отмена</Button>
    <Button kind="main" key="↩" disabled={!c.ok || c.busy} onclick={() => void c.go()}>{merge ? 'Объединить' : 'Переименовать'}</Button>
  {/snippet}
</Sheet>

<style>
  .ft { display: flex; align-items: center; gap: 10px; }
  .old { padding: 4px 8px; border-radius: 6px; background: var(--chip); color: var(--ink2); font: 600 13px var(--mono); }
  .ar { color: var(--ink3); }
  .new { flex: 1; display: flex; align-items: center; height: 30px; padding: 0 10px; border-radius: 7px; background: var(--field); box-shadow: inset 0 0 0 1.5px var(--lampline); font: 13px var(--mono); }
  .new.bad { box-shadow: inset 0 0 0 1.5px var(--todo); }
  .new i { font-style: normal; color: var(--ink3); }
  .new input { flex: 1; min-width: 0; padding: 0; border: 0; outline: none; background: none; color: var(--ink); caret-color: var(--lamp); font: inherit; -webkit-user-select: text; user-select: text; }
  .sug { display: flex; flex-direction: column; gap: 1px; }
  .sug div { display: flex; justify-content: space-between; align-items: center; height: 28px; padding: 0 10px; border-radius: 6px; font: 12.5px var(--mono); color: var(--ink); cursor: default; }
  .sug div.on { background: var(--lamp); color: var(--onlamp); }
  .sug em { font: 11.5px var(--ui); font-style: normal; color: var(--ink3); }
  .err { font-size: 12px; color: var(--todo); }
  .pv { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 8px; background: var(--chip); color: var(--ink2); }
  .pv b { color: var(--ink); }
  .warn { color: var(--wait); }
  .list { font-size: 12px; }
  .fine { font-size: 12px; color: var(--ink3); }
</style>

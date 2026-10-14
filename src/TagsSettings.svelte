<script lang="ts">
  import { tagsState as ts } from './tagsState.svelte';
  import ColorPicker from './ColorPicker.svelte';
  import { toneOf } from './colors';
  import { bareTag, tagOk } from './tags';

  // «Настройки → Теги» (ТЗ 38 §7): each tag's colour (the navigator, the tab «Тег», the capsules), and the tags not
  // inherited by the headings under them. Kept in .orgnotes/config.json: they go with the notes.
  let picker = $state<{ tag: string; anchor: HTMLElement } | null>(null);
  let adding = $state('');
  const bad = $derived(adding.trim() !== '' && !tagOk(bareTag(adding)));
  function add() {
    const t = bareTag(adding);
    if (!t || !tagOk(t)) return;
    if (!ts.noInherit.some((x) => x.toLowerCase() === t.toLowerCase())) void ts.setNoInherit([...ts.noInherit, t]);
    adding = '';
  }
</script>

<div class="body">
  <section class="general" aria-label="Теги">
    <div class="cap">НЕ НАСЛЕДОВАТЬ ТЕГИ</div>
    <div class="box">
      <div class="chips" aria-label="Не наследовать теги">
        {#each ts.noInherit as t (t)}
          <span class="chip">:{t}:<button aria-label="Убрать {t}" onclick={() => void ts.setNoInherit(ts.noInherit.filter((x) => x !== t))}>×</button></span>
        {/each}
        <input bind:value={adding} placeholder="+ тег" aria-label="Добавить тег, который не наследуется" spellcheck="false" class:bad
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onblur={add} />
      </div>
      <p class="hint">Такой тег остаётся только на своём заголовке. Например, <code>:1on1:</code> — чтобы встреча не помечала все задачи под ней.</p>
    </div>

    <div class="cap">ЦВЕТА ТЕГОВ</div>
    <div class="box list">
      {#each ts.list as t, i (t.tag)}
        {@const c = ts.colorOf(t.tag)}
        <div class="row" class:first={i === 0}>
          <button class="sw" aria-label="Цвет тега {t.tag}" style:background={c ? `var(--p-${c})` : 'var(--tagdot)'} onclick={(e) => (picker = { tag: t.tag, anchor: e.currentTarget as HTMLElement })}></button>
          <span class="nm">:{t.tag}:</span>
          <span class="n">{t.n}</span>
        </div>
      {:else}
        <p class="hint">В заметках пока нет тегов.</p>
      {/each}
    </div>
    <p class="help">Цвет виден в навигаторе «Теги», на вкладке тега и в капсулах. Цвета и список «Не наследовать» хранятся в папке заметок — <code>.orgnotes/config.json</code>.</p>
  </section>
</div>
{#if picker}
  <ColorPicker title="Цвет тега" value={ts.colorOf(picker.tag) ?? ''} keyword={':' + picker.tag + ':'} fallback={toneOf('gray')!} anchor={picker.anchor}
    onpick={(c) => { void ts.setColor(picker!.tag, c || null); picker = null; }} onclose={() => (picker = null)} />
{/if}

<style>
  .body { flex: 1; min-height: 0; display: flex; }
  section { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 24px; display: flex; flex-direction: column; gap: 10px; }
  section > * { flex-shrink: 0; }
  .general { max-width: 760px; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--fg2); padding: 4px 6px 0; }
  .box { padding: 10px 12px; background: var(--side); border: 1px solid var(--line); border-radius: 8px; display: flex; flex-direction: column; gap: 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chip { display: inline-flex; align-items: center; gap: 2px; height: 24px; padding: 0 4px 0 8px; border-radius: 5px; background: var(--tagbg); color: var(--tagfg); font: 12px var(--mono); }
  .chip button { width: 16px; height: 16px; padding: 0; border: 0; background: none; color: var(--fg3); font-size: 13px; line-height: 1; }
  .chips input { width: 110px; height: 24px; box-sizing: border-box; padding: 0 8px; border: 1px dashed var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); font: 12px var(--mono); outline: none; }
  .chips input:focus { border: 1px solid var(--acc); }
  .chips input.bad { border-color: var(--todo); }
  .hint { margin: 0; font-size: 12px; color: var(--fg2); line-height: 1.45; }
  .help { margin: 4px 6px 0; font-size: 12px; line-height: 1.5; color: var(--fg2); }
  code { font-family: var(--mono); }
  .list { gap: 0; padding: 4px 12px; }
  .row { display: flex; align-items: center; gap: 10px; height: 32px; border-top: 1px solid var(--line); }
  .row.first { border-top: 0; }
  .sw { width: 14px; height: 14px; padding: 0; border: 0; border-radius: 50%; box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg) 15%, transparent); }
  .nm { flex: 1; font: 12.5px var(--mono); }
  .n { font-size: 11.5px; color: var(--fg3); }
</style>

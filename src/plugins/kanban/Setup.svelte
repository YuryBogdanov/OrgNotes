<script lang="ts">
  import { onMount } from 'svelte';
  import { kanban } from './state.svelte';
  import { bestSet, countFor, countWords, type StatusSet } from './board';
  import type { BFile } from './state.svelte';

  // «Показать <файл> как доску» (ТЗ 33 §2): a card per set of statuses with how many level-1 headings it would take;
  // the one with the most is chosen; «Показать доску» writes «#+BOARD: …» at the top of the file.
  let { file, current = null, onpick, oncancel }: { file: BFile; current?: string | null; onpick: (s: StatusSet) => void; oncancel: () => void } = $props();
  const level1 = file.headings.filter((h) => h.level === 1).length;
  const sets = file.sets;
  let chosen = $state(sets.find((s) => s.name === current)?.name ?? bestSet(file.headings, sets)?.name ?? sets[0]?.name ?? '');
  const name = file.path.split('/').pop() ?? file.path;
  let root: HTMLDivElement | undefined = $state();

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      oncancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = sets.findIndex((s) => s.name === chosen);
      chosen = sets[(i + (e.key === 'ArrowDown' ? 1 : -1) + sets.length) % sets.length].name;
    }
  }
  function pick() {
    const s = sets.find((x) => x.name === chosen);
    if (s) onpick(s);
  }
  onMount(() => root?.focus());
</script>

<div class="kb-setup" role="dialog" aria-label="Показать как доску" tabindex="0" bind:this={root} onkeydown={key}>
  <div class="kb-sh">
    <b>Показать {name} как доску</b>
    <span>Выберите workflow: его статусы станут колонками, заголовки 1-го уровня — карточками.</span>
  </div>
  <div class="kb-sets" role="radiogroup" aria-label="Workflow">
    {#each sets as s (s.name)}
      {@const n = countFor(file.headings, s)}
      <button class="kb-set" class:on={chosen === s.name} role="radio" aria-checked={chosen === s.name} onclick={() => (chosen = s.name)} ondblclick={pick}>
        <span class="kb-radio" aria-hidden="true"></span>
        <span class="kb-sb">
          <span class="kb-sn"><b>{s.name}</b><span class="kb-cnt" class:none={!n}>{countWords(n, level1)}</span></span>
          <span class="kb-kws">{#each s.states as st (st.name)}<span class="kb-kw" style:--c={kanban.tone(st.name, file.path)}>{st.name}</span>{/each}</span>
        </span>
      </button>
    {:else}
      <div class="kb-none">В «Настройки → Статусы» нет наборов статусов.</div>
    {/each}
  </div>
  <div class="kb-plate">В начало файла добавится строка <code>#+BOARD: {chosen}</code> — Emacs её не трогает. Заголовки без статуса и со статусами других workflow на доске не показываются и не меняются.</div>
  <div class="kb-btns">
    <button class="kb-btn" onclick={oncancel}>Отмена</button>
    <button class="kb-btn pri" disabled={!chosen} onclick={pick}>Показать доску</button>
  </div>
</div>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from '../store.svelte';

  // ⌘F of the new interface (ТЗ 42 §5.7): a floating panel of 420 pt in the editor's upper right corner — the field
  // and «2 из 5», ↑ ↓ (⌘G / ⇧⌘G), «Aa», «.*» (a regular expression), ⎋; ⌥⌘F adds «Заменить на…» with «Заменить»
  // and «Все» (one edit for the file, ⌘Z takes it back whole).
  let { q = $bindable(''), re = $bindable(false), replacing = false, info, focusN = 0, onnext, onprev, onreplace, onclose }: {
    q: string;
    re: boolean;
    replacing?: boolean;
    info: { total: number; cur: number; folded: number; wrapped: boolean } | null;
    focusN?: number;
    onnext: () => void;
    onprev: () => void;
    onreplace: (text: string, all: boolean) => void;
    onclose: () => void;
  } = $props();

  let input: HTMLInputElement | undefined = $state();
  let repInput: HTMLInputElement | undefined = $state();
  let text = $state(q);
  let rep = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (q !== text && document.activeElement !== input) text = q;
  });
  const typed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => (q = text), 100);
  };
  $effect(() => {
    void focusN;
    void tick().then(() => {
      // ⌥⌘F with a query already: the replacement's field
      if (replacing && text) repInput?.focus();
      else {
        input?.focus();
        input?.select();
      }
    });
  });
  onMount(() => () => clearTimeout(timer));
  function key(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      q = text;
      if (e.shiftKey) onprev();
      else onnext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }
  function repKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      q = text;
      onreplace(rep, e.metaKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }
  const none = $derived(!!text && !!info && info.total === 0 && text === q);
  const count = $derived(!text || !info ? '' : info.total === 0 ? 'Не найдено' : `${info.cur + 1} из ${info.total}`);
  const can = $derived(!!text && !!info?.total);
</script>

<!-- ⎋ anywhere in the panel (a button pressed last) closes it -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="find" role="search" aria-label="Поиск в файле" onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose(); } }}>
  <div class="row">
    <div class="fld" class:none>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></svg>
      <input bind:this={input} bind:value={text} oninput={typed} onkeydown={key} aria-label="Найти в файле" placeholder="Найти в файле" spellcheck="false" autocomplete="off" />
      {#if count}<span class="cnt" class:no={none} aria-live="polite">{count}</span>{/if}
    </div>
    <button class="ib" aria-label="Предыдущее" title="Предыдущее ({store.keyHint('findPrev') || '⇧↩'})" onclick={onprev}><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 7.5L6 4l3.5 3.5" /></svg></button>
    <button class="ib" aria-label="Следующее" title="Следующее ({store.keyHint('findNext') || '↩'})" onclick={onnext}><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" /></svg></button>
    <button class="tg" title="Учитывать регистр" aria-pressed={store.findCase} class:on={store.findCase} onclick={() => store.setFindOpts({ cs: !store.findCase })}>Aa</button>
    <button class="tg mono" title="Регулярное выражение" aria-pressed={re} class:on={re} onclick={() => (re = !re)}>.*</button>
    <button class="ib" aria-label="Закрыть поиск" title="Закрыть (⎋)" onclick={onclose}><svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8" /></svg></button>
  </div>
  {#if replacing}
    <div class="row">
      <div class="fld"><input bind:this={repInput} bind:value={rep} onkeydown={repKey} aria-label="Заменить на" placeholder="Заменить на…" spellcheck="false" autocomplete="off" /></div>
      <!-- the focus back to the field: a button may turn off when nothing is left to replace -->
      <button class="btn" disabled={!can} onclick={() => (onreplace(rep, false), repInput?.focus())}>Заменить</button>
      <button class="btn" disabled={!can} onclick={() => (onreplace(rep, true), repInput?.focus())}>Все</button>
    </div>
  {/if}
</div>

<style>
  .find { position: absolute; top: 12px; right: 18px; z-index: 5; width: 420px; max-width: calc(100% - 36px); box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid var(--rule); border-radius: 10px; background: var(--card); box-shadow: var(--popshadow); font: 12.5px var(--ui); }
  .row { display: flex; align-items: center; gap: 4px; }
  .fld { flex: 1; min-width: 0; height: 28px; display: flex; align-items: center; gap: 7px; padding: 0 8px; box-sizing: border-box; border: 1px solid var(--rule); border-radius: 6px; background: var(--field); color: var(--ink3); }
  .fld:focus-within { border-color: var(--lamp); }
  .fld.none { border-color: var(--todo); }
  .fld input { flex: 1; min-width: 0; padding: 0; border: 0; outline: none; background: transparent; color: var(--ink); font: 13px var(--ui); -webkit-user-select: text; user-select: text; }
  .cnt { flex: 0 0 auto; font-size: 11.5px; color: var(--ink3); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .cnt.no { color: var(--todo); }
  .ib, .tg { flex: 0 0 auto; height: 28px; min-width: 28px; display: flex; align-items: center; justify-content: center; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: var(--ink2); font: 600 12px var(--ui); }
  .ib:hover, .tg:hover { background: var(--chip); color: var(--ink); }
  .tg.on { background: var(--lampsoft); color: var(--lampink); }
  .mono { font-family: var(--mono); }
  .btn { flex: 0 0 auto; height: 28px; padding: 0 12px; border: 0; border-radius: 6px; background: var(--chip2); color: var(--ink); font: 12.5px var(--ui); }
  .btn:disabled { opacity: 0.45; }
  button:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
</style>

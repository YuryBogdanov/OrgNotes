<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from './store.svelte';

  // ⌘F: the bar of a pane, over its text. Searches as you type (~100 ms), «2 из 6», ↩ / ⇧↩ next / previous,
  // «Aa» and «Слово» (kept on this Mac, shared with the search in all files), ⎋ or «Готово» closes.
  let { q = $bindable(''), info, global = false, focusN = 0, replacing = false, onreplace, onnext, onprev, onclose }: {
    q: string;
    info: { total: number; cur: number; folded: number; wrapped: boolean } | null;
    global?: boolean; // the query came from the search in all files
    focusN?: number; // bumped: the field takes the focus and its text is selected
    onnext: () => void;
    onprev: () => void;
    onclose: () => void;
    replacing?: boolean; // ⌥⌘F (ТЗ 42 §5.7): a second line «Заменить на…» with «Заменить» and «Все»
    onreplace?: (text: string, all: boolean) => void;
  } = $props();
  let rep = $state('');
  let repInput: HTMLInputElement | undefined = $state();
  function repKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      q = text;
      onreplace?.(rep, e.metaKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }

  let input: HTMLInputElement | undefined = $state();
  // the field's own text; the query follows it after a short pause
  let text = $state(q);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    // the query set from outside (⌘E, a jump from the search in all files)
    if (q !== text && document.activeElement !== input) text = q;
  });
  function typed() {
    clearTimeout(timer);
    timer = setTimeout(() => (q = text), 100);
  }
  $effect(() => {
    void focusN;
    void tick().then(() => {
      input?.focus();
      input?.select();
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
  const none = $derived(!!text && !!info && info.total === 0 && text === q);
  let wrapNote = $state(false);
  let wrapTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (info?.wrapped) {
      wrapNote = true;
      clearTimeout(wrapTimer);
      wrapTimer = setTimeout(() => (wrapNote = false), 1200);
    }
  });
  const count = $derived(!text || !info ? '' : info.total === 0 ? 'Не найдено' : wrapNote ? 'с начала' : `${info.cur + 1} из ${info.total}`);
</script>

<div class="find" role="search" aria-label="Поиск в файле">
  <div class="fld" class:none>
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
    <input bind:this={input} bind:value={text} oninput={typed} onkeydown={key} aria-label="Найти в файле" spellcheck="false" autocomplete="off" />
    {#if count}<span class="cnt" class:no={none} aria-live="polite">{count}</span>{/if}
  </div>
  <div class="nav" role="group" aria-label="Переход по результатам">
    <button title="Предыдущее ({[store.keyHint('findPrev'), '⇧↩'].filter(Boolean).join(', ')})" aria-label="Предыдущее" onclick={onprev}><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 7.5L6 4l3.5 3.5" /></svg></button>
    <button title="Следующее ({[store.keyHint('findNext'), '↩'].filter(Boolean).join(', ')})" aria-label="Следующее" onclick={onnext}><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" /></svg></button>
  </div>
  <button class="tg" title="Учитывать регистр" aria-pressed={store.findCase} class:on={store.findCase} onclick={() => store.setFindOpts({ cs: !store.findCase })}>Aa</button>
  <button class="tg" title="Слово целиком" aria-pressed={store.findWord} class:on={store.findWord} onclick={() => store.setFindOpts({ word: !store.findWord })}>Слово</button>
  {#if info?.folded}<span class="note">и {info.folded} в свёрнутых заголовках</span>{/if}
  {#if global}<span class="note">из глобального поиска</span>{/if}
  <button class="done" onclick={onclose}>Готово <span>⎋</span></button>
  {#if replacing}
    <div class="rep">
      <div class="fld"><input bind:this={repInput} bind:value={rep} onkeydown={repKey} aria-label="Заменить на" placeholder="Заменить на…" spellcheck="false" autocomplete="off" /></div>
      <button class="tg" disabled={!text || !info?.total} onclick={() => (onreplace?.(rep, false), repInput?.focus())}>Заменить</button>
      <button class="tg" disabled={!text || !info?.total} onclick={() => (onreplace?.(rep, true), repInput?.focus())}>Все</button>
    </div>
  {/if}
</div>

<style>
  .find { flex: 0 0 auto; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 6px 14px; background: var(--side); border-bottom: 1px solid var(--line); font-size: 12px; }
  .fld { flex: 0 1 320px; min-width: 200px; display: flex; align-items: center; gap: 7px; height: 28px; box-sizing: border-box; padding: 0 8px; background: var(--bg); border: 1.5px solid var(--line); border-radius: 7px; color: var(--fg2); }
  .fld:focus-within { border-color: var(--acc); }
  .fld.none { border-color: var(--todo); }
  .fld input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--fg); font-size: 13px; padding: 0; -webkit-user-select: text; user-select: text; }
  .cnt { flex: 0 0 auto; font-size: 11.5px; color: var(--fg2); white-space: nowrap; }
  .cnt.no { color: var(--todo); }
  .nav { display: flex; gap: 2px; }
  .nav button { width: 28px; height: 26px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); display: flex; align-items: center; justify-content: center; padding: 0; }
  .nav button:first-child { border-radius: 6px 0 0 6px; }
  .nav button:last-child { border-radius: 0 6px 6px 0; }
  .tg { height: 26px; min-width: 30px; padding: 0 7px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--fg2); font-size: 12px; font-weight: 600; }
  .tg.on { background: color-mix(in srgb, var(--acc) 16%, transparent); border-color: var(--acc); color: var(--acc); }
  .note { font-size: 11.5px; color: var(--fg3); }
  .done { margin-left: auto; height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); font-size: 12px; }
  .done span { color: var(--fg3); }
  .rep { flex: 1 0 100%; display: flex; align-items: center; gap: 8px; }
  .tg:disabled { opacity: 0.45; }
</style>

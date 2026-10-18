<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from '../store.svelte';

  // The quick entry of the new interface — one for ⇧⌘I in the window and for the panel over another program (ТЗ 52 §4,
  // ТЗ 48 §3, ТЗ 01 §4): 600 pt on `card`, radius 14; in the window 150 pt from the top over `dim`. The interface's font
  // (a field, not a file's text): the title 19 semibold with the Inbox's icon `lampink`, «Что записать?»; «Tab —
  // детали», after Tab the details 14 / 1.5, 1–8 lines, 48 pt in under a line; the foot on `side` — «→ inbox» (a click:
  // the Inbox's file), the keys, the key of the entry. ↩ adds, ⌘↩ from the details, ⇧Tab back to the title, ⎋ closes and
  // keeps the draft. Over another program, added — a strip of 64 pt «Добавлено в Inbox» with «Открыть» for 1.5 s; not
  // added — a red line under the title, the text kept.
  // `standalone`: the panel of its own over another program (ТЗ 52 §4) — no `dim` under it, the panel is its size.
  let { file, standalone = false, onsubmit, onpick, onclose, onopen }: {
    file: string | null;
    standalone?: boolean;
    onopen?: () => void; // «Открыть» of the strip «Добавлено» (over another program): the Inbox in the main window
    onsubmit: (title: string, details: string) => Promise<'ok' | 'nofile' | 'empty' | 'error'>;
    onpick: () => void;
    onclose: (added: boolean) => void;
  } = $props();

  const KEY = 'capture:draft';
  const load = () => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      return v && typeof v.title === 'string' ? (v as { title: string; details: string }) : null;
    } catch {
      return null;
    }
  };
  const draft = load();
  let title = $state(draft?.title ?? '');
  let details = $state(draft?.details ?? '');
  let showDetails = $state(!!draft?.details);
  let shake = $state(false);
  let phase = $state<'edit' | 'nofile' | 'busy' | 'added'>('edit');
  let failed = $state(false);
  let addedText = $state('');
  let titleEl: HTMLInputElement | undefined = $state();
  let detEl: HTMLTextAreaElement | undefined = $state();
  const keep = () => {
    try {
      if (title.trim() || details.trim()) localStorage.setItem(KEY, JSON.stringify({ title, details }));
      else localStorage.removeItem(KEY);
    } catch {
      /* no storage */
    }
  };
  $effect(() => {
    void title;
    void details;
    keep();
  });
  onMount(() => {
    titleEl?.focus();
    titleEl?.select();
  });
  // the details grow with their lines, to eight
  $effect(() => {
    void details;
    if (!detEl) return;
    detEl.style.height = 'auto';
    detEl.style.height = `${Math.min(detEl.scrollHeight + 2, 8 * 21 + 4)}px`;
  });
  async function create() {
    if (!title.trim()) {
      shake = true;
      setTimeout(() => (shake = false), 400);
      titleEl?.focus();
      return;
    }
    phase = 'busy';
    failed = false;
    const sent = title.trim();
    const r = await onsubmit(title, showDetails ? details : '');
    if (r === 'ok') {
      title = details = '';
      keep();
      if (standalone) {
        // over another program: the strip «Добавлено в Inbox» for a moment, then the panel goes
        addedText = sent;
        phase = 'added';
        setTimeout(() => phase === 'added' && onclose(true), 1500);
      } else onclose(true);
    } else if (r === 'nofile') {
      keep();
      phase = 'nofile';
    } else {
      phase = 'edit';
      failed = r === 'error'; // the text stays, the panel too
      void tick().then(() => titleEl?.focus());
    }
  }
  function close() {
    keep();
    onclose(false);
  }
  async function titleKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      void create();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      showDetails = true;
      await tick();
      detEl?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }
  function detKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      void create();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) titleEl?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }
  const key = $derived(store.keyHint('capture') || '⇧⌘I');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dim" class:standalone onmousedown={(e) => e.target === e.currentTarget && close()}>
  <div class="cap" class:standalone role="dialog" aria-label="Новая задача в Inbox">
    {#if phase === 'added'}
      <div class="added" role="status">
        <span class="ok" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg></span>
        <span class="at"><b>Добавлено в Inbox</b><span class="aw">{addedText}</span></span>
        {#if onopen}<button class="open" onclick={() => { phase = 'edit'; onopen?.(); }}>Открыть</button>{/if}
      </div>
    {:else if phase === 'nofile'}
      <div class="nofile">
        <b>Inbox пока не настроен</b>
        <span>Выберите файл, в который будут попадать быстрые записи. Введённый текст сохранится.</span>
        <div class="nb"><button onclick={close}>Отмена</button><button class="main" onclick={() => { keep(); onpick(); }}>Выбрать файл…</button></div>
      </div>
    {:else}
      <div class="trow" class:shake>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9.5 4 3h8l2 6.5V13H2zM2 9.5h3.5l1 1.5h3l1-1.5H14" /></svg>
        <input bind:this={titleEl} bind:value={title} class="title" placeholder="Что записать?" aria-label="Заголовок задачи" spellcheck="false" autocomplete="off" onkeydown={titleKey} disabled={phase === 'busy'} />
      </div>
      {#if failed}<div class="err" role="alert">Не удалось добавить. Текст сохранён — попробуйте ещё раз</div>{/if}
      {#if showDetails}
        <div class="dwrap"><textarea bind:this={detEl} bind:value={details} class="det" rows="1" placeholder="Детали" aria-label="Детали задачи" onkeydown={detKey} disabled={phase === 'busy'}></textarea></div>
      {:else}
        <div class="dhint">Tab — детали</div>
      {/if}
      <div class="foot">
        <button class="to" title="Выбрать файл Inbox" onclick={() => { keep(); onpick(); }}>→ {file?.replace(/\.org$/i, '') ?? 'inbox'}</button>
        <span class="keys">↩ добавить · ⌘↩ из деталей · ⎋ закрыть (черновик сохранится)</span>
        <span class="k">{key}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .dim { position: fixed; inset: 0; z-index: 95; display: flex; justify-content: center; align-items: flex-start; padding-top: 150px; background: var(--dim); }
  /* over another program: the panel is the box itself (its window is placed natively) */
  .dim.standalone { position: static; padding: 0; background: transparent; }
  .cap { width: 600px; max-width: calc(100vw - 32px); box-sizing: border-box; display: flex; flex-direction: column; border: 1px solid var(--rule); border-radius: 14px; background: var(--card); box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5); color: var(--ink); font: 13px var(--ui); overflow: hidden; }
  .cap.standalone { max-width: none; box-shadow: none; }
  .trow { display: flex; align-items: center; gap: 12px; padding: 16px 20px 8px; color: var(--lampink); }
  .trow svg { flex: 0 0 16px; }
  .trow.shake { animation: shake 0.3s; }
  .trow.shake .title::placeholder { color: var(--todo); }
  @keyframes shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
  @media (prefers-reduced-motion: reduce) { .trow.shake { animation: none; } }
  /* the interface's font: what is typed on the fly reads as the system's */
  .title { flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; outline: none; color: var(--ink); font: 600 19px/1.3 var(--ui); caret-color: var(--lamp); -webkit-user-select: text; user-select: text; }
  .title::placeholder { color: var(--ink3); font-weight: 600; }
  .err { padding: 0 20px 8px 48px; font-size: 12.5px; color: var(--todo); }
  .dhint { padding: 2px 20px 14px 48px; font-size: 13px; color: var(--ink3); }
  .dwrap { margin: 0 20px 0 48px; padding: 10px 0 12px; border-top: 1px solid var(--rule); }
  .det { display: block; width: 100%; box-sizing: border-box; margin: 0; padding: 0; min-height: 21px; resize: none; overflow-y: auto; border: 0; background: transparent; outline: none; color: var(--ink); font: 14px/1.5 var(--ui); caret-color: var(--lamp); -webkit-user-select: text; user-select: text; }
  .det::placeholder { color: var(--ink3); }
  .foot { display: flex; align-items: center; gap: 10px; padding: 10px 20px; border-top: 1px solid var(--rule); background: var(--side); font-size: 11.5px; color: var(--ink3); white-space: nowrap; }
  .to { height: 20px; padding: 0 7px; border: 0; border-radius: 5px; background: var(--chip); color: var(--lampink); font: 11.5px var(--ui); }
  .to:hover { background: var(--chip2); }
  .keys { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .k { font: 11px var(--mono); }
  .nofile { display: flex; flex-direction: column; gap: 6px; padding: 18px 20px 16px; }
  .nofile b { font-size: 14px; font-weight: 600; }
  .nofile span { font-size: 13px; color: var(--ink2); }
  .nb { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
  .nb button, .open { height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 13px var(--ui); }
  .nb .main { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .nb button:focus-visible, .open:focus-visible, .to:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
  /* «Добавлено» over another program: a strip of 64 pt */
  .added { height: 64px; box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 0 16px 0 20px; }
  .ok { flex: 0 0 24px; width: 24px; height: 24px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--done) 18%, transparent); color: var(--done); }
  .at { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 10px; }
  .at b { flex: 0 0 auto; font-size: 14px; font-weight: 600; }
  .aw { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; color: var(--ink2); }
  .open { height: 28px; flex: 0 0 auto; }
</style>

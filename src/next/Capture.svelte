<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from '../store.svelte';

  // The quick entry ⇧⌘I in the window, the new interface (ТЗ 48 §3, ТЗ 01 §4): a box as the palette's, 600 pt, 150 pt
  // from the top over `dim`. The title — the Inbox's icon `lampink`, a field in Cormorant 24 semibold, «Что записать?»;
  // «Tab — детали», after Tab the details in Cormorant 17, 1–8 lines; the foot — «→ inbox» (a click: the Inbox's file),
  // the keys, «⇧⌘I». ↩ adds, ⌘↩ from the details, ⇧Tab back to the title, ⎋ closes and keeps the draft (as typed).
  // `standalone`: the panel of its own over another program (ТЗ 52 §4) — no `dim` under it, the panel is its size.
  let { file, standalone = false, onsubmit, onpick, onclose }: {
    file: string | null;
    standalone?: boolean;
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
  let phase = $state<'edit' | 'nofile' | 'busy'>('edit');
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
    detEl.style.height = `${Math.min(detEl.scrollHeight + 2, 8 * 24 + 12)}px`;
  });
  async function create() {
    if (!title.trim()) {
      shake = true;
      setTimeout(() => (shake = false), 400);
      titleEl?.focus();
      return;
    }
    phase = 'busy';
    const r = await onsubmit(title, showDetails ? details : '');
    if (r === 'ok') {
      title = details = '';
      keep();
      onclose(true);
    } else if (r === 'nofile') {
      keep();
      phase = 'nofile';
    } else phase = 'edit';
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
  <div class="cap" role="dialog" aria-label="Новая задача в Inbox">
    {#if phase === 'nofile'}
      <div class="nofile">
        <b>Inbox пока не настроен</b>
        <span>Выберите файл, в который будут попадать быстрые записи. Введённый текст сохранится.</span>
        <div class="nb"><button onclick={close}>Отмена</button><button class="main" onclick={() => { keep(); onpick(); }}>Выбрать файл…</button></div>
      </div>
    {:else}
      <div class="trow" class:shake>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l2-7h10l2 7v5H3zM3 11h4l1 2h4l1-2h4" /></svg>
        <input bind:this={titleEl} bind:value={title} class="title" placeholder="Что записать?" aria-label="Заголовок задачи" spellcheck="false" autocomplete="off" onkeydown={titleKey} disabled={phase === 'busy'} />
      </div>
      {#if showDetails}
        <textarea bind:this={detEl} bind:value={details} class="det" rows="1" placeholder="Детали" aria-label="Детали задачи" onkeydown={detKey} disabled={phase === 'busy'}></textarea>
      {:else}
        <div class="dhint">Tab — детали</div>
      {/if}
      <div class="foot">
        <button class="to" title="Выбрать файл Inbox" onclick={() => { keep(); onpick(); }}>→ {file ?? 'inbox'}</button>
        <span class="keys">↩ добавить · ⌘↩ из деталей · ⎋ закрыть (черновик сохранится)</span>
        <span class="k">{key}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .dim { position: fixed; inset: 0; z-index: 95; display: flex; justify-content: center; align-items: flex-start; padding-top: 150px; background: var(--dim); }
  .dim.standalone { position: static; padding: 0; background: transparent; }
  .cap { width: 600px; max-width: calc(100vw - 32px); box-sizing: border-box; display: flex; flex-direction: column; border: 1px solid var(--rule); border-radius: 14px; background: var(--card); box-shadow: var(--popshadow); color: var(--ink); overflow: hidden; }
  .trow { display: flex; align-items: center; gap: 12px; padding: 16px 20px 6px; color: var(--lampink); }
  .trow.shake { animation: shake 0.3s; }
  .trow.shake .title::placeholder { color: var(--todo); }
  @keyframes shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
  @media (prefers-reduced-motion: reduce) { .trow.shake { animation: none; } }
  .title { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; color: var(--ink); font: 600 24px/1.25 var(--text); caret-color: var(--lamp); -webkit-user-select: text; user-select: text; }
  .title::placeholder, .det::placeholder { color: var(--ink3); font-weight: 500; }
  .dhint { padding: 2px 20px 14px 52px; font: 17px/24px var(--text); color: var(--ink3); }
  .det { margin: 0 20px 12px 52px; padding: 0; min-height: 24px; resize: none; overflow-y: auto; border: 0; background: transparent; outline: none; color: var(--ink); font: 17px/24px var(--text); caret-color: var(--lamp); -webkit-user-select: text; user-select: text; }
  .foot { display: flex; align-items: center; gap: 12px; padding: 9px 14px 9px 16px; border-top: 1px solid var(--rule); font-size: 11.5px; color: var(--ink3); white-space: nowrap; }
  .to { height: 22px; padding: 0 8px; border: 0; border-radius: 6px; background: var(--chip2); color: var(--ink2); font: 11.5px var(--ui); }
  .keys { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .k { font: 11px var(--mono); }
  .nofile { display: flex; flex-direction: column; gap: 6px; padding: 18px 20px 16px; }
  .nofile b { font-size: 15px; font-weight: 600; }
  .nofile span { font-size: 13px; color: var(--ink2); }
  .nb { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
  .nb button { height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 13px var(--ui); }
  .nb .main { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
</style>

<script lang="ts">
  import { onMount, tick } from 'svelte';

  // «Новая задача в Inbox» (⇧⌘I): a title (↩ creates), Tab opens the details (↩ new line, ⌘↩ creates, ⇧Tab back),
  // Esc closes and keeps what was typed for next time. The same view inside the window and as a panel of its own
  // when called from another program (`standalone`).
  let { file, standalone = false, onsubmit, onpick, onclose }: {
    file: string | null; // the Inbox file's name, for the header; null: not set up
    standalone?: boolean;
    onsubmit: (title: string, details: string) => Promise<'ok' | 'nofile' | 'empty' | 'error'>;
    onpick: () => void; // «Выбрать файл…» when the Inbox is not set up
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
  let inDetails = $state(false);
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
  // the draft is kept as it is typed: closing in any way (Esc, a click elsewhere) loses nothing
  $effect(() => {
    void title;
    void details;
    keep();
  });
  onMount(() => {
    titleEl?.focus();
    titleEl?.select();
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
      if (standalone) {
        phase = 'added';
        setTimeout(() => onclose(true), 900);
      } else onclose(true);
    } else if (r === 'nofile') {
      keep(); // nothing typed is lost
      phase = 'nofile';
    } else phase = 'edit';
  }
  function close() {
    keep();
    onclose(false);
  }
  async function titleKey(e: KeyboardEvent) {
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
      e.stopPropagation();
      close();
    }
  }
  function detKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      void create();
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      titleEl?.focus();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // stays in the panel
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
  const hints = $derived(inDetails ? '⌘↩ создать  ·  ↩ новая строка  ·  ⇧⇥ к заголовку  ·  esc отмена' : '↩ создать  ·  ⇥ детали  ·  esc отмена');
</script>

<div class="cap" class:standalone role="dialog" aria-label="Новая задача в Inbox">
  {#if phase === 'added'}
    <div class="added" role="status">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--done)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
      Добавлено в Inbox
    </div>
  {:else if phase === 'nofile'}
    <div class="crumb"><span>Новая задача</span></div>
    <div class="nofile">
      <div class="nt">Inbox пока не настроен</div>
      <div class="nd">Выберите файл, в который будут попадать быстрые задачи. Введённый текст сохранится.</div>
      <div class="nb"><button class="ghost" onclick={close}>Отмена</button><button class="primary" onclick={() => { keep(); onpick(); }}>Выбрать файл…</button></div>
    </div>
  {:else}
    <div class="crumb"><span>Новая задача</span><span aria-hidden="true">›</span><span>{file ?? 'Inbox'}</span></div>
    <div class="trow" class:shake>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--fg3)" stroke-width="1.5" aria-hidden="true"><rect x="3.5" y="3.5" width="13" height="13" rx="3" /></svg>
      <input bind:this={titleEl} bind:value={title} class="title" placeholder="Что сделать?" aria-label="Заголовок задачи" spellcheck="false" autocomplete="off"
        onkeydown={titleKey} disabled={phase === 'busy'} />
    </div>
    {#if showDetails}
      <textarea bind:this={detEl} bind:value={details} class="det" rows="3" placeholder="Детали" aria-label="Детали задачи" onkeydown={detKey} onfocus={() => (inDetails = true)} onblur={() => (inDetails = false)} disabled={phase === 'busy'}></textarea>
    {:else}
      <div class="dhint">Детали (необязательно) — Tab</div>
    {/if}
    <div class="keys">{hints}</div>
  {/if}
</div>

<style>
  .cap { width: 640px; max-width: calc(100vw - 48px); box-sizing: border-box; background: var(--bg); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45); overflow: hidden; color: var(--fg); display: flex; flex-direction: column; }
  .cap.standalone { width: 100%; max-width: none; border-radius: 14px; box-shadow: none; }
  .crumb { display: flex; align-items: center; gap: 8px; padding: 10px 18px 0; font-size: 11.5px; color: var(--fg3); }
  .trow { display: flex; align-items: center; gap: 12px; padding: 8px 18px 12px; }
  .trow.shake { animation: shake 0.3s; }
  .trow.shake .title::placeholder { color: var(--todo); }
  @keyframes shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
  @media (prefers-reduced-motion: reduce) { .trow.shake { animation: none; } }
  .title { flex: 1; min-width: 0; border: 0; background: transparent; font-size: 19px; line-height: 1.3; color: var(--fg); outline: none; -webkit-user-select: text; user-select: text; }
  .det { border: 0; border-top: 1px solid var(--line); padding: 12px 18px 14px 50px; min-height: 66px; resize: none; background: transparent; font: inherit; font-size: 13.5px; line-height: 1.5; color: var(--fg); outline: none; -webkit-user-select: text; user-select: text; }
  .dhint { border-top: 1px solid var(--line); padding: 12px 18px 14px 50px; font-size: 13.5px; color: var(--fg3); }
  .keys { display: flex; align-items: center; gap: 14px; padding: 8px 18px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); white-space: pre; }
  .added { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 28px; font-size: 15px; font-weight: 600; }
  .nofile { padding: 10px 18px 16px; display: flex; flex-direction: column; gap: 6px; }
  .nt { font-size: 16px; font-weight: 600; }
  .nd { font-size: 12.5px; color: var(--fg2); }
  .nb { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  .nb button { height: 28px; padding: 0 14px; border: 0; border-radius: 6px; font-size: 13px; }
  .ghost { background: var(--field); color: var(--fg); }
  .primary { background: var(--acc); color: var(--onacc); font-weight: 600; }
</style>

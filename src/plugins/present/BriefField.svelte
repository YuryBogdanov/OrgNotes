<script lang="ts">
  import { onMount } from 'svelte';
  import { brief, BRIEF, STANDARD } from './agentBrief.svelte';
  import { present } from './state.svelte';

  // «Бриф для агентов» in the plugin's settings (fix-59-1 §5.2): the file's text in a field of the section's width
  // (monospace 12, 14 lines, taller by its corner), written 0.5 s after typing and on leaving; «Скопировать», «Показать
  // в Finder», «Вернуть стандартный…» (asked; off while the text is the standard one; «изменён» / «есть новая версия»).
  let text = $state(brief.text ?? '');
  let timer: ReturnType<typeof setTimeout> | undefined;
  onMount(() => {
    void brief.reload().then(() => (text = brief.text ?? STANDARD));
    return () => {
      clearTimeout(timer);
      if (text !== brief.text) void brief.save(text);
    };
  });
  function input() {
    clearTimeout(timer);
    timer = setTimeout(() => void brief.save(text), 500);
  }
  function leave() {
    clearTimeout(timer);
    if (text !== brief.text) void brief.save(text);
  }
  const changed = $derived(text !== STANDARD);
  async function restore() {
    const r = await present.ctx.ui.sheet({
      title: 'Вернуть стандартный бриф?',
      render: (el) => void (el.textContent = 'Ваши правки брифа пропадут.'),
      buttons: [{ id: 'cancel', label: 'Отмена' }, { id: 'ok', label: 'Вернуть', primary: true }],
    });
    if (r !== 'ok') return;
    await brief.restore();
    text = STANDARD;
  }
</script>

<div class="pr-brief">
  <textarea class="pr-brief-ed" rows="14" spellcheck="false" aria-label="Бриф для агентов" bind:value={text} oninput={input} onblur={leave}></textarea>
  <div class="pr-brief-row">
    <button class="pr-btn" onclick={() => void brief.save(text).then(() => brief.copy())}>Скопировать</button>
    <button class="pr-btn" onclick={() => void present.ctx.agents?.reveal(BRIEF)}>Показать в Finder</button>
    <button class="pr-btn" disabled={!changed} onclick={restore}>Вернуть стандартный…</button>
    {#if brief.newer}<span class="pr-brief-note">есть новая версия</span>{:else if changed}<span class="pr-brief-note">изменён</span>{/if}
  </div>
</div>

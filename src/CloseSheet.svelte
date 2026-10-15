<script lang="ts">
  import { onMount } from 'svelte';
  import type { Unsaved } from './store.svelte';
  import { inTabs } from './names';
  import appIcon from '../src-tauri/icons/128x128@2x.png';

  // The sheet before tabs close with unsaved text: one file, one new note, or several tabs. With `error` set it is
  // the message about a failed write instead, with a single "ОК".
  type Answer = 'save' | 'discard' | 'cancel';
  let { items = [], error, onanswer }: { items?: Unsaved[]; error?: { title: string; text: string }; onanswer: (a: Answer) => void } = $props();

  const one = $derived(items.length === 1 ? items[0] : null);
  const hasNote = $derived(items.some((it) => it.kind === 'note'));
  const title = $derived(
    error ? error.title
    : one?.kind === 'file' ? `Сохранить изменения в «${one.name}»?`
    : one ? `Сохранить заметку «${one.name}»?`
    : `Сохранить изменения в ${inTabs(items.length)}?`,
  );
  const text = $derived(
    error ? error.text
    : one?.kind === 'note' ? 'Текст пока не записан в файл. Нажмите «Сохранить…», чтобы выбрать, куда его сохранить.'
    : 'Если не сохранить, изменения будут потеряны.' + (!one && hasNote ? ' Для новой заметки откроется «Сохранить как».' : ''),
  );
  const primary = $derived(error ? 'ОК' : one?.kind === 'file' ? 'Сохранить' : one ? 'Сохранить…' : 'Сохранить всё');

  let sheet: HTMLDivElement | undefined = $state();
  let main: HTMLButtonElement | undefined = $state();
  onMount(() => main?.focus()); // the safe choice: nothing is lost

  // a click beside the buttons leaves the focus where it is (on the chosen button)
  function keepFocus(e: MouseEvent) {
    if (!(e.target as Element).closest('button')) e.preventDefault();
  }
  function key(e: KeyboardEvent) {
    const cancel = e.key === 'Escape' || (e.metaKey && e.key === '.');
    if (cancel) {
      e.preventDefault();
      onanswer(error ? 'save' : 'cancel');
    } else if (e.metaKey && e.code === 'KeyD' && !error) {
      e.preventDefault();
      onanswer('discard');
    } else if (e.key === 'Tab') {
      // the focus goes round the sheet's buttons, never to the window behind it
      e.preventDefault();
      const bs = [...(sheet?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const i = bs.indexOf(document.activeElement as HTMLButtonElement);
      bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length]?.focus();
    } else if (e.metaKey) {
      e.preventDefault(); // ⌘W and the rest do nothing while the sheet is up
    }
  }
</script>

<svelte:window onkeydowncapture={key} />

<!-- the window behind does not react: the title bar is covered too, the rest is dimmed -->
<div class="block" aria-hidden="true" onmousedown={keepFocus}></div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dim" onmousedown={keepFocus}>
  <div class="sheet" bind:this={sheet} role="alertdialog" aria-modal="true" aria-labelledby="cs-title" aria-describedby="cs-text">
    <img class="icon" src={appIcon} alt="" width="48" height="48" />
    <div class="body">
      <h2 id="cs-title">{title}</h2>
      <p id="cs-text">{text}</p>
      {#if items.length > 1}
        <ul class="list" aria-label="Несохранённые вкладки">
          {#each items as it (it.tab.id)}
            <li>
              <svg class="fi" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray={it.kind === 'note' ? '2.2 2' : undefined} aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
              <span class="nm" class:note={it.kind === 'note'}>{it.name}</span>
              <span class="st">{it.kind === 'note' ? 'новая заметка' : 'изменён'}</span>
              <span class="dot" aria-hidden="true"></span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="btns">
      {#if !error}
        <button onclick={() => onanswer('discard')} aria-keyshortcuts="Meta+D">Не сохранять</button>
        <span class="grow"></span>
        <button onclick={() => onanswer('cancel')} aria-keyshortcuts="Escape">Отмена</button>
      {:else}
        <span class="grow"></span>
      {/if}
      <button class="primary" bind:this={main} onclick={() => onanswer('save')}>{primary}</button>
    </div>
  </div>
</div>

<style>
  .block { position: fixed; left: 0; right: 0; top: 0; height: 52px; z-index: 87; }
  .dim { position: fixed; left: 0; right: 0; top: 52px; bottom: 0; z-index: 87; background: rgba(0, 0, 0, 0.2); display: flex; justify-content: center; align-items: flex-start; }
  .sheet {
    width: 440px; max-width: 92%; padding: 18px 20px 16px; display: grid; grid-template-columns: 48px minmax(0, 1fr); column-gap: 14px; row-gap: 16px;
    background: var(--bg); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 12px 12px; box-shadow: 0 14px 40px rgba(0, 0, 0, 0.3);
  }
  .icon { width: 48px; height: 48px; }
  .body { min-width: 0; display: flex; flex-direction: column; gap: 6px; padding-top: 2px; }
  h2 { margin: 0; font-size: 13px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
  p { margin: 0; font-size: 12px; color: var(--fg2); line-height: 1.45; overflow-wrap: anywhere; }
  .list { list-style: none; margin: 6px 0 0; padding: 4px 0; max-height: calc(6 * 24px + 8px); overflow-y: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--side); }
  .list li { height: 24px; display: flex; align-items: center; gap: 7px; padding: 0 10px; font-size: 12px; }
  .fi { flex: 0 0 auto; color: var(--fg2); }
  .nm { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm.note { font-style: italic; }
  .st { flex: 0 0 auto; color: var(--fg2); font-size: 11.5px; }
  .dot { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 4px; background: var(--wait); }
  .btns { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; }
  .grow { flex: 1; }
  button { height: 26px; padding: 0 12px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); border-radius: 6px; font-size: 13px; }
  button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .primary { min-width: 92px; border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; padding: 0 16px; }
</style>

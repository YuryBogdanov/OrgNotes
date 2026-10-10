<script lang="ts">
  import { store } from './store.svelte';

  // The notes folder has no org files yet: the editor area invites to make the first one. The first file that
  // appears (made here, in Emacs, or copied in) replaces this by itself.
</script>

<div class="empty">
  <span class="glyph" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4M7 10h6M7 13h4" /></svg></span>
  <h1>Создайте первый файл</h1>
  <p class="lead">Начните с нового файла или положите в эту папку существующие: они появятся в навигаторе сами.</p>
  <div class="btns">
    <button onclick={() => store.revealFolder()}>Показать в Finder</button>
    <button class="primary" onclick={() => store.openPalette('newFile')}>Создать файл<span class="kb">⇧⌘N</span></button>
  </div>
  <button class="link" onclick={() => store.changeFolder()}>Выбрать другую папку…</button>
</div>

<style>
  .empty { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 14px; padding: 24px; }
  .glyph { width: 72px; height: 72px; border-radius: 22px; background: var(--acc); color: var(--onacc); display: flex; align-items: center; justify-content: center; }
  h1 { margin: 6px 0 0; font-size: 24px; line-height: 1.25; font-weight: 700; }
  .lead { margin: 0; max-width: 460px; font-size: 14px; line-height: 1.5; color: var(--fg2); }
  .btns { display: flex; gap: 10px; margin-top: 8px; flex-wrap: wrap; justify-content: center; }
  button { height: 30px; padding: 0 16px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); border-radius: 7px; font-size: 13px; white-space: nowrap; }
  button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .primary { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; padding: 0 18px; }
  .kb { margin-left: 8px; opacity: 0.85; font-weight: 400; font-size: 12px; }
  .link { height: auto; padding: 0; border: 0; background: none; color: var(--acc); font-size: 12.5px; margin-top: 2px; }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import type { Tab } from './layout';
  import { SaveAsCtl } from './saveAsCtl.svelte';

  // "Сохранить как…" for a tab that has no file yet: a sheet attached under the toolbar. Its workings: saveAsCtl.
  let { tab }: { tab: Tab } = $props();
  // svelte-ignore state_referenced_locally
  const c = new SaveAsCtl(tab); // the tab the sheet opened for
  let input: HTMLInputElement | undefined = $state();
  c.onfocusEditor = () => document.querySelector<HTMLElement>('section.pane.active .cm-content')?.focus({ preventScroll: true });
  c.onfocusName = () => input?.focus();
  onMount(() => {
    input?.focus();
    input?.setSelectionRange(0, c.name.length);
  });
</script>

<svelte:window onkeydown={c.key} />

<div class="dim">
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Сохранить как">
    <form onsubmit={(e) => { e.preventDefault(); void c.submit(); }}>
      <div class="row">
        <label for="sa-name">Сохранить как:</label>
        <div class="namebox">
          <input id="sa-name" bind:this={input} bind:value={c.name} autocomplete="off" spellcheck="false" />
        </div>
      </div>
      <div class="row">
        <label for="sa-dir">Где:</label>
        <select id="sa-dir" bind:value={c.dir}>
          {#each c.folders as f}
            <option value={f}>{'  '.repeat(f ? f.split('/').length : 0)}{f ? f.split('/').pop() : c.rootName}</option>
          {/each}
        </select>
      </div>
      <div class="path" aria-label="Путь">{c.pathLine}</div>
      {#if c.newFolder !== null}
        <div class="row">
          <label for="sa-folder">Новая папка:</label>
          <!-- svelte-ignore a11y_autofocus -->
          <input id="sa-folder" class="nf" bind:value={c.newFolder} autofocus placeholder="Имя папки" />
        </div>
      {/if}
      <div class="btns">
        <button type="button" onclick={() => (c.newFolder = c.newFolder === null ? '' : null)}>Новая папка</button>
        <span class="grow"></span>
        <button type="button" onclick={() => c.done(false)}>Отмена</button>
        <button type="submit" class="primary" disabled={c.busy || !c.name.trim()}>Сохранить</button>
      </div>
    </form>
  </div>

  {#if c.replace}
    <div class="ask" role="alertdialog" aria-modal="true" aria-label="Заменить файл">
      <h2>«{c.fileName}» уже существует. Заменить его?</h2>
      <p>Файл с таким именем уже есть в папке «{c.dir ? c.dir.split('/').pop() : c.rootName}». При замене его содержимое будет перезаписано.</p>
      <div class="btns">
        <!-- svelte-ignore a11y_autofocus -->
        <button autofocus onclick={c.closeAsk}>Отмена</button>
        <button class="danger" onclick={() => c.save(true)}>Заменить</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .dim { position: fixed; left: 0; right: 0; top: 52px; bottom: 0; z-index: 85; background: rgba(0, 0, 0, 0.2); display: flex; justify-content: center; align-items: flex-start; }
  .sheet { width: 480px; max-width: 92%; padding: 18px 20px 16px; background: var(--bg); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 12px 12px; box-shadow: 0 14px 40px rgba(0, 0, 0, 0.3); }
  .row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  label { flex: 0 0 96px; text-align: right; color: var(--fg2); }
  .namebox { flex: 1; min-width: 0; height: 28px; display: flex; align-items: center; padding: 0 8px; background: var(--field); border: 2px solid var(--acc); border-radius: 6px; }
  .namebox input { flex: 0 1 auto; min-width: 20px; width: 100%; border: 0; background: transparent; font-size: 13px; padding: 0; outline: none; -webkit-user-select: text; user-select: text; }
  select, .nf { flex: 1; min-width: 0; height: 28px; padding: 0 8px; border: 0; border-radius: 6px; background: var(--field); font-size: 13px; }
  .nf { border: 1px solid var(--line); background: var(--bg); -webkit-user-select: text; user-select: text; }
  .path { padding-left: 108px; margin: -4px 0 16px; font-size: 11.5px; color: var(--fg2); }
  .btns { display: flex; align-items: center; gap: 8px; }
  .grow { flex: 1; }
  .btns button { height: 26px; padding: 0 12px; border: 1px solid var(--line); background: var(--bg); border-radius: 6px; font-size: 13px; }
  .btns .primary { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; padding: 0 16px; }
  .btns .primary:disabled { opacity: 0.5; }
  .btns .danger { border: 0; background: var(--danger); color: var(--on-danger); font-weight: 600; }
  .ask { position: absolute; top: 40px; width: 380px; padding: 18px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35); }
  .ask h2 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  .ask p { margin: 0 0 14px; color: var(--fg2); line-height: 1.45; }
  .ask .btns { justify-content: flex-end; }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from './store.svelte';
  import { parseHeadings } from './org';
  import { noOrg } from './names';
  import type { Tab } from './layout';

  // "Сохранить как…" for a tab that has no file yet: a sheet attached under the toolbar.
  let { tab }: { tab: Tab } = $props();

  const lsGet = (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const rootName = $derived(store.dir?.split('/').pop() ?? 'Заметки');
  const dirOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');

  // the name: from the first heading of the text, else "Без названия"
  const firstHeading = parseHeadings(tab.text ?? '', store.untitledWf)[0]?.title.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
  let name = $state((firstHeading || 'Без названия').replace(/[/:\\]/g, '-').replace(/^\.+/, ''));

  // the folder: the one of the file in the neighbour pane, else the last one used, else the root
  const folders = $derived(['', ...[...store.folders].sort((a, b) => a.localeCompare(b, 'ru'))]);
  function initialDir() {
    const L = store.layout;
    for (let i = 0; i < L.panes.length; i++) {
      if (L.panes[i].tabs.includes(tab) || L.panes[i].tabs.some((t) => t.id === tab.id)) continue;
      const t = L.panes[i].tabs[L.panes[i].active];
      const f = store.fileOf(t);
      if (f) return dirOf(f.name);
    }
    const last = lsGet('saveAsDir:' + (store.dir ?? ''));
    return last !== null && (last === '' || store.folders.includes(last)) ? last : '';
  }
  let dir = $state(initialDir());
  const pathLine = $derived([rootName, ...dir.split('/').filter(Boolean)].join(' › '));

  let input: HTMLInputElement | undefined = $state();
  onMount(() => {
    input?.focus();
    input?.setSelectionRange(0, name.length);
  });

  let newFolder = $state<string | null>(null);
  async function makeFolder() {
    const n = (newFolder ?? '').trim();
    newFolder = null;
    if (!n) return;
    const rel = await store.createFolder(dir, n);
    if (rel !== null) dir = rel;
  }

  let replace = $state(false);
  let busy = $state(false);
  async function save(overwrite = false) {
    if (busy || !name.trim()) return;
    busy = true;
    const r = await store.commitSaveAs(tab, dir, name.trim(), overwrite);
    busy = false;
    if (r === 'exists') {
      replace = true;
      return;
    }
    replace = false;
    if (r !== 'ok') store.say(r); // the sheet closes, the tab stays unsaved
    done(r === 'ok');
  }
  // the sheet hands the focus back to the editor, the caret where it was
  function done(saved: boolean) {
    store.finishSaveAs(saved);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('section.pane.active .cm-content')?.focus());
  }
  // back to the name field, so Return saves again
  function closeAsk() {
    replace = false;
    queueMicrotask(() => input?.focus());
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (replace) closeAsk();
      else if (newFolder !== null) newFolder = null;
      else done(false);
    }
  }
  const fileName = $derived(noOrg(name.trim())); // as the app shows it
</script>

<svelte:window onkeydown={key} />

<div class="dim">
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Сохранить как">
    <form onsubmit={(e) => { e.preventDefault(); if (newFolder !== null) makeFolder(); else save(); }}>
      <div class="row">
        <label for="sa-name">Сохранить как:</label>
        <div class="namebox">
          <input id="sa-name" bind:this={input} bind:value={name} autocomplete="off" spellcheck="false" />
        </div>
      </div>
      <div class="row">
        <label for="sa-dir">Где:</label>
        <select id="sa-dir" bind:value={dir}>
          {#each folders as f}
            <option value={f}>{'  '.repeat(f ? f.split('/').length : 0)}{f ? f.split('/').pop() : rootName}</option>
          {/each}
        </select>
      </div>
      <div class="path" aria-label="Путь">{pathLine}</div>
      {#if newFolder !== null}
        <div class="row">
          <label for="sa-folder">Новая папка:</label>
          <!-- svelte-ignore a11y_autofocus -->
          <input id="sa-folder" class="nf" bind:value={newFolder} autofocus placeholder="Имя папки" />
        </div>
      {/if}
      <div class="btns">
        <button type="button" onclick={() => (newFolder = newFolder === null ? '' : null)}>Новая папка</button>
        <span class="grow"></span>
        <button type="button" onclick={() => done(false)}>Отмена</button>
        <button type="submit" class="primary" disabled={busy || !name.trim()}>Сохранить</button>
      </div>
    </form>
  </div>

  {#if replace}
    <div class="ask" role="alertdialog" aria-modal="true" aria-label="Заменить файл">
      <h2>«{fileName}» уже существует. Заменить его?</h2>
      <p>Файл с таким именем уже есть в папке «{dir ? dir.split('/').pop() : rootName}». При замене его содержимое будет перезаписано.</p>
      <div class="btns">
        <!-- svelte-ignore a11y_autofocus -->
        <button autofocus onclick={closeAsk}>Отмена</button>
        <button class="danger" onclick={() => save(true)}>Заменить</button>
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
  .btns .danger { border: 0; background: var(--todo); color: var(--onacc); font-weight: 600; }
  .ask { position: absolute; top: 40px; width: 380px; padding: 18px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35); }
  .ask h2 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  .ask p { margin: 0 0 14px; color: var(--fg2); line-height: 1.45; }
  .ask .btns { justify-content: flex-end; }
</style>

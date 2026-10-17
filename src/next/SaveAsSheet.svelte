<script lang="ts">
  import type { Tab } from '../layout';
  import { SaveAsCtl } from '../saveAsCtl.svelte';
  import Sheet from './ui/Sheet.svelte';
  import Button from './ui/Button.svelte';

  // «Сохранить как…» in the new interface (ТЗ 44 §4, ТЗ 10): the old one's workings (saveAsCtl.svelte.ts); a sheet —
  // the name, the folder and its path, «Новая папка», «Отмена» and the main «Сохранить»; a name taken — «Заменить?».
  let { tab }: { tab: Tab } = $props();
  // svelte-ignore state_referenced_locally
  const c = new SaveAsCtl(tab); // the tab the sheet opened for
  let input: HTMLInputElement | undefined = $state();
  c.onfocusEditor = () => document.querySelector<HTMLElement>('[data-ui="next"] .cm-content')?.focus({ preventScroll: true });
  c.onfocusName = () => input?.focus();
  const start = (el: HTMLInputElement) => queueMicrotask(() => (el.focus(), el.setSelectionRange(0, c.name.length)));
  const focus = (el: HTMLInputElement) => queueMicrotask(() => el.focus());
</script>

<svelte:window onkeydown={c.key} />
{#if c.replace}
  <Sheet title="«{c.fileName}» уже существует. Заменить его?" label="Заменить файл" role="alertdialog" oncancel={c.closeAsk}>
    <p>Файл с таким именем уже есть в папке «{c.dir ? c.dir.split('/').pop() : c.rootName}». При замене его содержимое будет перезаписано.</p>
    {#snippet foot()}
      <span style="flex:1"></span>
      <Button key="esc" autofocus onclick={c.closeAsk}>Отмена</Button>
      <Button kind="danger" onclick={() => c.save(true)}>Заменить</Button>
    {/snippet}
  </Sheet>
{:else}
  <Sheet title="Сохранить как" oncancel={() => c.done(false)}>
    <form class="f" onsubmit={(e) => { e.preventDefault(); void c.submit(); }}>
      <label class="row"><span>Имя</span><input class="fld" bind:this={input} bind:value={c.name} aria-label="Сохранить как:" autocomplete="off" spellcheck="false" use:start /></label>
      <label class="row"><span>Где</span>
        <select class="fld" bind:value={c.dir} aria-label="Где:">
          {#each c.folders as f (f)}<option value={f}>{'  '.repeat(f ? f.split('/').length : 0)}{f ? f.split('/').pop() : c.rootName}</option>{/each}
        </select>
      </label>
      <div class="path" aria-label="Путь">{c.pathLine}</div>
      {#if c.newFolder !== null}
        <label class="row"><span>Папка</span><input class="fld" bind:value={c.newFolder} aria-label="Новая папка:" placeholder="Имя папки" use:focus /></label>
      {/if}
      <div class="foot">
        <Button onclick={() => (c.newFolder = c.newFolder === null ? '' : null)}>Новая папка</Button>
        <span style="flex:1"></span>
        <Button key="esc" onclick={() => c.done(false)}>Отмена</Button>
        <Button kind="main" type="submit" key="↩" disabled={c.busy || !c.name.trim()}>Сохранить</Button>
      </div>
    </form>
  </Sheet>
{/if}

<style>
  p { margin: 0; }
  .f { display: flex; flex-direction: column; gap: 10px; }
  .row { display: grid; grid-template-columns: 52px minmax(0, 1fr); align-items: center; gap: 10px; color: var(--ink2); }
  .fld { height: 30px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 7px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); caret-color: var(--lamp); font: 13px var(--ui); outline: none; -webkit-user-select: text; user-select: text; }
  .fld:focus { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .path { margin-left: 62px; font-size: 12px; color: var(--ink3); }
  .foot { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
</style>

<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { store } from './store.svelte';
  import appIcon from './assets/app-icon.png';

  // The whole window before there is a notes folder: welcome, «Папка найдена», «Папка недоступна». No toolbar —
  // only the title bar with the app's name.
  const s = $derived(store.start!);
  const nameOf = (p: string) => p.split('/').filter(Boolean).pop() ?? p;
  const shown = (p: string) => p.replace(/^\/Users\/[^/]+/, '~');

  // «Считаем файлы…» only when counting takes longer than a second
  let slow = $state(false);
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    clearTimeout(slowTimer);
    slow = false;
    if (s.kind === 'found' && !s.scan) slowTimer = setTimeout(() => (slow = true), 1000);
  });
  // «Папка недоступна» checks again by itself: when the app comes back to the front (store.activated) and every
  // few seconds, so a disk that gets plugged in is noticed
  let poll: ReturnType<typeof setInterval> | undefined;
  $effect(() => {
    clearInterval(poll);
    if (s.kind === 'missing') poll = setInterval(() => void store.retryFolder(), 3000);
  });
  onDestroy(() => {
    clearTimeout(slowTimer);
    clearInterval(poll);
  });

  let main: HTMLButtonElement | undefined = $state();
  onMount(() => main?.focus());
  $effect(() => {
    void s.kind;
    queueMicrotask(() => main?.focus()); // Return presses the main button of each screen
  });
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape' && s.kind === 'found' && s.change) store.backFromFound();
  }
</script>

<svelte:window onkeydown={key} />

<div class="start">
  <div class="bar" data-tauri-drag-region><span data-tauri-drag-region>Panopticon</span></div>
  <div class="area">
    <div class="card" class:narrow={s.kind === 'found'}>
      {#if s.kind === 'welcome'}
        <img class="appicon" src={appIcon} alt="Panopticon" width="112" height="112" />
        <h1>Добро пожаловать в Panopticon</h1>
        <p class="lead">Заметки и задачи в обычных org-файлах. Выберите папку, в которой они лежат: приложение будет работать только с ней.</p>
        <div class="btns">
          <button onclick={() => store.createNewFolder()}>Создать новую папку…</button>
          <button class="primary" bind:this={main} onclick={() => store.chooseFolder()}>Выбрать папку…</button>
        </div>
        {#if store.hasSample}<button class="link" onclick={() => store.useSample()}>Открыть примеры</button>{/if}
        <p class="foot">Файлы остаются в обычных папках и открываются в любом редакторе, в том числе в Emacs.</p>
      {:else if s.kind === 'found'}
        <span class="glyph" aria-hidden="true"><svg width="46" height="46" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z" /></svg></span>
        <h1>Папка найдена</h1>
        <p class="lead">Вот что приложение увидит в выбранной папке. Откройте её, чтобы начать работу.</p>
        <div class="sum" aria-live="polite">
          <div class="head">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z" /></svg>
            <div class="who"><span class="nm">{s.scan?.name ?? nameOf(s.path)}</span><span class="pth">{s.scan?.shown ?? shown(s.path)}</span></div>
          </div>
          {#if s.scan}
            <div class="row"><span>Org-файлов</span><b>{s.scan.org}{s.scan.capped ? '+' : ''}</b></div>
            <div class="row"><span>Папок</span><b>{s.scan.folders}{s.scan.capped ? '+' : ''}</b></div>
            <div class="row dim"><span>Других файлов, они не показываются</span><span>{s.scan.other}{s.scan.capped ? '+' : ''}</span></div>
            {#if s.scan.big}
              <div class="row warn" role="note">Папка большая{s.scan.capped ? ': больше 10 000 файлов' : ''}. Обычно рабочая папка — только заметки, а не вся домашняя папка или диск.</div>
            {/if}
          {:else}
            <div class="row dim">{slow ? 'Считаем файлы…' : ' '}</div>
          {/if}
        </div>
        <div class="btns">
          <button onclick={() => store.chooseFolder()}>Выбрать другую…</button>
          <button class="primary" bind:this={main} disabled={!s.scan} onclick={() => store.openFound()}>Открыть</button>
        </div>
        <p class="foot">Другие файлы приложение не трогает и не показывает.{s.scan && s.scan.org === 0 ? ' В папке пока нет org-файлов — можно начать с нуля.' : ''}</p>
      {:else if s.kind === 'missing'}
        <span class="glyph warnglyph" aria-hidden="true"><svg width="46" height="46" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L2.5 16h15zM10 8v4M10 14.2v.01" /></svg></span>
        <h1>Папка «{nameOf(s.path)}» недоступна</h1>
        <p class="lead">Не удаётся открыть {shown(s.path)}. Возможно, её переместили или удалили, либо отключён диск.</p>
        <div class="btns">
          <button onclick={() => store.retryFolder()}>Повторить</button>
          <button class="primary" bind:this={main} onclick={() => store.chooseFolder()}>Выбрать другую папку…</button>
        </div>
        <p class="foot">Пока папка недоступна, приложение ничего не изменяет и не удаляет.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .start { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; background: var(--bg); color: var(--fg); }
  .bar { flex: 0 0 52px; display: flex; align-items: center; justify-content: center; background: var(--bar); border-bottom: 1px solid var(--line); color: var(--fg2); font-size: 12.5px; -webkit-user-select: none; user-select: none; }
  .area { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { width: 560px; max-width: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; }
  .card.narrow { width: 520px; }
  .appicon { width: 112px; height: 112px; border-radius: 26px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25); }
  .glyph { width: 88px; height: 88px; border-radius: 22px; background: var(--acc); color: var(--onacc); display: flex; align-items: center; justify-content: center; }
  .glyph.warnglyph { background: color-mix(in srgb, var(--wait) 18%, transparent); color: var(--wait); }
  h1 { margin: 6px 0 0; font-size: 24px; line-height: 1.25; font-weight: 700; text-wrap: balance; overflow-wrap: anywhere; }
  .lead { margin: 0; max-width: 460px; font-size: 14px; line-height: 1.5; color: var(--fg2); }
  .foot { margin: 10px 0 0; max-width: 440px; font-size: 12px; line-height: 1.5; color: var(--fg2); }
  .btns { display: flex; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; justify-content: center; }
  button { height: 30px; padding: 0 16px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); border-radius: 7px; font-size: 13px; white-space: nowrap; }
  button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .primary { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; padding: 0 18px; }
  .primary:disabled { opacity: 0.5; }
  .link { height: auto; padding: 0; border: 0; background: none; color: var(--acc); font-size: 12.5px; }
  .sum { width: 100%; max-width: 420px; display: flex; flex-direction: column; margin-top: 4px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; text-align: left; background: var(--side); }
  .head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
  .who { display: flex; flex-direction: column; min-width: 0; }
  .nm { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pth { font-size: 12px; color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; padding: 9px 14px; border-top: 1px solid var(--line); font-size: 13px; }
  .row b { font-weight: 600; font-variant-numeric: tabular-nums; }
  .row.dim { color: var(--fg2); }
  .row.warn { justify-content: flex-start; color: var(--wait); font-size: 12px; line-height: 1.45; }
</style>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import { store } from '../store.svelte';
  import appIcon from '../assets/app-icon.png';

  // The first start and the folder in the new interface (ТЗ 48 §6, ТЗ 06): no sidebar, no tabs — `bg` with the grid,
  // the window's lights, the content in the middle, 620 pt. «Добро пожаловать» (the app's icon 112, «ПЕРВЫЙ ЗАПУСК»,
  // the title in Yeseva One 44), «Папка найдена» (the icon 72; a card 440 — the folder, its path in IBM Plex Mono,
  // three figures in Yeseva One 28), the empty one, «Папка недоступна» (the warning in `wait`). ↩ the main button.
  const s = $derived(store.start!);
  const nameOf = (p: string) => p.split('/').filter(Boolean).pop() ?? p;
  const shown = (p: string) => p.replace(/^\/Users\/[^/]+/, '~');
  let slow = $state(false);
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    clearTimeout(slowTimer);
    slow = false;
    if (s.kind === 'found' && !s.scan) slowTimer = setTimeout(() => (slow = true), 1000);
  });
  // «Папка недоступна» checks again by itself every few seconds (a disk plugged in)
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
  $effect(() => {
    void s.kind;
    queueMicrotask(() => main?.focus());
  });
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape' && s.kind === 'found' && s.change) store.backFromFound();
  }
  const plus = (capped?: boolean) => (capped ? '+' : '');
  const word = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
</script>

<svelte:window onkeydown={key} />

<div class="start" role="main" aria-label="Первый запуск">
  <div class="lights" data-tauri-drag-region></div>
  <div class="area">
    <div class="box">
      {#if s.kind === 'welcome'}
        <img class="appicon" src={appIcon} alt="Panopticon" width="112" height="112" />
        <div class="kick">Первый запуск</div>
        <h1>Добро пожаловать в Panopticon</h1>
        <p class="lead">Выберите папку с org-файлами — приложение будет работать прямо с ними. Ничего не копируется и не меняется без вас; Emacs продолжит видеть те же файлы.</p>
        <div class="btns">
          <button class="b" onclick={() => store.createNewFolder()}>Создать новую папку…</button>
          <button class="b main" bind:this={main} onclick={() => store.chooseFolder()}>Выбрать папку… <span class="k">↩</span></button>
        </div>
        {#if store.hasSample}<button class="link" onclick={() => store.useSample()}>Открыть примеры</button>{/if}
      {:else if s.kind === 'found'}
        {@const empty = !!s.scan && s.scan.org === 0}
        <img class="appicon small" src={appIcon} alt="" width="72" height="72" />
        <h1>{empty ? 'Папка пустая' : 'Папка найдена'}</h1>
        <p class="lead">{empty ? 'В ней пока нет org-файлов — можно начать с нуля. Файлы появятся на месте, в этой папке.' : 'Всё готово. Откройте папку — файлы останутся на месте.'}</p>
        <div class="card" aria-live="polite">
          <div class="who">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z" /></svg>
            <span class="wn"><b>{s.scan?.name ?? nameOf(s.path)}</b><span class="pth">{s.scan?.shown ?? shown(s.path)}</span></span>
          </div>
          {#if s.scan}
            <div class="nums">
              <div><b>{s.scan.org}{plus(s.scan.capped)}</b><span>{word(s.scan.org, 'org-файл', 'org-файла', 'org-файлов')}</span></div>
              <div><b>{s.scan.folders}{plus(s.scan.capped)}</b><span>{word(s.scan.folders, 'папка', 'папки', 'папок')}</span></div>
              <div><b>{s.scan.other}{plus(s.scan.capped)}</b><span>{word(s.scan.other, 'другой файл', 'других файла', 'других файлов')}</span></div>
            </div>
            {#if s.scan.big}<p class="warn" role="note">Папка большая{s.scan.capped ? ': больше 10 000 файлов' : ''}. Обычно рабочая папка — только заметки, а не вся домашняя папка или диск.</p>{/if}
          {:else}
            <p class="count">{slow ? 'Считаем файлы…' : ' '}</p>
          {/if}
        </div>
        <div class="btns">
          <button class="b" onclick={() => store.chooseFolder()}>Другая папка…</button>
          <button class="b main" bind:this={main} disabled={!s.scan} onclick={() => store.openFound()}>Открыть <span class="k">↩</span></button>
        </div>
      {:else if s.kind === 'missing'}
        <span class="warnglyph" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L2.5 16h15zM10 8v4M10 14.2v.01" /></svg></span>
        <h1>Папка «{nameOf(s.path)}» недоступна</h1>
        <p class="lead">Не удаётся открыть {shown(s.path)}. Возможно, её переместили или удалили, либо отключён диск. Пока она недоступна, приложение ничего не изменяет.</p>
        <div class="btns">
          <button class="b" onclick={() => store.retryFolder()}>Повторить</button>
          <button class="b main" bind:this={main} onclick={() => store.chooseFolder()}>Выбрать другую папку… <span class="k">↩</span></button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .start {
    position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; color: var(--ink); font: 13px var(--ui); background-color: var(--bg);
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 24px 24px;
  }
  .lights { flex: 0 0 40px; -webkit-user-select: none; user-select: none; } /* the window's lights, the drag */
  .area { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .box { width: 620px; max-width: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }
  .appicon { width: 112px; height: 112px; border-radius: 26px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22); margin-bottom: 6px; }
  .appicon.small { width: 72px; height: 72px; border-radius: 17px; }
  .warnglyph { width: 72px; height: 72px; border-radius: 18px; display: grid; place-items: center; background: color-mix(in srgb, var(--wait) 16%, transparent); color: var(--wait); }
  .kick { font: 500 11px var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink3); }
  h1 { margin: 0; font: 400 44px/1.1 var(--title); text-wrap: balance; overflow-wrap: anywhere; }
  .lead { margin: 0; max-width: 460px; font-size: 15px; line-height: 1.5; color: var(--ink2); }
  .btns { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
  .b { height: 36px; padding: 0 18px; border: 0; border-radius: 8px; background: var(--chip2); color: var(--ink); font: 14px var(--ui); white-space: nowrap; }
  .b.main { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .b:disabled { opacity: 0.5; }
  .b:focus-visible, .link:focus-visible { outline: 2px solid var(--lamp); outline-offset: 2px; }
  .k { font: 11px var(--mono); opacity: 0.65; margin-left: 4px; }
  .link { border: 0; background: none; color: var(--lampink); font: 13px var(--ui); }
  .card { width: 440px; max-width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; margin-top: 6px; padding: 16px 18px; border: 1px solid var(--rule); border-radius: 12px; background: var(--card); text-align: left; }
  .who { display: flex; align-items: center; gap: 12px; color: var(--lampink); }
  .wn { min-width: 0; display: flex; flex-direction: column; color: var(--ink); }
  .wn b { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pth { font: 11px var(--mono); color: var(--ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nums { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding-top: 12px; border-top: 1px solid var(--rule); }
  .nums div { display: flex; flex-direction: column; gap: 2px; }
  .nums b { font: 400 28px/1.1 var(--title); font-variant-numeric: tabular-nums; }
  .nums span { font-size: 12px; color: var(--ink3); }
  .warn { margin: 0; font-size: 12px; line-height: 1.45; color: var(--wait); }
  .count { margin: 0; font-size: 12.5px; color: var(--ink3); min-height: 18px; }
</style>

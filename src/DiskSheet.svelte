<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store, type DiskAnswer } from './store.svelte';
  import { displayName } from './names';
  import { compare } from './diff';

  // The sheets of «Файл изменился на диске»: which version to keep (with a comparison), or what to do with a tab
  // whose file was deleted. Nothing here loses text without a choice.
  let { kind, path, onanswer }: { kind: 'changed' | 'deleted'; path: string; onanswer: (a: DiskAnswer) => void } = $props();

  const c = $derived(store.conflicts[path]); // follows the disk if it changes again while the sheet is open
  const mine = $derived(store.files.find((f) => f.path === path) ?? store.orphans[path]);
  const name = $derived(displayName((c ?? mine)?.name ?? path));
  let view = $state<'choose' | 'compare'>('choose');
  const cmp = $derived(view === 'compare' && c && mine ? compare(c.disk, mine.text) : null);

  // the conflict went away by itself (the disk caught up): nothing to ask
  $effect(() => {
    if (kind === 'changed' && !c) onanswer('later');
  });

  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const when = (ms: number | undefined) => {
    if (!ms) return 'время неизвестно';
    const d = new Date(ms);
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const today = new Date();
    return d.toDateString() === today.toDateString() ? `изменена в ${hm}` : `изменена ${d.getDate()} ${MONTHS[d.getMonth()]} в ${hm}`;
  };

  let sheet: HTMLDivElement | undefined = $state();
  let main: HTMLButtonElement | undefined = $state();
  onMount(() => main?.focus());
  async function show(v: 'choose' | 'compare') {
    view = v;
    await tick();
    main?.focus();
  }

  const keepFocus = (e: MouseEvent) => {
    if (!(e.target as Element).closest('button')) e.preventDefault();
  };
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape' || (e.metaKey && e.key === '.')) {
      e.preventDefault();
      // Esc puts the question off: back from the comparison, «later» for a conflict, «keep open» for a deleted file
      if (view === 'compare') show('choose');
      else onanswer(kind === 'changed' ? 'later' : 'keep');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const bs = [...(sheet?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const i = bs.indexOf(document.activeElement as HTMLButtonElement);
      bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length]?.focus();
    } else if (e.metaKey) e.preventDefault(); // the window behind does not react
  }
</script>

<svelte:window onkeydowncapture={key} />

<div class="block" aria-hidden="true" onmousedown={keepFocus}></div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dim" onmousedown={keepFocus}>
  {#if kind === 'changed' && view === 'compare' && cmp}
    <div class="sheet wide" bind:this={sheet} role="dialog" aria-modal="true" aria-label="Сравнение версий «{name}»">
      <div class="ttl"><h2>Сравнение версий «{name}»</h2><span class="sub">отличий: {cmp.fragments}</span></div>
      <div class="legend">
        <span><i class="sw minus"></i>− на диске, пропадёт, если оставить мою</span>
        <span><i class="sw plus"></i>+ в моей версии, перезапишет диск</span>
      </div>
      <div class="diff" role="table" aria-label="Отличия">
        {#each cmp.rows as r, i (i)}
          {#if r.kind === 'gap'}
            <div class="ln gap" role="row">… {r.n} {r.n % 10 === 1 && r.n % 100 !== 11 ? 'строка' : r.n % 10 >= 2 && r.n % 10 <= 4 && (r.n % 100 < 12 || r.n % 100 > 14) ? 'строки' : 'строк'} без изменений</div>
          {:else}
            <div class="ln" class:minus={r.kind === '-'} class:plus={r.kind === '+'} role="row" title={r.text}>
              <span class="no">{r.n}</span><span class="sg">{r.kind === '-' ? '−' : r.kind === '+' ? '+' : ''}</span><span class="tx">{r.text}</span>
            </div>
          {/if}
        {/each}
      </div>
      <div class="btns">
        <button bind:this={main} onclick={() => show('choose')}>Назад</button>
        <span class="grow"></span>
        <button onclick={() => onanswer('disk')}>Загрузить с диска</button>
        <button class="primary" onclick={() => onanswer('mine')}>Оставить мою версию</button>
      </div>
    </div>
  {:else}
    <div class="sheet" bind:this={sheet} role="alertdialog" aria-modal="true" aria-labelledby="ds-title" aria-describedby="ds-text">
      <span class="icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L2.5 16h15zM10 8v4M10 14.2v.01" /></svg></span>
      <div class="body">
        {#if kind === 'changed'}
          <h2 id="ds-title">Файл «{name}» изменён другой программой</h2>
          <p id="ds-text">В этой вкладке есть несохранённые изменения, а файл на диске уже другой. Выберите, какую версию оставить. Если оставить мою, при сохранении файл на диске будет перезаписан; если загрузить с диска, мои изменения пропадут.</p>
          <ul class="list" aria-label="Версии">
            <li><span class="nm">Моя версия</span><span class="st">{when(store.editedAt(path))}</span><span class="dot" aria-label="есть правки"></span></li>
            <li><span class="nm">Версия на диске</span><span class="st">{when(c?.mtime)}</span><span class="dot off" aria-hidden="true"></span></li>
          </ul>
        {:else}
          <h2 id="ds-title">Файл «{name}» удалён или перемещён</h2>
          <p id="ds-text">Файла больше нет по прежнему пути, а во вкладке есть несохранённые изменения. Сохраните их в новый файл или закройте вкладку без сохранения.</p>
        {/if}
      </div>
      <div class="btns">
        {#if kind === 'changed'}
          <button onclick={() => onanswer('disk')}>Загрузить с диска</button>
          <span class="grow"></span>
          <button onclick={() => onanswer('mine')}>Оставить мою версию</button>
          <!-- Return compares: an accidental Return loses neither version -->
          <button class="primary" bind:this={main} onclick={() => show('compare')}>Сравнить…</button>
        {:else}
          <button onclick={() => onanswer('close')}>Закрыть без сохранения</button>
          <span class="grow"></span>
          <button onclick={() => onanswer('keep')}>Оставить открытой</button>
          <button class="primary" bind:this={main} onclick={() => onanswer('saveas')}>Сохранить как…</button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .block { position: fixed; left: 0; right: 0; top: 0; height: 52px; z-index: 87; }
  .dim { position: fixed; left: 0; right: 0; top: 52px; bottom: 0; z-index: 87; background: var(--scrim); display: flex; justify-content: center; align-items: flex-start; }
  .sheet {
    /* 440 in the design; the three long button names of these sheets need 520 to stay on one line */
    width: 520px; max-width: 92%; padding: 18px 20px 16px; display: grid; grid-template-columns: 48px minmax(0, 1fr); column-gap: 14px; row-gap: 18px;
    background: var(--bg); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 12px 12px; box-shadow: 0 14px 40px rgba(0, 0, 0, 0.3);
  }
  .sheet.wide { width: 720px; max-width: 94%; display: flex; flex-direction: column; gap: 0; max-height: calc(100vh - 52px - 32px); }
  .icon { width: 48px; height: 48px; border-radius: 11px; background: var(--acc); color: var(--onacc); display: flex; align-items: center; justify-content: center; }
  .body { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  h2 { margin: 0; font-size: 13px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
  p { margin: 0; font-size: 12px; color: var(--fg2); line-height: 1.45; }
  .list { list-style: none; margin: 4px 0 0; padding: 0; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
  .list li { height: 28px; display: flex; align-items: center; gap: 8px; padding: 0 10px; font-size: 12px; }
  .list li + li { border-top: 1px solid var(--line); }
  .nm { flex: 1; min-width: 0; }
  .st { color: var(--fg2); font-size: 11.5px; }
  .dot { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 4px; background: var(--wait); }
  .dot.off { opacity: 0; }
  .ttl { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
  .sub { font-size: 12px; color: var(--fg2); }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-bottom: 10px; font-size: 12px; color: var(--fg2); }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .sw { width: 10px; height: 10px; border-radius: 3px; }
  .sw.minus { background: color-mix(in srgb, var(--todo) 40%, transparent); }
  .sw.plus { background: color-mix(in srgb, var(--done) 45%, transparent); }
  .diff { flex: 1 1 auto; min-height: 0; overflow: auto; border: 1px solid var(--line); border-radius: 7px; font: 12.5px var(--mono); }
  .ln { display: flex; align-items: center; height: 22px; }
  .ln.minus { background: color-mix(in srgb, var(--todo) 16%, transparent); }
  .ln.plus { background: color-mix(in srgb, var(--done) 18%, transparent); }
  .ln.gap { padding-left: 54px; color: var(--fg3); font-family: var(--ui); font-size: 11.5px; background: var(--side); }
  .no { flex: 0 0 36px; text-align: right; padding-right: 8px; color: var(--fg3); }
  .sg { flex: 0 0 18px; font-weight: 700; color: var(--fg3); }
  .ln.minus .sg { color: var(--todo); }
  .ln.plus .sg { color: var(--done); }
  .tx { flex: 1 1 auto; min-width: 0; white-space: pre; overflow: hidden; text-overflow: ellipsis; padding-right: 8px; }
  .btns { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; }
  .wide .btns { margin-top: 16px; }
  .grow { flex: 1; }
  button { flex: 0 0 auto; white-space: nowrap; height: 26px; padding: 0 12px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); border-radius: 6px; font-size: 13px; }
  button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .primary { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; padding: 0 16px; }
</style>

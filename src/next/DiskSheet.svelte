<script lang="ts">
  import { store, type DiskAnswer } from '../store.svelte';
  import { displayName } from '../names';
  import { compare, diffSummary } from '../diff';
  import { sheetKeys } from './sheetKeys';
  import Sheet from './ui/Sheet.svelte';
  import Button from './ui/Button.svelte';

  // «Файл изменён другой программой» in the new interface (ТЗ 44 §4, ТЗ 07): 520 pt; under the words two plates on
  // `chip` side by side — «Моя версия» and «На диске», each with a line of how it differs (the first difference by
  // heading, «и ещё N» for the rest); «Сравнить…» left, «Загрузить с диска», the main «Оставить мою версию».
  // «Сравнить…» — the same sheet 720 pt wide with the lines. A file gone: save it as, keep the tab, or close it.
  let { kind, path, onanswer }: { kind: 'changed' | 'deleted'; path: string; onanswer: (a: DiskAnswer) => void } = $props();
  const c = $derived(store.conflicts[path]); // follows the disk if it changes again while the sheet is open
  const mine = $derived(store.files.find((f) => f.path === path) ?? store.orphans[path]);
  const name = $derived(displayName((c ?? mine)?.name ?? path));
  let view = $state<'choose' | 'compare'>('choose');
  const sum = $derived(c && mine ? diffSummary(c.disk, mine.text) : { mine: [], disk: [] });
  const cmp = $derived(view === 'compare' && c && mine ? compare(c.disk, mine.text) : null);
  $effect(() => {
    if (kind === 'changed' && !c) onanswer('later'); // the disk caught up by itself: nothing to ask
  });
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const when = (ms: number | undefined) => {
    if (!ms) return '';
    const d = new Date(ms);
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return d.toDateString() === new Date().toDateString() ? `в ${hm}` : `${d.getDate()} ${MONTHS[d.getMonth()]} в ${hm}`;
  };
  const line = (xs: string[]) => (xs.length ? xs[0] + (xs.length > 1 ? ` и ещё ${xs.length - 1}` : '') : 'отличий нет');
  const cancel = () => (view === 'compare' ? (view = 'choose') : onanswer(kind === 'changed' ? 'later' : 'keep'));
  let box: HTMLElement | undefined = $state();
  const key = sheetKeys(
    () => box,
    (e) => (e.key === 'Escape' || (e.metaKey && e.key === '.') ? (cancel(), true) : false),
  );
  const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'строка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'строки' : 'строк');
</script>

<svelte:window onkeydowncapture={key} />
{#if kind === 'changed' && view === 'compare' && cmp}
  <Sheet title="Сравнение версий «{name}»" width={720} role="dialog" oncancel={cancel}>
    <div class="in" bind:this={box}>
      <div class="legend"><span><i class="sw minus"></i>− на диске, пропадёт, если оставить мою</span><span><i class="sw plus"></i>+ в моей версии, перезапишет диск</span><span class="n">отличий: {cmp.fragments}</span></div>
      <div class="diff" role="table" aria-label="Отличия">
        {#each cmp.rows as r, i (i)}
          {#if r.kind === 'gap'}
            <div class="ln gap" role="row">… {r.n} {plural(r.n)} без изменений</div>
          {:else}
            <div class="ln" class:minus={r.kind === '-'} class:plus={r.kind === '+'} role="row" title={r.text}><span class="no">{r.n}</span><span class="sg">{r.kind === '-' ? '−' : r.kind === '+' ? '+' : ''}</span><span class="tx">{r.text}</span></div>
          {/if}
        {/each}
      </div>
      <div class="foot">
        <Button autofocus onclick={() => (view = 'choose')}>Назад</Button>
        <span class="grow"></span>
        <Button onclick={() => onanswer('disk')}>Загрузить с диска</Button>
        <Button kind="main" onclick={() => onanswer('mine')}>Оставить мою версию</Button>
      </div>
    </div>
  </Sheet>
{:else if kind === 'changed'}
  <Sheet title="Файл «{name}» изменён другой программой" width={520} role="alertdialog" oncancel={cancel}>
    <div class="in" bind:this={box}>
      <p>В этой вкладке есть несохранённые изменения, а файл на диске уже другой. Если оставить мою версию, при сохранении она перезапишет файл; если загрузить с диска, мои изменения пропадут.</p>
      <div class="plates">
        <div class="plate" aria-label="Моя версия"><b>Моя версия</b><span class="when">{when(store.editedAt(path))}</span><span class="what">{line(sum.mine)}</span></div>
        <div class="plate" aria-label="На диске"><b>На диске</b><span class="when">{when(c?.mtime)}</span><span class="what">{line(sum.disk)}</span></div>
      </div>
      <div class="foot">
        <!-- ↩ compares, as before (ТЗ 07): an accidental ↩ loses neither version; the main one is the mockup's -->
        <Button autofocus onclick={() => (view = 'compare')}>Сравнить…</Button>
        <span class="grow"></span>
        <Button onclick={() => onanswer('disk')}>Загрузить с диска</Button>
        <Button kind="main" onclick={() => onanswer('mine')}>Оставить мою версию</Button>
      </div>
    </div>
  </Sheet>
{:else}
  <Sheet title="Файл «{name}» удалён или перемещён" role="alertdialog" oncancel={cancel}>
    <div class="in" bind:this={box}>
      <p>Файла больше нет по прежнему пути, а во вкладке есть несохранённые изменения. Сохраните их в новый файл или закройте вкладку без сохранения.</p>
      <div class="foot">
        <Button kind="danger" onclick={() => onanswer('close')}>Закрыть без сохранения</Button>
        <span class="grow"></span>
        <Button onclick={() => onanswer('keep')}>Оставить открытой</Button>
        <Button kind="main" autofocus onclick={() => onanswer('saveas')}>Сохранить как…</Button>
      </div>
    </div>
  </Sheet>
{/if}

<style>
  .in { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  p { margin: 0; }
  .plates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .plate { min-width: 0; display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-radius: 8px; background: var(--chip); }
  .plate b { font-weight: 600; color: var(--ink); }
  .when { font-size: 11.5px; color: var(--ink3); }
  .what { font-size: 12.5px; color: var(--ink2); overflow-wrap: anywhere; }
  .foot { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .grow { flex: 1; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--ink3); }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .legend .n { margin-left: auto; }
  .sw { width: 10px; height: 10px; border-radius: 2px; }
  .sw.minus { background: color-mix(in srgb, var(--todo) 30%, transparent); }
  .sw.plus { background: color-mix(in srgb, var(--done) 30%, transparent); }
  .diff { max-height: 52vh; overflow: auto; border: 1px solid var(--rule); border-radius: 8px; font: 12px/20px var(--mono); }
  .ln { display: flex; gap: 8px; padding: 0 10px; white-space: pre; color: var(--ink2); }
  .ln.minus { background: color-mix(in srgb, var(--todo) 12%, transparent); }
  .ln.plus { background: color-mix(in srgb, var(--done) 12%, transparent); }
  .ln.gap { color: var(--ink3); font-family: var(--ui); font-style: italic; }
  .no { flex: 0 0 32px; text-align: right; color: var(--ink3); }
  .sg { flex: 0 0 10px; }
  .tx { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
</style>

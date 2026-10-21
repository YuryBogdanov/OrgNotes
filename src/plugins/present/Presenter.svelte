<script lang="ts">
  import { show, drawSlide } from './show.svelte';
  import { present } from './state.svelte';

  // The presenter's view (ТЗ 59 §8, the mockup «экран докладчика»): on `side`, 56 / 40 around. On top the timer and
  // «идёт · с 14:02» (or «на паузе»), «СЛАЙД 2 ИЗ 7», «Пауза», «Завершить esc». Left «Сейчас» — the slide shown, 900 wide
  // (less when it does not fit), framed by the lamp, the keys under it; right «Дальше · <title>» (or «Конец») and the
  // notes, 21, scrolled when long.
  let w = $state(0);
  let h = $state(0);
  const deck = $derived(show.deck);
  const cur = $derived(deck?.slides[show.index] ?? null);
  const next = $derived(deck?.slides[show.index + 1] ?? null);
  const nowW = $derived(Math.max(240, Math.min(900, w - 80 - 28 - 380, ((h - 56 - 32 - 90) * 16) / 9)));
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = $derived.by(() => {
    const s = Math.floor(show.elapsed / 1000);
    const hh = Math.floor(s / 3600);
    return (hh ? `${hh}:` : '') + `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  });
  const since = $derived.by(() => {
    const d = new Date(show.began);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  function slide(box: HTMLElement, a: { i: number; width: number }) {
    const paint = (o: typeof a) => {
      void present.theme;
      drawSlide(box, o.i, o.width);
    };
    paint(a);
    return { update: paint };
  }
</script>

<div class="pr-presenter" bind:clientWidth={w} bind:clientHeight={h}>
  <div class="pp-top">
    <span class="pp-time">{time}</span>
    <span class="pp-state">{show.pausedAt !== null ? 'на паузе' : `идёт · с ${since}`}</span>
    <span class="pp-sp"></span>
    <span class="pp-count">{show.digits ? `→ ${show.digits}` : `СЛАЙД ${show.index + 1} ИЗ ${show.count}`}</span>
    <button class="pr-btn pp-b" onclick={() => show.pause()}>{show.pausedAt !== null ? 'Дальше' : 'Пауза'}</button>
    <button class="pr-btn pp-b" onclick={() => show.end()}>Завершить <span class="dim">esc</span></button>
  </div>
  <div class="pp-main">
    <div class="pp-now">
      <div class="pp-lbl">Сейчас</div>
      <div class="pp-frame on" class:black={show.black}>
        {#if cur}<div class="pp-slide" use:slide={{ i: show.index, width: nowW }}></div>{/if}
      </div>
      <div class="pp-keys"><kbd>← →</kbd> листать <kbd>B</kbd> чёрный экран <kbd>S</kbd> поменять экраны</div>
    </div>
    <div class="pp-side">
      {#if next}
        <div class="pp-lbl">Дальше · {next.title || 'Без названия'}</div>
        <div class="pp-frame"><div class="pp-slide" use:slide={{ i: show.index + 1, width: 380 }}></div></div>
      {:else}
        <div class="pp-lbl">Дальше</div>
        <div class="pp-end">Конец</div>
      {/if}
      <div class="pp-lbl notes">Заметки</div>
      <div class="pp-notes">{cur?.notes?.text || ''}</div>
    </div>
  </div>
</div>

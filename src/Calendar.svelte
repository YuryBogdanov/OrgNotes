<script lang="ts">
  import { isoDay, longDate, monthGrid, monthName, relWords, sameDay, shortDate, stampText } from './calendar';
  import type { CalSpec } from './commands';

  // Three months around the chosen day (the palette's «Выбрать дату…»): the line of the result, the grids, the
  // legend. The keys live in the palette (the focus stays in its field); the mouse picks here.
  let { spec, sel, view, bad, busy, onselect, onpick, onturn }: {
    spec: CalSpec;
    sel: Date;
    view: Date; // a day of the month in the middle
    bad: boolean; // the typed text is not a date
    busy: Map<string, 'task' | 'deadline'>;
    onselect: (d: Date) => void;
    onpick: (d: Date) => void;
    onturn: (n: number) => void; // the wheel: a month back or on
  } = $props();

  const now = new Date();
  const months = $derived([-1, 0, 1].map((k) => {
    const first = new Date(view.getFullYear(), view.getMonth() + k, 1);
    return { y: first.getFullYear(), m: first.getMonth(), mid: k === 0, weeks: monthGrid(first.getFullYear(), first.getMonth()) };
  }));
  const rel = $derived(relWords(sel, now) + (spec.current ? ` · сейчас ${shortDate(spec.current)}` : ''));
  let wheel = 0;
  function onwheel(e: WheelEvent) {
    e.preventDefault();
    wheel += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(wheel) < 60) return;
    onturn(wheel > 0 ? 1 : -1);
    wheel = 0;
  }
</script>

<div class="cal">
  <div class="res" aria-live="polite">
    <span class="long">{longDate(sel)}</span>
    <span class="rel">{bad ? 'Не похоже на дату' : rel}</span>
    {#if spec.kind === 'MARK'}
      <span class="raw"><span class="lbl">Отметка:</span>{' '}<span class="ts">{stampText(sel, spec.names).replace(/^<(.*)>$/, '[$1]')}</span></span>
    {:else}
      <span class="raw"><span class="lbl">Вставится:</span>{' '}<span class="kw">{spec.kind}:</span>{' '}<span class="ts">{stampText(sel, spec.names, spec.old)}</span></span>
    {/if}
  </div>
  <div class="months" {onwheel}>
    {#each months as mo, mi (mo.y + '-' + mo.m)}
      <div class="month" role="grid" aria-label={monthName(mo.y, mo.m)}>
        <div class="mh">
          <span class="arr" class:hid={mi !== 0} aria-hidden="true">‹</span>
          <span class="mn" class:mid={mo.mid}>{monthName(mo.y, mo.m)}</span>
          <span class="arr r" class:hid={mi !== 2} aria-hidden="true">›</span>
        </div>
        <div class="wd" aria-hidden="true"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div>
        {#each mo.weeks as w, wi (wi)}
          <div class="wk" role="row">
            {#each w as d, k (k)}
              {#if d}
                {@const b = busy.get(isoDay(d))}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="day" role="gridcell" tabindex="-1" aria-selected={sameDay(d, sel)} aria-label={longDate(d)}
                  class:sel={sameDay(d, sel)} class:today={sameDay(d, now)} class:cur={sameDay(d, spec.current)} class:we={k >= 5}
                  onmousedown={(e) => e.preventDefault()} onclick={() => onselect(d)} ondblclick={() => onpick(d)}>
                  <span class="n">{d.getDate()}</span>
                  <span class="dot" class:busy={!!b} class:dl={b === 'deadline'} aria-hidden="true"></span>
                </div>
              {:else}
                <div class="day empty" role="gridcell" aria-hidden="true"></div>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    {/each}
  </div>
  <div class="legend">
    <span><span class="sw today" aria-hidden="true"></span>сегодня</span>
    <span><span class="sw cur" aria-hidden="true"></span>текущая дата задачи</span>
    <span><span class="pt" aria-hidden="true"></span>есть записи</span>
    <span><span class="pt dl" aria-hidden="true"></span>дедлайн</span>
  </div>
</div>

<style>
  .cal { display: flex; flex-direction: column; gap: 14px; padding: 14px 18px 16px; }
  .res { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 12px; }
  .long { font-size: 15px; font-weight: 700; }
  .rel { font-size: 12.5px; color: var(--fg2); }
  .raw { margin-left: auto; font: 12px var(--mono); }
  .lbl { color: var(--fg2); }
  .kw { color: var(--fg3); }
  .ts { color: var(--ts); }
  .months { display: flex; flex-wrap: wrap; gap: 22px; }
  .month { flex: 1 1 170px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .mh { display: flex; align-items: center; height: 24px; margin-bottom: 2px; font-size: 13px; }
  .arr { width: 20px; color: var(--fg3); }
  .arr.r { text-align: right; }
  .arr.hid { visibility: hidden; }
  .mn { flex: 1; text-align: center; font-weight: 600; color: var(--fg2); }
  .mn.mid { font-weight: 700; color: var(--fg); }
  .wd, .wk { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
  .wd { font-size: 10.5px; color: var(--fg3); text-align: center; height: 16px; }
  .day { height: 30px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border-radius: 7px; border: 1.5px solid transparent; color: var(--fg); cursor: default; }
  .day.empty { visibility: hidden; }
  .day.we { color: var(--fg2); }
  .day.cur { border: 1.5px dashed var(--ts); }
  .day.today { border: 1.5px solid var(--acc); color: var(--acc); }
  .day.today .n { font-weight: 700; }
  .day.sel { background: var(--pacc); border-color: var(--pacc); color: var(--onpacc); }
  .day.sel .n { font-weight: 700; }
  .n { font-size: 12.5px; font-weight: 500; line-height: 15px; }
  .dot { width: 4px; height: 4px; border-radius: 2px; background: transparent; }
  .dot.busy { background: var(--fg3); }
  .dot.dl { background: var(--todo); }
  .day.sel .dot.busy { background: var(--onpacc); }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11.5px; color: var(--fg2); }
  .legend > span { display: flex; align-items: center; gap: 5px; }
  .sw { width: 14px; height: 14px; box-sizing: border-box; border-radius: 4px; }
  .sw.today { border: 1.5px solid var(--acc); }
  .sw.cur { border: 1.5px dashed var(--ts); }
  .pt { width: 4px; height: 4px; border-radius: 2px; background: var(--fg3); margin: 0 5px; }
  .pt.dl { background: var(--todo); }
</style>

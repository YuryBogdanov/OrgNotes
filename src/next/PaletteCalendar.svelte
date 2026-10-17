<script lang="ts">
  import { isoDay, longDate, monthGrid, monthName, sameDay } from '../calendar';
  import type { CalSpec } from '../commands';

  // The palette's calendar in the new interface (ТЗ 44 §2.1, ТЗ 20): three months — a day 13 pt in a 32 pt cell, 7 pt
  // corners; today framed by `lampline`, its number `lampink`; the chosen on `lamp`; the past days `ink3` at 60%; a
  // 4 pt `next` dot under a day with tasks already. Under them the chips «Сегодня», «Завтра», the next Monday,
  // «Через неделю», «Убрать дату» (`todo`, when there is one), and the dot's legend. The keys live in the palette.
  let { spec, sel, view, busy, onselect, onpick, onturn, onclear }: {
    spec: CalSpec; sel: Date; view: Date; busy: Map<string, 'task' | 'deadline'>;
    onselect: (d: Date) => void; onpick: (d: Date) => void; onturn: (n: number) => void; onclear: () => void;
  } = $props();

  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (n: number) => new Date(today0.getFullYear(), today0.getMonth(), today0.getDate() + n);
  const monday = day(((8 - today0.getDay()) % 7) || 7);
  const chips = [
    { label: 'Сегодня', d: day(0) },
    { label: 'Завтра', d: day(1) },
    { label: `Пн, ${monday.getDate()}`, d: monday },
    { label: 'Через неделю', d: day(7) },
  ];
  const months = $derived([-1, 0, 1].map((k) => {
    const first = new Date(view.getFullYear(), view.getMonth() + k, 1);
    return { y: first.getFullYear(), m: first.getMonth(), mid: k === 0, weeks: monthGrid(first.getFullYear(), first.getMonth()) };
  }));
  let wheel = 0;
  function onwheel(e: WheelEvent) {
    e.preventDefault();
    wheel += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(wheel) < 60) return;
    onturn(wheel > 0 ? 1 : -1);
    wheel = 0;
  }
  const keep = (e: MouseEvent) => e.preventDefault(); // the focus stays in the palette's field
</script>

<div class="cal">
  <div class="months" {onwheel}>
    {#each months as mo, mi (mo.y + '-' + mo.m)}
      <div class="month" role="grid" aria-label={monthName(mo.y, mo.m)}>
        <div class="mh">
          <button class="arr" class:hid={mi !== 0} aria-label="Месяц назад" tabindex="-1" onmousedown={keep} onclick={() => onturn(-1)}>‹</button>
          <span class="mn" class:mid={mo.mid}>{monthName(mo.y, mo.m)}</span>
          <button class="arr" class:hid={mi !== 2} aria-label="Месяц вперёд" tabindex="-1" onmousedown={keep} onclick={() => onturn(1)}>›</button>
        </div>
        <div class="wd" aria-hidden="true"><span>пн</span><span>вт</span><span>ср</span><span>чт</span><span>пт</span><span>сб</span><span>вс</span></div>
        {#each mo.weeks as w, wi (wi)}
          <div class="wk" role="row">
            {#each w as d, k (k)}
              {#if d}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="day" role="gridcell" tabindex="-1" aria-selected={sameDay(d, sel)} aria-label={longDate(d)}
                  class:sel={sameDay(d, sel)} class:today={sameDay(d, now)} class:past={+d < +today0} class:cur={sameDay(d, spec.current)}
                  onmousedown={keep} onclick={() => onselect(d)} ondblclick={() => onpick(d)}>
                  <span class="n">{d.getDate()}</span>
                  <span class="dot" class:busy={busy.has(isoDay(d))} aria-hidden="true"></span>
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
  <div class="chips">
    {#each chips as c (c.label)}<button class="chip" tabindex="-1" onmousedown={keep} onclick={() => onpick(c.d)}>{c.label}</button>{/each}
    {#if spec.clear}<button class="chip clr" tabindex="-1" onmousedown={keep} onclick={onclear}>Убрать дату</button>{/if}
    <span class="legend"><span class="pt" aria-hidden="true"></span>в этот день уже есть задачи</span>
  </div>
</div>

<style>
  .cal { display: flex; flex-direction: column; gap: 14px; padding: 6px 18px 16px; }
  .months { display: flex; gap: 22px; }
  .month { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .mh { display: flex; align-items: center; height: 26px; margin-bottom: 2px; }
  .arr { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--ink3); font: 15px var(--ui); }
  .arr:hover { background: var(--chip); color: var(--ink); }
  .arr.hid { visibility: hidden; }
  .mn { flex: 1; text-align: center; font: 600 12.5px var(--ui); color: var(--ink2); }
  .mn.mid { color: var(--ink); }
  .wd, .wk { display: grid; grid-template-columns: repeat(7, 32px); justify-content: space-between; }
  .wd { height: 18px; font-size: 10.5px; color: var(--ink3); text-align: center; }
  .day { width: 32px; height: 32px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border-radius: 7px; color: var(--ink); cursor: default; }
  .day:hover:not(.sel) { background: var(--chip); }
  .day.empty { visibility: hidden; }
  .day.past { color: color-mix(in srgb, var(--ink3) 60%, transparent); }
  .day.cur { box-shadow: inset 0 0 0 1.5px var(--rule); }
  .day.today { box-shadow: inset 0 0 0 1.5px var(--lampline); color: var(--lampink); }
  .day.today .n { font-weight: 700; }
  .day.sel { background: var(--lamp); color: var(--onlamp); box-shadow: none; }
  .day.sel .n { font-weight: 700; }
  .n { font: 500 13px/15px var(--ui); }
  .dot { width: 4px; height: 4px; border-radius: 2px; }
  .dot.busy { background: var(--next); }
  .day.sel .dot.busy { background: var(--onlamp); }
  .chips { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .chip { height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: var(--chip2); color: var(--ink); font: 12.5px var(--ui); }
  .chip:hover { background: var(--lampsoft); }
  .chip.clr { color: var(--todo); }
  .legend { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink3); }
  .pt { width: 4px; height: 4px; border-radius: 2px; background: var(--next); }
</style>

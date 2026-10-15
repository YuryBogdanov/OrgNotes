<script lang="ts">
  import { portal } from './portal';
  import { onMount } from 'svelte';
  import { fromHsv, parseHex, toHsv } from './colors';

  // The colour picker of the theme editor (ТЗ 25 §2.3): saturation and value, a hue strip, the hex, the eight colours
  // of the theme's palette, and an alpha strip for the current line and the selection. Every move applies at once.
  let { value, alpha = false, swatches, anchor, onchange, onclose }: {
    value: string; // #rrggbb or #rrggbbaa
    alpha?: boolean;
    swatches: string[];
    anchor: HTMLElement;
    onchange: (hex: string) => void;
    onclose: () => void;
  } = $props();

  const W = 250;
  // the hue is kept apart: a grey or black would lose it
  const start = toHsv(value);
  let h = $state(start.h);
  let sat = $state(start.s);
  let val = $state(start.v);
  let a = $state(alpha ? start.a : 1);
  let hexText = $state(value);
  let el: HTMLDivElement | undefined = $state();
  const cur = $derived(fromHsv(h, sat, val, a));
  const solid = $derived(fromHsv(h, sat, val));
  const hueHex = $derived(fromHsv(h, 1, 1));

  function emit() {
    hexText = cur;
    onchange(cur);
  }
  function setHex(x: string) {
    const v = toHsv(x);
    if (v.s > 0 && v.v > 0) h = v.h;
    sat = v.s;
    val = v.v;
    if (alpha) a = x.length === 9 ? v.a : a;
    emit();
  }

  // dragging in the field and the strips
  function drag(e: PointerEvent, set: (x: number, y: number) => void) {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const at = (ev: PointerEvent) => {
      set(Math.max(0, Math.min(1, (ev.clientX - box.left) / box.width)), Math.max(0, Math.min(1, (ev.clientY - box.top) / box.height)));
      emit();
    };
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const pos = $derived.by(() => {
    const r = anchor.getBoundingClientRect();
    const hgt = alpha ? 316 : 290;
    const below = window.innerHeight - r.bottom > hgt + 12;
    return { left: Math.max(8, Math.min(r.left + 30, window.innerWidth - W - 8)), top: below ? r.bottom + 4 : Math.max(8, r.top - hgt - 4) };
  });
  onMount(() => el?.querySelector<HTMLInputElement>('input')?.focus());
  function outside(e: MouseEvent) {
    const t = e.target as Node;
    if (!el?.contains(t) && !anchor.contains(t)) onclose();
  }
  function key(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    onclose();
    anchor.focus();
  }
</script>

<svelte:window onmousedown={outside} onkeydowncapture={key} />

<div class="cpop" role="dialog" aria-label="Цвет" use:portal bind:this={el} style="left:{pos.left}px;top:{pos.top}px;width:{W}px">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sv" style="background:linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, {hueHex})" onpointerdown={(e) => drag(e, (x, y) => { sat = x; val = 1 - y; })}>
    <span class="knob" style="left:{sat * 100}%;top:{(1 - val) * 100}%;background:{solid}"></span>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="strip hue" onpointerdown={(e) => drag(e, (x) => (h = Math.min(359.9, x * 360)))}><span class="thumb" style="left:{(h / 360) * 100}%"></span></div>
  {#if alpha}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="strip al" aria-label="Прозрачность" style="--c:{solid}" onpointerdown={(e) => drag(e, (x) => (a = Math.round(x * 100) / 100))}><span class="thumb" style="left:{a * 100}%"></span></div>
  {/if}
  <div class="row">
    <span class="sw big" style="background:{cur}"></span>
    <input class="hex" aria-label="HEX" spellcheck="false" bind:value={hexText}
      onkeydown={(e) => { if (e.key === 'Enter') { const x = parseHex(hexText); if (x) setHex(x); } }}
      oninput={() => { const x = parseHex(hexText); if (x && (hexText.trim().length >= 6)) { const v = toHsv(x); if (v.s > 0 && v.v > 0) h = v.h; sat = v.s; val = v.v; if (alpha && x.length === 9) a = v.a; onchange(fromHsv(h, sat, val, a)); } }} />
    {#if alpha}<span class="pct">{Math.round(a * 100)}%</span>{/if}
  </div>
  <div class="pal">
    <span class="cap">Из палитры темы</span>
    {#each swatches as c, i (i)}
      <button class="sw" style="background:{c}" aria-label="Цвет палитры {c}" onclick={() => setHex(alpha ? c + (a < 1 ? Math.round(a * 255).toString(16).padStart(2, '0') : '') : c)}></button>
    {/each}
  </div>
</div>

<style>
  .cpop { position: fixed; z-index: 130; box-sizing: border-box; padding: 10px; display: flex; flex-direction: column; gap: 8px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 14px 40px rgba(0, 0, 0, 0.28); font-size: 12px; }
  .sv { position: relative; height: 120px; border-radius: 7px; cursor: crosshair; touch-action: none; }
  .knob { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 6px; border: 2px solid #fff; box-sizing: border-box; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4); pointer-events: none; }
  .strip { position: relative; height: 10px; border-radius: 5px; touch-action: none; }
  .hue { background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
  .al { background: linear-gradient(to right, transparent, var(--c)), repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 8px 8px; }
  .thumb { position: absolute; top: -2px; width: 6px; height: 14px; margin-left: -3px; border-radius: 3px; background: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4); pointer-events: none; }
  .row { display: flex; align-items: center; gap: 6px; }
  .sw { width: 20px; height: 20px; padding: 0; border: 0; border-radius: 5px; box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.35); }
  .sw.big { flex: 0 0 26px; height: 26px; border-radius: 6px; }
  .hex { flex: 1; min-width: 0; height: 26px; box-sizing: border-box; padding: 0 8px; border: 1.5px solid var(--acc); border-radius: 6px; background: var(--bg); color: var(--fg); font: 12px var(--mono); outline: none; -webkit-user-select: text; user-select: text; }
  .pct { font: 11.5px var(--mono); color: var(--fg2); }
  .pal { display: flex; flex-wrap: wrap; gap: 5px; }
  .cap { width: 100%; font-size: 11px; color: var(--fg2); }
</style>

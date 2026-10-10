<script lang="ts">
  import { onMount } from 'svelte';
  import { PALETTE, colorName, toneOf, toneStyle, type Tone } from './colors';

  // Popover with a pointer: eight named colours (4 x 2), a live preview on both themes, and "Другой цвет…".
  let { value, keyword, fallback, anchor, onpick, onclose }: {
    value: string; // palette id, #rrggbb or '' (automatic)
    keyword: string;
    fallback: Tone; // the colour in effect when `value` is empty
    anchor: HTMLElement;
    onpick: (color: string) => void;
    onclose: () => void;
  } = $props();

  const WIDTH = 268;
  const isCustom = $derived(/^#/.test(value));
  const tone = $derived(toneOf(value) ?? fallback);
  const label = $derived(value ? colorName(value) : 'Авто');
  const named = PALETTE.map((p) => ({ id: p.id, name: p.name, style: toneStyle({ light: p.light, dark: p.dark }) }));
  const swatches = $derived(isCustom ? [...named, { id: value, name: 'Другой цвет', style: toneStyle(toneOf(value)!) }] : named);

  let el: HTMLDivElement | undefined = $state();
  let colorInput: HTMLInputElement | undefined = $state();
  let focused = $state(0);

  // placed under the swatch, kept inside the window; the arrow follows the swatch
  const place = $derived.by(() => {
    if (!anchor) return { left: 8, top: 40, bottom: undefined, arrow: 20, above: false };
    const r = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left + r.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8));
    const spaceBelow = window.innerHeight - r.bottom;
    const above = spaceBelow < 380 && r.top > spaceBelow;
    return { left, top: above ? undefined : r.bottom + 10, bottom: above ? window.innerHeight - r.top + 10 : undefined, arrow: r.left + r.width / 2 - left, above };
  });

  // focus the current colour once, when the popover opens (not on every later change of `focused`)
  onMount(() => {
    const i = swatches.findIndex((s) => s.id === value);
    focused = i >= 0 ? i : 0;
    queueMicrotask(() => el?.querySelectorAll<HTMLElement>('[data-sw]')[focused]?.focus());
  });

  function outside(e: MouseEvent) {
    const t = e.target as Node;
    if (el?.contains(t) || anchor?.contains(t)) return; // a click on the swatch is handled by its own toggle
    onclose();
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
      anchor?.focus();
      return;
    }
    const cols = 4;
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      focused = Math.max(0, Math.min(swatches.length - 1, focused + move));
      el?.querySelectorAll<HTMLElement>('[data-sw]')[focused]?.focus();
    }
  }
</script>

<svelte:window onmousedown={outside} onkeydown={key} />

<div class="pop" bind:this={el} role="dialog" aria-label="Цвет статуса {keyword}"
  style="left:{place.left}px;width:{WIDTH}px;{place.above ? `bottom:${place.bottom}px` : `top:${place.top}px`}">
  <span class="arrow" class:below={place.above} style="left:{place.arrow - 7}px"></span>
  <div class="hd"><b>Цвет статуса</b><span>{label}</span></div>

  <div class="grid" role="radiogroup" aria-label="Цвета">
    {#each swatches as s, i (s.id)}
      <button class="cell" data-sw role="radio" aria-checked={s.id === value} aria-label={s.name} tabindex={i === focused ? 0 : -1} onclick={() => onpick(s.id)}>
        <span class="dot tone-bg" class:sel={s.id === value} style={s.style}>
          {#if s.id === value}<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>{/if}
        </span>
        <span class="nm">{s.name}</span>
      </button>
    {/each}
  </div>

  <div class="prev">
    <div class="cap">Так будет выглядеть</div>
    <div class="plates">
      <div class="plate light"><span class="chip" style="color:{tone.light};background:color-mix(in srgb, {tone.light} 14%, transparent)">{keyword || '…'}</span></div>
      <div class="plate dark"><span class="chip" style="color:{tone.dark};background:color-mix(in srgb, {tone.dark} 15%, transparent)">{keyword || '…'}</span></div>
    </div>
  </div>

  <!-- the colour input lies exactly over the button, so the system picker points at the button, not at the popover's corner -->
  <div class="otherwrap">
    <button class="other" onclick={() => (colorInput?.showPicker ? colorInput.showPicker() : colorInput?.click())}>Другой цвет…</button>
    <input bind:this={colorInput} class="hidden" type="color" value={isCustom ? value : tone.light} aria-label="Другой цвет" tabindex="-1"
      oninput={(e) => onpick(e.currentTarget.value.toLowerCase())} />
  </div>
  <div class="note">Цвета подбираются отдельно для светлой и тёмной темы</div>
</div>

<style>
  .pop {
    position: fixed; z-index: 120; padding: 14px 12px; border-radius: 12px;
    background: var(--bg);
    border: 1px solid var(--line); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    display: flex; flex-direction: column; gap: 12px;
  }
  .arrow { position: absolute; top: -7px; width: 14px; height: 14px; transform: rotate(45deg); background: var(--bg); border-left: 1px solid var(--line); border-top: 1px solid var(--line); }
  .arrow.below { top: auto; bottom: -7px; transform: rotate(225deg); }
  .hd { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; }
  .hd span { color: var(--fg2); }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 2px; }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 4px; border: 0; background: transparent; padding: 2px 0; border-radius: 8px; }
  .cell:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
  .dot { width: 28px; height: 28px; border-radius: 14px; display: flex; align-items: center; justify-content: center; }
  .dot.sel { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--acc); }
  .nm { font-size: 11px; color: var(--fg2); white-space: nowrap; margin: 0 -6px; letter-spacing: -0.01em; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--fg2); margin-bottom: 6px; }
  .plates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .plate { height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--line); }
  .plate.light { background: #ffffff; }
  .plate.dark { background: #1e1e22; }
  .chip { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 5px; letter-spacing: 0.02em; }
  .otherwrap { position: relative; }
  .other { width: 100%; height: 28px; border: 0; border-radius: 6px; background: var(--field); }
  .hidden { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; pointer-events: none; border: 0; padding: 0; }
  .note { font-size: 11.5px; color: var(--fg2); line-height: 1.4; }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { PALETTE, colorName, toneOf, toneStyle, type Tone } from './colors';
  import { asNamed } from './themes';
  import { store } from './store.svelte';

  // Popover with a pointer: eight named colours (4 x 2) and a preview in the editor themes of both appearances —
  // each theme gives its own shade of a named colour.
  let { value, keyword, fallback, anchor, onpick, onclose, title = 'Цвет статуса' }: {
    value: string; // a named colour or '' (automatic)
    keyword: string;
    title?: string; // «Цвет блока» in the agenda builder
    fallback: Tone; // the colour in effect when `value` is empty
    anchor: HTMLElement;
    onpick: (color: string) => void;
    onclose: () => void;
  } = $props();

  const WIDTH = 268;
  const tone = $derived(toneOf(value) ?? fallback);
  const label = $derived(value ? colorName(value) : 'Авто');
  const swatches = PALETTE.map((p) => ({ id: p.id, name: p.name, style: toneStyle(toneOf(p.id)!) }));
  // the shade of the colour in effect in each appearance's theme: `var(--p-red)` → the theme's hex
  const light = $derived(store.themeFor('light').colors);
  const dark = $derived(store.themeFor('dark').colors);
  const shade = (pal: Record<string, string>, t: string) => pal[/--p-(\w+)/.exec(t)?.[1] ?? ''] ?? t;
  const sel = $derived(asNamed(value) ?? '');

  let el: HTMLDivElement | undefined = $state();
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
    const i = swatches.findIndex((s) => s.id === sel);
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

<div class="pop" bind:this={el} role="dialog" aria-label="{title} {keyword}"
  style="left:{place.left}px;width:{WIDTH}px;{place.above ? `bottom:${place.bottom}px` : `top:${place.top}px`}">
  <span class="arrow" class:below={place.above} style="left:{place.arrow - 7}px"></span>
  <div class="hd"><b>{title}</b><span>{label}</span></div>

  <div class="grid" role="radiogroup" aria-label="Цвета">
    {#each swatches as s, i (s.id)}
      <button class="cell" data-sw role="radio" aria-checked={s.id === sel} aria-label={s.name} tabindex={i === focused ? 0 : -1} onclick={() => onpick(s.id)}>
        <span class="dot tone-bg" class:sel={s.id === sel} style={s.style}>
          {#if s.id === sel}<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>{/if}
        </span>
        <span class="nm">{s.name}</span>
      </button>
    {/each}
  </div>

  <div class="prev">
    <div class="cap">Так будет выглядеть</div>
    <div class="plates">
      {#each [light, dark] as c, i (i)}
        {@const x = shade(c.palette, tone.light)}
        <div class="plate" style="background:{c.bg}"><span class="chip" style="color:{x};background:color-mix(in srgb, {x} 15%, transparent)">{keyword || '…'}</span></div>
      {/each}
    </div>
  </div>
  <div class="note">Оттенок цвета задаёт тема редактора: слева — светлая, справа — тёмная</div>
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
  .chip { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 5px; letter-spacing: 0.02em; }
  .note { font-size: 11.5px; color: var(--fg2); line-height: 1.4; }
</style>

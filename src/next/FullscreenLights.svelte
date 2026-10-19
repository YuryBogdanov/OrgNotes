<script lang="ts">
  import { store } from '../store.svelte';

  // The window's buttons in full screen (fix #298): Rust hides macOS's own there (titlebar.rs), the page draws these
  // where they stand in a window — over the sections' bar and the panel, or at the toolbar's start with the panel
  // hidden — while the pointer is at the screen's top (`titlebar.lights`); the red one closes, the green one leaves
  // full screen, the yellow one is off (as macOS has it in full screen). They come and go in 150 ms.
  const shown = $derived(store.titlebar.fullscreen && store.titlebar.lights);
</script>

<div class="fl" class:shown role="group" aria-label="Кнопки окна" aria-hidden={!shown} inert={!shown}>
  <button class="light close" aria-label="Закрыть окно" onclick={() => store.closeFromFullscreen()}>
    <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.8 3.8l4.4 4.4M8.2 3.8l-4.4 4.4" /></svg>
  </button>
  <button class="light mini" aria-label="Свернуть окно" disabled></button>
  <button class="light zoom" aria-label="Выйти из полноэкранного режима" onclick={() => store.leaveFullscreen()}>
    <svg viewBox="0 0 12 12" aria-hidden="true"><path class="fill" d="M3.3 6.3v2.4h2.4zM8.7 5.7V3.3H6.3z" /></svg>
  </button>
</div>

<style>
  /* where macOS puts them in a window (tauri.conf.json `trafficLightPosition`), under the menu's line when it shows */
  .fl { position: fixed; left: 18px; top: calc(var(--menu, 0px) + 20px); z-index: 50; display: flex; gap: 8px; opacity: 0; pointer-events: none; transition: opacity 0.15s ease; }
  .fl.shown { opacity: 1; pointer-events: auto; }
  @media (prefers-reduced-motion: reduce) { .fl { transition: none; } }
  .light { width: 12px; height: 12px; padding: 0; border: 0; border-radius: 6px; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.18); }
  .light svg { width: 8px; height: 8px; opacity: 0; stroke: rgba(0, 0, 0, 0.55); stroke-width: 1.3; stroke-linecap: round; fill: none; }
  .light svg .fill { fill: rgba(0, 0, 0, 0.55); stroke: none; }
  .fl:hover .light svg { opacity: 1; }
  .light.close { background: #ff5f57; }
  .light.zoom { background: #28c840; }
  .light.mini { background: color-mix(in srgb, var(--ink) 22%, transparent); box-shadow: none; }
  .light:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
</style>

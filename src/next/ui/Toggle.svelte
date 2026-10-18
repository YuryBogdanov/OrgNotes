<script lang="ts">
  // A switch of the new interface (ТЗ 44, ТЗ 54 §2): 36 × 22, off on `chip2`, on `lamp`, the knob white.
  let { checked, label, labelledby, id, disabled = false, onchange }: {
    checked: boolean; label?: string; labelledby?: string; id?: string; disabled?: boolean; onchange: () => void;
  } = $props();
</script>

<button {id} class="tg" class:on={checked} role="switch" aria-checked={checked} aria-label={label} aria-labelledby={labelledby} {disabled} onclick={onchange}><i></i></button>

<style>
  .tg { position: relative; flex: 0 0 36px; width: 36px; height: 22px; padding: 0; border: 0; border-radius: 11px; background: var(--chip2); transition: background 0.15s; }
  .tg i { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 9px; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); transition: transform 0.15s; }
  .tg.on { background: var(--lamp); }
  .tg.on i { transform: translateX(14px); }
  .tg:disabled { opacity: 0.45; }
  .tg:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .tg, .tg i { transition: none; } }
</style>

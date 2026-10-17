<script lang="ts">
  // A field of the new interface (ТЗ 44 §1): 30 pt on `field`, 7 pt corners; in focus an inner 1.5 pt `lampline`, the
  // caret `lamp`. `wrong`: the reason under it in `todo` (a form's `validate`, §4).
  let { value = $bindable(''), label, placeholder = '', wrong = '', mono = false, autofocus = false, select = false, el = $bindable(), onkeydown, oninput }: {
    value?: string; label: string; placeholder?: string; wrong?: string; mono?: boolean; autofocus?: boolean; select?: boolean;
    el?: HTMLInputElement; onkeydown?: (e: KeyboardEvent) => void; oninput?: (e: Event) => void;
  } = $props();
  const focus = (node: HTMLInputElement) => {
    if (autofocus) queueMicrotask(() => (node.focus(), select && node.select()));
  };
</script>

<span class="fw">
  <input class="f" class:mono class:bad={!!wrong} bind:this={el} bind:value aria-label={label} aria-invalid={!!wrong || undefined} {placeholder}
    spellcheck="false" autocomplete="off" {onkeydown} {oninput} use:focus />
  {#if wrong}<span class="why" role="alert">{wrong}</span>{/if}
</span>

<style>
  .fw { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .f { height: 30px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 7px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); caret-color: var(--lamp); font: 13px var(--ui); outline: none; -webkit-user-select: text; user-select: text; }
  .f.mono { font: 12.5px var(--mono); }
  .f:focus { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .f.bad { box-shadow: inset 0 0 0 1.5px var(--todo); }
  .why { font-size: 11.5px; color: var(--todo); }
</style>

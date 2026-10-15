<script lang="ts">
  // A switch (tech sprint 1.2): role="switch" with its state and its name; its look is the global `.switch`.
  let { checked, label, id, disabled = false, onchange }: { checked: boolean; label: string; id?: string; disabled?: boolean; onchange: (next: boolean) => void } = $props();
</script>

<button {id} class="switch" role="switch" aria-checked={checked} aria-label={label} {disabled} onclick={() => onchange(!checked)}><span></span></button>

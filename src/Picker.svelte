<script lang="ts">
  import { store } from './store.svelte';
  import PlacePicker from './PlacePicker.svelte';

  // «Выбрать файл…» for the Inbox (or, with `onpick`, any setting of a file): the core's choice of a place
  // (PlacePicker) with the file alone — recent ones first, typing searches every file.
  let { onclose, onpick, label = 'Файл Inbox' }: { onclose: () => void; onpick?: (rel: string) => void; label?: string } = $props();
  async function pick(p: { path: string }) {
    const rel = store.files.find((f) => f.path === p.path)?.name;
    if (!rel) return;
    onclose();
    if (onpick) onpick(rel);
    else await store.setInbox({ file: rel });
  }
</script>

<PlacePicker kind="file" title={label} token={label} placeholder="Найти файл" recent={store.refileRecentFiles('')} onpick={pick} {onclose} />

<script lang="ts">
  import { lists, resolve } from '../taskLists.svelte';
  import Menu from './ui/Menu.svelte';
  import TagsPop from './TagsPop.svelte';

  // The window's part of the lists of tasks in the new interface (ТЗ 48 §1, ТЗ 34): the task's menu — the menu of
  // ТЗ 44, 260 pt, its submenus on the right (the statuses as capsules on `lampsoft`) — and «Теги…» — the tags' popover
  // of ТЗ 44 §3.3 by the task's row, applied as one change when it closes. Both give the focus back to their list.
  const back = (id: string | undefined) =>
    queueMicrotask(() => {
      const el = lists.spec(id ?? null)?.el();
      (el?.querySelector<HTMLElement>('[data-k].sel') ?? el)?.focus({ preventScroll: true });
    });
  function closeMenu() {
    const id = lists.active ?? undefined;
    lists.menu = null;
    back(id);
  }
  const req = $derived(lists.tagsReq);
  let tags = $state<string[]>([]);
  $effect(() => {
    if (req) tags = [...(resolve(req.task)?.h.tags ?? [])];
  });
  function done() {
    const r = lists.tagsReq;
    lists.tagsReq = null;
    if (!r) return;
    const before = resolve(r.task)?.h.tags ?? [];
    if (before.join(':') !== tags.join(':')) void lists.tags(r.list, r.task, tags);
    back(r.list);
  }
</script>

{#if lists.menu}
  <Menu x={lists.menu.x} y={lists.menu.y} items={lists.menu.items} width={260} label="Задача" onclose={closeMenu} />
{/if}
{#if req}
  <TagsPop {tags} x={req.x} y={req.y} onchange={(t) => (tags = t)} onclose={done} />
{/if}

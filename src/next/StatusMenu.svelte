<script lang="ts">
  import { store } from '../store.svelte';
  import { toneFor } from '../org';
  import { toneStyle } from '../colors';
  import { PRIORITIES, statusChoices } from '../headingChoices';
  import { setPriorityAt, setStatusAt } from '../headingWrite';
  import type { RichPick } from '../orgRich';
  import type { MenuItem } from '../menuItems';
  import Menu from './ui/Menu.svelte';

  // The menu behind a drawn status or priority in the new interface (ТЗ 44 §3.2): rows of 30 pt — a place for the
  // tick, the capsule (not text), «✓» and «сейчас» at the current; the done statuses after a line; the foot «⇧← ⇧→ —
  // предыдущий / следующий» and «набор «…» · файл»; the row chosen on `lampsoft` (the fill would fight the capsules).
  let { pick, path, onclose }: { pick: RichPick; path: string; onclose: () => void } = $props();
  const f = $derived(store.files.find((x) => x.path === path));
  const items = $derived.by<MenuItem[]>(() => {
    if (!f) return [];
    // taken now: the menu closes (and its owner forgets the pick) before an item runs
    const at = path;
    const line = pick.line;
    if (pick.kind === 'status') {
      const { open, done, set } = statusChoices(f.wf, pick.keyword ?? null);
      const row = (s: { name: string; current: boolean }): MenuItem => ({
        label: s.name, capsule: toneStyle(toneFor(s.name, f.wf)), checked: s.current, ...(s.current ? { shortcut: 'сейчас' } : {}), action: () => setStatusAt(at, line, s.name),
      });
      return [...open.map(row), ...(open.length && done.length ? ['sep' as const] : []), ...done.map(row), 'sep', { note: '⇧← ⇧→ — предыдущий / следующий' }, { note: `набор «${set}» · ${f.name.split('/').pop()}` }];
    }
    if (pick.kind === 'priority')
      return [
        ...PRIORITIES.map((p): MenuItem => ({ label: p, capsule: '--tl:var(--wait)', checked: p === pick.priority, ...(p === pick.priority ? { shortcut: 'сейчас' } : {}), action: () => setPriorityAt(at, line, p) })),
        'sep',
        { label: 'Без приоритета', checked: false, action: () => setPriorityAt(at, line, null) },
      ];
    return [];
  });
</script>

{#if items.length}<Menu x={Math.min(pick.rect.left, window.innerWidth - 240)} y={pick.rect.bottom + 4} {items} width={230} soft label={pick.kind === 'status' ? 'Статус' : 'Приоритет'} {onclose} />{/if}

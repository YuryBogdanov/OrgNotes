<script lang="ts">
  import type { Named, ReviewCard } from '@panopticon/api';
  import { data } from './state.svelte';
  import { session } from './session.svelte';
  import { short } from './review';

  // The quick buttons: the same choices as the palette's heading commands, on the task of the card.
  let { card }: { card: ReviewCard } = $props();
  const ICON = {
    status: 'M3 10h14M12.5 6l4 4-4 4',
    priority: 'M10 3v10M10 16.5v.01',
    schedule: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3',
    deadline: 'M5 17V3M5 4h10l-2 3 2 3H5',
    tags: 'M3 3h6.5l7.5 7.5-6 6L3.5 9.5zM6.8 6.8h.01',
  };
  const kbd = (id: string) => data.ctx.commands.keyOf(id);
  const found = $derived(session.item ? data.find(session.item) : null);
  const h = $derived(found?.h);
  let tone = $state<Named | null>(null);
  $effect(() => {
    const kw = h?.keyword;
    const path = card.heading.ref.path;
    if (!kw) return void (tone = null);
    void data.ctx.index!.statusTone(kw, path).then((t) => (tone = t));
  });
  const d = (o?: { y: number; m: number; d: number }) => (o ? short(new Date(o.y, o.m - 1, o.d)) : '—');
  const items = $derived(
    h
      ? [
          { step: 'status', label: 'Статус', val: h.keyword ?? '—', tip: `Статус · ${kbd('statusPrev')} ${kbd('statusNext')} в тексте`, tone: !!h.keyword },
          { step: 'priority', label: 'Приоритет', val: h.priority ?? '—', tip: `Приоритет · ${kbd('prioUp')} ${kbd('prioDown')} на заголовке` },
          { step: 'schedule', label: 'Запланировано', val: d(h.scheduled), date: !!h.scheduled, tip: `Запланировать · ${kbd('schedule') || kbd('palette')}` },
          { step: 'deadline', label: 'Дедлайн', val: d(h.deadline), date: !!h.deadline, tip: `Дедлайн · ${kbd('deadline') || kbd('palette')}` },
          { step: 'tags', label: 'Теги', val: h.tags.join(', ') || '—', tip: `Теги · ${kbd('tags') || kbd('palette')}` },
        ]
      : [],
  );
  const open = (step: string) => void data.ctx.commands.run('heading.' + step, { ref: card.heading.ref });
</script>

{#each items as q (q.label)}
  <button class="qb" title={q.tip} onclick={() => open(q.step)}>
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICON[q.step as keyof typeof ICON]} /></svg>
    <span>{q.label}</span>
    <span class="qv" class:date={q.date} style:color={q.tone && tone ? `var(--p-${tone})` : null}>{q.val}</span>
  </button>
{/each}

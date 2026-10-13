<script lang="ts">
  import type { ReviewCard } from '@panopticon/api';
  import { data } from './state.svelte';
  import { session, lastLine } from './session.svelte';
  import { ageDays, agePill } from './review';

  // The card's header: «Задача 3 из 7», the file and the lines, where a moved task went, its age in the Inbox.
  let { card }: { card: ReviewCard } = $props();
  const item = $derived(session.item);
  const found = $derived(item ? data.find(item) : null);
  const age = $derived(item ? ageDays(item.created) : null);
  const stale = $derived(age !== null && age > data.settings.stale);
  const inInbox = $derived(!!item && item.path === data.path);
</script>

<span class="k">Задача {card.index + 1} из {card.total}</span>
{#if found}<span class="where">{found.f.path.split('/').pop()} · строки {found.h.line + 1}–{lastLine(found.f.text, found.h) + 1}</span>{/if}
{#if item?.result === 'move' && item.note}<span class="moved">Перенесена в {item.note.replace(/^→ /, '')}</span>{/if}
{#if item?.created && inInbox}<span class="age" class:stale>
  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 1.5" /></svg>
  {agePill(item.created)}</span>{/if}

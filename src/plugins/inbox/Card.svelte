<script lang="ts">
  import type { HeadingRef } from '@panopticon/api';
  import { data } from './state.svelte';

  // The card of the Inbox file (ТЗ 44 §5, §7): how many tasks and how old the oldest, «Разобрать ⇧⌘R»; under the
  // caret the task and the core's actions on it with their keys (§9) — «Перенести», «Запланировать», «Теги» — and
  // «Удалить». Not on a task: the actions are there, off.
  let { at }: { at: { path: string; heading: HeadingRef | null } } = $props();
  const ctx = data.ctx;
  const list = $derived(data.list);
  const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ages = $derived(list.filter((it) => it.created).map((it) => Math.round((day0(new Date()) - day0(it.created!)) / 86_400_000)));
  const oldest = $derived(ages.length ? Math.max(0, ...ages) : null);
  const it = $derived(at.heading ? list.find((x) => x.line === at.heading!.line) : undefined);
  const ref = $derived(it ? data.refOf(it) : null);
  const plural = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
  const key = (id: string) => ctx.commands.keyOf(id);
  const remove = (r: HeadingRef) => void ctx.edit!.transaction(`Удалено: ${r.title}`, (tx) => tx.remove(r));
</script>

<div class="fc-stats">
  <div class="fc-stat"><b>{list.length}</b><span>{plural(list.length, 'запись', 'записи', 'записей')}</span></div>
  {#if oldest !== null}<div class="fc-stat"><b>{oldest} дн.</b><span>самой старой</span></div>{/if}
</div>
<div class="fc-btns">
  <button type="button" class="fc-btn main" disabled={!data.pending.length} onclick={() => void ctx.commands.run('inbox.review')}>Разобрать{#if key('inbox.review')}<kbd>{key('inbox.review')}</kbd>{/if}</button>
</div>
<div class="fc-under">Под курсором</div>
{#if it}
  <div class="ib-cur">{it.title}</div>
{:else}
  <div class="ib-none">Курсор не на записи Inbox</div>
{/if}
<div class="fc-btns">
  <button type="button" class="fc-btn" disabled={!ref} onclick={() => ref && void ctx.ui.refile(ref)}>Перенести{#if key('refile')}<kbd>{key('refile')}</kbd>{/if}</button>
  <button type="button" class="fc-btn" disabled={!ref} onclick={() => ref && void ctx.commands.run('heading.schedule', { ref })}>Запланировать{#if key('schedule')}<kbd>{key('schedule')}</kbd>{/if}</button>
  <button type="button" class="fc-btn" disabled={!ref} onclick={() => ref && void ctx.commands.run('heading.tags', { ref })}>Теги{#if key('tags')}<kbd>{key('tags')}</kbd>{/if}</button>
  <button type="button" class="fc-btn" disabled={!ref} onclick={() => ref && remove(ref)}>Удалить</button>
</div>

<style>
  .ib-cur { font-size: 12.5px; font-weight: 600; color: var(--fg); line-height: 1.4; }
  .ib-none { font-size: 11.5px; opacity: 0.75; }
</style>

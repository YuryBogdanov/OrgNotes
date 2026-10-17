<script lang="ts">
  import { session } from './session.svelte';
  import type { ReviewItem } from './review';

  // The summary when the queue is through: what was done, the skipped ones to go through now, those put in meanwhile.
  const run = $derived(session.run);
  const count = (r: string) => run?.items.filter((x) => x.result === r).length ?? 0;
  const stats = $derived([
    { n: count('done'), t: 'выполнено', c: 'var(--done)' },
    { n: count('cancel'), t: 'отменено', c: 'var(--fg2)' },
    { n: count('move'), t: 'перенесено', c: 'var(--acc)' },
    { n: count('defer'), t: 'отложено', c: 'var(--ts)' },
    { n: count('skip'), t: 'пропущено', c: 'var(--wait)' },
    { n: count('next'), t: 'разобрано', c: 'var(--next)' },
  ]);
  const skipped = $derived(run?.items.filter((x) => x.result === 'skip') ?? []);
  const added = $derived(session.added);
  /** «Осталась 1 пропущенная задача», «Осталось 3 пропущенные задачи», «Осталось 5 пропущенных задач». */
  function skippedText(n: number) {
    const one = n % 10 === 1 && n % 100 !== 11;
    const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
    const words = one ? 'пропущенная задача' : few ? 'пропущенные задачи' : 'пропущенных задач';
    return `${one ? 'Осталась' : 'Осталось'} ${n} ${words}. ${one ? 'Её' : 'Их'} можно разобрать сейчас или в следующий раз.`;
  }
  const again = (list: ReviewItem[]) => session.again(list);
</script>

<p>{skipped.length ? skippedText(skipped.length) : 'Inbox разобран.'}</p>
<div class="stats">
  {#each stats as s (s.t)}<div class="stat"><span class="n" style:color={s.c}>{s.n}</span><span>{s.t}</span></div>{/each}
</div>
{#if added.length}
  <div class="added">Добавлено во время разбора: {added.length} <button class="lnk" onclick={() => session.start(added)}>Разобрать и их</button></div>
{/if}
<div class="btns">
  {#if skipped.length}<button class="pri" onclick={() => again(skipped)}>Разобрать {skipped.length === 1 ? 'пропущенную' : 'пропущенные'}</button>{/if}
  <button onclick={() => session.end()}>Закончить</button>
</div>
<span class="fine">Все изменения уже записаны в файлы. ⌘Z отменяет последнее действие разбора.</span>

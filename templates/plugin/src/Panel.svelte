<script lang="ts">
  import type { Ctx, HeadingInfo } from '@panopticon/api';
  import { openTasks } from './main';

  // The section «Пример»: the open tasks, a click opens the file at the task. Read again when a file changes.
  let { ctx }: { ctx: Ctx } = $props();
  let tasks = $state<HeadingInfo[]>([]);
  let word = $state(String(ctx.settings.values().word ?? 'задач'));
  const read = async () => (tasks = await openTasks(ctx));
  void read();
  $effect(() => {
    const offFiles = ctx.events.on('file.changed', () => void read());
    const offSettings = ctx.settings.onChange((v) => (word = String(v.word ?? 'задач')));
    return () => (offFiles(), offSettings());
  });
</script>

<div class="example">
  <h3>Открытых {word}: {tasks.length}</h3>
  <ul>
    {#each tasks as t (t.ref.path + t.ref.line)}
      <li><button onclick={() => void ctx.commands.run('heading.reveal', { ref: t.ref })}>{t.keyword} {t.title}</button></li>
    {/each}
  </ul>
</div>

<style>
  /* the app's colours: --fg, --fg2, --line, --acc, --field, --p-red … (they follow the theme) */
  .example { padding: 12px 16px; }
  h3 { margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--fg2); }
  ul { list-style: none; margin: 0; padding: 0; }
  button { width: 100%; text-align: left; padding: 5px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--fg); font-size: 13px; }
  button:hover { background: var(--field); }
</style>

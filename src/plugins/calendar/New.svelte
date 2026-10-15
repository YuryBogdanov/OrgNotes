<script lang="ts">
  import { cal as calendar } from './state.svelte';
  import { onMount } from 'svelte';
  import { dayShort, fromIso } from '@panopticon/api/org';

  // «+ Задача» / «+ Событие» of the calendar (ТЗ 24, 2.7): the quick entry of the Inbox with the day filled in. Where
  // it goes and what it gets come from «Настройки → Календарь»; «Спрашивать» and «Как в прошлый раз» let the file
  // be chosen here.
  let { kind, date, onclose }: { kind: 'task' | 'event'; date: string; onclose: () => void } = $props();

  const cfg = calendar.cfg;
  const target = calendar.target(kind);
  let title = $state('');
  let day = $state(date);
  let time = $state('');
  let file = $state(target.file?.name ?? '');
  let busy = $state(false);
  let shake = $state(false);
  let titleEl: HTMLInputElement | undefined = $state();
  onMount(() => titleEl?.focus());

  const choose = cfg.pick !== 'default';
  const files = $derived([...calendar.files].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
  const heading = kind === 'task' ? cfg.taskHeading : cfg.eventHeading;
  const placeOf = (n: string) => [n.replace(/\.org$/, '').split('/').join(' › '), heading].filter(Boolean).join(' › ');
  const valid = $derived(/^\d{4}-\d{2}-\d{2}$/.test(day));

  async function create() {
    if (!title.trim() || !file || !valid) {
      shake = true;
      setTimeout(() => (shake = false), 400);
      titleEl?.focus();
      return;
    }
    busy = true;
    const ok = await calendar.create({ kind, title, date: fromIso(day), time: /^\d{2}:\d{2}$/.test(time) ? time : null }, file);
    busy = false;
    if (!ok) return;
    const name = file.split('/').pop()!.replace(/\.org$/, '');
    calendar.ctx.ui.notify(`${kind === 'task' ? 'Задача добавлена' : 'Событие добавлено'} в «${name}»`, [{ label: 'Отменить', run: () => void calendar.ctx.edit!.undo() }]);
    onclose();
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Enter' && !(e.target as Element).closest('select')) {
      e.preventDefault();
      void create();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }
</script>

<div class="cap" role="dialog" aria-label={kind === 'task' ? 'Новая задача' : 'Новое событие'} tabindex="-1" onkeydown={key}>
  <div class="crumb"><span>{kind === 'task' ? 'Новая задача' : 'Новое событие'}</span><span aria-hidden="true">›</span><span>{valid ? dayShort(fromIso(day)) : 'дата?'}</span></div>
  <div class="trow" class:shake>
    {#if kind === 'task'}
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--fg3)" stroke-width="1.5" aria-hidden="true"><rect x="3.5" y="3.5" width="13" height="13" rx="3" /></svg>
    {:else}
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3" /></svg>
    {/if}
    <input bind:this={titleEl} bind:value={title} class="title" placeholder={kind === 'task' ? 'Что сделать?' : 'Что за событие?'} aria-label="Заголовок" spellcheck="false" autocomplete="off" disabled={busy} />
  </div>
  <div class="fields">
    <label class="f"><span>{kind === 'task' ? (cfg.dateKind === 'plain' ? 'Дата' : cfg.dateKind) : 'Дата'}</span><input type="date" bind:value={day} aria-label="Дата" /></label>
    <label class="f"><span>Время</span><input type="time" bind:value={time} aria-label="Время" step="900" /></label>
    {#if kind === 'event'}<span class="len">{time ? `на ${cfg.minutes} мин` : 'весь день'}</span>{/if}
  </div>
  <div class="where">
    {#if choose}
      <label for="cn-file">Файл</label>
      <select id="cn-file" bind:value={file}>
        {#if !file}<option value="">Выберите файл…</option>{/if}
        {#each files as f (f.path)}<option value={f.name}>{f.name.replace(/\.org$/, '').split('/').join(' › ')}</option>{/each}
      </select>
      {#if heading}<span>› {heading}</span>{/if}
    {:else if file}
      <span>Создаётся в {placeOf(file)}</span>
    {:else}
      <span class="warn">Файл не выбран: укажите его в настройках календаря или Inbox</span>
    {/if}
    <span class="sp"></span>
    <button class="link" onclick={() => { onclose(); calendar.settings(); }}>Изменить в настройках</button>
  </div>
  <div class="keys">↩ создать  ·  esc отмена<span class="sp"></span><button class="primary" onclick={() => void create()} disabled={busy || !file}>Создать</button></div>
</div>

<style>
  .cap { width: 600px; max-width: calc(100vw - 48px); box-sizing: border-box; background: var(--bg); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45); overflow: hidden; color: var(--fg); display: flex; flex-direction: column; outline: none; }
  .crumb { display: flex; align-items: center; gap: 8px; padding: 10px 18px 0; font-size: 11.5px; color: var(--fg3); }
  .trow { display: flex; align-items: center; gap: 12px; padding: 8px 18px 12px; }
  .trow.shake { animation: shake 0.3s; }
  .trow.shake .title::placeholder { color: var(--todo); }
  @keyframes shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
  @media (prefers-reduced-motion: reduce) { .trow.shake { animation: none; } }
  .title { flex: 1; min-width: 0; border: 0; background: transparent; font-size: 19px; line-height: 1.3; color: var(--fg); outline: none; -webkit-user-select: text; user-select: text; }
  .fields { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 10px 18px 10px 50px; border-top: 1px solid var(--line); }
  .f { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--fg2); }
  .f input { height: 26px; padding: 0 6px; border: 1px solid var(--line); border-radius: 6px; background: var(--field); color: var(--fg); font: inherit; font-size: 12.5px; font-weight: 400; }
  .len { font-size: 12px; color: var(--fg2); }
  .where { display: flex; align-items: center; gap: 6px; padding: 8px 18px 10px 50px; font-size: 12px; color: var(--fg2); }
  .where label { font-weight: 600; font-size: 11px; }
  .where select { height: 26px; max-width: 260px; border: 1px solid var(--line); border-radius: 6px; background: var(--field); color: var(--fg); font-size: 12.5px; }
  .warn { color: var(--todo); }
  .sp { flex: 1; }
  .link { border: 0; padding: 0; background: transparent; color: var(--acc); font-size: 12px; }
  .keys { display: flex; align-items: center; gap: 14px; padding: 8px 18px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); white-space: pre; }
  .primary { height: 26px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--acc); color: var(--onacc); font-size: 12.5px; font-weight: 600; }
  .primary:disabled { opacity: 0.5; }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { kanban } from './state.svelte';
  import { boardFor, boardOf, headingsWord, titleHtml, type StatusSet } from './board';
  import { openSetup } from './setup';

  // The board of a file (ТЗ 33 §3): the header (the workflow, the filter, what is not on it, «Текст»), the columns of
  // the statuses — the finished ones show the recent cards, the ones after the first folded — and the cards.
  let { path, showText }: { path: string; showText: () => void } = $props();

  const file = $derived(kanban.files.get(path));
  const name = $derived(path.split('/').pop() ?? path);
  const wfName = $derived(file ? boardOf(file.text) : null);
  const set = $derived(file && wfName ? (file.sets.find((s) => s.name === wfName) ?? null) : null);
  let filter = $state('');
  let selected = $state<string | null>(null);
  const showOld = $derived(new Set([...kanban.showOld].filter((k) => k.startsWith(path + '\u0000')).map((k) => k.slice(path.length + 1))));
  const board = $derived(file && set ? boardFor(file.text, file.headings, set, { filter, doneDays: kanban.doneDays, showOld }) : null);
  const firstDone = $derived(set?.states.find((s) => s.done)?.name ?? null);
  const textKey = $derived(kanban.ctx.commands.keyOf('kanban.toggle'));

  let choosing = $state(false);
  let had = false; // the file has had «#+BOARD» while shown
  onMount(() => {
    void kanban.read(path).then((f) => {
      // no «#+BOARD» yet: the choice of a workflow first (cancelled — back to the text)
      if (f && !boardOf(f.text)) void choose();
    });
  });
  // «#+BOARD» gone (⌘Z, a hand edit in the other pane): back to the text
  $effect(() => {
    if (!file || choosing) return;
    if (boardOf(file.text)) had = true;
    else if (had) showText();
  });
  async function choose() {
    const f = kanban.files.get(path) ?? (await kanban.read(path));
    if (!f) return;
    choosing = true;
    const s = await openSetup(f, wfName);
    if (s) await kanban.setBoard(path, s.name);
    choosing = false;
    if (!s && !boardOf(f.text)) showText();
  }
  function wfMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    kanban.ctx.ui.menu(
      [
        ...(file?.sets ?? []).map((s: StatusSet) => ({ label: s.name, checked: s.name === wfName, run: () => void kanban.setBoard(path, s.name) })),
        'sep' as const,
        { label: 'Убрать доску', run: () => void kanban.setBoard(path, null).then((ok) => ok && showText()) },
      ],
      { x: r.left, y: r.bottom + 4 },
    );
  }
  function offMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    kanban.ctx.ui.menu(
      (board?.off ?? []).map((o) => ({
        label: (o.keyword ? o.keyword + ' ' : '') + o.title,
        run: () => {
          showText();
          void kanban.ctx.commands.run('file.open', { path, line: o.line });
        },
      })),
      { x: r.right - 280, y: r.bottom + 4 },
    );
  }
  const folded = (kw: string, done: boolean) => kanban.isFolded(path, kw, kw === firstDone, done);
  const toggleOld = (kw: string) => {
    const k = path + '\u0000' + kw;
    if (kanban.showOld.has(k)) kanban.showOld.delete(k);
    else kanban.showOld.add(k);
  };
  const PRIO: Record<string, string> = { A: 'var(--todo)', B: 'var(--wait)', C: 'var(--fg2)' };
</script>

<div class="kanban">
  <div class="kb-head">
    <span class="kb-name">{name}</span>
    {#if file && wfName}
      <button class="kb-hb" title="Сменить workflow" onclick={wfMenu}><span class="kb-dim">Workflow:</span><b>{wfName}</b>
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="var(--fg3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5l4 4 4-4" /></svg></button>
    {/if}
    {#if board}
      <label class="kb-filter">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
        <input bind:value={filter} placeholder="Фильтр: текст, :тег:" aria-label="Фильтр карточек" spellcheck="false" autocomplete="off" />
      </label>
    {/if}
    <span class="kb-gap"></span>
    {#if board?.off.length}
      <button class="kb-off" title="Заголовки 1-го уровня без статуса или со статусом из другого workflow" onclick={offMenu}>Не на доске: {headingsWord(board.off.length)} ›</button>
    {/if}
    <button class="kb-hb" title="Вернуться к тексту файла" onclick={showText}>
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 5h12M4 9h12M4 13h8" /></svg>Текст{#if textKey}<span class="kb-dim kb-k">{textKey}</span>{/if}
    </button>
  </div>

  {#if file && wfName && !set}
    <div class="kb-missing" role="status">
      <b>Workflow «{wfName}» не найден в настройках статусов</b>
      <div class="kb-mb">
        <button class="kb-btn pri" onclick={choose}>Выбрать workflow</button>
        <button class="kb-btn" onclick={() => void kanban.ctx.commands.run('settings.open', { section: 'Статусы' })}>Открыть настройки статусов</button>
      </div>
    </div>
  {:else if board}
    <div class="kb-cols" role="list" aria-label="Колонки">
      {#each board.columns as c (c.keyword)}
        {@const tone = kanban.tone(c.keyword, path)}
        {#if folded(c.keyword, c.done)}
          <button class="kb-col folded" role="listitem" aria-label="{c.keyword}: {c.total}, свёрнута" title="Развернуть" onclick={() => kanban.setFolded(path, c.keyword, false)}>
            <span class="kb-n">{c.total}</span><span class="kb-kw v" style:--c={tone}>{c.keyword}</span>
          </button>
        {:else}
          <section class="kb-col" role="listitem" aria-label={c.keyword} data-col={c.keyword}>
            <button class="kb-ch" title="Свернуть" onclick={() => kanban.setFolded(path, c.keyword, true)}>
              <span class="kb-kw" style:--c={tone}>{c.keyword}</span>
              <span class="kb-n">{filter.trim() ? `${c.matched} из ${c.total}` : c.total}</span>
              {#if c.done && kanban.doneDays}<span class="kb-note">за {kanban.doneDays} дней</span>{/if}
            </button>
            <div class="kb-cards">
              {#each c.cards as k (k.key)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="kb-card" class:done={k.done} class:sel={selected === k.key} role="button" tabindex="0" aria-label={k.title} data-line={k.line} onclick={() => (selected = k.key)}>
                  <div class="kb-t">{@html titleHtml(k.title)}</div>
                  {#if k.priority || k.date || k.progress || k.tags.length}
                    <div class="kb-meta">
                      {#if k.priority}<span class="kb-pr" style:--c={PRIO[k.priority] ?? 'var(--fg2)'}>#{k.priority}</span>{/if}
                      {#if k.date}<span class="kb-date" class:late={k.date.late}><svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 4h14v13H3zM3 8h14" /></svg>{k.date.text}</span>{/if}
                      {#if k.progress}<span class="kb-prog"><svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 10l4 4 8-8" /></svg>{k.progress}</span>{/if}
                      {#if k.tags.length}<span class="kb-tags">:{k.tags.join(':')}:</span>{/if}
                    </div>
                  {/if}
                </div>
              {/each}
              {#if c.older}
                <button class="kb-more" onclick={() => toggleOld(c.keyword)}>Ещё {c.older} {c.older % 10 === 1 && c.older % 100 !== 11 ? 'старая' : 'старых'} ›</button>
              {:else if showOld.has(c.keyword)}
                <button class="kb-more" onclick={() => toggleOld(c.keyword)}>Только за {kanban.doneDays} дней</button>
              {/if}
            </div>
          </section>
        {/if}
      {/each}
    </div>
  {:else}
    <div class="kb-stage"></div>
  {/if}
</div>

<script lang="ts">
  import { store } from './store.svelte';
  import { backlinks, linkLabel, linksOf, resolveLink } from './links';
  import { dayDiff, fmtShort, kwTone, subtreeProgress, toJs } from './org';

  const f = $derived(store.file);
  const h = $derived(f && store.selected >= 0 ? f.headings[store.selected] : undefined);
  const states = $derived(f ? [...f.wf.open, ...f.wf.done] : []);
  const tone = $derived(h?.keyword && f ? kwTone(h.keyword, f.wf) : '--fg2');
  const progress = $derived(h && f ? subtreeProgress(f.headings, store.selected, f.wf) : { done: 0, total: 0 });
  const inherited = $derived.by(() => {
    if (!h || !f) return [] as string[];
    const out = new Set<string>(f.filetags);
    for (let p = h.parent; p >= 0; p = f.headings[p].parent) f.headings[p].tags.forEach((t) => out.add(t));
    h.tags.forEach((t) => out.delete(t));
    return [...out];
  });
  const deadlineHint = $derived.by(() => {
    if (!h?.deadline) return '';
    const n = dayDiff(toJs(h.deadline), new Date());
    return n < 0 ? `просрочено на ${-n} дн.` : n === 0 ? 'дедлайн сегодня' : `до дедлайна ${n} дн.`;
  });
  // links written in this heading's own text, and links from elsewhere that point here
  const own = $derived.by(() => {
    if (!f || !h) return [];
    const next = f.headings[store.selected + 1]?.line ?? Infinity;
    return linksOf(f)
      .filter((l) => l.line >= h.line && l.line < next)
      .map((l) => ({ l, t: resolveLink(l, store.cur, store.files) }));
  });
  const back = $derived(h ? backlinks(store.files, store.cur, h.line) : []);
  const isDone = $derived(!!h?.keyword && !!f?.wf.done.includes(h.keyword));
</script>

<div class="insp">
  {#if h && f}
    <section>
      <div class="cap">ЗАДАЧА</div>
      <div class="name">{h.title}</div>
      <label class="row">
        <span class="k">Состояние</span>
        <select class="pick" style="color:var({tone});font-weight:600" value={h.keyword ?? ''} onchange={(e) => store.setKeyword(e.currentTarget.value || null)}>
          <option value="">—</option>
          {#each states as s}<option value={s}>{s}</option>{/each}
        </select>
      </label>
      <label class="row">
        <span class="k">Приоритет</span>
        <select class="pick" style="color:{h.priority ? 'var(--wait)' : 'inherit'};font-weight:600" value={h.priority ?? ''} onchange={(e) => store.setPriority(e.currentTarget.value || null)}>
          <option value="">—</option>
          {#each ['A', 'B', 'C'] as p}<option value={p}>{p}</option>{/each}
        </select>
      </label>
      <button class="primary" onclick={() => store.setKeyword(isDone ? f.wf.open[0] : f.wf.done[0])}>
        {isDone ? 'Вернуть в работу' : 'Выполнено'}
      </button>
    </section>

    <section>
      <div class="cap">ДАТЫ</div>
      <div class="row"><span class="k">Запланировано</span><span class="val">{h.scheduled ? fmtShort(h.scheduled) : '—'}</span></div>
      <div class="row"><span class="k">Дедлайн</span><span class="val">{h.deadline ? fmtShort(h.deadline) : '—'}</span></div>
      {#if h.event}<div class="row"><span class="k">Событие</span><span class="val">{fmtShort(h.event)}{h.event.time ? ' ' + h.event.time : ''}</span></div>{/if}
      {#if h.closed}<div class="row"><span class="k">Закрыто</span><span class="val">{fmtShort(h.closed)}</span></div>{/if}
      {#if deadlineHint}<div class="hint right">{deadlineHint}</div>{/if}
    </section>

    {#if h.tags.length || inherited.length}
      <section>
        <div class="cap">ТЕГИ</div>
        <div class="tags">
          {#each h.tags as t}<span class="tag">{t}</span>{/each}
          {#each inherited as t}<span class="tag inh">{t}</span>{/each}
        </div>
        {#if inherited.length}<div class="hint">Пунктиром — унаследованные от родительских заголовков</div>{/if}
      </section>
    {/if}

    {#if own.length}
      <section>
        <div class="cap">ССЫЛКИ</div>
        {#each own as { l, t }}
          <button class="link" class:bad={t.kind === 'missing'} onclick={() => store.follow(l)} title={l.raw}>
            <span class="lic">{t.kind === 'url' ? '↗' : t.kind === 'missing' ? '⚠' : '→'}</span>
            <span class="ltx">{linkLabel(l)}</span>
          </button>
        {/each}
      </section>
    {/if}

    {#if back.length}
      <section>
        <div class="cap">ОБРАТНЫЕ ССЫЛКИ</div>
        {#each back as b}
          <button class="link" onclick={() => store.jump(b.file, b.line)}>
            <span class="lic">←</span>
            <span class="ltx">{b.heading || store.files[b.file].name}<span class="src"> · {store.files[b.file].name.split('/').pop()}</span></span>
          </button>
        {/each}
      </section>
    {/if}

    {#if progress.total}
      <section>
        <div class="cap">ПОДЗАДАЧИ</div>
        <div class="bar"><div style="width:{(progress.done / progress.total) * 100}%"></div></div>
        <div class="hint">{progress.done} из {progress.total} выполнено</div>
      </section>
    {/if}

    {#if h.effort}
      <section>
        <div class="cap">СВОЙСТВА</div>
        <div class="row"><span class="k">Effort</span><span class="val mono">{h.effort}</span></div>
      </section>
    {/if}
  {:else}
    <div class="empty">Поставьте курсор внутрь заголовка, чтобы увидеть его свойства</div>
  {/if}
</div>

<style>
  .insp { height: 100%; overflow: auto; padding: 14px; display: flex; flex-direction: column; gap: 16px; }
  section { display: flex; flex-direction: column; gap: 8px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
  section:last-child { border-bottom: 0; }
  .cap { font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .name { font-size: 14px; font-weight: 600; line-height: 1.3; -webkit-user-select: text; user-select: text; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .k { color: var(--fg2); font-size: 12px; }
  .val { height: 24px; display: flex; align-items: center; padding: 0 10px; background: var(--field); border-radius: 6px; font-size: 12px; }
  .mono { font-family: var(--mono); }
  .pick { height: 24px; padding: 0 6px; border: 0; border-radius: 6px; background: var(--field); font-size: 12px; }
  .primary { height: 28px; border: 0; border-radius: 6px; background: var(--acc); color: var(--onacc); font-size: 12.5px; font-weight: 600; }
  .primary:active { filter: brightness(0.9); }
  .hint { font-size: 11.5px; color: var(--fg2); }
  .right { text-align: right; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { padding: 2px 9px; border-radius: 10px; background: var(--tagbg); color: var(--tagfg); font-size: 12px; }
  .tag.inh { background: transparent; border: 1px dashed var(--line); color: var(--fg2); }
  .bar { height: 6px; border-radius: 3px; background: var(--field); overflow: hidden; }
  .bar div { height: 100%; background: var(--done); }
  .link { display: flex; gap: 8px; align-items: baseline; text-align: left; border: 0; background: transparent; padding: 3px 6px; margin: 0 -6px; border-radius: 6px; font-size: 12.5px; color: var(--link); }
  .link:hover { background: var(--field); }
  .link.bad { color: var(--todo); }
  .lic { flex: 0 0 auto; color: var(--fg3); }
  .ltx { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .src { color: var(--fg2); }
  .empty { color: var(--fg2); font-size: 12px; line-height: 1.5; padding-top: 6px; }
</style>

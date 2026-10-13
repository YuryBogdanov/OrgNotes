<script lang="ts">
  import ContextMenu from './ContextMenu.svelte';
  import { lists, resolve } from './taskLists.svelte';
  import { store } from './store.svelte';

  // The window's part of the lists of tasks (ТЗ 34): the context menu of a task and the field of its tags. Both give
  // the focus back to the list they came from.
  const back = (id: string | undefined) => queueMicrotask(() => lists.spec(id ?? null)?.el()?.focus({ preventScroll: true }));
  function closeMenu() {
    const id = lists.active ?? undefined;
    lists.menu = null;
    back(id);
  }

  // ---- «Теги…»: the task's tags as capsules with «×», a field with the tags of the folder ---------------------------
  const req = $derived(lists.tagsReq);
  let tags = $state<string[]>([]);
  let q = $state('');
  let hi = $state(0);
  let input: HTMLInputElement | undefined = $state();
  $effect(() => {
    if (!req) return;
    tags = [...(resolve(req.task)?.h.tags ?? [])];
    q = '';
    hi = 0;
    queueMicrotask(() => input?.focus());
  });
  const all = $derived([...new Set(store.files.flatMap((f) => [...f.filetags, ...f.headings.flatMap((h) => h.tags)]))].sort((a, b) => a.localeCompare(b, 'ru')));
  const found = $derived.by(() => {
    const s = q.trim().toLowerCase();
    return s ? all.filter((t) => !tags.includes(t) && t.toLowerCase().includes(s)).slice(0, 8) : [];
  });
  function add(t: string) {
    const v = t.trim().replace(/[\s:]+/g, '_');
    if (v && !tags.includes(v)) tags = [...tags, v];
    q = '';
    hi = 0;
  }
  function done(apply: boolean) {
    const r = lists.tagsReq;
    lists.tagsReq = null;
    if (!r) return;
    if (apply) {
      const before = resolve(r.task)?.h.tags ?? [];
      if (before.join(':') !== tags.join(':')) void lists.tags(r.list, r.task, tags);
    }
    back(r.list);
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      done(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (q.trim()) add(found[hi] ?? q);
      else done(true);
    } else if (e.key === 'ArrowDown' && found.length) {
      e.preventDefault();
      hi = (hi + 1) % found.length;
    } else if (e.key === 'ArrowUp' && found.length) {
      e.preventDefault();
      hi = (hi - 1 + found.length) % found.length;
    } else if (e.key === 'Backspace' && !q && tags.length) {
      tags = tags.slice(0, -1);
    } else if ((e.key === ' ' || e.key === ',') && q.trim()) {
      e.preventDefault();
      add(q);
    }
  }
  const pos = $derived(req ? { left: Math.max(8, Math.min(req.x, window.innerWidth - 328)), top: Math.max(8, Math.min(req.y, window.innerHeight - 220)) } : { left: 0, top: 0 });
</script>

{#if lists.menu}
  <ContextMenu x={lists.menu.x} y={lists.menu.y} items={lists.menu.items} onclose={closeMenu} width={250} tall />
{/if}

{#if req}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onmousedown={() => done(false)}></div>
  <div class="tagpop" role="dialog" aria-label="Теги задачи" style="left:{pos.left}px;top:{pos.top}px">
    <div class="cap">ТЕГИ</div>
    <div class="box">
      {#each tags as t (t)}
        <span class="chip">{t}<button aria-label="Убрать тег {t}" onclick={() => (tags = tags.filter((x) => x !== t))}>×</button></span>
      {/each}
      <input bind:this={input} bind:value={q} onkeydown={key} placeholder={tags.length ? '' : 'Добавить тег'} aria-label="Новый тег" spellcheck="false" autocomplete="off" />
    </div>
    {#if found.length}
      <div class="list" role="listbox" aria-label="Теги папки">
        {#each found as t, i (t)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="opt" class:on={i === hi} role="option" aria-selected={i === hi} onmousedown={(e) => { e.preventDefault(); add(t); }}>{t}</div>
        {/each}
      </div>
    {/if}
    <div class="foot"><span>↩ применить</span><span>⎋ отмена</span></div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 90; }
  .tagpop {
    position: fixed; z-index: 91; width: 320px; box-sizing: border-box; padding: 10px; border-radius: 9px;
    background: var(--bg); border: 1px solid var(--line); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
    display: flex; flex-direction: column; gap: 8px;
  }
  .cap { font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .box { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-height: 30px; padding: 4px 6px; border-radius: 6px; background: var(--field); }
  .box:focus-within { box-shadow: 0 0 0 2px color-mix(in srgb, var(--acc) 45%, transparent); }
  .chip { display: inline-flex; align-items: center; gap: 3px; padding: 1px 4px 1px 8px; border-radius: 9px; background: var(--tagbg); color: var(--tagfg); font-size: 12px; }
  .chip button { border: 0; background: transparent; color: inherit; padding: 0 3px; font-size: 13px; line-height: 1; opacity: 0.7; }
  .chip button:hover { opacity: 1; }
  input { flex: 1; min-width: 80px; border: 0; outline: none; background: transparent; font-size: 13px; padding: 2px; }
  .list { display: flex; flex-direction: column; max-height: 180px; overflow: auto; }
  .opt { padding: 4px 8px; border-radius: 5px; font-size: 13px; }
  .opt.on { background: var(--acc); color: var(--onacc); }
  .foot { display: flex; gap: 14px; font-size: 11.5px; color: var(--fg2); }
</style>

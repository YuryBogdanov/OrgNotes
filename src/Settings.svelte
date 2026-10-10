<script lang="ts">
  import { store } from './store.svelte';
  import { toneFor, type Workflow } from './org';
  import { toneOf, toneStyle, colorName } from './colors';
  import ColorPicker from './ColorPicker.svelte';
  import {
    MAX_KEYWORD, addState, addWorkflow, canRemoveState, canRemoveWorkflow, checkKeyword, displayName, dropState, dropWorkflow,
    effectiveKeys, fromConfig, initialOf, moveState, normalizeKeyword, orgLine, pendingState, removeState, removeWorkflow,
    toJson, validate, type DraftState,
  } from './workflowEditor';

  // `standalone`: the settings live in their own window; otherwise they are a sheet over the app (plain browser).
  let { standalone = false }: { standalone?: boolean } = $props();

  let draft = $state(fromConfig(store.config));
  let selectedId = $state(draft.workflows[0]?.id ?? '');
  const wf = $derived(draft.workflows.find((w) => w.id === selectedId) ?? draft.workflows[0]);
  const problems = $derived(validate(draft));
  const json = $derived(toJson(store.configText, draft));
  // nothing is written until the user actually changes something
  let baseline = toJson(store.configText, draft);
  let savedFlash = $state(false);

  $effect(() => {
    const j = json;
    if (problems.length || j === baseline) return;
    const t = setTimeout(async () => {
      baseline = j;
      await store.saveConfig(j);
      savedFlash = true;
      setTimeout(() => (savedFlash = false), 1500);
    }, 250);
    return () => clearTimeout(t);
  });

  // statuses as a Workflow, so chips use the same colours as everywhere in the app
  const asWorkflow = $derived<Workflow>({
    open: draft.workflows.flatMap((w) => w.states.filter((s) => !s.done && !s.pending).map((s) => s.keyword)),
    done: draft.workflows.flatMap((w) => w.states.filter((s) => s.done && !s.pending).map((s) => s.keyword)),
    sequences: draft.workflows.map((w) => ({
      name: w.name,
      states: w.states.filter((s) => !s.pending).map((s) => ({ name: s.keyword, done: s.done, color: s.color || undefined })),
    })),
  });
  const toneOfState = (s: DraftState) => toneOf(s.color) ?? toneFor(s.keyword || 'X', asWorkflow);
  const chipStyle = (s: DraftState) => toneStyle(toneOfState(s));

  const keys = $derived(wf ? effectiveKeys(wf) : new Map<string, string>());
  const open = $derived(wf ? wf.states.filter((s) => !s.done) : []);
  const done = $derived(wf ? wf.states.filter((s) => s.done) : []);
  const initial = $derived(wf ? initialOf(wf) : undefined);
  const used = (kw: string) => (kw ? store.keywordUsage(kw) : 0);

  // ---- editing a keyword: a buffer per row, Return confirms, Esc cancels --------------------------
  let edits = $state<Record<string, string>>({});
  let errors = $state<Record<string, string>>({});
  let focusId = $state<string | null>(null);
  let focusTick = $state(0);
  const inputs: Record<string, HTMLInputElement | undefined> = {};
  /** Remember a row's keyword field so it can be focused from code. */
  function track(el: HTMLInputElement, id: string) {
    inputs[id] = el;
    return {
      destroy() {
        if (inputs[id] === el) delete inputs[id];
      },
    };
  }

  const valueOf = (s: DraftState) => edits[s.id] ?? s.keyword;
  function typing(s: DraftState, raw: string) {
    const v = normalizeKeyword(raw);
    edits[s.id] = raw.length && /\s$/.test(raw) ? v + '-' : v; // a trailing space becomes the dash at once
    const e = v ? checkKeyword(draft, v, s.id) : null;
    if (e) errors[s.id] = e;
    else delete errors[s.id];
  }
  function clearEdit(id: string) {
    delete edits[id];
    delete errors[id];
  }
  function cancel(s: DraftState) {
    clearEdit(s.id);
    if (s.pending) {
      if (wf) removeState(wf, s.id);
      return;
    }
    inputs[s.id]?.blur();
  }
  type Rename = { s: DraftState; from: string; to: string; count: number };
  let rename = $state<Rename | null>(null);
  let confirmDelete = $state<{ s: DraftState; count: number } | null>(null);

  function commit(s: DraftState) {
    const v = valueOf(s);
    if (!v && s.pending) {
      cancel(s);
      return false;
    }
    if (v === s.keyword && !s.pending) {
      clearEdit(s.id);
      return true;
    }
    const err = checkKeyword(draft, v, s.id);
    if (err) {
      errors[s.id] = err;
      return false;
    }
    if (!s.pending && used(s.keyword) > 0) {
      rename = { s, from: s.keyword, to: v, count: used(s.keyword) };
      return true; // the dialog decides
    }
    applyKeyword(s, v);
    return true;
  }
  function applyKeyword(s: DraftState, v: string) {
    s.keyword = v;
    s.pending = false;
    clearEdit(s.id);
  }
  function keydown(e: KeyboardEvent, s: DraftState) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (commit(s) && !errors[s.id]) inputs[s.id]?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel(s);
    }
  }
  function blur(s: DraftState) {
    if (rename || errors[s.id]) {
      if (!s.pending) clearEdit(s.id); // an invalid edit is dropped, the old word stays
      else if (!valueOf(s)) cancel(s);
      return;
    }
    if (edits[s.id] !== undefined || s.pending) commit(s);
  }
  function chooseRename(mode: 'files' | 'settings' | 'cancel') {
    const r = rename;
    rename = null;
    if (!r) return;
    if (mode === 'cancel') {
      clearEdit(r.s.id);
      return;
    }
    if (mode === 'files') store.renameKeywordInFiles(r.from, r.to);
    applyKeyword(r.s, r.to);
  }

  function plus(done = false) {
    if (!wf) return;
    const s = addState(draft, wf, done);
    focusId = s.id;
    focusTick++;
  }
  $effect(() => {
    focusTick; // each press of "+" focuses the empty row again
    const id = focusId;
    if (!id) return;
    queueMicrotask(() => {
      const el = inputs[id];
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    });
  });

  // ---- deleting ------------------------------------------------------------------------------------
  function askDelete(s: DraftState) {
    if (!wf || !canRemoveState(wf, s.id)) return;
    const n = s.pending ? 0 : used(s.keyword);
    if (n > 0) confirmDelete = { s, count: n };
    else removeState(wf, s.id);
  }
  function doDelete() {
    const c = confirmDelete;
    confirmDelete = null;
    if (c && wf) removeState(wf, c.s.id);
  }
  let confirmWf = $state(false);
  const wfUsed = $derived(wf ? wf.states.reduce((n, s) => n + (s.pending ? 0 : used(s.keyword)), 0) : 0);
  function deleteWorkflow() {
    if (!wf || !canRemoveWorkflow(draft)) return;
    if (wfUsed > 0 && !confirmWf) {
      confirmWf = true;
      return;
    }
    confirmWf = false;
    const idx = draft.workflows.findIndex((w) => w.id === wf.id);
    removeWorkflow(draft, wf.id);
    selectedId = draft.workflows[Math.max(0, idx - 1)]?.id ?? '';
  }
  $effect(() => {
    selectedId;
    confirmWf = false;
    picker = null;
  });

  // ---- colour picker ---------------------------------------------------------------------------------
  let picker = $state<{ id: string; anchor: HTMLElement } | null>(null);
  const pickerState = $derived(picker && wf ? wf.states.find((s) => s.id === picker!.id) : undefined);
  function togglePicker(e: MouseEvent | KeyboardEvent, s: DraftState) {
    const anchor = e.currentTarget as HTMLElement;
    picker = picker?.id === s.id ? null : { id: s.id, anchor };
  }

  // ---- drag and drop ------------------------------------------------------------------------------------
  let dragId = $state<string | null>(null);
  let overId = $state<string | null>(null);
  let dragWf = $state<string | null>(null);
  let overWf = $state<string | null>(null);
  function startRowDrag(e: DragEvent, s: DraftState) {
    dragId = s.id;
    e.dataTransfer?.setData('text/plain', s.id);
    const row = (e.currentTarget as HTMLElement).closest('.srow');
    if (row && e.dataTransfer) e.dataTransfer.setDragImage(row, 12, 20);
  }
  const dropRow = (e: DragEvent, before: string | 'separator' | null) => {
    e.preventDefault();
    if (dragId && wf) dropState(wf, dragId, before);
    dragId = overId = null;
  };

  // keyboard reordering of the focused row: ⌥↑ / ⌥↓
  function rowKey(e: KeyboardEvent, s: DraftState) {
    if (!e.altKey || !wf || (e.target as HTMLElement).tagName === 'INPUT' && false) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveState(wf, s.id, e.key === 'ArrowUp' ? -1 : 1);
      queueMicrotask(() => document.querySelector<HTMLElement>(`[data-row="${s.id}"]`)?.focus());
    }
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape' && !standalone && !picker && !rename && !confirmDelete) store.settingsOpen = false;
  }

  const TABS = ['Основные', 'Статусы', 'Теги', 'Агенды', 'Календарь', 'Файлы'];
  const bannerCount = $derived(problems.length + Object.keys(errors).length);
</script>

<svelte:window onkeydown={key} />

{#snippet body()}
  <div class="win" class:standalone role={standalone ? undefined : 'dialog'} aria-modal={standalone ? undefined : true} aria-label="Настройки">
    <header>
      <div class="tabs" role="tablist" aria-label="Разделы настроек">
        {#each TABS as t}
          <button role="tab" aria-selected={t === 'Статусы'} class:on={t === 'Статусы'} disabled={t !== 'Статусы'} title={t === 'Статусы' ? '' : 'Пока не реализовано'}>{t}</button>
        {/each}
      </div>
      <span class="flash" class:show={savedFlash}>Сохранено в .orgnotes/config.json</span>
      {#if !standalone}<button class="close" aria-label="Закрыть настройки" onclick={() => (store.settingsOpen = false)}>×</button>{/if}
    </header>

    <div class="body">
      <aside>
        <div class="cap">НАБОРЫ СТАТУСОВ</div>
        {#each draft.workflows as w (w.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="wfrow" class:over={overWf === w.id}
            ondragover={(e) => { if (dragWf) { e.preventDefault(); overWf = w.id; } }}
            ondrop={(e) => { e.preventDefault(); if (dragWf) dropWorkflow(draft, dragWf, w.id); dragWf = overWf = null; }}>
            <button class="wf" class:on={w.id === wf?.id} aria-pressed={w.id === wf?.id} onclick={() => (selectedId = w.id)}>
              <span class="wfh">
                <span class="wfgrip" draggable="true" role="img" aria-label="Перетащить набор" ondragstart={(e) => { dragWf = w.id; e.dataTransfer?.setData('text/plain', w.id); }} ondragend={() => (dragWf = overWf = null)}>⋮⋮</span>
                <span class="wfn">{w.name || '—'}</span>
              </span>
              <span class="chips">
                {#each w.states.filter((s) => !s.pending) as s (s.id)}<span class="chip tone-chip" style={chipStyle(s)}>{displayName(s.keyword) || '…'}</span>{/each}
              </span>
            </button>
          </div>
        {/each}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="wfend" class:over={overWf === 'end'} ondragover={(e) => { if (dragWf) { e.preventDefault(); overWf = 'end'; } }}
          ondrop={(e) => { e.preventDefault(); if (dragWf) dropWorkflow(draft, dragWf, null); dragWf = overWf = null; }}></div>
        <button class="add" onclick={() => (selectedId = addWorkflow(draft).id)}>+ Новый набор</button>
        <p class="help">Набор — это цепочка состояний. Первый набор в списке используется по умолчанию. Порядок меняется перетаскиванием. Переключаться между наборами на заголовке можно клавишами ⌃⇧← и ⌃⇧→.</p>
      </aside>

      {#if wf}
        <section>
          <div class="head">
            <label class="field">
              <span>Название набора</span>
              <input aria-label="Название набора" value={wf.name} oninput={(e) => (wf.name = e.currentTarget.value)} />
            </label>
            <label class="field">
              <span>Состояние новой задачи</span>
              <select aria-label="Состояние новой задачи" value={initial?.id} onchange={(e) => (wf.initialId = e.currentTarget.value)}>
                {#each open.filter((s) => !s.pending) as s (s.id)}<option value={s.id}>{displayName(s.keyword)}</option>{/each}
              </select>
            </label>
            <div class="tools">
              <button class="danger" aria-label="Удалить набор" disabled={!canRemoveWorkflow(draft)} title={canRemoveWorkflow(draft) ? '' : 'Единственный набор удалить нельзя'} onclick={deleteWorkflow}>
                {confirmWf ? `Удалить (в заметках: ${wfUsed})?` : 'Удалить набор'}
              </button>
            </div>
          </div>
          {#each problems.filter((p) => p.workflow === wf.id && !p.state) as p}<div class="err">{p.message}</div>{/each}

          <div class="table" role="table" aria-label="Состояния набора">
            <div class="grid th" role="row">
              <span></span><span role="columnheader">ЦВЕТ</span>
              <span role="columnheader" class="lockh">НАЗВАНИЕ
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Только чтение"><rect x="4.5" y="9" width="11" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
              </span>
              <span role="columnheader" class="edith">В ФАЙЛЕ
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Редактируется"><path d="M3 17l1-4 9.5-9.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L7 16z" /></svg>
              </span>
              <span role="columnheader">КЛАВИША</span><span></span>
            </div>

            {#each [...open, 'sep', ...done] as item (typeof item === 'string' ? 'sep' : item.id)}
              {#if typeof item === 'string'}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="sep" class:over={overId === 'separator'} ondragover={(e) => { e.preventDefault(); overId = 'separator'; }} ondrop={(e) => dropRow(e, 'separator')}>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9" /></svg>
                  Ниже — завершающие состояния: задача считается закрытой
                </div>
              {:else}
                {@const s = item}
                {@const kw = valueOf(s)}
                <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                <div class="grid srow" class:over={overId === s.id} class:isdone={s.done} class:bad={!!errors[s.id]} role="row" tabindex="0" data-row={s.id}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" aria-label="{displayName(s.keyword) || 'Новое состояние'}. Option со стрелками вверх и вниз меняет порядок"
                  onkeydown={(e) => rowKey(e, s)}
                  ondragover={(e) => { if (dragId) { e.preventDefault(); overId = s.id; } }} ondrop={(e) => dropRow(e, s.id)}>
                  <span class="grip" draggable="true" role="img" aria-label="Перетащить строку" ondragstart={(e) => startRowDrag(e, s)} ondragend={() => (dragId = overId = null)}>⋮⋮</span>
                  <span class="colorcell">
                    <button class="swatch" aria-label="Цвет: {s.color ? colorName(s.color) : 'авто'}. Изменить" aria-haspopup="dialog" aria-expanded={picker?.id === s.id}
                      style="background:{toneOfState(s).light}" onclick={(e) => togglePicker(e, s)}></button>
                  </span>
                  <span class="name" role="cell" class:empty={!kw}>{kw ? displayName(kw) : '—'}</span>
                  <span class="filecell">
                    <input class="kw" class:red={!!errors[s.id]} role="cell" aria-label="Ключевое слово в файле" aria-invalid={!!errors[s.id]}
                      placeholder="например, REVIEW" maxlength={MAX_KEYWORD + 8} spellcheck="false" autocomplete="off"
                      use:track={s.id} value={kw}
                      oninput={(e) => typing(s, e.currentTarget.value)} onkeydown={(e) => keydown(e, s)} onblur={() => blur(s)}
                      onfocus={() => (focusId = s.id)} />
                  </span>
                  <span class="keycell">{#if keys.get(s.id) && !s.pending}<span class="keychip">{keys.get(s.id)}</span>{/if}</span>
                  <span class="acts">
                    <button class="x" aria-label="Удалить состояние {displayName(s.keyword)}" disabled={!canRemoveWorkflow(draft) && false || !canRemoveState(wf, s.id)}
                      title={canRemoveState(wf, s.id) ? '' : 'Последнее открытое состояние удалить нельзя'} onclick={() => askDelete(s)}>×</button>
                  </span>
                </div>
                {#if errors[s.id]}
                  <div class="hint err">{errors[s.id]}</div>
                {:else if s.pending}
                  <div class="hint">Введите ключевое слово и нажмите ↩ · ⎋ — отмена</div>
                {/if}
                {#each problems.filter((p) => p.state === s.id) as p}<div class="hint err">{p.message}</div>{/each}
              {/if}
            {/each}

            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="addrow" class:over={overId === 'end'} ondragover={(e) => { if (dragId) { e.preventDefault(); overId = 'end'; } }} ondrop={(e) => dropRow(e, null)}>
              <button onclick={() => plus(false)}>+ Состояние</button>
              <button onclick={() => plus(true)}>+ Завершающее</button>
            </div>
          </div>
          <div class="note">Название строится из ключевого слова. Редактируется только колонка «В файле».</div>

          <div class="block">
            <div class="cap">ПОВЕДЕНИЕ</div>
            <button class="sw-row" role="switch" aria-checked={draft.behavior.closed} onclick={() => (draft.behavior.closed = !draft.behavior.closed)}>
              <span class="tg" class:on={draft.behavior.closed}><span></span></span>
              <span>Записывать время закрытия <code>CLOSED:</code></span>
            </button>
            <button class="sw-row" role="switch" aria-checked={draft.behavior.logbook} onclick={() => (draft.behavior.logbook = !draft.behavior.logbook)}>
              <span class="tg" class:on={draft.behavior.logbook}><span></span></span>
              <span>Вести историю смены состояний в <code>:LOGBOOK:</code></span>
            </button>
            <div class="note">Поведение действует на весь проект и на все наборы.</div>
          </div>

          <div class="block">
            <div class="cap">КАК ЭТО ВЫГЛЯДИТ</div>
            <div class="flow">
              {#each wf.states.filter((s) => !s.pending && s.keyword) as s, i (s.id)}
                <span class="fchip tone-chip" style={chipStyle(s)}>{displayName(s.keyword)}</span>
                {#if i < wf.states.filter((x) => !x.pending && x.keyword).length - 1}<span class="arrow" aria-hidden="true">→</span>{/if}
              {/each}
            </div>
            <div class="orgline" aria-label="Строка #+TODO">{orgLine(wf)}</div>
            <div class="note">В файле ключевое слово не может содержать пробелов, поэтому «IN PROGRESS» записывается как IN-PROGRESS. Приложение не пишет эту строку в ваши файлы; она показана для Emacs.</div>
          </div>

          {#if bannerCount}
            <div class="err banner">Изменения не сохраняются, пока есть ошибки ({bannerCount}).</div>
          {/if}
        </section>
      {/if}
    </div>

    {#if picker && pickerState}
      <ColorPicker value={pickerState.color} keyword={pickerState.keyword} fallback={toneFor(pickerState.keyword || 'X', asWorkflow)}
        anchor={picker?.anchor as HTMLElement} onpick={(c) => (pickerState.color = c)} onclose={() => (picker = null)} />
    {/if}

    {#if rename}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="modal" onmousedown={() => chooseRename('cancel')}>
        <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Переименование статуса" onmousedown={(e) => e.stopPropagation()}>
          <h2>Заменить {rename.from} на {rename.to} в {rename.count} заголовках?</h2>
          <p>Если оставить слово в заметках как есть, эти заголовки перестанут считаться задачами со статусом.</p>
          <div class="btns">
            <button onclick={() => chooseRename('cancel')}>Отмена</button>
            <button onclick={() => chooseRename('settings')}>Только в настройках</button>
            <button class="primary" onclick={() => chooseRename('files')}>Заменить в файлах</button>
          </div>
        </div>
      </div>
    {/if}

    {#if confirmDelete}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="modal" onmousedown={() => (confirmDelete = null)}>
        <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Удаление статуса" onmousedown={(e) => e.stopPropagation()}>
          <h2>{confirmDelete.s.keyword} используется в {confirmDelete.count} заголовках</h2>
          <p>Файлы не изменятся: слово останется в тексте, но перестанет считаться статусом.</p>
          <div class="btns">
            <button onclick={() => (confirmDelete = null)}>Отмена</button>
            <button class="danger-b" onclick={doDelete}>Удалить</button>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/snippet}

{#if standalone}
  {@render body()}
{:else}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onmousedown={() => (store.settingsOpen = false)}>
    <div class="sheet" onmousedown={(e) => e.stopPropagation()}>{@render body()}</div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.3); display: flex; align-items: center; justify-content: center; padding: 24px; }
  .sheet { width: min(1040px, 100%); height: min(760px, 100%); display: flex; }
  .win { position: relative; flex: 1; display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4); min-width: 0; }
  .win.standalone { height: 100vh; border: 0; border-radius: 0; box-shadow: none; }
  header { display: flex; align-items: center; gap: 16px; padding: 10px 14px; background: var(--bar); border-bottom: 1px solid var(--line); }
  .tabs { display: flex; gap: 2px; }
  .tabs button { border: 0; background: transparent; padding: 5px 14px; border-radius: 7px; color: var(--fg2); }
  .tabs button.on { background: var(--field); color: var(--fg); font-weight: 600; }
  .tabs button:disabled { opacity: 0.45; }
  .flash { margin-left: auto; font-size: 12px; color: var(--done); opacity: 0; transition: opacity 0.2s; }
  .flash.show { opacity: 1; }
  .close { border: 0; background: transparent; font-size: 20px; width: 28px; height: 28px; color: var(--fg2); border-radius: 6px; }
  .close:hover { background: var(--field); }

  .body { flex: 1; min-height: 0; display: flex; }
  aside { flex: 0 0 270px; border-right: 1px solid var(--line); background: var(--side); padding: 14px 10px; overflow: auto; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--fg2); padding: 0 6px 6px; }
  .wfrow.over { box-shadow: inset 0 2px 0 var(--acc); }
  .wfend { height: 6px; }
  .wfend.over { box-shadow: inset 0 2px 0 var(--acc); }
  .wf { display: block; width: 100%; text-align: left; border: 0; background: transparent; border-radius: 8px; padding: 8px 10px; margin-bottom: 2px; }
  .wf.on { background: var(--sel); }
  .wfh { display: flex; gap: 8px; align-items: center; }
  .wfgrip { color: var(--fg3); cursor: grab; letter-spacing: -2px; }
  .wfn { font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 5px 0 0 22px; }
  .chip { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
  .add { width: 100%; margin-top: 4px; height: 30px; border: 1px dashed var(--line); background: transparent; border-radius: 7px; color: var(--acc); }
  .help { font-size: 12px; line-height: 1.5; color: var(--fg2); padding: 10px 6px; }

  section { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 24px; display: flex; flex-direction: column; gap: 14px; }
  .head { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 200px; }
  .field > span { font-size: 12px; color: var(--fg2); }
  .field input, .field select { height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); font-size: 13.5px; font-weight: 600; -webkit-user-select: text; user-select: text; }
  .tools { margin-left: auto; display: flex; gap: 6px; }
  .tools button { height: 28px; padding: 0 12px; border: 0; border-radius: 6px; background: var(--field); }
  .tools button:disabled { opacity: 0.4; }
  .danger { color: var(--todo); }

  /* one grid for the header and every row, so columns line up at any width */
  .table { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .grid { display: grid; grid-template-columns: 24px 56px minmax(120px, 1.1fr) minmax(150px, 1.2fr) 76px 40px; column-gap: 12px; align-items: center; padding: 0 10px; }
  .th { height: 30px; background: var(--side); font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .th span { text-align: left; }
  .lockh, .edith { display: inline-flex; align-items: center; gap: 5px; }
  .edith { color: var(--fg); }
  .srow { min-height: 44px; border-top: 1px solid var(--line); background: var(--bg); outline: none; }
  .srow:focus-visible { box-shadow: inset 0 0 0 2px var(--acc); }
  .srow.over, .sep.over, .addrow.over { box-shadow: inset 0 2px 0 var(--acc); }
  .grip { color: var(--fg3); cursor: grab; letter-spacing: -2px; -webkit-user-select: none; user-select: none; }
  .colorcell { display: flex; align-items: center; }
  .swatch { width: 18px; height: 18px; border-radius: 9px; border: 0; padding: 0; box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg) 18%, transparent); }
  .swatch:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .name { font-family: var(--mono); font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name.empty { color: var(--fg3); }
  .kw { width: 100%; height: 28px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); font-family: var(--mono); font-size: 12.5px; -webkit-user-select: text; user-select: text; }
  .kw:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 25%, transparent); }
  .kw.red { border-color: var(--todo); box-shadow: 0 0 0 3px color-mix(in srgb, var(--todo) 20%, transparent); }
  .keychip { display: inline-block; min-width: 22px; text-align: center; padding: 1px 6px; border-radius: 5px; background: var(--field); font-family: var(--mono); font-size: 12px; color: var(--fg2); }
  .acts { display: flex; justify-content: flex-end; }
  .x { width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: var(--fg3); font-size: 16px; }
  .x:hover:not(:disabled) { background: var(--field); color: var(--todo); }
  .x:disabled { opacity: 0.3; }
  .hint { padding: 3px 12px 8px 128px; font-size: 12px; color: var(--fg2); background: var(--bg); }
  .hint.err { color: var(--todo); }
  .sep { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px; font-size: 12px; color: var(--fg2); background: var(--side); border-top: 1px solid var(--line); }
  .addrow { display: flex; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--line); }
  .addrow button { height: 28px; padding: 0 12px; border: 1px dashed var(--line); border-radius: 6px; background: transparent; color: var(--acc); }

  .block { display: flex; flex-direction: column; gap: 8px; }
  .sw-row { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; text-align: left; padding: 3px 0; }
  .tg { width: 34px; height: 20px; border-radius: 10px; background: var(--field); position: relative; flex: 0 0 34px; transition: background 0.15s; }
  .tg span { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 8px; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
  .tg.on { background: var(--acc); }
  .tg.on span { transform: translateX(14px); }
  code, .orgline { font-family: var(--mono); font-size: 12px; }
  .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .fchip { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 6px; }
  .arrow { color: var(--fg3); }
  .orgline { padding: 8px 10px; border-radius: 6px; background: var(--side); -webkit-user-select: text; user-select: text; }
  .note { font-size: 12px; color: var(--fg2); line-height: 1.5; }
  .err { color: var(--todo); font-size: 12px; }
  .err.banner { padding: 8px 12px; border-radius: 6px; background: color-mix(in srgb, var(--todo) 12%, transparent); }

  .modal { position: absolute; inset: 0; z-index: 110; background: rgba(0, 0, 0, 0.28); display: flex; align-items: flex-start; justify-content: center; padding-top: 14vh; }
  .dlg { width: 420px; max-width: calc(100% - 32px); padding: 18px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35); }
  .dlg h2 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  .dlg p { margin: 0 0 14px; color: var(--fg2); line-height: 1.45; }
  .btns { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .btns button { height: 28px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--field); }
  .btns .primary { background: var(--acc); color: var(--onacc); font-weight: 600; }
  .btns .danger-b { background: var(--todo); color: var(--onacc); font-weight: 600; }
</style>

<script lang="ts">
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { store } from './store.svelte';
  import { toneFor, type Workflow } from './org';
  import { toneOf, toneStyle, colorName } from './colors';
  import ColorPicker from './ColorPicker.svelte';
  import { Reorder } from './reorder.svelte';
  import { setLayer } from './settingsNav.svelte';
  import {
    MAX_KEYWORD, addState, checkKey, normalizeKey, addWorkflow, canRemoveState, canRemoveWorkflow, checkKeyword, displayName, dropState, dropWorkflow,
    effectiveKeys, fromConfig, initialOf, moveState, normalizeKeyword, orgLine, removeState, removeWorkflow,
    toJson, validate, type DraftState,
  } from './workflowEditor';

  // «Статусы» of the settings (ТЗ 22 §3): the sets on the left, the chosen one's states on the right. A draft of the
  // config, written a moment after each change while it has no problems.
  let draft = $state(fromConfig(store.config));
  let selectedId = $state(draft.workflows[0]?.id ?? '');
  const wf = $derived(draft.workflows.find((w) => w.id === selectedId) ?? draft.workflows[0]);
  const problems = $derived(validate(draft));
  const json = $derived(toJson(store.configText, draft));
  // nothing is written until the user actually changes something
  let baseline = toJson(store.configText, draft);

  $effect(() => {
    const j = json;
    if (problems.length || j === baseline) return;
    const t = setTimeout(async () => {
      baseline = j;
      // from the newest file: the main window may have written agendas meanwhile
      await store.updateConfig((raw) => toJson(raw, draft));
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

  // quick keys: the field shows the automatic letter until one is typed; empty = automatic again
  let keyEdits = $state<Record<string, string>>({});
  const keyShown = (s: DraftState) => keyEdits[s.id] ?? (s.key || keys.get(s.id) || '');
  function typingKey(s: DraftState, raw: string) {
    const v = normalizeKey(raw);
    keyEdits[s.id] = v;
    const e = wf ? checkKey(wf, v, s.id) : null;
    if (e) errors['k' + s.id] = e;
    else delete errors['k' + s.id];
  }
  function clearKeyEdit(id: string) {
    delete keyEdits[id];
    delete errors['k' + id];
  }
  function commitKey(s: DraftState) {
    const v = keyEdits[s.id];
    if (v === undefined) return true;
    if (errors['k' + s.id]) return false;
    const current = s.key || keys.get(s.id) || '';
    if (v === '') s.key = ''; // back to automatic
    else if (v !== current) s.key = v; // typing the letter that is already shown changes nothing
    clearKeyEdit(s.id);
    return true;
  }
  function keyKeydown(e: KeyboardEvent, s: DraftState) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (commitKey(s)) (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      clearKeyEdit(s.id);
      (e.currentTarget as HTMLInputElement).blur();
    }
  }
  function keyBlur(s: DraftState) {
    if (errors['k' + s.id]) clearKeyEdit(s.id);
    else commitKey(s);
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
  // a set by its grip onto another set (before it) or the end; a state by its grip onto a state, the line between the
  // open and the done ones, or the end (the whole row is the drag image)
  const wfDrag = new Reorder((id, target) => dropWorkflow(draft, id, target === 'end' ? null : target));
  const rowDrag = new Reorder((id, target) => void (wf && dropState(wf, id, target === 'end' ? null : target)));

  // keyboard reordering of the focused row: ⌥↑ / ⌥↓
  function rowKey(e: KeyboardEvent, s: DraftState) {
    if (!e.altKey || !wf || (e.target as HTMLElement).tagName === 'INPUT' && false) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveState(wf, s.id, e.key === 'ArrowUp' ? -1 : 1);
      queueMicrotask(() => document.querySelector<HTMLElement>(`[data-row="${s.id}"]`)?.focus());
    }
  }
  const bannerCount = $derived(problems.length + Object.keys(errors).length);
  // ⎋ takes the picker or a dialog first, not the sheet
  $effect(() => setLayer('statuses', !!(picker || rename || confirmDelete)));
  $effect(() => () => setLayer('statuses', false));
</script>

<div class="body">
      <aside>
        <div class="cap">НАБОРЫ СТАТУСОВ</div>
        {#each draft.workflows as w (w.id)}
          <div class="wfrow" class:over={wfDrag.overId === w.id} use:wfDrag.zone={w.id}>
            <button class="wf" class:on={w.id === wf?.id} aria-pressed={w.id === wf?.id} onclick={() => (selectedId = w.id)}>
              <span class="wfh">
                <span class="wfgrip" role="img" aria-label="Перетащить набор" use:wfDrag.handle={{ id: w.id }}>⋮⋮</span>
                <span class="wfn">{w.name || '—'}</span>
              </span>
              <span class="chips">
                {#each w.states.filter((s) => !s.pending) as s (s.id)}<span class="chip tone-chip" style={chipStyle(s)}>{displayName(s.keyword) || '…'}</span>{/each}
              </span>
            </button>
          </div>
        {/each}
        <div class="wfend" class:over={wfDrag.overId === 'end'} use:wfDrag.zone={'end'}></div>
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
              <span role="columnheader" class="edith">КЛАВИША
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Редактируется (клавиша)"><path d="M3 17l1-4 9.5-9.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L7 16z" /></svg>
              </span><span></span>
            </div>

            {#each [...open, 'sep', ...done] as item (typeof item === 'string' ? 'sep' : item.id)}
              {#if typeof item === 'string'}
                <div class="sep" class:over={rowDrag.overId === 'separator'} use:rowDrag.zone={'separator'}>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9" /></svg>
                  Ниже — завершающие состояния: задача считается закрытой
                </div>
              {:else}
                {@const s = item}
                {@const kw = valueOf(s)}
                <div class="grid srow" class:over={rowDrag.overId === s.id} class:isdone={s.done} class:bad={!!errors[s.id]} role="row" tabindex="0" data-row={s.id}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" aria-label="{displayName(s.keyword) || 'Новое состояние'}. Option со стрелками вверх и вниз меняет порядок"
                  onkeydown={(e) => rowKey(e, s)} use:rowDrag.zone={s.id}>
                  <span class="grip" role="img" aria-label="Перетащить строку" use:rowDrag.handle={{ id: s.id, image: '.srow' }}>⋮⋮</span>
                  <span class="colorcell">
                    <button class="swatch" aria-label="Цвет: {s.color ? colorName(s.color) : 'авто'}. Изменить" aria-haspopup="dialog" aria-expanded={picker?.id === s.id}
                      onclick={(e) => togglePicker(e, s)}>
                      <span class="dot tone-bg" style={chipStyle(s)}></span>
                      <svg class="chev" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5l4 4 4-4" /></svg>
                    </button>
                  </span>
                  <span class="name" role="cell" class:chip={!!kw} class:tone-chip={!!kw} class:empty={!kw} style={kw ? chipStyle(s) : ''}>{kw ? displayName(kw) : '—'}</span>
                  <span class="filecell">
                    <input class="kw" class:red={!!errors[s.id]} role="cell" aria-label="Ключевое слово в файле" aria-invalid={!!errors[s.id]}
                      placeholder="например, REVIEW" maxlength={MAX_KEYWORD + 8} spellcheck="false" autocomplete="off"
                      use:track={s.id} value={kw}
                      oninput={(e) => typing(s, e.currentTarget.value)} onkeydown={(e) => keydown(e, s)} onblur={() => blur(s)}
                      onfocus={() => (focusId = s.id)} />
                  </span>
                  <span class="keycell">
                    <input class="qk" class:auto={!s.key && keyEdits[s.id] === undefined} class:red={!!errors['k' + s.id]} aria-label="Клавиша" aria-invalid={!!errors['k' + s.id]}
                      spellcheck="false" autocomplete="off" disabled={s.pending}
                      value={keyShown(s)} onfocus={(e) => e.currentTarget.select()} onmouseup={(e) => { e.preventDefault(); e.currentTarget.select(); }}
                      oninput={(e) => { typingKey(s, (e instanceof InputEvent ? e.data : null) || e.currentTarget.value); e.currentTarget.value = keyEdits[s.id] ?? ''; }} onkeydown={(e) => keyKeydown(e, s)} onblur={() => keyBlur(s)} />
                  </span>
                  <span class="acts">
                    <button class="x" aria-label="Удалить состояние {displayName(s.keyword)}" disabled={!canRemoveState(wf, s.id)}
                      title={canRemoveState(wf, s.id) ? '' : 'Последнее открытое состояние удалить нельзя'} onclick={() => askDelete(s)}>×</button>
                  </span>
                </div>
                {#if errors['k' + s.id]}
                  <div class="hint err">{errors['k' + s.id]}</div>
                {:else if errors[s.id]}
                  <div class="hint err">{errors[s.id]}</div>
                {:else if s.pending}
                  <div class="hint">Введите ключевое слово и нажмите ↩ · ⎋ — отмена</div>
                {/if}
                {#each problems.filter((p) => p.state === s.id) as p}<div class="hint err">{p.message}</div>{/each}
              {/if}
            {/each}

            <div class="addrow" class:over={rowDrag.overId === 'end'} use:rowDrag.zone={'end'}>
              <button onclick={() => plus(false)}>+ Состояние</button>
              <button onclick={() => plus(true)}>+ Завершающее</button>
            </div>
          </div>
          <div class="note">Название строится из ключевого слова. Редактируются колонки «В файле» и «Клавиша».</div>

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
      <!-- «Отмена» of the dialog is the rename's «cancel» too -->
      <ConfirmDialog label="Переименование статуса" title="Заменить {rename.from} на {rename.to} в {rename.count} заголовках?" onclose={() => rename && chooseRename('cancel')}
        actions={[{ label: 'Только в настройках', run: () => chooseRename('settings') }, { label: 'Заменить в файлах', kind: 'primary', run: () => chooseRename('files') }]}>
        Если оставить слово в заметках как есть, эти заголовки перестанут считаться задачами со статусом.
      </ConfirmDialog>
    {/if}

    {#if confirmDelete}
      <ConfirmDialog label="Удаление статуса" title="{confirmDelete.s.keyword} используется в {confirmDelete.count} заголовках" onclose={() => (confirmDelete = null)} actions={[{ label: 'Удалить', kind: 'danger', run: doDelete }]}>
        Файлы не изменятся: слово останется в тексте, но перестанет считаться статусом.
      </ConfirmDialog>
    {/if}

<style>
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
  /* a macOS switch */

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
  .table { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; flex: 0 0 auto; }
  section > * { flex-shrink: 0; }
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
  .swatch { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 5px 0 0; border: 0; border-radius: 7px; background: transparent; color: var(--fg3); }
  .swatch:hover { background: var(--field); }
  .swatch:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
  .dot { width: 16px; height: 16px; border-radius: 8px; box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg) 18%, transparent); }
  /* the name as a capsule, like the chips in the list of workflows */
  .name { justify-self: start; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
  .name.chip { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; padding: 3px 9px; border-radius: 6px; }
  .name.empty { color: var(--fg3); font-family: var(--mono); font-size: 12.5px; }
  .kw { width: 100%; height: 28px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); font-family: var(--mono); font-size: 12.5px; -webkit-user-select: text; user-select: text; }
  .kw:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 25%, transparent); }
  .kw.red { border-color: var(--todo); box-shadow: 0 0 0 3px color-mix(in srgb, var(--todo) 20%, transparent); }
  .qk { width: 44px; height: 28px; padding: 0; text-align: center; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); font-family: var(--mono); font-size: 12.5px; -webkit-user-select: text; user-select: text; }
  .qk.auto { color: var(--fg2); }
  .qk:disabled { background: transparent; border-color: transparent; }
  .qk:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 25%, transparent); }
  .qk.red { border-color: var(--todo); }
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
</style>

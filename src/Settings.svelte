<script lang="ts">
  import { calendar } from './features/calendar.svelte';
  import { store, type SettingsSection } from './store.svelte';
  import { allSettings, blocksOf, settingsOf } from './views';
  import SchemaSettings from './SchemaSettings.svelte';
  import KeysSettings from './KeysSettings.svelte';
  import AppearanceSettings from './AppearanceSettings.svelte';
  import ThemeEditor from './ThemeEditor.svelte';
  import { toneFor, type Workflow } from './org';
  import { toneOf, toneStyle, colorName } from './colors';
  import ColorPicker from './ColorPicker.svelte';
  import Picker from './Picker.svelte';
  import {
    MAX_KEYWORD, addState, checkKey, normalizeKey, addWorkflow, canRemoveState, canRemoveWorkflow, checkKeyword, displayName, dropState, dropWorkflow,
    effectiveKeys, fromConfig, initialOf, moveState, normalizeKeyword, orgLine, pendingState, removeState, removeWorkflow,
    toJson, validate, type DraftState,
  } from './workflowEditor';

  // The settings: a sheet over the main window (as the agenda builder), sections on the left. Changes apply at once.

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

  /** ⎋ closes (an open popover, dialog or edit takes it first), ⌘[ ⌘] go to the section before / after. */
  function key(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
      if (confirmAgenda) confirmAgenda = null;
      else if (!picker && !pickFile && !rename && !confirmDelete) store.closeSettings();
      e.preventDefault();
      return;
    }
    if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      e.preventDefault();
      step(e.code === 'BracketLeft' ? -1 : 1);
    }
  }
  /** The section before / after that is ready (the others are not made yet). */
  function step(d: -1 | 1, focus = false) {
    const ready = sections.filter((x) => READY.includes(x));
    const i = ready.indexOf(tab);
    const next = ready[(i + d + ready.length) % ready.length];
    store.showSection(next);
    if (focus) queueMicrotask(() => document.querySelector<HTMLElement>(`[data-section="${next}"]`)?.focus());
  }
  function sideKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(e.key === 'ArrowUp' ? -1 : 1, true);
    }
  }
  // the core's sections, in the order of the mockup; the features' (Календарь) come from the registry (views.ts)
  const CORE: [SettingsSection, number][] = [['Основные', 0], ['Оформление', 10], ['Статусы', 20], ['Теги', 30], ['Агенды', 40], ['Inbox', 60], ['Файлы', 70], ['Клавиши', 80]];
  // a plugin turned on while the sheet is open brings its section at once (the registry is reactive)
  const sections = $derived([...CORE, ...allSettings().map((x): [SettingsSection, number] => [x.id, x.order])].sort((a, b) => a[1] - b[1]).map(([id]) => id));
  const READY = $derived<SettingsSection[]>(['Основные', 'Оформление', 'Статусы', 'Агенды', 'Inbox', 'Клавиши', ...allSettings().map((x) => x.id)]);
  const ICON: Record<SettingsSection, string> = {
    Основные: 'M10 7.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2',
    Оформление: 'M10 3a7 7 0 1 0 0 14c1 0 1.5-.6 1.5-1.3 0-1.1-1-1.4-1-2.4 0-.8.7-1.3 1.5-1.3H14a3 3 0 0 0 3-3C17 5.6 13.9 3 10 3zM6.5 9.5h.01M8.5 6.5h.01M12 6.5h.01',
    Статусы: 'M3 10h14M12.5 6l4 4-4 4',
    Теги: 'M3 3h6.5l7.5 7.5-6 6L3.5 9.5zM6.8 6.8h.01',
    Агенды: 'M7.5 5h9M7.5 10h9M7.5 15h9M3.5 5h.01M3.5 10h.01M3.5 15h.01',
    Inbox: 'M3 11l2-7h10l2 7v5H3zM3 11h4l1 2h4l1-2h4',
    Файлы: 'M3 6a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z',
    Клавиши: 'M2.5 6h15v9h-15zM5 9h.01M8 9h.01M11 9h.01M14 9h.01M6 12h8',
  };
  const tab = $derived(READY.includes(store.settingsSection) ? store.settingsSection : 'Основные');
  // another section starts at its top
  let contentEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    void tab;
    if (contentEl) contentEl.scrollTop = 0;
  });

  // ---- Inbox ---------------------------------------------------------------------------------------------------
  let pickFile = $state(false); // «Выбрать…»: the palette of files, the same as in the Inbox stub
  const inboxPath = $derived(
    !store.inboxCfg.file ? 'Не выбран' : store.inboxCfg.file.split('/').join(' / ') + (store.inboxFile ? '' : ' — не найден'),
  );
  const inboxStates = $derived.by(() => {
    const seqs = store.inboxFile?.wf.sequences ?? store.config.workflows;
    return [...new Set(seqs.flatMap((sq) => sq.states.filter((x) => !x.done).map((x) => x.name)))];
  });
  // ---- Календарь ------------------------------------------------------------------------------------------------
  // ---- Агенды: «Мои агенды» -----------------------------------------------------------------------------
  let confirmAgenda = $state<{ id: string; name: string } | null>(null);
  /** «Новая агенда»: the settings close and the builder opens (one sheet at a time); ⌘, brings them back. */
  function newAgenda() {
    store.closeSettings();
    store.newAgendaInBuilder();
  }
  const bannerCount = $derived(problems.length + Object.keys(errors).length);
</script>

<svelte:window onkeydown={(e) => { if (!store.keyRecording) key(e); }} />

<div class="scrim" aria-hidden="true"></div>
<div class="win" role="dialog" aria-modal="true" aria-label="Настройки">
    <header>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="2.6" /><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" /></svg>
      <div class="ttl"><span class="t1">Настройки</span><span class="t2">{tab}{tab === 'Оформление' && store.themeEditing ? ' › Тема редактора' : ''}</span></div>
      <span class="live">Изменения применяются сразу</span>
      <button class="done-b" onclick={() => store.closeSettings()}>Готово</button>
    </header>
    <div class="main">
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div class="sections" role="tablist" aria-orientation="vertical" aria-label="Разделы настроек" tabindex="-1" onkeydown={sideKey}>
      {#each sections as t (t)}
        <button role="tab" data-section={t} aria-selected={t === tab} tabindex={t === tab ? 0 : -1} class:on={t === tab} disabled={!READY.includes(t)} title={READY.includes(t) ? '' : 'Пока не реализовано'} onclick={() => store.showSection(t)}>
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICON[t] ?? settingsOf(t)?.icon} /></svg>
          <span>{t}</span>
        </button>
      {/each}
      <div class="sidehelp">{store.keyHint('settings') || '⌘,'} — открыть · ⎋ — закрыть<br />⌘[ ⌘] — предыдущий / следующий раздел</div>
    </div>

    <div class="content" class:wide={tab === 'Статусы'} class:fill={tab === 'Оформление' && !!store.themeEditing} bind:this={contentEl}>
    {#if tab === 'Клавиши'}
      <div class="page"><KeysSettings /></div>
    {:else if tab === 'Оформление' && store.themeEditing}
      <ThemeEditor name={store.themeEditing} />
    {:else if tab === 'Оформление'}
      <div class="page"><AppearanceSettings /></div>
    {:else if tab === 'Inbox'}
      <div class="body">
        <section class="general" aria-label="Inbox">
          <div class="cap">ФАЙЛ</div>
          <div class="opts">
            <div class="opt">
              <span id="ib-file">Файл Inbox</span>
              <span class="ibfile">
                <span class="val" aria-labelledby="ib-file" data-testid="ib-file">{inboxPath}</span>
                <button class="change" aria-label="Выбрать файл Inbox" onclick={() => (pickFile = true)}>Выбрать…</button>
              </span>
            </div>
            <div class="opt">
              <label for="ib-add">Куда добавлять</label>
              <select id="ib-add" class="sel" value={store.inboxCfg.add} onchange={(e) => store.setInbox({ add: e.currentTarget.value === 'end' ? 'end' : 'top' })}>
                <option value="top">В начало файла</option>
                <option value="end">В конец файла</option>
              </select>
            </div>
          </div>
          <p class="help">Сюда попадают новые задачи; задачи, записанные в файл вручную, тоже появляются в списке. Новые задачи записываются сразу на диск, между задачами — пустая строка. В начало — после строк вроде #+TITLE, перед первой задачей. Файл свой у каждой рабочей папки.</p>

          <div class="cap">БЫСТРЫЙ ВВОД</div>
          <div class="opts">
            <div class="opt">
              <span>{store.keyHint('capture') || 'Без сочетания'} — изменить в разделе «Клавиши»</span>
              <button class="change" onclick={() => store.showSection('Клавиши')}>Открыть…</button>
            </div>
            <div class="opt">
              <label for="ib-global">Работает из любой программы</label>
              <button id="ib-global" class="switch" role="switch" aria-checked={store.captureGlobal} aria-label="Работает из любой программы"
                onclick={() => void store.setCaptureKey(store.captureKey, !store.captureGlobal)}><span></span></button>
            </div>
            <div class="opt">
              <label for="ib-confirm">Показывать подтверждение «Добавлено в Inbox»</label>
              <button id="ib-confirm" class="switch" role="switch" aria-checked={store.inboxCfg.confirm} aria-label="Показывать подтверждение"
                onclick={() => store.setInbox({ confirm: !store.inboxCfg.confirm })}><span></span></button>
            </div>
            <div class="opt">
              <label for="ib-status">Статус новой задачи</label>
              <select id="ib-status" class="sel" value={store.inboxCfg.status ?? ''} onchange={(e) => store.setInbox({ status: e.currentTarget.value || null })}>
                <option value="">Начальный статус набора</option>
                {#each inboxStates as st (st)}<option value={st}>{st}</option>{/each}
              </select>
            </div>
            <div class="opt">
              <label for="ib-created">Записывать дату создания (:CREATED:)</label>
              <button id="ib-created" class="switch" role="switch" aria-checked={store.inboxCfg.created} aria-label="Записывать дату создания"
                onclick={() => store.setInbox({ created: !store.inboxCfg.created })}><span></span></button>
            </div>
          </div>
          <p class="help">Из любой программы: приложение должно быть запущено (окно можно закрыть, оно остаётся в Dock). Сочетание хранится на этом Mac.</p>

          {#each blocksOf('Inbox') as b (b.schema.id)}<SchemaSettings schema={b.schema} embedded />{/each}
        </section>
      </div>
    {:else if settingsOf(tab)}
      {@const spec = settingsOf(tab)!}
      {#if spec.schema}<SchemaSettings schema={spec.schema} />{:else if spec.component}<spec.component />{/if}
    {:else if tab === 'Агенды'}
      <div class="body">
        <section class="general" aria-label="Агенды">
          <div class="cap">МОИ АГЕНДЫ</div>
          {#if store.agendas.length}
            <div class="alist" role="list" aria-label="Мои агенды">
              {#each store.agendas as a (a.id)}
                <div class="arow" role="listitem">
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 6h12M4 10h8M4 14h5" /></svg>
                  <span class="an">{a.name}</span>
                  <span class="ab">{a.blocks.length} {a.blocks.length % 10 === 1 && a.blocks.length % 100 !== 11 ? 'блок' : a.blocks.length % 10 >= 2 && a.blocks.length % 10 <= 4 && (a.blocks.length % 100 < 12 || a.blocks.length % 100 > 14) ? 'блока' : 'блоков'}</span>
                  <button class="x" aria-label="Удалить агенду {a.name}" title="Удалить агенду" onclick={() => (confirmAgenda = { id: a.id, name: a.name })}>×</button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="help">Своих агенд пока нет. Агенда — это набор блоков, каждый выбирает задачи по условиям.</p>
          {/if}
          <div><button class="primary-b" onclick={newAgenda}>Новая агенда в конструкторе…</button></div>
          <p class="help">Изменить агенду можно в навигаторе в режиме «Агенда» (⌃⌘2): правый клик по названию → «Редактировать…».</p>
          {#each blocksOf('Агенды') as b (b.schema.id)}<SchemaSettings schema={b.schema} embedded />{/each}
        </section>
      </div>
    {:else if tab === 'Основные'}
      <div class="body">
        <section class="general" aria-label="Основные">
          <div class="cap">РАБОЧАЯ ПАПКА</div>
          <div class="opt">
            <div class="folder">
              <span class="fname">{store.dir ? store.dir.split('/').pop() : 'Не выбрана'}</span>
              {#if store.dir}<span class="fpath" title={store.dir}>{store.dir.replace(/^\/Users\/[^/]+/, '~')}</span>{/if}
            </div>
            <!-- the settings close: what they show belongs to the folder being left -->
            <button class="change" onclick={() => { store.closeSettings(); void store.changeFolder(); }}>Изменить…</button>
          </div>
          <p class="help">Приложение работает с одной папкой: все org-файлы в ней и её подпапках. Сменить её можно и в меню «Файл → Открыть другую папку…».</p>
          <div class="cap">НАВИГАТОР</div>
          <div class="opt">
            <label for="nav-headings">Показывать заголовки в навигаторе</label>
            <button id="nav-headings" class="switch" role="switch" aria-checked={store.navHeadings} aria-label="Показывать заголовки в навигаторе"
              onclick={() => store.setNavHeadings(!store.navHeadings)}><span></span></button>
          </div>
          <p class="help">Структура файла всегда есть в инспекторе, на вкладке «Структура», и в командной палитре по «#». Настройка хранится на этом Mac.</p>
          <div class="cap">УРОВНИ ЗАГОЛОВКОВ</div>
          <div class="opts">
            <div class="opt">
              <label for="one-star">Одна звёздочка на уровень</label>
              <button id="one-star" class="switch" role="switch" aria-checked={store.levels.oneStar} aria-label="Одна звёздочка на уровень"
                onclick={() => store.setLevels({ oneStar: !store.levels.oneStar })}><span></span></button>
            </div>
            <div class="opt">
              <label for="indent-text">Сдвигать текст по уровню</label>
              <button id="indent-text" class="switch" role="switch" aria-checked={store.levels.indent} aria-label="Сдвигать текст по уровню"
                onclick={() => store.setLevels({ indent: !store.levels.indent })}><span></span></button>
            </div>
            <div class="opt">
              <span id="step-l">Шаг отступа</span>
              <div class="stepper" role="group" aria-labelledby="step-l">
                <button aria-label="Меньше" disabled={store.levels.step <= 1} onclick={() => store.setLevels({ step: store.levels.step - 1 })}>−</button>
                <span class="sv" aria-live="polite">{store.levels.step} симв.</span>
                <button aria-label="Больше" disabled={store.levels.step >= 4} onclick={() => store.setLevels({ step: store.levels.step + 1 })}>+</button>
              </div>
            </div>
          </div>
          <p class="help">Только вид в редакторе: звёздочки и пробелы в файлах не меняются. «Вид › Структурный вид» включает и выключает обе настройки сразу. Настройки хранятся на этом Mac.</p>
          <div class="cap">ОФОРМЛЕННЫЙ ТЕКСТ</div>
          <div class="opts">
            <div class="opt">
              <label for="rich-on">Оформленный текст</label>
              <button id="rich-on" class="switch" role="switch" aria-checked={store.rich} aria-label="Оформленный текст"
                onclick={() => store.setRich(!store.rich)}><span></span></button>
            </div>
            <div class="opt">
              <label for="rich-nums">Номера строк в оформленном виде</label>
              <button id="rich-nums" class="switch" role="switch" aria-checked={store.richNumbers} aria-label="Номера строк в оформленном виде"
                onclick={() => store.setRichNumbers(!store.richNumbers)}><span></span></button>
            </div>
          </div>
          <p class="help">Статусы, приоритеты и теги — капсулами, даты — плашками, заголовки крупнее, разметка без служебных символов. Строка под курсором показывается как есть. Текст файла не меняется. То же — «Вид › Оформленный текст» и переключатель «Текст / Оформление» над редактором. Настройки хранятся на этом Mac.</p>
          <div class="cap">DRAWERS</div>
          <div class="opts">
            <div class="opt">
              <label for="fold-drawers">Сворачивать drawers при открытии файла</label>
              <button id="fold-drawers" class="switch" role="switch" aria-checked={store.foldDrawers} aria-label="Сворачивать drawers при открытии файла"
                onclick={() => store.setFoldDrawers(!store.foldDrawers)}><span></span></button>
            </div>
          </div>
          <p class="help">Блоки :PROPERTIES:, :LOGBOOK: и другие показываются одной строкой с «…», в том числе новые — от Inbox и смены статуса. Tab на этой строке или клик по «…» разворачивает. Только вид: файл не меняется. Настройка хранится на этом Mac.</p>
          <div class="cap">КЛАВИШИ</div>
          <div class="opt">
            <div class="folder">
              <span>Сочетания клавиш перенесены в раздел «Клавиши»</span>
              <span class="fpath">Набор «Как в Emacs / Как в macOS» и все команды</span>
            </div>
            <button class="change" onclick={() => store.showSection('Клавиши')}>Открыть…</button>
          </div>
        </section>
      </div>
    {:else}
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
              <span role="columnheader" class="edith">КЛАВИША
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Редактируется (клавиша)"><path d="M3 17l1-4 9.5-9.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L7 16z" /></svg>
              </span><span></span>
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
                      oninput={(e) => { typingKey(s, (e as InputEvent).data || e.currentTarget.value); e.currentTarget.value = keyEdits[s.id] ?? ''; }} onkeydown={(e) => keyKeydown(e, s)} onblur={() => keyBlur(s)} />
                  </span>
                  <span class="acts">
                    <button class="x" aria-label="Удалить состояние {displayName(s.keyword)}" disabled={!canRemoveWorkflow(draft) && false || !canRemoveState(wf, s.id)}
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

            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="addrow" class:over={overId === 'end'} ondragover={(e) => { if (dragId) { e.preventDefault(); overId = 'end'; } }} ondrop={(e) => dropRow(e, null)}>
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
    {/if}
    </div>
    </div>

    {#if picker && pickerState}
      <ColorPicker value={pickerState.color} keyword={pickerState.keyword} fallback={toneFor(pickerState.keyword || 'X', asWorkflow)}
        anchor={picker?.anchor as HTMLElement} onpick={(c) => (pickerState.color = c)} onclose={() => (picker = null)} />
    {/if}

    {#if pickFile}<Picker onclose={() => (pickFile = false)} />{/if}

    {#if confirmAgenda}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="modal" onmousedown={() => (confirmAgenda = null)}>
        <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Удаление агенды" onmousedown={(e) => e.stopPropagation()}>
          <h2>Удалить агенду «{confirmAgenda.name}»?</h2>
          <p>Задачи и файлы не изменятся: удаляется только сама агенда.</p>
          <div class="btns">
            <button onclick={() => (confirmAgenda = null)}>Отмена</button>
            <button class="danger-b" onclick={() => { const id = confirmAgenda!.id; confirmAgenda = null; void store.deleteAgenda(id); }}>Удалить</button>
          </div>
        </div>
      </div>
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

<style>
  /* a sheet over the main window, as the agenda builder: clicks on the dimmed window do nothing */
  .scrim { position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.42); }
  .win {
    position: fixed; z-index: 71; left: 50%; top: 36px; bottom: 36px; transform: translateX(-50%); width: min(1100px, calc(100% - 72px));
    display: grid; grid-template-rows: 56px minmax(0, 1fr); grid-template-columns: minmax(0, 1fr); border-radius: 12px; overflow: hidden; background: var(--bg); border: 1px solid var(--line);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
  }
  header { display: flex; align-items: center; gap: 12px; padding: 0 16px 0 22px; background: var(--bar); border-bottom: 1px solid var(--line); }
  .ttl { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
  .t1 { font-size: 15px; font-weight: 700; }
  .t2 { font-size: 11.5px; color: var(--fg2); }
  .live { font-size: 11.5px; color: var(--fg3); }
  .done-b { height: 28px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .done-b:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .main { min-height: 0; min-width: 0; display: flex; }
  .sections { flex: 0 0 210px; box-sizing: border-box; background: var(--side); border-right: 1px solid var(--line); padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; overflow: auto; outline: none; }
  .sections button { display: flex; align-items: center; gap: 10px; height: 32px; flex: 0 0 32px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: var(--fg); text-align: left; }
  .sections button svg { flex: 0 0 17px; }
  .sections button.on { background: var(--sel); color: var(--acc); font-weight: 600; }
  .sections button:disabled { opacity: 0.45; }
  .sections button:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .sidehelp { margin-top: auto; padding: 10px 8px 2px; font-size: 11px; color: var(--fg3); line-height: 1.45; }
  /* the section: a column up to 760 in the middle with its own scroll; the statuses take the whole width */
  .content { flex: 1 1 0; min-width: 0; min-height: 0; overflow: auto; }
  .content:not(.wide) > :global(*) { max-width: 760px; margin: 0 auto; box-sizing: border-box; }
  .content.wide { display: flex; }
  .content.fill { display: flex; flex-direction: column; overflow: hidden; }
  .content.fill > :global(*) { max-width: none; flex: 1 1 0; min-height: 0; }
  .page { padding: 20px 28px 32px; }
  /* a narrow window: the sections go to a strip on top */
  @media (max-width: 820px) {
    .main { flex-direction: column; }
    .sections { flex: 0 0 auto; flex-direction: row; border-right: 0; border-bottom: 1px solid var(--line); overflow-x: auto; padding: 8px; }
    .sections button { flex: 0 0 auto; }
    .sidehelp { display: none; }
    .live { display: none; }
  }

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
  .general { max-width: 760px; }
  .opts { display: flex; flex-direction: column; gap: 6px; }
  .sel { height: 26px; max-width: 260px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); padding: 0 6px; font-size: 12.5px; }
  .val { font-size: 12.5px; color: var(--fg2); }
  .segs { display: flex; padding: 2px; background: var(--field); border-radius: 7px; gap: 2px; }
  .segs button { height: 22px; padding: 0 10px; white-space: nowrap; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 12px; }
  .segs button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); font-weight: 500; }
  .ibfile { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .ibfile .val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stepper { display: flex; align-items: center; gap: 2px; padding: 2px; border-radius: 7px; background: var(--field); }
  .stepper button { width: 24px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: transparent; font-size: 14px; }
  .stepper button:hover:not(:disabled) { background: var(--bg); }
  .stepper button:disabled { opacity: 0.35; }
  .stepper button:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
  .sv { min-width: 56px; text-align: center; font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .alist { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .arow { display: flex; align-items: center; gap: 9px; height: 36px; padding: 0 8px 0 12px; background: var(--side); }
  .arow + .arow { border-top: 1px solid var(--line); }
  .an { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ab { font-size: 12px; color: var(--fg2); }
  .primary-b { height: 28px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--acc); color: var(--onacc); font-size: 12.5px; font-weight: 600; }
  .folder { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
  .fname { font-size: 13px; font-weight: 600; }
  .fpath { font-size: 12px; color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .change { flex: 0 0 auto; height: 24px; padding: 0 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12.5px; }
  .opt { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 12px; background: var(--side); border: 1px solid var(--line); border-radius: 8px; }
  .opt label { font-size: 13px; }
  .olab { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .olab small { font-size: 11.5px; color: var(--fg2); }
  .sel.txt { width: 200px; padding: 0 8px; -webkit-user-select: text; user-select: text; }
  .hrs { display: flex; align-items: center; gap: 6px; color: var(--fg2); }
  /* a macOS switch */
  .switch { flex: 0 0 auto; position: relative; width: 32px; height: 18px; padding: 0; border: 0; border-radius: 9px; background: var(--field); box-shadow: inset 0 0 0 1px var(--line); transition: background 0.15s; }
  .switch span { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 7px; background: var(--onpacc); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
  .switch[aria-checked='true'] { background: var(--acc); box-shadow: none; }
  .switch[aria-checked='true'] span { transform: translateX(14px); }
  .switch:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .switch, .switch span { transition: none; } }

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

  .modal { position: absolute; inset: 0; z-index: 110; background: rgba(0, 0, 0, 0.28); display: flex; align-items: flex-start; justify-content: center; padding-top: 14vh; }
  .dlg { width: 420px; max-width: calc(100% - 32px); padding: 18px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35); }
  .dlg h2 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  .dlg p { margin: 0 0 14px; color: var(--fg2); line-height: 1.45; }
  .btns { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .btns button { height: 28px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--field); }
  .btns .primary { background: var(--acc); color: var(--onacc); font-weight: 600; }
  .btns .danger-b { background: var(--todo); color: var(--onacc); font-weight: 600; }
</style>

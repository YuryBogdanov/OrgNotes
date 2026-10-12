<script lang="ts">
  import { tick } from 'svelte';
  import { store } from './store.svelte';
  import { better, fuzzy } from './fuzzy';
  import { SOURCE_HEADING, avatarColor, findSource, initials, readSource, sourceKey, sourceSummary, goalsWord } from './goals';

  // «Добавить цели» (ТЗ 23, 2.3): a file, then its level-1 heading where the goals are; the name in the navigator,
  // «Это мои цели». The same sheet changes the heading of a source («Сменить заголовок…»).
  const req = store.goalAdd!;
  const NEW = '\u0000new';

  let q = $state('');
  let file = $state<string | null>(req.file ?? null); // relative name
  let head = $state<string | null>(null);
  let name = $state('');
  let named = false; // typed by hand: a file change keeps it
  let me = $state(!!req.me);
  let confirmMe = $state(false);
  let busy = $state(false);

  const mineNow = $derived(store.goalSources.find((s) => s.me));
  const base = (n: string) => n.split('/').pop()!.replace(/\.org$/, '');
  const files = $derived(
    store.files
      .map((f) => ({ f, m: q.trim() ? fuzzy(q, f.name) : null }))
      .filter((x) => !q.trim() || x.m)
      .sort((a, b) => (a.m && b.m ? (better(a.m, b.m) ? -1 : better(b.m, a.m) ? 1 : 0) : a.f.name.localeCompare(b.f.name, 'ru')))
      .map((x) => x.f),
  );
  const noteOf = (rel: string) => {
    const s = store.goalSources.filter((x) => x.file === rel && sourceKey(x) !== req.replace);
    return s.some((x) => x.me) ? 'мои цели' : s.length ? 'уже в целях' : 'не добавлен';
  };
  const cur = $derived(store.files.find((f) => f.name === file));
  const heads = $derived(cur ? cur.headings.map((h, i) => ({ h, i })).filter((x) => x.h.level === 1) : []);
  const canNew = $derived(!!cur && findSource(cur.headings, SOURCE_HEADING) < 0);
  const titleOf = (text: string, rel: string) => /^#\+TITLE:\s*(.+)$/im.exec(text)?.[1].trim() || base(rel);

  /** A file picked: the heading that looks like a source (or «Квартальные задачи»), the name from #+TITLE. */
  function pickFile(rel: string) {
    file = rel;
    const f = store.files.find((x) => x.name === rel);
    if (!f) return;
    const looks = heads.find((x) => sourceSummary(f.text, f.headings, x.i));
    const named0 = f.headings.find((h) => h.level === 1 && h.title.toLowerCase() === SOURCE_HEADING.toLowerCase());
    head = looks?.h.title ?? named0?.title ?? (findSource(f.headings, SOURCE_HEADING) < 0 ? NEW : null);
    if (!named) name = titleOf(f.text, rel);
  }
  if (file) pickFile(file);
  else if (req.replace) pickFile(req.replace.split('#')[0]);
  if (req.replace) {
    const s = store.goalSources.find((x) => sourceKey(x) === req.replace);
    if (s) {
      name = s.title;
      named = true;
    }
  }

  const preview = $derived.by(() => {
    if (!cur || !head) return null;
    if (head === NEW) return { title: SOURCE_HEADING, rows: [] as { t: string; n: string }[], fresh: true };
    const src = readSource(cur.text, cur.headings, head);
    return { title: head, rows: src.quarters.map((x) => ({ t: `Квартал Q${x.q.q} ${x.q.y}`, n: goalsWord(x.goals.length) })), fresh: false };
  });
  const ready = $derived(!!file && !!head && !!name.trim());

  async function add(force = false) {
    if (!ready || busy) return;
    if (me && mineNow && mineNow.file !== file && !force && sourceKey(mineNow) !== req.replace) {
      confirmMe = true;
      return;
    }
    busy = true;
    const heading = head === NEW ? SOURCE_HEADING : head!;
    const src = { file: file!, heading, title: name.trim(), ...(me ? { me: true } : {}) };
    const ok = await store.addGoalSource(src, { create: head === NEW, replace: req.replace });
    busy = false;
    if (!ok) return;
    store.goalAdd = null;
    store.setNavMode('goals');
    store.openGoals(sourceKey(src));
  }
  const close = () => (store.goalAdd = null);

  // ---- keyboard: ↑↓ in the list in focus, ↩ adds, ⎋ closes -----------------------------------------------------
  let col = $state<'file' | 'head'>(req.replace || req.file ? 'head' : 'file');
  function move(d: 1 | -1) {
    if (col === 'file') {
      const i = files.findIndex((f) => f.name === file);
      const n = files[Math.max(0, Math.min(files.length - 1, i + d))];
      if (n) pickFile(n.name);
    } else {
      const opts = [...heads.map((x) => x.h.title), ...(canNew ? [NEW] : [])];
      const i = opts.indexOf(head ?? '');
      head = opts[Math.max(0, Math.min(opts.length - 1, i + d))] ?? head;
    }
    void tick().then(() => document.querySelector('.gadd .sel')?.scrollIntoView({ block: 'nearest' }));
  }
  function key(e: KeyboardEvent) {
    if (confirmMe) {
      if (e.key === 'Escape') {
        e.preventDefault();
        confirmMe = false;
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      void add();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (e.target as HTMLElement).dataset.list !== 'no') {
      e.preventDefault();
      move(e.key === 'ArrowDown' ? 1 : -1);
    }
  }
  let search: HTMLInputElement | undefined = $state();
  void tick().then(() => search?.focus());
</script>

<div class="scrim" aria-hidden="true"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="gadd" role="dialog" aria-modal="true" aria-label="Добавить цели" tabindex="-1" onkeydown={key}>
  <header>
    <b>{req.replace ? 'Сменить заголовок' : 'Добавить цели'}</b>
    <span>Выберите файл и заголовок первого уровня, под которым хранятся цели человека</span>
  </header>
  <div class="body">
    <div class="cols">
      <div class="col" class:focus={col === 'file'}>
        <span class="cap">1. ФАЙЛ</span>
        <label class="search">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
          <input bind:this={search} bind:value={q} placeholder="Файл…" aria-label="Файл" spellcheck="false" autocomplete="off" onfocus={() => (col = 'file')} />
        </label>
        <div class="list" role="listbox" aria-label="Файлы">
          {#each files as f (f.path)}
            {@const note = noteOf(f.name)}
            <button role="option" aria-selected={file === f.name} class:sel={file === f.name} class:dim={note !== 'не добавлен'}
              onclick={() => { col = 'file'; pickFile(f.name); }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
              <b>{base(f.name)}</b><span class="path">{f.name.split('/').slice(0, -1).join(' › ')}</span><span class="nt">{note}</span>
            </button>
          {:else}
            <span class="empty">Ничего не найдено</span>
          {/each}
        </div>
      </div>
      <div class="col" class:focus={col === 'head'}>
        <span class="cap">2. ЗАГОЛОВОК 1-ГО УРОВНЯ{cur ? ` · ${base(cur.name)}` : ''}</span>
        <div class="list" role="listbox" aria-label="Заголовки первого уровня">
          {#if !cur}<span class="empty">Сначала выберите файл</span>{/if}
          {#each heads as x (x.i)}
            {@const sum = sourceSummary(cur!.text, cur!.headings, x.i)}
            <button role="option" aria-selected={head === x.h.title} class:sel={head === x.h.title} onclick={() => { col = 'head'; head = x.h.title; }}>
              <span class="lv" aria-hidden="true"></span><span class="ht">{x.h.title}</span><span class="nt">{sum}</span>
            </button>
          {/each}
          {#if canNew}
            <button role="option" aria-selected={head === NEW} class="new" class:sel={head === NEW} onclick={() => { col = 'head'; head = NEW; }}>+ Создать «{SOURCE_HEADING}» в конце файла</button>
          {/if}
        </div>
      </div>
    </div>
    <div class="more">
      <div class="left">
        <label class="fld">
          <span>Название в навигаторе</span>
          <span class="inp">
            <span class="av" style="background:{avatarColor(file ?? '')}" aria-hidden="true">{initials(name, me)}</span>
            <input bind:value={name} oninput={() => (named = true)} aria-label="Название в навигаторе" data-list="no" spellcheck="false" />
          </span>
          <span class="hint">По умолчанию — из #+TITLE файла</span>
        </label>
        <button class="sw-row" role="switch" aria-checked={me} onclick={() => (me = !me)}>
          <span class="switch" class:on={me}><span></span></span>
          <span class="swt"><span>Это мои цели</span><span class="hint">{mineNow ? `Сейчас «Мои цели» — ${mineNow.file.split('/').pop()} › ${mineNow.heading}` : '«Мои цели» ещё не указаны'}</span></span>
        </button>
      </div>
      <div class="right">
        <span class="lbl">Что найдено под заголовком</span>
        <div class="pre" aria-label="Что найдено под заголовком">
          {#if preview}
            <span class="h1">* {preview.title}</span>
            {#each preview.rows as r (r.t)}<span class="h2">  * {r.t}<span class="cnt">   {r.n}</span></span>{/each}
            {#if preview.fresh}<span class="cnt">Заголовка ещё нет — будет создан в конце файла</span>{:else if !preview.rows.length}<span class="cnt">Кварталов пока нет</span>{/if}
          {:else}<span class="cnt">—</span>{/if}
        </div>
        <span class="hint">Кварталы и цели дальше создаются из интерфейса</span>
      </div>
    </div>
  </div>
  <footer>
    <button onclick={close}>Отмена</button>
    <button class="pri" disabled={!ready || busy} onclick={() => add()}>{req.replace ? 'Сохранить' : 'Добавить'}</button>
  </footer>
  {#if confirmMe && mineNow}
    <div class="modal">
      <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Мои цели">
        <h2>Сделать «Мои цели» — {file?.split('/').pop()}?</h2>
        <p>Сейчас «Мои цели» — {mineNow.file.split('/').pop()} › {mineNow.heading}. Тот источник останется в команде.</p>
        <div class="btns">
          <button onclick={() => (confirmMe = false)}>Отмена</button>
          <button class="pri" onclick={() => { confirmMe = false; void add(true); }}>Сделать</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.42); }
  .gadd { position: fixed; z-index: 71; left: 50%; top: 48px; bottom: 48px; transform: translateX(-50%); width: min(880px, calc(100% - 48px)); display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5); overflow: hidden; outline: none; }
  header { flex: 0 0 58px; display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 0 20px; background: var(--bar); border-bottom: 1px solid var(--line); }
  header b { font-size: 15px; }
  header span { font-size: 12px; color: var(--fg2); }
  .body { flex: 1 1 0; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
  .cols { display: flex; flex-wrap: wrap; border-bottom: 1px solid var(--line); min-height: 260px; }
  .col { flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 6px; padding: 14px 14px 12px; }
  .col + .col { border-left: 1px solid var(--line); }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; color: var(--fg2); }
  .search { display: flex; align-items: center; gap: 7px; height: 28px; box-sizing: border-box; padding: 0 9px; border: 1px solid var(--line); border-radius: 7px; color: var(--fg3); }
  .search:focus-within { border-color: var(--acc); }
  .search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--fg); font-size: 13px; padding: 0; -webkit-user-select: text; user-select: text; }
  .list { display: flex; flex-direction: column; gap: 1px; max-height: 300px; overflow: auto; }
  .list button { flex: 0 0 30px; display: flex; align-items: center; gap: 8px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--fg); text-align: left; font-size: 13px; }
  .list button.dim { color: var(--fg2); }
  .list button.sel { background: var(--acc); color: var(--onacc); }
  .col:not(.focus) .list button.sel { background: var(--sel); color: var(--fg); }
  .list button:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .path { flex: 1; min-width: 0; font-size: 12px; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nt { font-size: 11px; opacity: 0.85; white-space: nowrap; }
  .ht { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lv { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 2px; background: var(--h1); }
  .sel .lv { background: currentColor; }
  .list .new { margin-top: 4px; border: 1px dashed var(--line); color: var(--acc); }
  .empty { padding: 6px 8px; color: var(--fg3); font-size: 12.5px; }
  .more { display: flex; flex-wrap: wrap; gap: 16px; padding: 14px 20px; }
  .left, .right { flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
  .right { gap: 6px; }
  .fld { display: flex; flex-direction: column; gap: 5px; }
  .fld > span:first-child, .lbl { font-size: 12px; font-weight: 600; color: var(--fg2); }
  .inp { height: 30px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; }
  .inp:focus-within { border-color: var(--acc); }
  .inp input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--fg); font-size: 13px; padding: 0; -webkit-user-select: text; user-select: text; }
  .av { flex: 0 0 20px; width: 20px; height: 20px; border-radius: 10px; color: #ffffff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .hint { font-size: 11.5px; color: var(--fg3); }
  .sw-row { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; text-align: left; padding: 0; color: var(--fg); }
  .switch { flex: 0 0 36px; width: 36px; height: 22px; box-sizing: border-box; padding: 2px; border-radius: 11px; background: var(--field); box-shadow: inset 0 0 0 1px var(--line); display: flex; transition: background 0.15s; }
  .switch span { width: 18px; height: 18px; border-radius: 9px; background: #ffffff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
  .switch.on { background: var(--acc); box-shadow: none; }
  .switch.on span { transform: translateX(14px); }
  .swt { display: flex; flex-direction: column; }
  .pre { display: flex; flex-direction: column; padding: 10px 12px; border-radius: 8px; background: var(--side); font-family: var(--mono); font-size: 12px; line-height: 1.6; white-space: pre; overflow: auto; }
  .h1 { color: var(--h1); font-weight: 700; }
  .h2 { color: var(--h2); font-weight: 700; }
  .cnt { color: var(--fg3); font-weight: 400; white-space: normal; font-family: var(--ui); }
  .h2 .cnt { font-family: var(--mono); white-space: pre; }
  footer { flex: 0 0 auto; display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--line); background: var(--side); }
  footer button, .btns button { height: 30px; padding: 0 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); }
  .pri { border: 0 !important; background: var(--acc) !important; color: var(--onacc) !important; font-weight: 600; }
  .pri:disabled { opacity: 0.5; }
  .modal { position: absolute; inset: 0; z-index: 5; background: rgba(0, 0, 0, 0.28); display: flex; align-items: flex-start; justify-content: center; padding-top: 14vh; }
  .dlg { width: 420px; max-width: calc(100% - 32px); padding: 18px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35); }
  .dlg h2 { margin: 0 0 8px; font-size: 14px; }
  .dlg p { margin: 0 0 14px; color: var(--fg2); line-height: 1.45; }
  .btns { display: flex; justify-content: flex-end; gap: 8px; }
</style>

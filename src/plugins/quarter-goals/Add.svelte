<script lang="ts">
  import { goals } from './state.svelte';
  import { core } from './core.svelte';
  import { SOURCE_HEADING, avatarColor, findSource, initials, readSource, sourceKey, sourceSummary, goalsWord } from './goals';

  // «Добавить цели» (ТЗ 23, 2.3): a file, then its level-1 heading where the goals are — the core's choice of a place
  // (PlacePicker, the columns); the name in the navigator, «Это мои цели». The same sheet changes the heading of a
  // source («Сменить заголовок…»).
  let { me: reqMe, replace, file: reqFile, close }: { me?: boolean; replace?: string; file?: string; close: () => void } = $props();
  const req = { me: reqMe, replace, file: reqFile };
  const NEW = '\u0000new';

  let file = $state<string | null>(req.file ?? null); // relative name
  let head = $state<string | null>(null);
  let name = $state('');
  let named = false; // typed by hand: a file change keeps it
  let me = $state(!!req.me);
  let confirmMe = $state(false);
  let busy = $state(false);

  const mineNow = $derived(goals.goalSources.find((s) => s.me));
  const base = (n: string) => n.split('/').pop()!.replace(/\.org$/, '');
  const noteOf = (rel: string) => {
    const s = goals.goalSources.filter((x) => x.file === rel && sourceKey(x) !== req.replace);
    return s.some((x) => x.me) ? 'мои цели' : s.length ? 'уже в целях' : 'не добавлен';
  };
  const fileNote = (rel: string) => {
    const text = noteOf(rel);
    return { text, dim: text !== 'не добавлен' };
  };
  const cur = $derived(core.files.find((f) => f.name === file));
  const heads = $derived(cur ? cur.headings.map((h, i) => ({ h, i })).filter((x) => x.h.level === 1) : []);
  const canNew = $derived(!!cur && findSource(cur.headings, SOURCE_HEADING) < 0);
  const titleOf = (text: string, rel: string) => /^#\+TITLE:\s*(.+)$/im.exec(text)?.[1].trim() || base(rel);

  /** A file picked: the heading that looks like a source (or «Квартальные задачи»), the name from #+TITLE. */
  function pickFile(rel: string) {
    file = rel;
    const f = core.files.find((x) => x.name === rel);
    if (!f) return;
    const looks = heads.find((x) => sourceSummary(f.text, f.headings, x.i));
    const named0 = f.headings.find((h) => h.level === 1 && h.title.toLowerCase() === SOURCE_HEADING.toLowerCase());
    head = looks?.h.title ?? named0?.title ?? (findSource(f.headings, SOURCE_HEADING) < 0 ? NEW : null);
    if (!named) name = titleOf(f.text, rel);
  }
  if (file) pickFile(file);
  else if (req.replace) pickFile(req.replace.split('#')[0]);
  if (req.replace) {
    const s = goals.goalSources.find((x) => sourceKey(x) === req.replace);
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
    const ok = await goals.addGoalSource(src, { create: head === NEW, replace: req.replace });
    busy = false;
    if (!ok) return;
    close();
    void goals.ctx.commands.run('quarter-goals.nav'); // the navigator shows the goals
    goals.openGoals(sourceKey(src));
  }

  // ---- keyboard: ↑↓ in the list in focus (the picker's), ↩ adds, ⎋ closes ------------------------------------------
  // the choice of a place: the core's columns (a widget); ↑↓ of the sheet move in it
  let picker: ReturnType<typeof goals.ctx.ui.widget> | null = null;
  function placeWidget(el: HTMLElement) {
    const w = goals.ctx.ui.widget(el, {
      type: 'place', key: 'at', label: 'Файл и заголовок', levels: [1], headCap: '2. ЗАГОЛОВОК 1-ГО УРОВНЯ',
      note: (rel) => fileNote(rel),
      headNote: (rel, title) => {
        const f = core.files.find((x) => x.name === rel);
        const i = f ? f.headings.findIndex((h) => h.level === 1 && h.title === title) : -1;
        return f && i >= 0 ? sourceSummary(f.text, f.headings, i) : '';
      },
      create: (rel) => (rel === file && canNew ? `+ Создать «${SOURCE_HEADING}» в конце файла` : null),
    }, null, (v) => {
      const x = v as { path: string; heading: string | null; create?: boolean };
      if (x.path !== file) pickFile(x.path);
      else head = x.create ? NEW : x.heading;
    });
    picker = w;
    const stop = $effect.root(() => {
      $effect(() => w.set(file ? { path: file, heading: head === NEW ? null : head, ...(head === NEW ? { create: true } : {}) } : null));
    });
    queueMicrotask(() => w.focusList(req.replace || req.file ? 'head' : 'file'));
    return { destroy: () => (stop(), w.dispose(), (picker = null)) };
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
      picker?.move(e.key === 'ArrowDown' ? 1 : -1);
    }
  }
</script>

<div class="gadd" role="dialog" aria-modal="true" aria-label="Добавить цели" tabindex="-1" onkeydown={key}>
  <header>
    <b>{req.replace ? 'Сменить заголовок' : 'Добавить цели'}</b>
    <span>Выберите файл и заголовок первого уровня, под которым хранятся цели человека</span>
  </header>
  <div class="body">
    <div class="pick" use:placeWidget></div>
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
  .gadd { position: fixed; z-index: 71; left: 50%; top: 48px; bottom: 48px; transform: translateX(-50%); width: min(880px, calc(100% - 48px)); display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5); overflow: hidden; outline: none; }
  header { flex: 0 0 58px; display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 0 20px; background: var(--bar); border-bottom: 1px solid var(--line); }
  header b { font-size: 15px; }
  header span { font-size: 12px; color: var(--fg2); }
  .body { flex: 1 1 0; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
  /* the core's columns as they were in this sheet: no frame of their own, a line under them */
  .pick :global(.place) { border: 0; border-radius: 0; }
  .pick :global(.place .c-cols) { border-bottom: 1px solid var(--line); }
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

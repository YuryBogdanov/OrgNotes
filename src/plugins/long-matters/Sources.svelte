<script lang="ts">
  import { onMount } from 'svelte';
  import { long } from './state.svelte';
  import { readSettings, type Source } from './long';

  // «Настройки → Долгие дела → Источники» (ТЗ 40 §8): a row per source — a file with the level of its headings, or a
  // tag; «+» adds one. A file not in the folder says so.
  let { ctrl }: { ctrl: { value(): unknown; set(v: unknown): void; onChange(fn: () => void): () => void } } = $props();
  const read = () => readSettings({ sources: ctrl.value() ?? undefined }).sources;
  let list = $state<Source[]>(read());
  let files = $state<string[] | null>(null);
  let adding = $state(false);
  onMount(() => {
    void long.ctx.index!.files().then((fs) => (files = fs.map((f) => f.path)));
    return ctrl.onChange(() => (list = read()));
  });
  function save(next: Source[]) {
    list = next;
    ctrl.set(next);
  }
  const put = (i: number, s: Source) => save(list.map((x, k) => (k === i ? s : x)));
  async function addFile() {
    adding = false;
    const p = await long.ctx.ui.pickPlace({ kind: 'file', title: 'Файл с долгими делами' });
    if (p) save([...list, { kind: 'file', file: p.path, level: 1 }]);
  }
  function addTag() {
    adding = false;
    save([...list, { kind: 'tag', tag: 'long' }]);
  }
  const tagOf = (v: string) => v.trim().replace(/^:+|:+$/g, '');
</script>

<div class="lm-src">
  {#each list as s, i (i)}
    <div class="src">
      {#if s.kind === 'file'}
        <span class="kind">Файл</span>
        <span class="file" class:gone={files && !files.includes(s.file)}>{s.file}</span>
        {#if files && !files.includes(s.file)}<span class="warn">Файл не найден</span>{/if}
        <label class="lvl">уровень
          <select aria-label="Уровень заголовков в {s.file}" value={s.level} onchange={(e) => put(i, { ...s, level: Number(e.currentTarget.value) })}>
            {#each [1, 2, 3] as l (l)}<option value={l}>{l}</option>{/each}
          </select>
        </label>
      {:else}
        <span class="kind">Тег</span>
        <span class="tag">:<input aria-label="Тег долгих дел" value={s.tag} spellcheck="false"
          onchange={(e) => (tagOf(e.currentTarget.value) ? put(i, { kind: 'tag', tag: tagOf(e.currentTarget.value) }) : (e.currentTarget.value = s.tag))} />:</span>
      {/if}
      <button class="rm" aria-label="Убрать источник" title="Убрать" onclick={() => save(list.filter((_, k) => k !== i))}>×</button>
    </div>
  {:else}
    <p class="none">Источников нет — долгих дел не будет.</p>
  {/each}
  <div class="add">
    {#if adding}
      <button onclick={() => void addFile()}>Файл…</button>
      <button onclick={addTag}>Тег</button>
      <button class="cancel" onclick={() => (adding = false)}>Отмена</button>
    {:else}
      <button aria-label="Добавить источник" onclick={() => (adding = true)}>+ Источник</button>
    {/if}
  </div>
</div>

<style>
  .lm-src { display: flex; flex-direction: column; gap: 6px; }
  .src { display: flex; align-items: center; gap: 10px; min-height: 32px; padding: 0 6px 0 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); }
  .kind { flex: 0 0 38px; font-size: 11.5px; font-weight: 600; color: var(--fg3); }
  .file { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file.gone { color: var(--fg3); text-decoration: line-through; }
  .warn { flex: 0 0 auto; font-size: 11.5px; color: var(--wait); font-weight: 600; }
  .lvl { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--fg2); }
  .lvl select { height: 24px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); }
  .tag { flex: 1; display: flex; justify-content: flex-start; align-items: center; font: 12.5px var(--mono); color: var(--fg2); }
  .tag input { flex: 0 0 140px; width: 140px; height: 24px; margin: 0 2px; padding: 0 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); font: inherit; outline: none; }
  .tag input:focus { border-color: var(--acc); }
  .rm { flex: 0 0 24px; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--fg3); font-size: 15px; }
  .rm:hover { background: color-mix(in srgb, var(--fg) 8%, transparent); color: var(--fg); }
  .none { margin: 0; color: var(--fg3); font-size: 12.5px; }
  .add { display: flex; gap: 6px; }
  .add button { height: 26px; padding: 0 10px; border: 1px dashed var(--line); border-radius: 6px; background: transparent; color: var(--acc); font-size: 12.5px; }
  .add button:hover { border-color: var(--acc); }
  .add .cancel { color: var(--fg2); border-style: solid; }
</style>

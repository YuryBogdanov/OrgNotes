<script lang="ts">
  import SchemaSettings from './SchemaSettings.svelte';
  import { miniSchema } from './miniOptions.svelte';
  import { store } from './store.svelte';

  // «Настройки → Мини-окно» (ТЗ 31 §6): its settings by the schema, then its keys — shown here, changed in «Клавиши».
  const KEYS = [
    { id: 'miniShow', label: 'Показать мини-окно и писать', sub: 'Глобальное · из любой программы' },
    { id: 'miniOpen', label: 'Открыть в мини-окне', sub: 'Текущий заголовок или файл' },
    { id: 'miniBack', label: 'Вернуть фокус в предыдущую программу', sub: 'В мини-окне, когда нечего закрывать' },
  ];
  const chips = (id: string) => store.bindings.get(id) ?? [];
</script>

<div class="body">
  <SchemaSettings schema={miniSchema} />
  <section class="general" aria-label="Клавиши мини-окна">
    <div class="cap">КЛАВИШИ <span class="cs">можно изменить в разделе «Клавиши»</span></div>
    <div class="opts">
      {#each KEYS as k (k.id)}
        <button class="opt krow" onclick={() => store.showSection('Клавиши')} title="Изменить в разделе «Клавиши»">
          <span class="kl"><span>{k.label}</span><small>{k.sub}</small></span>
          <span class="chips">{#each chips(k.id) as c (c)}<kbd>{c}</kbd>{:else}<span class="none">Не назначено</span>{/each}</span>
        </button>
      {/each}
    </div>
  </section>
</div>

<style>
  .body { padding: 0 0 24px; }
  .general { padding: 0 28px; }
  .cap { margin: 18px 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--fg2); }
  .cs { margin-left: 6px; font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--fg3); }
  .opts { display: flex; flex-direction: column; gap: 6px; }
  .krow { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; padding: 10px 12px; background: var(--side); border: 1px solid var(--line); border-radius: 8px; text-align: left; color: var(--fg); font-size: 13px; }
  .kl { display: flex; flex-direction: column; gap: 2px; }
  .kl small { color: var(--fg2); font-size: 11.5px; }
  .chips { display: flex; gap: 4px; }
  kbd { font: 12px var(--mono, ui-monospace, Menlo, monospace); padding: 2px 7px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); }
  .none { color: var(--fg3); font-size: 12px; }
</style>

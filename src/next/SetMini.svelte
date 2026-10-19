<script lang="ts">
  import { store } from '../store.svelte';
  import { miniSchema } from '../miniOptions.svelte';
  import { keysFocus } from '../keysEditor.svelte';
  import type { Schema } from '../settingsSchema';
  import SetSchema from './SetSchema.svelte';
  import Group from './SetGroup.svelte';
  import Row from './SetRow.svelte';

  // «Настройки → Мини-окно» of the new interface (ТЗ 54 §3, ТЗ 31 §6): its schema in the new rows («Не гаснуть после
  // ввода» as segments), then its three keys — the shortcut in Plex Mono on the right; a click opens «Клавиши» on it.
  const KEYS = [
    { id: 'miniShow', label: 'Показать мини-окно и писать', sub: 'Глобальное · из любой программы' },
    { id: 'miniOpen', label: 'Открыть в мини-окне', sub: 'Текущий заголовок или файл' },
    { id: 'miniBack', label: 'Вернуть фокус в предыдущую программу', sub: 'В мини-окне, когда нечего закрывать' },
  ];
  const schema: Schema = {
    ...miniSchema,
    groups: miniSchema.groups.map((g) => ({ ...g, fields: g.fields.map((f) => (f.key === 'linger' && f.type === 'choice' ? { ...f, look: 'segments' as const } : f)) })),
  };
  const keys = (id: string) => (store.bindings.get(id) ?? []).join(', ');
  function toKeys(id: string) {
    keysFocus.id = id;
    store.showSection('Клавиши');
  }
</script>

<SetSchema {schema} />
<Group caption="Клавиши" note="изменить — в разделе «Клавиши» ›">
  {#each KEYS as k (k.id)}
    <Row label={k.label} hint={k.sub} onclick={() => toKeys(k.id)}>
      <button class="kb" title="Изменить в разделе «Клавиши»" onclick={(e) => (e.stopPropagation(), toKeys(k.id))}>{keys(k.id) || 'Не назначено'}</button>
    </Row>
  {/each}
</Group>

<style>
  .kb { padding: 0; border: 0; background: none; color: var(--ink2); font: 12px var(--mono); white-space: nowrap; }
  .kb:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
</style>

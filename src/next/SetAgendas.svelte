<script lang="ts">
  import { store } from '../store.svelte';
  import { blocksOf } from '../views';
  import Group from './SetGroup.svelte';
  import Row from './SetRow.svelte';
  import Button from './ui/Button.svelte';
  import SetSchema from './SetSchema.svelte';

  // «Настройки → Агенды» of the new interface (ТЗ 54 §2): «Мои агенды» — a row each with its blocks and ×, a new one
  // in the builder; the plugins' blocks of this section by their schemas.
  let { onremove }: { onremove: (a: { id: string; name: string }) => void } = $props();
  const blocks = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'блок' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'блока' : 'блоков'}`;
  /** «Новая агенда»: the settings close and the builder opens (one sheet at a time); ⌘, brings them back. */
  function newAgenda() {
    store.closeSettings();
    store.newAgendaInBuilder();
  }
</script>

<Group caption="Мои агенды" note="изменить — правый клик по агенде в сайдбаре">
  {#each store.agendas as a (a.id)}
    <Row label={a.name} hint={blocks(a.blocks.length)}>
      <button class="x" aria-label="Удалить агенду {a.name}" title="Удалить агенду" onclick={() => onremove({ id: a.id, name: a.name })}>×</button>
    </Row>
  {:else}
    <Row label="Своих агенд пока нет" hint="Агенда — набор блоков, каждый выбирает задачи по условиям" />
  {/each}
  <Row label="Новая агенда" hint="Откроется конструктор агенды"><Button small kind="main" onclick={newAgenda}>Новая агенда…</Button></Row>
</Group>
{#each blocksOf('Агенды') as b (b.schema.id)}<SetSchema schema={b.schema} />{/each}

<style>
  .x { width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ink3); font-size: 16px; }
  .x:hover { background: var(--chip); color: var(--todo); }
  .x:focus-visible { outline: 2px solid var(--lampline); outline-offset: 1px; }
</style>

<script lang="ts">
  import { store } from '../store.svelte';
  import { WIDE, hintOf, optionsOf, type Field, type Schema } from '../settingsSchema';
  import FormFields from './FormFields.svelte';
  import PlacePalette from './PlacePalette.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Segments from './ui/Segments.svelte';
  import MenuButton from './ui/MenuButton.svelte';
  import Button from './ui/Button.svelte';
  import Group from './SetGroup.svelte';
  import Row from './SetRow.svelte';

  // A schema's settings (roadmap 0.6, a feature's or a plugin's) in the new look (ТЗ 54 §2): each group its caption
  // (the help beside it) and card, each field a row — a switch, segments, a menu, a field of text, a file with
  // «Выбрать…»; the long ones (lines, a day, a place, the plugin's own) under the name across the row, drawn by the
  // forms' fields. The plugin needs nothing changed.
  let { schema }: { schema: Schema } = $props();
  const v = $derived(schema.values());
  const id = (f: Field) => `${schema.id}-${f.key}`;
  const set = (key: string, value: unknown) => void schema.set({ [key]: value });
  /** One field of the schema, for the forms' fields to draw (its label is the row's). */
  const one = (f: Field): Schema => ({ ...schema, groups: [{ caption: '', fields: [f] }] });
  let picking = $state<Extract<Field, { type: 'file' }> | null>(null);
</script>

{#each schema.groups as g, gi (gi)}
  <Group caption={g.caption || undefined} note={g.help} label={g.caption || schema.label}>
    {#each g.fields.filter((f) => f.type !== 'month') as f (f.key)}
      {@const hint = hintOf(f, v)}
      {@const off = f.disabled?.(v) ?? false}
      {#if WIDE.has(f.type)}
        <Row label={f.label} {hint} id={id(f)} wide><FormFields schema={one(f)} bare /></Row>
      {:else}
        <Row label={f.label} {hint} id={id(f)}>
          {#if f.type === 'switch'}
            <Toggle checked={!!v[f.key]} labelledby={id(f)} disabled={off} onchange={() => set(f.key, !v[f.key])} />
          {:else if f.type === 'choice'}
            {@const opts = optionsOf(f, v)}
            {#if f.look === 'segments'}
              <Segments value={v[f.key] as unknown} options={opts} labelledby={id(f)} disabled={off} onchange={(x) => set(f.key, x)} />
            {:else}
              <MenuButton value={v[f.key] as unknown} options={opts} label={f.label} disabled={off} onchange={(x) => set(f.key, x)} />
            {/if}
          {:else if f.type === 'pair'}
            {@const both = f.options(v)}
            <span class="pair" role="group" aria-labelledby={id(f)}>
              {#each [f.key, f.key2] as k, n (k)}
                {#if n}<span class="dash">–</span>{/if}
                <MenuButton value={v[k] as unknown} options={both[n]} label={f.labels[n]} disabled={off} onchange={(x) => set(k, x)} />
              {/each}
            </span>
          {:else if f.type === 'text' && f.suggest}
            <!-- with suggestions (API 1.14): the forms' field, its popover under it -->
            <span class="sw"><FormFields schema={one(f)} bare /></span>
          {:else if f.type === 'text'}
            <input class="f" aria-labelledby={id(f)} value={(v[f.key] as string) ?? ''} placeholder={f.placeholder} spellcheck="false" autocomplete="off" disabled={off}
              onchange={(e) => set(f.key, f.clean ? f.clean(e.currentTarget.value) : e.currentTarget.value)} />
          {:else if f.type === 'file'}
            <span class="val" data-testid={id(f)}>{f.show((v[f.key] as string | null) ?? null)}</span>
            {#if v[f.key] && f.clear}<Button small label="{f.label}: {f.clear}" onclick={() => set(f.key, null)}>×</Button>{/if}
            <Button small label="Выбрать {f.label.toLowerCase()}" onclick={() => (picking = f)}>Выбрать…</Button>
          {/if}
        </Row>
      {/if}
    {/each}
  </Group>
{/each}
{#each picking ? [picking] : [] as f (f.key)}
  <PlacePalette kind="file" title={f.label} token={f.label} placeholder="Найти файл" recent={store.refileRecentFiles('')} onclose={() => (picking = null)}
    onpick={(x) => {
      const rel = store.files.find((y) => y.path === x.path)?.name;
      if (!rel) return 'Файл не найден';
      set(f.key, rel);
      picking = null;
    }} />
{/each}

<style>
  .f { width: 220px; height: 30px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 7px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); caret-color: var(--lamp); font: 13px var(--ui); outline: none; -webkit-user-select: text; user-select: text; }
  .f:focus { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .sw { width: 220px; }
  .pair { display: flex; align-items: center; gap: 6px; }
  .dash { color: var(--ink3); }
  .val { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; color: var(--ink2); }
</style>

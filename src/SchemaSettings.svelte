<script lang="ts">
  import Picker from './Picker.svelte';
  import { WHERE_NOTE, hintOf, optOf, optValue, optionsOf, whereOfGroup, type Field, type Schema } from './settingsSchema';

  // A feature's settings drawn from its schema (roadmap 0.6), in the settings sheet's look: a section of its own or,
  // `embedded`, a block inside another section («Цели квартала» in «Агенды»).
  let { schema, embedded = false }: { schema: Schema; embedded?: boolean } = $props();

  const v = $derived(schema.values());
  const id = (f: Field) => `${schema.id}-${f.key}`;
  const set = (key: string, value: unknown) => void schema.set({ [key]: value });
  let picking = $state<Extract<Field, { type: 'file' }> | null>(null);
  // ⎋ closes the picker of a file first, not the sheet
  const esc = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && picking) {
      e.preventDefault();
      picking = null;
    }
  };
</script>

<svelte:window onkeydowncapture={esc} />

{#snippet groups()}
  {#each schema.groups as g (g.caption)}
    {@const where = whereOfGroup(g)}
    <div class="cap">{g.caption}</div>
    <div class="opts">
      {#each g.fields as f (f.key)}
        {@const hint = hintOf(f, v)}
        <div class="opt">
          {#if f.type === 'file'}
            <span id={id(f)}>{f.label}</span>
            <span class="ibfile">
              <span class="val" aria-labelledby={id(f)} data-testid={id(f)}>{f.show((v[f.key] as string | null) ?? null)}</span>
              {#if v[f.key] && f.clear}<button class="change" aria-label="{f.label}: {f.clear}" title={f.clear[0].toUpperCase() + f.clear.slice(1)} onclick={() => set(f.key, null)}>×</button>{/if}
              <button class="change" aria-label="Выбрать {f.label.toLowerCase()}" onclick={() => (picking = f)}>Выбрать…</button>
            </span>
          {:else}
            <span class="olab">
              {#if f.type === 'choice' && f.look === 'segments'}<span id={id(f)}>{f.label}</span>
              {:else if f.type === 'pair'}<span id={id(f)}>{f.label}</span>
              {:else}<label for={id(f)}>{f.label}</label>{/if}
              {#if hint}<small>{hint}</small>{/if}
            </span>
            {#if f.type === 'switch'}
              <button id={id(f)} class="switch" role="switch" aria-checked={!!v[f.key]} aria-label={f.label} onclick={() => set(f.key, !v[f.key])}><span></span></button>
            {:else if f.type === 'text'}
              <input id={id(f)} class="sel txt" value={(v[f.key] as string) ?? ''} placeholder={f.placeholder} spellcheck="false"
                onchange={(e) => set(f.key, f.clean ? f.clean(e.currentTarget.value) : e.currentTarget.value)} />
            {:else if f.type === 'choice'}
              {@const opts = optionsOf(f, v)}
              {#if f.look === 'segments'}
                <div class="segs" role="radiogroup" aria-labelledby={id(f)}>
                  {#each opts as o (o.value)}
                    <button role="radio" aria-checked={v[f.key] === o.value} class:on={v[f.key] === o.value} disabled={o.disabled} onclick={() => set(f.key, o.value)}>{o.label}</button>
                  {/each}
                </div>
              {:else}
                <select id={id(f)} class="sel" value={optValue(v[f.key])} onchange={(e) => set(f.key, optOf(opts, e.currentTarget.value))}>
                  {#each opts as o, i (i)}<option value={optValue(o.value)} disabled={o.disabled}>{o.label}</option>{/each}
                </select>
              {/if}
            {:else if f.type === 'pair'}
              {@const both = f.options(v)}
              <span class="hrs" role="group" aria-labelledby={id(f)}>
                {#each [f.key, f.key2] as k, n (k)}
                  {#if n}–{/if}
                  <select class="sel" aria-label={f.labels[n]} value={optValue(v[k])} onchange={(e) => set(k, optOf(both[n], e.currentTarget.value))}>
                    {#each both[n] as o, i (i)}<option value={optValue(o.value)} disabled={o.disabled}>{o.label}</option>{/each}
                  </select>
                {/each}
              </span>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
    {#if g.help || where}<p class="help">{[g.help, where && WHERE_NOTE[where]].filter(Boolean).join(' ')}</p>{/if}
  {/each}
{/snippet}

{#if embedded}
  {@render groups()}
{:else}
  <div class="body">
    <section class="general" aria-label={schema.label}>{@render groups()}</section>
  </div>
{/if}
{#each picking ? [picking] : [] as f (f.key)}
  <Picker label={f.label} onclose={() => (picking = null)} onpick={(rel) => set(f.key, rel)} />
{/each}

<style>
  section > :global(*) { flex-shrink: 0; }
  section { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 24px; display: flex; flex-direction: column; gap: 14px; }
  .body { flex: 1; min-height: 0; display: flex; }
  .general { max-width: 760px; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--fg2); padding: 0 6px 6px; }
  .help { font-size: 12px; line-height: 1.5; color: var(--fg2); padding: 10px 6px; }
  .opts { display: flex; flex-direction: column; gap: 6px; }
  .opt { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 12px; background: var(--side); border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
  .olab { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .olab small { font-size: 11.5px; color: var(--fg2); }
  .sel { height: 26px; max-width: 260px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); padding: 0 6px; font-size: 12.5px; }
  .sel.txt { width: 200px; padding: 0 8px; -webkit-user-select: text; user-select: text; }
  .val { font-size: 12.5px; color: var(--fg2); }
  .segs { display: flex; padding: 2px; background: var(--field); border-radius: 7px; gap: 2px; }
  .segs button { height: 22px; padding: 0 10px; white-space: nowrap; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 12px; }
  .segs button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); font-weight: 500; }
  .ibfile { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .ibfile .val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .change { flex: 0 0 auto; height: 24px; padding: 0 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12.5px; }
  .hrs { display: flex; align-items: center; gap: 6px; color: var(--fg2); }
  .switch { flex: 0 0 auto; position: relative; width: 32px; height: 18px; padding: 0; border: 0; border-radius: 9px; background: var(--field); box-shadow: inset 0 0 0 1px var(--line); transition: background 0.15s; }
  .switch span { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 7px; background: var(--onpacc); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
  .switch[aria-checked='true'] { background: var(--acc); box-shadow: none; }
  .switch[aria-checked='true'] span { transform: translateX(14px); }
  .switch:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
</style>

<script lang="ts">
  import { RIGHTS } from '../api/host.svelte';
  import { LinkInstall } from '../pluginLink.svelte';
  import Sheet from './ui/Sheet.svelte';
  import Button from './ui/Button.svelte';
  import Segments from './ui/Segments.svelte';

  // «Установить плагин по ссылке» in the new interface (ТЗ 54 §3, ТЗ 37 §8): a sheet of 520 — the link and «Проверить»,
  // the version (the newest tag or the branch), what was found and whether it fits, «Проверять обновления»; the logic
  // is pluginLink.svelte.ts.
  let { onclose }: { onclose: () => void } = $props();
  const ln = new LinkInstall();
</script>

<Sheet title="Установить плагин по ссылке" label="Установка по ссылке" width={520} oncancel={onclose}>
  <div class="fld">
    <span class="lb" id="ln-url">Ссылка на git-репозиторий</span>
    <span class="in">
      <!-- svelte-ignore a11y_autofocus -->
      <input class="f" bind:value={ln.url} autofocus placeholder="https://git.company.local/team/panopticon-okr.git" spellcheck="false" aria-labelledby="ln-url"
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void ln.check(); } }} oninput={() => ln.typed()} />
      <Button disabled={!ln.url.trim() || ln.probing} onclick={() => void ln.check()}>{ln.probing && !ln.probe ? 'Проверяем…' : 'Проверить'}</Button>
    </span>
    {#if ln.error}<span class="err" role="alert">{ln.error}</span>{:else}<span class="hint">HTTPS или SSH. Доступ — через git и ключи на этом Mac, как при обычном git clone.</span>{/if}
  </div>
  {#if ln.probe && ln.m}
    {@const m = ln.m}
    {@const probe = ln.probe}
    {#if ln.latestTag || ln.head}
      <div class="ver"><span class="lb">Версия</span>
        <Segments label="Версия" disabled={ln.probing} value={probe.ref} onchange={(r) => void ln.check(r)}
          options={[...(ln.latestTag ? [{ value: ln.latestTag, label: `Последний тег · ${ln.latestTag}` }] : []), ...(ln.head ? [{ value: ln.head, label: `Ветка ${ln.head}` }] : [])]} />
      </div>
    {/if}
    <div class="found" aria-label="Найденный плагин">
      <span class="ib"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={m.icon ?? 'M4 4h12v12H4zM8 4v12M4 8h4'} /></svg></span>
      <div class="fi">
        <div class="fn"><b>{m.name}</b><span>v{m.version} · manifest.json найден</span></div>
        <span class="rights">Права: {#if m.permissions.length}{#each m.permissions as p, i (p)}{i ? ', ' : ''}<span class:net={p === 'net'}>{RIGHTS[p] ?? p}{p === 'net' && m.net.length ? `: ${m.net.join(', ')}` : ''}</span>{/each}{:else}никаких{/if}</span>
        {#if ln.builtin}<span class="bad">id «{m.id}» занят встроенным плагином</span>{:else if ln.fits}<span class="bad">{ln.fits}</span>{:else}<span class="ok">Подходит вашей версии приложения</span>{/if}
      </div>
    </div>
    <label class="chk"><input type="checkbox" bind:checked={ln.updates} /><span class="box" aria-hidden="true">✓</span>Проверять обновления в этом репозитории</label>
    <p class="warn">Плагин не из каталога: его код никто, кроме автора, не смотрел. Ставьте плагины только из источников, которым доверяете.</p>
  {/if}
  {#snippet foot()}
    <span style="flex:1"></span>
    <Button key="esc" onclick={onclose}>Отмена</Button>
    <Button kind="main" disabled={!ln.canInstall} onclick={() => void ln.install().then((ok) => ok && onclose())}>{ln.busy ? 'Устанавливаем…' : 'Установить'}</Button>
  {/snippet}
</Sheet>

<style>
  p { margin: 0; }
  .fld { display: flex; flex-direction: column; gap: 5px; }
  .lb { font-size: 11px; font-weight: 600; color: var(--ink3); }
  .in { display: flex; gap: 8px; }
  .f { flex: 1; min-width: 0; height: 30px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 7px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); caret-color: var(--lamp); font: 12.5px var(--mono); outline: none; -webkit-user-select: text; user-select: text; }
  .f:focus { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .hint { font-size: 11.5px; color: var(--ink3); }
  .err { font-size: 12px; color: var(--todo); }
  .ver { display: flex; align-items: center; gap: 10px; }
  .found { display: flex; gap: 12px; padding: 12px; border-radius: 10px; background: var(--chip); }
  .ib { flex: 0 0 30px; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--plug) 14%, transparent); color: var(--plug); }
  .fi { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; }
  .fn { display: flex; align-items: baseline; gap: 8px; }
  .fn b { font-size: 13.5px; }
  .fn span { font-size: 11.5px; color: var(--ink3); }
  .rights { color: var(--ink2); }
  .net { color: var(--wait); font-weight: 600; }
  .ok { color: var(--done); }
  .bad { color: var(--todo); }
  .warn { font-size: 11.5px; color: var(--wait); }
  .chk { display: flex; align-items: center; gap: 8px; cursor: default; }
  .chk input { position: absolute; opacity: 0; pointer-events: none; }
  .box { flex: 0 0 15px; width: 15px; height: 15px; box-sizing: border-box; border: 1.5px solid var(--ink3); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: transparent; font-size: 10px; font-weight: 800; }
  .chk input:checked + .box { border: 0; background: var(--lamp); color: var(--onlamp); }
</style>

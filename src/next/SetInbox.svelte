<script lang="ts">
  import { store } from '../store.svelte';
  import { blocksOf } from '../views';
  import { keysFocus } from '../keysEditor.svelte';
  import { setLayer } from '../settingsNav.svelte';
  import Group from './SetGroup.svelte';
  import Row from './SetRow.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Segments from './ui/Segments.svelte';
  import MenuButton from './ui/MenuButton.svelte';
  import Button from './ui/Button.svelte';
  import SetSchema from './SetSchema.svelte';
  import PlacePalette from './PlacePalette.svelte';

  // «Настройки → Inbox» of the new interface (ТЗ 54 §2): the file (the palette's files), where new tasks go; the quick
  // entry — its key (to «Клавиши»), from any program, «Добавлено в Inbox», the status, :CREATED:; the plugins' blocks.
  let picking = $state(false);
  $effect(() => setLayer('inbox', picking));
  $effect(() => () => setLayer('inbox', false));
  const inboxPath = $derived(!store.inboxCfg.file ? 'Не выбран' : store.inboxCfg.file.split('/').join(' / ') + (store.inboxFile ? '' : ' — не найден'));
  const inboxStates = $derived.by(() => {
    const seqs = store.inboxFile?.wf.sequences ?? store.config.workflows;
    return [...new Set(seqs.flatMap((sq) => sq.states.filter((x) => !x.done).map((x) => x.name)))];
  });
  const ADD: { value: 'top' | 'end'; label: string }[] = [
    { value: 'top', label: 'В начало' },
    { value: 'end', label: 'В конец' },
  ];
  function toKeys() {
    keysFocus.id = 'capture';
    store.showSection('Клавиши');
  }
</script>

<Group caption="Файл" note="свой у каждой рабочей папки">
  <Row label="Файл Inbox" hint="Сюда попадают новые задачи; записанные вручную тоже видны в списке" id="ib-file">
    <span class="val" data-testid="ib-file">{inboxPath}</span>
    <Button small label="Выбрать файл Inbox" onclick={() => (picking = true)}>Выбрать…</Button>
  </Row>
  <Row label="Куда добавлять" hint="В начало — после строк вроде #+TITLE, перед первой задачей" id="ib-add">
    <Segments value={store.inboxCfg.add} options={ADD} labelledby="ib-add" onchange={(v) => store.setInbox({ add: v })} />
  </Row>
</Group>
<Group caption="Быстрый ввод">
  <Row label="Сочетание" hint="Изменить — в разделе «Клавиши»" onclick={toKeys}>
    <button class="kb" title="Изменить в разделе «Клавиши»" onclick={(e) => (e.stopPropagation(), toKeys())}>{store.keyHint('capture') || 'Без сочетания'}</button>
  </Row>
  <Row label="Работает из любой программы" hint="Приложение должно быть запущено; окно можно закрыть" id="ib-global">
    <Toggle checked={store.captureGlobal} labelledby="ib-global" onchange={() => void store.setCaptureKey(store.captureKey, !store.captureGlobal)} />
  </Row>
  <Row label="Показывать «Добавлено в Inbox»" id="ib-confirm">
    <Toggle checked={store.inboxCfg.confirm} labelledby="ib-confirm" onchange={() => store.setInbox({ confirm: !store.inboxCfg.confirm })} />
  </Row>
  <Row label="Статус новой задачи">
    <MenuButton value={store.inboxCfg.status ?? ''} label="Статус новой задачи" width={220} options={[{ value: '', label: 'Начальный статус набора' }, ...inboxStates.map((s) => ({ value: s, label: s }))]}
      onchange={(v) => store.setInbox({ status: v || null })} />
  </Row>
  <Row label="Записывать дату создания" hint=":CREATED: у новой задачи" id="ib-created">
    <Toggle checked={store.inboxCfg.created} labelledby="ib-created" onchange={() => store.setInbox({ created: !store.inboxCfg.created })} />
  </Row>
</Group>
{#each blocksOf('Inbox') as b (b.schema.id)}<SetSchema schema={b.schema} />{/each}

{#if picking}
  <PlacePalette kind="file" title="Файл Inbox" token="Файл Inbox" placeholder="Найти файл" recent={store.refileRecentFiles('')} onclose={() => (picking = false)}
    onpick={(x) => {
      const rel = store.files.find((y) => y.path === x.path)?.name;
      if (!rel) return 'Файл не найден';
      picking = false;
      void store.setInbox({ file: rel });
    }} />
{/if}

<style>
  .val { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; color: var(--ink2); }
  .kb { padding: 0; border: 0; background: none; color: var(--ink2); font: 12px var(--mono); }
</style>

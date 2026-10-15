<script lang="ts">
  import Switch from './Switch.svelte';
  import SchemaSettings from './SchemaSettings.svelte';
  import { store } from './store.svelte';
  import { blocksOf } from './views';

  // «Настройки → Inbox» (tech sprint 4.2, from Settings.svelte): the file, where new tasks go, the quick entry.
  // «Выбрать…» asks the sheet for its palette of files (`onpick`).
  let { onpick }: { onpick: () => void } = $props();

  const inboxPath = $derived(
    !store.inboxCfg.file ? 'Не выбран' : store.inboxCfg.file.split('/').join(' / ') + (store.inboxFile ? '' : ' — не найден'),
  );
  const inboxStates = $derived.by(() => {
    const seqs = store.inboxFile?.wf.sequences ?? store.config.workflows;
    return [...new Set(seqs.flatMap((sq) => sq.states.filter((x) => !x.done).map((x) => x.name)))];
  });
</script>

<section class="general spage" aria-label="Inbox">
  <div class="cap">ФАЙЛ</div>
  <div class="opts">
    <div class="opt">
      <span id="ib-file">Файл Inbox</span>
      <span class="ibfile">
        <span class="val" aria-labelledby="ib-file" data-testid="ib-file">{inboxPath}</span>
        <button class="btn" aria-label="Выбрать файл Inbox" onclick={onpick}>Выбрать…</button>
      </span>
    </div>
    <div class="opt">
      <label for="ib-add">Куда добавлять</label>
      <select id="ib-add" class="sel" value={store.inboxCfg.add} onchange={(e) => store.setInbox({ add: e.currentTarget.value === 'end' ? 'end' : 'top' })}>
        <option value="top">В начало файла</option>
        <option value="end">В конец файла</option>
      </select>
    </div>
  </div>
  <p class="help">Сюда попадают новые задачи; задачи, записанные в файл вручную, тоже появляются в списке. Новые задачи записываются сразу на диск, между задачами — пустая строка. В начало — после строк вроде #+TITLE, перед первой задачей. Файл свой у каждой рабочей папки.</p>

  <div class="cap">БЫСТРЫЙ ВВОД</div>
  <div class="opts">
    <div class="opt">
      <span>{store.keyHint('capture') || 'Без сочетания'} — изменить в разделе «Клавиши»</span>
      <button class="btn" onclick={() => store.showSection('Клавиши')}>Открыть…</button>
    </div>
    <div class="opt">
      <label for="ib-global">Работает из любой программы</label>
      <Switch id="ib-global" checked={store.captureGlobal} label="Работает из любой программы" onchange={() => void store.setCaptureKey(store.captureKey, !store.captureGlobal)} />
    </div>
    <div class="opt">
      <label for="ib-confirm">Показывать подтверждение «Добавлено в Inbox»</label>
      <Switch id="ib-confirm" checked={store.inboxCfg.confirm} label="Показывать подтверждение" onchange={() => store.setInbox({ confirm: !store.inboxCfg.confirm })} />
    </div>
    <div class="opt">
      <label for="ib-status">Статус новой задачи</label>
      <select id="ib-status" class="sel" value={store.inboxCfg.status ?? ''} onchange={(e) => store.setInbox({ status: e.currentTarget.value || null })}>
        <option value="">Начальный статус набора</option>
        {#each inboxStates as st (st)}<option value={st}>{st}</option>{/each}
      </select>
    </div>
    <div class="opt">
      <label for="ib-created">Записывать дату создания (:CREATED:)</label>
      <Switch id="ib-created" checked={store.inboxCfg.created} label="Записывать дату создания" onchange={() => store.setInbox({ created: !store.inboxCfg.created })} />
    </div>
  </div>
  <p class="help">Из любой программы: приложение должно быть запущено (окно можно закрыть, оно остаётся в Dock). Сочетание хранится на этом Mac.</p>

  {#each blocksOf('Inbox') as b (b.schema.id)}<SchemaSettings schema={b.schema} embedded />{/each}
</section>

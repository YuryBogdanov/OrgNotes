// The words of the sheet before tabs close with unsaved text (ТЗ 10): one file, one new note, or several tabs; with
// an `error` — the message about a failed write. The old sheet (CloseSheet.svelte) and the new one say the same.

import { inTabs } from './names';

export interface CloseItem {
  kind: 'file' | 'note';
  name: string;
}
export function closeWords(items: CloseItem[], error?: { title: string; text: string }) {
  const one = items.length === 1 ? items[0] : null;
  const hasNote = items.some((it) => it.kind === 'note');
  const title = error
    ? error.title
    : one?.kind === 'file' ? `Сохранить изменения в «${one.name}»?`
    : one ? `Сохранить заметку «${one.name}»?`
    : `Сохранить изменения в ${inTabs(items.length)}?`;
  const text = error
    ? error.text
    : one?.kind === 'note' ? 'Текст пока не записан в файл. Нажмите «Сохранить…», чтобы выбрать, куда его сохранить.'
    : 'Если не сохранить, изменения будут потеряны.' + (!one && hasNote ? ' Для новой заметки откроется «Сохранить как».' : '');
  const primary = error ? 'ОК' : one?.kind === 'file' ? 'Сохранить' : one ? 'Сохранить…' : 'Сохранить всё';
  return { title, text, primary };
}

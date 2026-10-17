// «Переименовать во всех файлах…» and «Объединить с…» (ТЗ 38 §5), apart from how they look: the new name (or, to
// merge, one of the tags there are), what is wrong with it, what changes and where; the keys. The old dialog
// (TagRename.svelte) and the new interface's sheet draw the same. (Not «tagRename»: macOS would take it for the
// component.)

import { tagsState as ts } from './tagsState.svelte';
import { bareTag, tagOk } from './tags';

export const pl = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);

export class TagRenameCtl {
  text = $state('');
  cur = $state(0);
  busy = $state(false);
  to = $derived(bareTag(this.text));
  others = $derived.by(() => ts.list.filter((t) => t.tag.toLowerCase() !== this.from.toLowerCase()));
  sugg = $derived.by(() => {
    if (!this.merge) return [];
    const q = this.to.toLowerCase();
    return this.others.filter((t) => !q || t.tag.toLowerCase().includes(q)).slice(0, 6);
  });
  exists = $derived.by(() => this.others.some((t) => t.tag.toLowerCase() === this.to.toLowerCase()));
  bad = $derived.by(() => (!!this.to && !tagOk(this.to) ? 'Только буквы, цифры, _ @ # % — без пробелов и двоеточий' : this.merge && this.to && !this.exists ? 'Выберите тег из списка' : ''));
  ok = $derived.by(() => !!this.to && !this.bad && this.to.toLowerCase() !== this.from.toLowerCase());
  preview = $derived.by(() => (this.ok ? ts.preview(this.from, this.to) : ts.preview(this.from, this.from)));

  constructor(readonly from: string, readonly merge: boolean, private onclose: () => void) {}
  go = async () => {
    if (!this.ok || this.busy) return;
    this.busy = true;
    await ts.rename(this.from, this.others.find((t) => t.tag.toLowerCase() === this.to.toLowerCase())?.tag ?? this.to);
    this.busy = false;
    this.onclose();
  };
  key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.onclose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = this.sugg[this.cur];
      if (this.merge && s && s.tag.toLowerCase() !== this.to.toLowerCase()) this.text = s.tag;
      else void this.go();
    } else if (this.merge && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      this.cur = Math.max(0, Math.min(this.sugg.length - 1, this.cur + (e.key === 'ArrowDown' ? 1 : -1)));
    }
  };
}

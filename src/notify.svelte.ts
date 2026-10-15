// The notes at the bottom of the window (tech sprint 2.1, from the store): a toast with buttons («Отменить»,
// «Вернуть»), the line about a failed write, the line of an unsaved note's bar. The store forwards to it.

import { displayName } from './names';

export type ToastAction = { label: string; run: () => void };

class Notify {
  /** «work» обновлён с диска — a status line at the bottom of the editor for 4 s. */
  toast = $state<{ text: string; n: number; actions?: { label: string; run: () => void }[]; icon?: string } | null>(null);
  /** A short note at the bottom (with buttons, e.g. «Открыть», «Отменить»); it goes after a few seconds. `icon`: an SVG
   *  path (viewBox 0 0 20 20) instead of the arrows of «обновлён с диска». */
  note(text: string, actions?: { label: string; run: () => void }[], ms = 4000, icon?: string) {
    this.toastNames = [];
    this.toast = { text, n: Date.now(), actions, icon };
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), ms);
  }
  private toastNames: string[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  /** A failed "Сохранить как…", shown in the bar of the new notes (other messages are about files). */
  draftNotice = $state('');
  private draftTimer: ReturnType<typeof setTimeout> | undefined;
  sayDraft(msg: string) {
    this.draftNotice = msg;
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => (this.draftNotice = ''), 6000);
  }
  say(msg: string) {
    this.notice = msg;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = ''), 6000);
  }
  /** Files re-read from the disk: one toast for them (the names gathered while it is shown). */
  reloaded(names: string[]) {
    this.toastNames = [...new Set([...(this.toast ? this.toastNames : []), ...names])];
    const n = this.toastNames.length;
    const files = n % 10 === 1 && n % 100 !== 11 ? 'файл' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'файла' : 'файлов';
    const text = n === 1 ? `«${displayName(this.toastNames[0])}» обновлён с диска: файл изменила другая программа` : `Обновлено с диска: ${n} ${files}`;
    this.toast = { text, n: Date.now() };
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 4000);
  }
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Why a write failed: a line at the bottom for 6 s. */
  notice = $state('');
}

export const notify = new Notify();

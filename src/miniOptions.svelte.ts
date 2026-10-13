// «Настройки → Мини-окно» (ТЗ 31 §6): kept on this Mac (localStorage, shared by both windows); applied at once — the
// native panel's opacity, pause, smoothness, place among the desktops, capture, memory of its frame through Rust.

import type { Schema, Values } from './settingsSchema';

export interface MiniSettings {
  opacity: number; // 0.1…0.9: how much of it is seen away from the pointer
  linger: number; // s: full after the last key
  smooth: boolean;
  fullscreen: boolean; // over full-screen programs, on every desktop
  hideFromCapture: boolean;
  what: 'heading' | 'file'; // ⇧⌘M opens the heading the caret is in, or its file whole
  remember: boolean; // its size and place
}
export const DEFAULT_MINI: MiniSettings = { opacity: 0.3, linger: 3, smooth: true, fullscreen: true, hideFromCapture: true, what: 'heading', remember: true };
const KEY = 'mini:settings';

export function readMini(raw: unknown): MiniSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_MINI;
  const bool = (k: keyof MiniSettings) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : (d[k] as boolean));
  const op = Math.round(Number(v.opacity) * 10) / 10;
  return {
    opacity: op >= 0.1 && op <= 0.9 ? op : d.opacity,
    linger: [1, 3, 5, 10].includes(Number(v.linger)) ? Number(v.linger) : d.linger,
    smooth: bool('smooth'),
    fullscreen: bool('fullscreen'),
    hideFromCapture: bool('hideFromCapture'),
    what: v.what === 'file' ? 'file' : 'heading',
    remember: bool('remember'),
  };
}

class Mini {
  cfg = $state<MiniSettings>(this.read());
  private read(): MiniSettings {
    try {
      return readMini(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    } catch {
      return { ...DEFAULT_MINI };
    }
  }
  set(patch: Partial<MiniSettings>) {
    this.cfg = { ...this.cfg, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.cfg));
    } catch {
      /* this time only */
    }
    void this.apply();
  }
  /** The panel takes them (and keeps them for when it is made). */
  async apply() {
    if (!('__TAURI_INTERNALS__' in window)) return;
    const { invoke } = await import('@tauri-apps/api/core');
    const c = this.cfg;
    await invoke('mini_options', { opacity: c.opacity, linger: c.linger, smooth: c.smooth, fullscreen: c.fullscreen, hideFromCapture: c.hideFromCapture, remember: c.remember }).catch(() => {});
  }
}
export const mini = new Mini();

const pct = (n: number) => ({ value: n / 10, label: `${n * 10} %` });
export const miniSchema: Schema = {
  id: 'mini',
  label: 'Мини-окно',
  values: () => mini.cfg as unknown as Values,
  set: (patch) => mini.set(patch as Partial<MiniSettings>),
  groups: [
    {
      caption: 'ПРОЗРАЧНОСТЬ',
      fields: [
        { key: 'opacity', type: 'choice', look: 'menu', where: 'local', label: 'Прозрачность', hint: 'От 10 до 90 %. Наведите курсор — окно видно полностью', options: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(pct) },
        { key: 'linger', type: 'choice', look: 'menu', where: 'local', label: 'Не гаснуть после ввода', hint: 'Пока вы печатаете, окно остаётся видимым',
          options: [[1, '1 секунда'], [3, '3 секунды'], [5, '5 секунд'], [10, '10 секунд']].map(([value, label]) => ({ value: value as number, label: label as string })) },
        { key: 'smooth', type: 'switch', where: 'local', label: 'Плавное появление и затухание' },
      ],
      help: 'Когда курсор не над окном и вы не печатаете.',
    },
    {
      caption: 'ПОВЕДЕНИЕ',
      fields: [
        { key: 'fullscreen', type: 'switch', where: 'local', label: 'Поверх полноэкранных программ', hint: 'Zoom, Meet, Keynote в полноэкранном режиме' },
        { key: 'hideFromCapture', type: 'switch', where: 'local', label: 'Скрывать от демонстрации и записи экрана', hint: 'Когда вы сами показываете экран, мини-окна не видно' },
        { key: 'what', type: 'choice', look: 'segments', where: 'local', label: 'Что открывать', hint: 'По ⇧⌘M', options: [{ value: 'heading', label: 'Текущий заголовок' }, { value: 'file', label: 'Весь файл' }] },
        { key: 'remember', type: 'switch', where: 'local', label: 'Запоминать размер и положение' },
      ],
    },
  ],
};

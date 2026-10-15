// Keyboard shortcuts (ТЗ «раздел „Клавиши“»; tech sprint 2.2, from the store): a set of defaults and the changes on
// top, on this Mac; the quick entry's and the mini window's system-wide ones. The store forwards to it.

import { bindingsOf, fromAccelerator, parseState, toAccelerator, withKeys, DEFAULT_STATE, type KeyState, type Preset } from './keys';
import { notify } from './notify.svelte';
import { lsGet, lsSet } from './storage';
import { invoke, isTauri } from './tauri';

export const DEFAULT_CAPTURE_KEY = 'Shift+CmdOrCtrl+KeyI';

/** What a feature's tab does with the keys of its scope. */
export interface ScopeKeys {
  active: () => boolean;
  run: (id: string) => boolean;
}

class Shortcuts {
  keyState = $state<KeyState>(parseState(lsGet('keys')));
  /** The registry of commands changed (a plugin turned on or off): the shortcuts again. */
  keysVersion = $state(0);
  /** Every command's shortcuts now; the quick entry's is its own setting (it is registered with the system). */
  bindings = $derived.by(() => {
    void this.keysVersion;
    const b = bindingsOf(this.keyState);
    b.set('capture', this.captureKey ? [fromAccelerator(this.captureKey)] : []);
    return b;
  });
  /** A shortcut is being recorded in the settings: the window's keys wait. */
  keyRecording = $state(false);
  /** The first shortcut of a command, for tooltips and hints («⇧⌘O»); '' if it has none. */
  keyHint(id: string) {
    return this.bindings.get(id)?.[0] ?? '';
  }
  /** «Найти далее (⌘G)», or the title alone. */
  titled(title: string, id: string) {
    const k = this.keyHint(id);
    return k ? `${title} (${k})` : title;
  }
  /** Give a command these shortcuts; the quick entry's goes to the system (an error says why it could not). */
  async setKeys(id: string, keys: string[]): Promise<string | null> {
    if (id === 'capture') return this.setCaptureKey(keys[0] ? (toAccelerator(keys[0]) ?? '') : '', this.captureGlobal);
    this.keyState = withKeys(this.keyState, id, keys);
    this.saveKeys();
    return null;
  }
  setPreset(preset: Preset) {
    this.keyState = { ...this.keyState, preset };
    this.saveKeys();
  }
  /** «Сбросить все»: the defaults of the set, the quick entry's ⇧⌘I too. */
  async resetKeys() {
    this.keyState = { ...DEFAULT_STATE, preset: this.keyState.preset };
    this.saveKeys();
    if (this.captureKey !== DEFAULT_CAPTURE_KEY) await this.setCaptureKey(DEFAULT_CAPTURE_KEY, this.captureGlobal);
  }
  saveKeys() {
    lsSet('keys', JSON.stringify(this.keyState));
  }
  /** A feature's scope of keys (keys.ts `registerScope`) runs its commands while its tab is shown (⌘1…⌘5 of a
   *  review win over the window's): set by the tab, taken away when it goes. */
  scopeKeys = new Map<string, ScopeKeys>();
  setScopeKeys(scope: string, keys: ScopeKeys | null) {
    if (keys) this.scopeKeys.set(scope, keys);
    else this.scopeKeys.delete(scope);
  }
  /** The quick entry's shortcut and whether it works from any program (a preference of this Mac). */
  captureKey = $state(lsGet('capture:key') || DEFAULT_CAPTURE_KEY);
  captureGlobal = $state(lsGet('capture:global') !== '0');
  /** Register the shortcut with the system; null, or why it could not be (taken by another program, say). */
  async applyCaptureKey(): Promise<string | null> {
    if (!isTauri) return null;
    try {
      await invoke('set_capture_shortcut', { accelerator: this.captureKey, global: this.captureGlobal });
      return null;
    } catch (e) {
      return String(e);
    }
  }
  /** The mini window's system-wide shortcut (ТЗ 31; ⌃⌥⌘M: ⌃⌥Space switches the input source on macOS), as set in
   *  «Клавиши»: registered again when it changes; one taken by another program is said. */
  private miniKeyNow: string | null = null;
  async applyMiniKey(): Promise<string | null> {
    if (!isTauri) return null;
    const accelerator = toAccelerator(this.bindings.get('miniShow')?.[0] ?? '') ?? '';
    if (accelerator === this.miniKeyNow) return null;
    this.miniKeyNow = accelerator;
    try {
      await invoke('set_mini_shortcut', { accelerator });
      return null;
    } catch (e) {
      notify.say('Сочетание мини-окна занято другой программой: ' + e);
      return String(e);
    }
  }
  /** «Мини-окно: показать»: shown with the keys in it (or the keys back to the program before). */
  toggleMini() {
    if (isTauri) void invoke('mini_toggle').catch(() => {});
  }
  async setCaptureKey(key: string, global: boolean): Promise<string | null> {
    this.captureKey = key;
    this.captureGlobal = global;
    lsSet('capture:key', key);
    lsSet('capture:global', global ? '1' : '0');
    return this.applyCaptureKey();
  }
}

export const shortcuts = new Shortcuts();

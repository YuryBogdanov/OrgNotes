// «Установить плагин по ссылке» (ТЗ 37 §8), what both shells' sheets share: a git repository of the organisation
// (https or ssh, the keys of this Mac) — «Проверить» reads its tags and the plugin in the newest one (or the default
// branch); its rights, whether it fits; installed with its link kept for updates.

import { plugins } from './api/host.svelte';
import { parseManifest, incompatible, type Manifest } from './api/manifest';
import { API_VERSION } from './api/index';
import { APP_VERSION } from './api/declare';
import { store } from './store.svelte';

interface Probe {
  refs: { head: string | null; tags: [string, string][]; branches: [string, string][] };
  ref: string;
  track: 'tag' | 'branch';
  commit: string;
  manifest: string;
}
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export class LinkInstall {
  url = $state('');
  checked = $state('');
  probing = $state(false);
  error = $state<string | null>(null);
  probe = $state<Probe | null>(null);
  updates = $state(true);
  busy = $state(false);
  m = $derived.by((): Manifest | null => {
    if (!this.probe) return null;
    try {
      const r = parseManifest(JSON.parse(this.probe.manifest));
      return r.ok ? r.manifest : null;
    } catch {
      return null;
    }
  });
  fits = $derived(this.m ? incompatible(this.m, API_VERSION, APP_VERSION) : null);
  latestTag = $derived(this.probe?.refs.tags.find(([t]) => !t.includes('-'))?.[0] ?? null);
  head = $derived(this.probe?.refs.head ?? null);
  builtin = $derived(this.m ? plugins.entries.some((e) => e.builtin && e.manifest?.id === this.m!.id) : false);
  get canInstall() {
    return !!this.probe && !!this.m && !this.fits && !this.builtin && !this.busy && !this.probing;
  }
  /** The link typed changed: what was found is not its. */
  typed() {
    if (this.probe && this.url.trim() !== this.checked) this.probe = null;
  }
  async check(ref?: string) {
    const u = this.url.trim();
    if (!u || this.probing) return;
    this.probing = true;
    this.error = null;
    if (!ref) this.probe = null;
    try {
      this.probe = await invoke<Probe>('git_probe', { url: u, ref: ref ?? null });
      this.checked = u;
      if (!this.m) this.error = 'manifest.json не разобран: проверьте его поля';
    } catch (err) {
      this.error = String(err);
      if (!ref) this.probe = null;
    } finally {
      this.probing = false;
    }
  }
  /** Installs and turns it on; true when done (the sheet closes). */
  async install(): Promise<boolean> {
    const m = this.m;
    if (!this.probe || !m || this.fits || this.busy || this.builtin) return false;
    this.busy = true;
    try {
      await invoke('plugin_install_git', { url: this.checked, ref: this.probe.ref, track: this.probe.track, checkUpdates: this.updates });
      plugins.allow(m);
      await plugins.refreshInstalled();
      const section = m.contributes.settings.find((s) => s.section)?.section;
      store.note(`«${m.name}» установлен и включён · команды — в палитре`, section ? [{ label: 'Настройки плагина', run: () => store.showSection(section as never) }] : undefined, 6000);
      return true;
    } catch (err) {
      this.error = String(err);
      return false;
    } finally {
      this.busy = false;
    }
  }
}

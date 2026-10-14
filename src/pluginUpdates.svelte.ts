// The installed plugins' versions (ТЗ 37): their updates — from the catalog (the manifest of the repository's
// default branch) or from a git link (a newer version tag, a new commit of the branch) — checked once a day and when
// «Плагины» opens; an update installed (other rights asked first), a plugin removed to the Trash.

import { SvelteMap } from 'svelte/reactivity';
import { plugins } from './api/host.svelte';
import { parseManifest, type Manifest } from './api/manifest';
import { cmpVersion, newerTag } from './api/sources';
import type { Entry } from './api/declare';
import { store } from './store.svelte';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}
const DAY = 24 * 60 * 60 * 1000;
const CHECKED_KEY = 'plugins:updatesChecked';

/** A newer version of an installed plugin: its version (a tag, or a commit of a branch), its manifest. */
export interface Update {
  version: string;
  manifest: Manifest | null;
  ref?: string;
}
interface Refs {
  head: string | null;
  tags: [string, string][];
  branches: [string, string][];
}

class PluginUpdates {
  updates = new SvelteMap<string, Update>();
  /** Being checked, installed, removed: the plugins' ids. */
  busy = new SvelteMap<string, 'check' | 'update' | 'remove'>();
  checking = $state(false);
  /** Why the last check of a plugin failed (no network, no access). */
  errors = new SvelteMap<string, string>();

  private manifestOf(text: string | null | undefined): Manifest | null {
    if (!text) return null;
    try {
      const r = parseManifest(JSON.parse(text));
      return r.ok ? r.manifest : null;
    } catch {
      return null;
    }
  }
  /** The newer version of one plugin, or null; an error is kept for its row. */
  private async checkOne(e: Entry): Promise<void> {
    const s = e.source;
    const m = e.manifest;
    if (!s || !m) return;
    const id = m.id;
    this.errors.delete(id);
    try {
      if (s.kind === 'catalog') {
        const next = this.manifestOf(await invoke<string>('catalog_raw', { repo: s.repo, file: 'manifest.json' }));
        if (next && cmpVersion(next.version, m.version) > 0) this.updates.set(id, { version: next.version, manifest: next });
        else this.updates.delete(id);
      } else if (s.checkUpdates) {
        const refs = await invoke<Refs>('git_refs', { url: s.url });
        if (s.track === 'tag') {
          const tag = newerTag(refs.tags, m.version);
          if (tag) {
            // its manifest (its rights) before it is offered
            const p = await invoke<{ manifest: string }>('git_probe', { url: s.url, ref: tag });
            this.updates.set(id, { version: tag.replace(/^v/, ''), ref: tag, manifest: this.manifestOf(p.manifest) });
          } else this.updates.delete(id);
        } else {
          const head = refs.branches.find(([b]) => b === s.ref)?.[1];
          if (head && s.commit && head !== s.commit) {
            const p = await invoke<{ manifest: string }>('git_probe', { url: s.url, ref: s.ref });
            this.updates.set(id, { version: head.slice(0, 7), ref: s.ref, manifest: this.manifestOf(p.manifest) });
          } else this.updates.delete(id);
        }
      }
    } catch (err) {
      this.errors.set(id, String(err));
    }
  }
  /** Every installed plugin with a source; `force` — now, else once a day. */
  async check(force = false) {
    plugins.updatesWaiting = () => this.updates.size > 0; // the dot by «Плагины» (here: the host is loaded by now)
    if (this.checking) return;
    let last = 0;
    try {
      last = +(localStorage.getItem(CHECKED_KEY) ?? 0);
    } catch {
      /* none */
    }
    if (!force && Date.now() - last < DAY) return;
    this.checking = true;
    try {
      await Promise.all(plugins.entries.filter((e) => !e.builtin && e.source).map((e) => this.checkOne(e)));
      localStorage.setItem(CHECKED_KEY, String(Date.now()));
    } finally {
      this.checking = false;
    }
  }
  async checkPlugin(id: string) {
    const e = plugins.entry(id);
    if (!e) return;
    this.busy.set(id, 'check');
    try {
      await this.checkOne(e);
      if (!this.updates.has(id) && !this.errors.has(id)) store.note(`«${e.manifest?.name ?? id}»: установлена последняя версия`);
    } finally {
      this.busy.delete(id);
    }
  }

  /** «Обновить · x»: other rights asked first; the plugin restarted alone. */
  async update(id: string) {
    const e = plugins.entry(id);
    const u = this.updates.get(id);
    const s = e?.source;
    if (!e?.manifest || !u || !s) return;
    if (e.enabled && u.manifest && !plugins.sameRights(u.manifest) && !(await plugins.askRights(u.manifest, u.version))) return;
    this.busy.set(id, 'update');
    try {
      if (s.kind === 'catalog') await invoke('plugin_install_release', { id, repo: s.repo, version: u.version });
      else await invoke('plugin_install_git', { url: s.url, ref: u.ref ?? s.ref, track: s.track, checkUpdates: s.checkUpdates });
      this.updates.delete(id);
      await plugins.refreshInstalled();
      store.note(`«${e.manifest.name}» обновлён до ${u.version}`);
    } catch (err) {
      store.note(`«${e.manifest.name}» не обновлён: ${err}`);
    } finally {
      this.busy.delete(id);
    }
  }
  /** «Удалить…» (asked before): off, its folder to the Trash; its data stays. */
  async remove(id: string) {
    const e = plugins.entry(id);
    if (!e || e.builtin) return;
    this.busy.set(id, 'remove');
    try {
      if (e.enabled) await plugins.setEnabled(id, false);
      await invoke('plugin_remove', { id: e.dir });
      this.updates.delete(id);
      await plugins.refreshInstalled();
      store.note(`«${e.manifest?.name ?? id}» удалён — папка в Корзине`);
    } catch (err) {
      store.note(`Не удалось удалить: ${err}`);
    } finally {
      this.busy.delete(id);
    }
  }
}

export const pluginUpdates = new PluginUpdates();

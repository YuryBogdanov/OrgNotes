// The catalog of plugins (ТЗ 37 §5–7): its list (the catalog's repository), each plugin's last manifest (the
// default branch of its own repository: its version, rights, compatibility), its README and releases; installing a
// release with its progress, «Отменить», the plugin on at once.

import { SvelteMap } from 'svelte/reactivity';
import { plugins } from './api/host.svelte';
import { parseManifest, incompatible, type Manifest } from './api/manifest';
import { API_VERSION } from './api/index';
import { APP_VERSION } from './api/declare';
import { cmpVersion } from './api/sources';
import { pluginUpdates } from './pluginUpdates.svelte';
import { store } from './store.svelte';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/** «1,1 тыс.» */
export const count = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',').replace(',0', '')} тыс.` : String(n));
/** «84 КБ» */
export const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);

export const CATEGORIES: [string, string][] = [['planning', 'Задачи и планирование'], ['view', 'Вид'], ['integrations', 'Интеграции'], ['export', 'Экспорт'], ['themes', 'Темы']];

export interface CatalogEntry {
  id: string;
  name: string;
  author: string;
  description: string;
  repo: string;
  categories: string[];
  icon?: string;
  downloads: number;
  updated: string | null;
}
export interface Release {
  tag: string;
  date: string;
  notes: string;
  size: number;
}
/** What the button of a plugin says. */
export type CatState = { kind: 'install' } | { kind: 'installed' } | { kind: 'update'; version: string } | { kind: 'old'; why: string } | { kind: 'progress'; done: number; total: number; enabling: boolean } | { kind: 'unknown' };

const str = (v: unknown) => (typeof v === 'string' ? v : '');
function readList(text: string, statsText: string | null | undefined): CatalogEntry[] {
  let stats: Record<string, { downloads?: number; updated?: string }> = {};
  try {
    stats = JSON.parse(statsText ?? '{}') ?? {};
  } catch {
    /* none */
  }
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x.id === 'string' && typeof x.repo === 'string')
    .map((x) => ({
      id: x.id, name: str(x.name) || x.id, author: str(x.author), description: str(x.description), repo: x.repo,
      categories: Array.isArray(x.categories) ? x.categories.filter((c: unknown) => typeof c === 'string') : [],
      ...(typeof x.icon === 'string' ? { icon: x.icon } : {}),
      downloads: stats[x.id]?.downloads ?? 0, updated: stats[x.id]?.updated ?? null,
    }));
}

class Catalog {
  list = $state.raw<CatalogEntry[]>([]);
  loading = $state(false);
  /** When it was read from GitHub (ms); offline — the last list kept, why GitHub did not answer. */
  fetched = $state(0);
  offline = $state<string | null>(null);
  error = $state<string | null>(null);
  repo = $state('Panopticon-Org-Notes/plugins');
  /** Each plugin's last manifest (its repository's default branch); null — not readable. */
  manifests = new SvelteMap<string, Manifest | null>();
  /** Installing: its progress; `enabling` after the files are in. */
  progress = new SvelteMap<string, { done: number; total: number; enabling: boolean }>();
  private listening = false;

  async load(force = false) {
    if (this.loading || (!force && this.fetched && Date.now() - this.fetched < 60 * 60 * 1000)) return;
    this.loading = true;
    this.error = null;
    try {
      const c = await invoke<{ plugins: string; stats: string | null; fetched: number; offline?: string; repo: string }>('catalog_fetch');
      this.list = readList(c.plugins, c.stats);
      this.fetched = c.fetched;
      this.offline = c.offline ?? null;
      this.repo = c.repo;
      if (force) this.manifests.clear();
      await Promise.all(this.list.map((e) => this.manifestOf(e)));
    } catch (err) {
      this.error = String(err);
    } finally {
      this.loading = false;
    }
  }
  async manifestOf(e: CatalogEntry): Promise<Manifest | null> {
    if (this.manifests.has(e.id)) return this.manifests.get(e.id)!;
    let m: Manifest | null;
    try {
      const r = parseManifest(JSON.parse(await invoke<string>('catalog_raw', { repo: e.repo, file: 'manifest.json' })));
      m = r.ok && r.manifest.id === e.id ? r.manifest : null;
    } catch {
      m = null;
    }
    this.manifests.set(e.id, m);
    return m;
  }
  stateOf(e: CatalogEntry): CatState {
    const p = this.progress.get(e.id);
    if (p) return { kind: 'progress', ...p };
    const m = this.manifests.get(e.id);
    const have = plugins.entries.find((x) => x.manifest?.id === e.id && !x.builtin);
    if (have?.manifest) {
      if (m && have.source?.kind === 'catalog' && cmpVersion(m.version, have.manifest.version) > 0) return { kind: 'update', version: m.version };
      return { kind: 'installed' };
    }
    if (m === undefined) return { kind: 'unknown' };
    if (m === null) return { kind: 'old', why: 'Нет манифеста' };
    const why = incompatible(m, API_VERSION, APP_VERSION);
    if (why) return { kind: 'old', why: /приложение/.test(why) ? `Нужно приложение ${m.minAppVersion}` : `Нужно API ${m.api.replace(/^[\^~]|>=/g, '')}` };
    return { kind: 'install' };
  }
  async readme(e: CatalogEntry): Promise<string> {
    return invoke<string>('catalog_raw', { repo: e.repo, file: 'README.md' });
  }
  async releases(e: CatalogEntry): Promise<Release[]> {
    const raw = JSON.parse(await invoke<string>('catalog_releases', { repo: e.repo }));
    return (Array.isArray(raw) ? raw : [])
      .filter((r) => !r.draft)
      .map((r) => ({
        tag: str(r.tag_name), date: str(r.published_at).slice(0, 10), notes: str(r.body),
        size: (r.assets ?? []).filter((a: { name: string }) => ['manifest.json', 'main.js', 'styles.css'].includes(a.name)).reduce((n: number, a: { size: number }) => n + (a.size ?? 0), 0),
      }));
  }

  private async listen() {
    if (this.listening) return;
    this.listening = true;
    try {
      const { listen } = await import('@tauri-apps/api/event');
      await listen<{ id: string; done: number; total: number }>('plugin-progress', (ev) => {
        const p = this.progress.get(ev.payload.id);
        if (p && !p.enabling) this.progress.set(ev.payload.id, { done: ev.payload.done, total: ev.payload.total, enabling: false });
      });
    } catch {
      /* no events in a browser */
    }
  }
  /** «Установить» (after the sheet of rights) or «Обновить»: the release of its last version; on at once if asked. */
  async install(e: CatalogEntry, enable: boolean) {
    const m = await this.manifestOf(e);
    if (!m || this.progress.has(e.id)) return;
    void this.listen(); // not awaited: the events come while it downloads
    const was = plugins.entries.find((x) => x.manifest?.id === e.id && !x.builtin);
    this.progress.set(e.id, { done: 0, total: 0, enabling: false });
    try {
      await invoke('plugin_install_release', { id: e.id, repo: e.repo, version: m.version });
      this.progress.set(e.id, { ...this.progress.get(e.id)!, enabling: true });
      if (enable) plugins.allow(m);
      pluginUpdates.updates.delete(e.id);
      await plugins.refreshInstalled();
      const on = plugins.entry(e.id)?.enabled;
      const section = m.contributes.settings.find((s) => s.section)?.section;
      store.note(
        was ? `«${m.name}» обновлён до ${m.version}` : on ? `«${m.name}» установлен и включён · команды — в палитре` : `«${m.name}» установлен — включите его в «Плагинах»`,
        section ? [{ label: 'Настройки плагина', run: () => store.showSection(section as never) }] : undefined,
        6000,
      );
    } catch (err) {
      if (String(err) !== 'отменено') store.note(`«${e.name}» не установлен: ${err}`);
    } finally {
      this.progress.delete(e.id);
    }
  }
  cancel(id: string) {
    void invoke('plugin_cancel', { id });
  }
}

export const catalog = new Catalog();

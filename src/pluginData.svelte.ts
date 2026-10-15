// What features keep (roadmap 0.6; tech sprint 2.2, from the store): their files in the notes folder
// (`.orgnotes/plugins/<id>.json`), their settings of this Mac, and what config.json had before. The store owns one and
// forwards to it; it gives the config as parsed and the way to change it.

import { notify } from './notify.svelte';
import { shortcuts } from './shortcuts.svelte';
import { lsDel, lsGet, lsSet } from './storage';
import { invoke, isTauri } from './tauri';

/** Where a feature keeps its settings and where they were before roadmap 0.6 (config.json). */
export interface StorageSpec {
  /** Its folder's settings as config.json had them. */
  legacy?: (parsed: any) => unknown;
  /** The keys of config.json dropped once the feature's file is written («goals», or «inbox.order» inside a key: the
   *  key goes when nothing is left in it). */
  legacyKeys?: string[];
  /** Its settings of this Mac as config.json had them. */
  localLegacy?: (parsed: any) => unknown;
  /** Its file or its settings of this Mac as written before, read in their new shape (the calendar became a plugin:
   *  its flat settings → `{ settings, data }`); the next write keeps the new one. */
  upgrade?: (v: unknown, where: 'folder' | 'local') => unknown;
}

/** A removed plugin's settings kept for «Вернуть». */
export interface PluginData {
  id: string;
  folder: unknown;
  local: string | null;
  keys: Record<string, string[]>;
}
/** What the store gives: config.json as parsed last, a change of it, the sets of statuses read again. */
export interface DataHost {
  config(): any;
  updateConfig(make: (raw: string | null) => string): Promise<boolean>;
  refresh(): void;
}

/** A key of config.json («goals») or a key in one («inbox.order»). */
function hasPath(o: any, path: string): boolean {
  const [a, b] = path.split('.');
  return !!o && typeof o === 'object' && a in o && (b === undefined || (!!o[a] && typeof o[a] === 'object' && b in o[a]));
}
function dropPath(o: any, path: string) {
  const [a, b] = path.split('.');
  if (b === undefined) return void delete o[a];
  if (!o[a] || typeof o[a] !== 'object') return;
  delete o[a][b];
  if (!Object.keys(o[a]).length) delete o[a];
}

/**
 * A feature's own settings (roadmap 0.6): what describes the files and the team's ways (the goals' sources, the
 * calendar's files) in the notes folder, `.orgnotes/plugins/<id>.json`, going along with the files; what is
 * personal on this Mac. Before 0.6 they were keys of config.json: read from there until written anew.
 */
export class PluginStore {
  private host: DataHost;
  constructor(host: DataHost) {
    this.host = host;
  }
  private storages = new Map<string, StorageSpec>();
  /** The folder's files of the features, as read (undefined: there is none yet). */
  private featureFiles = $state<Record<string, unknown>>({});
  registerStorage(id: string, o: StorageSpec = {}) {
    this.storages.set(id, o);
  }
  hasStorage(id: string) {
    return this.storages.has(id);
  }
  /** config.json still has the feature's old keys (its file is not written yet). */
  hasLegacy(id: string) {
    return (this.storages.get(id)?.legacyKeys ?? []).some((k) => hasPath(this.host.config(), k));
  }
  /** The feature's settings in the notes folder (its file, else what config.json had before 0.6). */
  folderData(id: string): unknown {
    const s = this.storages.get(id);
    if (!(id in this.featureFiles)) return s?.legacy?.(this.host.config());
    const v = this.featureFiles[id];
    return s?.upgrade ? s.upgrade(v, 'folder') : v;
  }
  async setFolderData(id: string, value: unknown): Promise<boolean> {
    const text = JSON.stringify(value, null, 2) + '\n';
    try {
      if (isTauri) await invoke('write_feature_file', { id, text });
    } catch (e) {
      notify.say('Не удалось сохранить настройки: ' + e);
      return false;
    }
    this.featureFiles = { ...this.featureFiles, [id]: value };
    this.host.refresh();
    // moved: the old keys leave config.json (the file is the place now)
    const keys = (this.storages.get(id)?.legacyKeys ?? []).filter((k) => hasPath(this.host.config(), k));
    if (keys.length)
      await this.host.updateConfig((raw) => {
        try {
          const p = raw ? JSON.parse(raw) : {};
          for (const k of keys) dropPath(p, k);
          return JSON.stringify(p, null, 2) + '\n';
        } catch {
          return raw ?? '';
        }
      });
    return true;
  }
  /** One feature's file read now (a plugin turned on after the folder was read). */
  async readFeatureFile(id: string) {
    if (!isTauri || id in this.featureFiles) return;
    try {
      const t = await invoke<string | null>('read_feature_file', { id });
      if (t !== null) this.featureFiles = { ...this.featureFiles, [id]: JSON.parse(t) };
    } catch {
      /* unreadable: as if there were none */
    }
  }
  /** Every feature's file read (the folder opened). */
  async readAll() {
    const out: Record<string, unknown> = {};
    if (isTauri)
      for (const id of this.storages.keys()) {
        try {
          const t = await invoke<string | null>('read_feature_file', { id });
          if (t !== null) out[id] = JSON.parse(t);
        } catch {
          /* unreadable: as if there were none */
        }
      }
    this.featureFiles = out;
  }
  /** The feature's personal settings on this Mac (else what `legacy` gives: config.json before 0.6). */
  localData(id: string): unknown {
    void this.localTick;
    const raw = lsGet('feature:' + id);
    const s = this.storages.get(id);
    if (raw !== null) {
      try {
        const v = JSON.parse(raw);
        return s?.upgrade ? s.upgrade(v, 'local') : v;
      } catch {
        /* the default */
      }
    }
    return s?.localLegacy?.(this.host.config());
  }
  private localTick = $state(0);
  setLocalData(id: string, value: unknown) {
    lsSet('feature:' + id, JSON.stringify(value));
    this.localTick++;
  }

  /** A plugin removed with its settings (fix of ТЗ 37): its data in the folder and on this Mac and the shortcuts given
   *  to its commands forgotten; what they were, for «Вернуть». */
  forgetPluginData(id: string): PluginData {
    const keys = Object.fromEntries(Object.entries(shortcuts.keyState.overrides).filter(([k]) => k.startsWith(id + '.')));
    const backup: PluginData = { id, folder: id in this.featureFiles ? this.featureFiles[id] : undefined, local: lsGet('feature:' + id), keys };
    if (backup.folder !== undefined) void this.setFolderData(id, {});
    lsDel('feature:' + id);
    this.localTick++;
    if (Object.keys(keys).length) {
      const overrides = { ...shortcuts.keyState.overrides };
      for (const k of Object.keys(keys)) delete overrides[k];
      shortcuts.keyState = { ...shortcuts.keyState, overrides };
      shortcuts.saveKeys();
    }
    return backup;
  }
  async restorePluginData(b: PluginData) {
    if (b.folder !== undefined) await this.setFolderData(b.id, b.folder);
    if (b.local !== null) {
      lsSet('feature:' + b.id, b.local);
      this.localTick++;
    }
    if (Object.keys(b.keys).length) {
      shortcuts.keyState = { ...shortcuts.keyState, overrides: { ...shortcuts.keyState.overrides, ...b.keys } };
      shortcuts.saveKeys();
    }
  }
}

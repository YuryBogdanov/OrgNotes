// A plugin's manifest (ТЗ 26 §3): read and checked here, pure, so the tests see every rule. What it declares the core
// registers before the plugin's code is loaded.

import type { Group } from '../settingsSchema';

export const PERMISSIONS = ['index.read', 'files.read', 'files.edit', 'clipboard', 'net', 'process'] as const;
export type Permission = (typeof PERMISSIONS)[number];
/** Never a plugin's: the core's own keys (save, close, quit, settings, undo). */
export const RESERVED_KEYS = ['⌘S', '⌘W', '⌘Q', '⌘,', '⌘Z', '⇧⌘Z'];

export interface ManifestCommand {
  id: string;
  title: string;
  keys?: string[];
  synonyms?: string[];
  /** «review»: the keys of an action of the plugin's review (work while its tab is shown). */
  scope?: 'review';
  /** From the palette it asks in the palette (`ui.choose` at once): the next step of the same window. */
  step?: boolean;
}
export interface ManifestNav {
  id: string;
  title: string;
  icon: string; // an SVG path, viewBox 0 0 20 20
  key?: string; // a command of the manifest that shows it
}
export interface ManifestView {
  id: string;
  title: string;
  icon: string;
  /** A button in the toolbar's «Открыть в панели», after the core's: the view in the second pane, or out of it. */
  toolbar?: boolean;
}
/** A section of the settings of its own, or a block in another section (`block`: its name). */
export interface ManifestSettings {
  section?: string;
  block?: string;
  icon?: string;
  groups: Group[];
}
export interface ManifestStatusSet {
  name: string;
  states: string; // «IDEA DOING | DONE»
}
export interface Manifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  api: string;
  minAppVersion?: string;
  main?: string;
  styles?: string;
  /** A built-in plugin that is off until turned on (an example). */
  defaultEnabled?: boolean;
  permissions: Permission[];
  net: string[];
  contributes: {
    commands: ManifestCommand[];
    navSections: ManifestNav[];
    views: ManifestView[];
    settings: ManifestSettings[];
    statusSets: ManifestStatusSet[];
    themes: string[];
  };
  /** Things allowed but left out (a reserved key): shown in the list of plugins. */
  warnings: string[];
}

const isStr = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

/** A version «1.2.3» (a pre-release part is ignored); null when not one. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?(?:[-+].*)?$/.exec(v.trim());
  return m ? [+m[1], +m[2], +(m[3] ?? 0)] : null;
}
const cmp = (a: [number, number, number], b: [number, number, number]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
/** Semver ranges as manifests write them: «^1.2», «~1.2.0», «>=1.0», «1.2.3», «1» (= ^1). */
export function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version);
  const r = range.trim();
  if (!v) return false;
  const m = /^(\^|~|>=)?\s*(\d+(?:\.\d+){0,2})$/.exec(r);
  if (!m) return false;
  const parts = m[2].split('.').map(Number);
  const base = [parts[0], parts[1] ?? 0, parts[2] ?? 0] as [number, number, number];
  const op = m[1] ?? (parts.length < 3 ? '^' : '=');
  if (op === '>=') return cmp(v, base) >= 0;
  if (op === '=') return cmp(v, base) === 0;
  if (cmp(v, base) < 0) return false;
  if (op === '~') return v[0] === base[0] && v[1] === base[1];
  return base[0] === 0 ? v[0] === 0 && v[1] === base[1] : v[0] === base[0]; // ^
}

/** The manifest checked: what is wrong is said in words, every problem at once. */
export function parseManifest(raw: unknown): { ok: true; manifest: Manifest } | { ok: false; problems: string[] } {
  const j = obj(raw);
  const problems: string[] = [];
  const warnings: string[] = [];
  const id = j.id;
  if (!isStr(id) || !/^[a-z0-9-]{1,64}$/.test(id)) problems.push('id — латиница в нижнем регистре, цифры и дефис, до 64 символов');
  if (!isStr(j.name)) problems.push('нет name');
  if (!isStr(j.version) || !parseVersion(j.version)) problems.push('version — номер версии, например 1.0.0');
  if (!isStr(j.api)) problems.push('нет api — диапазон версий API, например ^1.0');
  if (j.minAppVersion !== undefined && (!isStr(j.minAppVersion) || !parseVersion(j.minAppVersion))) problems.push('minAppVersion — номер версии приложения');
  const permissions = arr(j.permissions);
  for (const p of permissions) if (!(PERMISSIONS as readonly unknown[]).includes(p)) problems.push(`неизвестное право «${String(p)}»`);
  const net = arr(j.net).filter(isStr);
  if (net.length && !permissions.includes('net')) problems.push('net — хосты без права net');
  const c = obj(j.contributes);
  const ids = new Set<string>(); // per kind: a command and a view may share an id («hello.board» opens «hello.board»)
  const own = (what: string, x: unknown) => {
    if (!isStr(x)) {
      problems.push(`${what}: нет id`);
      return false;
    }
    if (isStr(id) && !x.startsWith(id + '.') && x !== id) problems.push(`${what} «${x}»: id начинается с «${id}.»`);
    if (ids.has(what + ':' + x)) problems.push(`${what} «${x}»: id повторяется`);
    ids.add(what + ':' + x);
    return true;
  };
  const commands: ManifestCommand[] = [];
  for (const x of arr(c.commands).map(obj)) {
    if (!own('команда', x.id)) continue;
    if (!isStr(x.title)) problems.push(`команда «${x.id}»: нет title`);
    const keys = arr(x.keys).filter(isStr);
    const ok = keys.filter((k) => !RESERVED_KEYS.includes(k));
    for (const k of keys) if (!ok.includes(k)) warnings.push(`${k} у «${String(x.title)}» занято приложением`);
    if (x.scope !== undefined && x.scope !== 'review') problems.push(`команда «${x.id}»: scope — только review`);
    commands.push({ id: x.id as string, title: String(x.title ?? ''), keys: ok, synonyms: arr(x.synonyms).filter(isStr), ...(x.scope === 'review' ? { scope: 'review' as const } : {}), ...(x.step === true ? { step: true } : {}) });
  }
  const navSections: ManifestNav[] = [];
  for (const x of arr(c.navSections).map(obj)) {
    if (!own('раздел', x.id)) continue;
    if (!isStr(x.title)) problems.push(`раздел «${x.id}»: нет title`);
    if (x.key !== undefined && !commands.some((k) => k.id === x.key)) problems.push(`раздел «${x.id}»: key — не команда этого плагина`);
    navSections.push({ id: x.id as string, title: String(x.title ?? ''), icon: isStr(x.icon) ? x.icon : 'M4 4h12v12H4z', key: isStr(x.key) ? x.key : undefined });
  }
  const views: ManifestView[] = [];
  for (const x of arr(c.views).map(obj)) {
    if (!own('вид', x.id)) continue;
    if (!isStr(x.title)) problems.push(`вид «${x.id}»: нет title`);
    views.push({ id: x.id as string, title: String(x.title ?? ''), icon: isStr(x.icon) ? x.icon : 'M4 4h12v12H4z', ...(x.toolbar === true ? { toolbar: true } : {}) });
  }
  const settings: ManifestSettings[] = [];
  for (const x of arr(c.settings).map(obj)) {
    if (!isStr(x.section) && !isStr(x.block)) {
      problems.push('настройки: нужен section или block');
      continue;
    }
    const groups = arr(x.groups).map(obj);
    for (const g of groups)
      for (const f of arr(g.fields).map(obj)) {
        if (!isStr(f.key) || !isStr(f.label)) problems.push('настройки: у поля нужны key и label');
        if (!['choice', 'switch', 'text', 'file', 'pair'].includes(String(f.type))) problems.push(`настройки: тип поля «${String(f.type)}»`);
        if (f.where !== 'folder' && f.where !== 'local') problems.push(`настройки «${String(f.key)}»: where — folder или local`);
      }
    settings.push({ section: isStr(x.section) ? x.section : undefined, block: isStr(x.block) ? x.block : undefined, icon: isStr(x.icon) ? x.icon : undefined, groups: groups as unknown as Group[] });
  }
  const statusSets: ManifestStatusSet[] = [];
  for (const x of arr(c.statusSets).map(obj)) {
    if (!isStr(x.name) || !isStr(x.states) || !/\|/.test(x.states)) problems.push('набор статусов: name и states вида «A B | C»');
    else statusSets.push({ name: x.name, states: x.states });
  }
  for (const t of arr(c.themes)) if (!isStr(t) || !/^[\w.-]+(\/[\w.-]+)*\.json$/.test(t) || t.split('/').includes('..')) problems.push(`тема «${String(t)}»: путь к .json внутри папки плагина`);
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    manifest: {
      id: id as string, name: j.name as string, version: j.version as string, api: j.api as string,
      description: isStr(j.description) ? j.description : undefined, author: isStr(j.author) ? j.author : undefined,
      minAppVersion: isStr(j.minAppVersion) ? j.minAppVersion : undefined,
      main: isStr(j.main) ? j.main : undefined, styles: isStr(j.styles) ? j.styles : undefined,
      defaultEnabled: typeof j.defaultEnabled === 'boolean' ? j.defaultEnabled : undefined,
      permissions: permissions as Permission[], net,
      contributes: { commands, navSections, views, settings, statusSets, themes: arr(c.themes).filter(isStr) as string[] },
      warnings,
    },
  };
}

/** Why the plugin cannot run with this app, in words; null when it can. */
export function incompatible(m: Pick<Manifest, 'api' | 'minAppVersion'>, api: string, app: string): string | null {
  if (!satisfies(api, m.api)) return `нужно API ${m.api.replace(/^[\^~]|>=/g, '')}, в приложении ${api}`;
  if (m.minAppVersion && !satisfies(app, '>=' + m.minAppVersion)) return `нужно приложение ${m.minAppVersion} или новее, установлено ${app}`;
  return null;
}

/** The host of an http(s) address (lower case, no port); null when it is not one or has a user part. */
export function hostOf(url: string): string | null {
  const m = /^https?:\/\/([^/?#]*)/i.exec(url);
  if (!m || !m[1] || m[1].includes('@')) return null;
  const host = m[1].startsWith('[') ? m[1].slice(0, m[1].indexOf(']') + 1) : m[1].split(':')[0];
  return host && /^[a-z0-9.\-[\]:]+$/i.test(host) ? host.toLowerCase() : null;
}
/** The manifest's `net` lets a plugin go to this host: the same, or «*.company.ru» for its subdomains. */
export function hostAllowed(net: string[], host: string): boolean {
  return net.some((h) => {
    const x = h.toLowerCase();
    return x.startsWith('*.') ? host.endsWith(x.slice(1)) : host === x;
  });
}

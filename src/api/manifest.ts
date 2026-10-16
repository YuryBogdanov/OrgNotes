// A plugin's manifest (ТЗ 26 §3): read and checked here, pure, so the tests see every rule. What it declares the core
// registers before the plugin's code is loaded.

import type { Group } from '../settingsSchema';

export const PERMISSIONS = ['index.read', 'index.touch', 'files.read', 'files.edit', 'clipboard', 'net', 'process'] as const;
export type Permission = (typeof PERMISSIONS)[number];
/** Never a plugin's: the core's own keys (save, close, quit, settings, undo). */
export const RESERVED_KEYS = ['⌘S', '⌘W', '⌘Q', '⌘,', '⌘Z', '⇧⌘Z'];

export interface ManifestCommand {
  id: string;
  title: string;
  keys?: string[];
  synonyms?: string[];
  /** «review»: the keys of an action of the plugin's review (work while its tab is shown); «view»: of its view of a
   *  file (work while a file tab shows it: the board's keys, 1.5). */
  scope?: 'review' | 'view';
  /** From the palette it asks in the palette (`ui.choose` at once): the next step of the same window. */
  step?: boolean;
  /** A grey line under it in «Клавиши» (1.6). */
  note?: string;
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
/** A view of a file (ТЗ 33): «Показать как ›» in a file tab's menu; `key` — the plugin's command that switches to it. */
export interface ManifestFileView {
  id: string;
  title: string;
  icon: string;
  key?: string;
}
/** A file type of the plugin (ТЗ 39, API 1.10): files with this extension are listed in the folder and opened in
 *  the plugin's file view `view`; `template` — what a new one holds, `newLabel` — the folder menu's item. */
export interface ManifestFileType {
  ext: string;
  title: string;
  icon: string;
  view: string;
  template: string;
  newLabel: string;
}
/** A block of «Сегодня» (ТЗ 32): in the settings' list of blocks; `attach` puts it under the block before it. */
export interface ManifestTodayBlock {
  id: string;
  title: string;
  hint?: string;
  attach?: boolean;
  /** A row of its own, the whole width (1.7). */
  width?: 'full';
  /** Where it goes in the order the first time: before or after a block of the screen (1.7). */
  before?: string;
  after?: string;
}
/** A place of the plugin's drawing other plugins put their pieces in (`ui.slot`; it draws them with `ui.drawSlot`).
 *  Since 1.8. */
export interface ManifestSlot {
  id: string;
  hint?: string;
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
  /** Its icon: an SVG path in 20×20, a line (the list of plugins, the catalog; ТЗ 37). */
  icon?: string;
  permissions: Permission[];
  net: string[];
  contributes: {
    commands: ManifestCommand[];
    navSections: ManifestNav[];
    views: ManifestView[];
    todayBlocks: ManifestTodayBlock[];
    fileViews: ManifestFileView[];
    fileTypes: ManifestFileType[];
    settings: ManifestSettings[];
    statusSets: ManifestStatusSet[];
    themes: string[];
    slots: ManifestSlot[];
  };
  /** The functions other plugins may call (`ctx.plugins.call`; the plugin gives them with `ctx.exports`). Since 1.8. */
  exports: string[];
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
    if (x.scope !== undefined && x.scope !== 'review' && x.scope !== 'view') problems.push(`команда «${x.id}»: scope — review или view`);
    commands.push({ id: x.id as string, title: String(x.title ?? ''), keys: ok, synonyms: arr(x.synonyms).filter(isStr), ...(x.scope === 'review' || x.scope === 'view' ? { scope: x.scope } : {}), ...(x.step === true ? { step: true } : {}), ...(isStr(x.note) && x.note ? { note: x.note } : {}) });
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
  const todayBlocks: ManifestTodayBlock[] = [];
  for (const x of arr(c.todayBlocks).map(obj)) {
    if (!own('блок', x.id)) continue;
    if (!isStr(x.title)) problems.push(`блок «${x.id}»: нет title`);
    todayBlocks.push({ id: x.id as string, title: String(x.title ?? ''), ...(isStr(x.hint) ? { hint: x.hint } : {}), ...(x.attach === true ? { attach: true } : {}), ...(x.width === 'full' ? { width: 'full' as const } : {}), ...(isStr(x.before) ? { before: x.before } : {}), ...(isStr(x.after) ? { after: x.after } : {}) });
  }
  const slots: ManifestSlot[] = [];
  for (const x of arr(c.slots).map(obj)) {
    if (!own('место', x.id)) continue;
    slots.push({ id: x.id as string, ...(isStr(x.hint) ? { hint: x.hint } : {}) });
  }
  const exports: string[] = [];
  for (const x of arr(j.exports)) {
    if (typeof x === 'string' && /^[A-Za-z_$][\w$]*$/.test(x)) exports.push(x);
    else problems.push(`exports: «${String(x)}» — имя функции`);
  }
  const fileViews: ManifestFileView[] = [];
  for (const x of arr(c.fileViews).map(obj)) {
    if (!own('вид файла', x.id)) continue;
    if (!isStr(x.title)) problems.push(`вид файла «${x.id}»: нет title`);
    if (x.key !== undefined && !commands.some((k) => k.id === x.key)) problems.push(`вид файла «${x.id}»: key — не команда этого плагина`);
    fileViews.push({ id: x.id as string, title: String(x.title ?? ''), icon: isStr(x.icon) ? x.icon : 'M4 4h12v12H4z', ...(isStr(x.key) ? { key: x.key } : {}) });
  }
  const fileTypes: ManifestFileType[] = [];
  for (const x of arr(c.fileTypes).map(obj)) {
    const ext = isStr(x.ext) ? x.ext.replace(/^\./, '').toLowerCase() : '';
    if (!/^[a-z0-9]{1,16}$/.test(ext) || ext === 'org' || ext === 'org_archive') {
      problems.push(`тип файла «${String(x.ext)}»: расширение — латинские буквы и цифры, не org`);
      continue;
    }
    if (!isStr(x.view) || !fileViews.some((v) => v.id === x.view)) {
      problems.push(`тип файла «.${ext}»: view — вид файла этого плагина`);
      continue;
    }
    const title = isStr(x.title) ? x.title : ext;
    fileTypes.push({ ext, title, icon: isStr(x.icon) ? x.icon : 'M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z', view: x.view, template: isStr(x.template) ? x.template : '', newLabel: isStr(x.newLabel) ? x.newLabel : `Новый ${title.toLowerCase()}` });
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
        if (!['choice', 'switch', 'text', 'file', 'pair', 'custom'].includes(String(f.type))) problems.push(`настройки: тип поля «${String(f.type)}»`);
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
      icon: isStr(j.icon) && /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/.test(j.icon) ? j.icon : undefined,
      permissions: permissions as Permission[], net,
      contributes: { commands, navSections, views, todayBlocks, fileViews, fileTypes, settings, statusSets, themes: arr(c.themes).filter(isStr) as string[], slots },
      exports,
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

/** A plugin's icon: its own, else its section's of the navigator, else its first tab's or file view's; none. */
export const iconOf = (m: Manifest): string | undefined => m.icon ?? m.contributes.navSections[0]?.icon ?? m.contributes.views[0]?.icon ?? m.contributes.fileViews[0]?.icon;

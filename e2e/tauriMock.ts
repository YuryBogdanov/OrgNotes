import type { Page } from '@playwright/test';

/**
 * Fake Tauri backend: an in-memory "disk" plus the same save/conflict rules and the same
 * debounced `notes-changed` event the Rust side produces, so the real save → watch → reload
 * cycle of the front end runs in a plain browser.
 */
export async function installTauriMock(page: Page, files: Record<string, string>, opts: { eventDelayMs?: number; listDelayMs?: number; today?: boolean; remind?: boolean } = {}) {
  await page.addInitScript(
    ({ files, eventDelay, listDelay, today, remind }) => {
      const w = window as any;
      // «Сегодня» (ТЗ 32) opens by itself at the start of the day: the tests of other things start as if it was shown
      if (!today) localStorage.setItem('today:shown', '4102444800000');
      // nor its reminder in the evening of a working day, unless the test asks
      if (!remind) localStorage.setItem('feature:today', JSON.stringify({ remind: false }));
      const disk: Record<string, string> = { ...files };
      const cbs: Record<number, (e: unknown) => void> = {};
      const listeners: Record<string, number> = {};
      let nid = 1;
      const folders = new Set<string>(); // explicit (possibly empty) folders, relative to /mock
      w.__disk = disk;
      w.__folders = folders;
      w.__log = [] as unknown[];
      const emit = () =>
        setTimeout(() => {
          const id = listeners['notes-changed'];
          if (id) cbs[id]({ event: 'notes-changed', id: 1, payload: null });
        }, eventDelay);
      const mtime: Record<string, number> = {};
      // another program: writes, deletes and moves files, and the watcher tells the app
      w.__setDisk = (path: string, text: string) => {
        disk[path] = text;
        mtime[path] = Date.now();
        emit();
      };
      w.__touchDisk = (path: string) => {
        mtime[path] = Date.now();
        emit();
      };
      // an event from the Rust side (e.g. `titlebar` in full screen)
      w.__emitEvent = (event: string, payload: unknown) => {
        const id = listeners[event];
        if (id) cbs[id]({ event, id: 1, payload });
      };
      w.__rmDisk = (path: string) => {
        delete disk[path];
        emit();
      };
      w.__mvDisk = (from: string, to: string) => {
        disk[to] = disk[from];
        delete disk[from];
        emit();
      };
      w.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
        transformCallback(cb: (e: unknown) => void) {
          cbs[nid] = cb;
          return nid++;
        },
        unregisterCallback(id: number) {
          delete cbs[id];
        },
        async invoke(cmd: string, args: any) {
          if (cmd === 'plugin:event|listen') {
            listeners[args.event] = args.handler;
            return 1;
          }
          if (cmd === 'plugin:event|unlisten') return;
          // the notes folder: a test can start without one (__noDir), with a remembered one that is gone (__missing),
          // or pick folders in the system dialog (__picks); files of another folder live under its own prefix
          const root = () => (w.__noDir ? null : (w.__dir ?? '/mock'));
          if (cmd === 'get_notes_dir') return root();
          if (cmd === 'notes_dir_status') return { dir: w.__missing ? null : root(), missing: w.__missing ?? null };
          if (cmd === 'retry_notes_dir') {
            if (!w.__missing) return w.__gone ? null : root();
            if (!w.__missingBack) return null;
            w.__dir = w.__missing;
            w.__missing = null;
            w.__noDir = false;
            return w.__dir;
          }
          if (cmd === 'set_notes_dir') {
            w.__dir = args.path;
            w.__noDir = false;
            w.__missing = null;
            w.__log.push(['set_dir', args.path]);
            return;
          }
          if (cmd === 'scan_folder') {
            if (w.__scanDelay) await new Promise((r) => setTimeout(r, w.__scanDelay));
            const keys = Object.keys(disk).filter((k) => k.startsWith(args.path + '/') && !k.slice(args.path.length + 1).split('/').some((x) => x.startsWith('.')));
            const dirs = new Set<string>();
            for (const k of keys) {
              const parts = k.slice(args.path.length + 1).split('/').slice(0, -1);
              parts.forEach((_, i) => dirs.add(parts.slice(0, i + 1).join('/')));
            }
            const org = keys.filter((k) => k.endsWith('.org')).length;
            const name = args.path.split('/').pop();
            return { name, path: args.path, shown: args.path.replace(/^\/Users\/[^/]+/, '~'), org, folders: dirs.size, other: keys.length - org, capped: !!w.__big, big: !!w.__big };
          }
          // own editor themes (ТЗ 25): files under /config/themes/; the save panel answers from __savePicks
          if (cmd === 'list_themes') return Object.keys(disk).filter((k) => k.startsWith('/config/themes/')).sort().map((k) => disk[k]);
          if (cmd === 'write_theme') {
            disk['/config/themes/' + args.file] = args.text;
            w.__log.push(['write_theme', args.file]);
            return;
          }
          if (cmd === 'delete_theme') {
            delete disk['/config/themes/' + args.file];
            w.__log.push(['delete_theme', args.file]);
            return;
          }
          if (cmd === 'export_text') {
            disk[args.path] = args.text;
            return;
          }
          if (cmd === 'import_text') {
            if (!(args.path in disk)) throw 'нет такого файла';
            return disk[args.path];
          }
          if (cmd === 'plugin:dialog|save') {
            w.__log.push(['save_panel', args.options]);
            return (w.__savePicks ?? []).shift() ?? null;
          }
          if (cmd === 'plugin:dialog|open') {
            w.__log.push(['pick', args.options]);
            return (w.__picks ?? []).shift() ?? null;
          }
          if (cmd === 'plugin:window|hide') {
            w.__log.push(['hide']);
            return;
          }
          if (cmd === 'plugin:window|set_fullscreen') {
            w.__log.push(['fullscreen', args.value]);
            return;
          }
          if (cmd === 'sample_notes_dir') return null;
          if (cmd === 'list_org_files') {
            // snapshot first, answer later: like a slow disk read racing with the user's typing
            if (w.__gone) throw 'unavailable'; // the folder went away while the app runs
            const r = (root() ?? '/mock') + '/';
            const snapshot = Object.entries(disk)
              .filter(([path]) => path.startsWith(r) && /\.org(_archive)?$/.test(path) && !path.slice(r.length).split('/').some((p) => p.startsWith('.')))
              .map(([path, text]) => ({ name: path.slice(r.length), path, text, mtime: mtime[path] ?? 0 }));
            if (listDelay) await new Promise((r) => setTimeout(r, listDelay));
            return snapshot;
          }
          if (cmd === 'list_org_files__old') {
            return Object.entries(disk).map(([path, text]) => ({ name: path.replace('/mock/', ''), path, text }));
          }
          if (cmd === 'save_org_file') {
            // a test can make a file unwritable: window.__failWrites = ['/mock/work.org']
            if ((w.__failWrites ?? []).includes(args.path)) throw 'нет прав на запись';
            if (disk[args.path] !== args.base) {
              w.__log.push(['conflict', args.path]);
              throw 'conflict';
            }
            await new Promise((r) => setTimeout(r, 5));
            disk[args.path] = args.text;
            w.__log.push(['save', args.path]);
            emit();
            return;
          }
          if (cmd === 'read_project_config') return disk['/mock/.orgnotes/config.json'] ?? null;
          // a feature's own settings in the notes folder (roadmap 0.6)
          // the installed plugins (roadmap 1.2): folders under /config/plugins/<dir>/
          if (cmd === 'list_plugins') {
            const dirs = [...new Set(Object.keys(disk).filter((k) => k.startsWith('/config/plugins/')).map((k) => k.split('/')[3]))].sort();
            return dirs.map((dir) => ({ dir, manifest: disk[`/config/plugins/${dir}/manifest.json`] ?? null, source: disk[`/config/plugins/${dir}/.source.json`] ?? null }));
          }
          // where plugins come from (ТЗ 37): a test's fixtures in window.__sources —
          //   catalog: { plugins, stats }, raw: { 'repo/file': text }, releases: { 'repo@version': { file: text } },
          //   git: { url: { refs, refsFor?: { ref: files } } } — files of a ref: { 'manifest.json': text, … }
          if (['catalog_fetch', 'catalog_raw', 'catalog_releases', 'plugin_install_release', 'plugin_cancel', 'plugin_remove', 'git_refs', 'git_probe', 'plugin_install_git'].includes(cmd)) {
            const src = w.__sources ?? {};
            w.__log.push([cmd, args]);
            const put = (id: string, files: Record<string, string>, source: object) => {
              for (const k of Object.keys(disk)) if (k.startsWith(`/config/plugins/${id}/`)) delete disk[k];
              for (const [f, t] of Object.entries(files)) disk[`/config/plugins/${id}/${f}`] = t;
              disk[`/config/plugins/${id}/.source.json`] = JSON.stringify(source);
              return files['manifest.json'];
            };
            const refFiles = (url: string, ref: string) => {
              const g = src.git?.[url];
              if (!g) throw 'Репозиторий не найден или нет доступа: проверьте ссылку, ключ SSH или вход в git на этом Mac';
              const files = g.refsFor?.[ref];
              if (!files) throw 'В репозитории нет manifest.json (ни в корне, ни в dist/)';
              return files as Record<string, string>;
            };
            if (cmd === 'catalog_fetch') {
              if (!src.catalog) throw 'нет связи с GitHub';
              return { plugins: JSON.stringify(src.catalog.plugins), stats: JSON.stringify(src.catalog.stats ?? {}), fetched: Date.now(), repo: 'Panopticon-Org-Notes/plugins' };
            }
            if (cmd === 'catalog_raw') {
              const t = src.raw?.[`${args.repo}/${args.file}`];
              if (t === undefined) throw 'не найдено';
              return t;
            }
            if (cmd === 'catalog_releases') return JSON.stringify(src.releaseList?.[args.repo] ?? []);
            if (cmd === 'plugin_install_release') {
              const files = src.releases?.[`${args.repo}@${args.version}`];
              if (!files) throw `нет релиза ${args.version} в ${args.repo}`;
              return put(args.id, files, { kind: 'catalog', repo: args.repo, version: args.version });
            }
            if (cmd === 'plugin_cancel') return null;
            if (cmd === 'plugin_remove') {
              const ks = Object.keys(disk).filter((k) => k.startsWith(`/config/plugins/${args.id}/`));
              if (!ks.length) throw `нет плагина «${args.id}»`;
              for (const k of ks) delete disk[k];
              return null;
            }
            if (cmd === 'git_refs') {
              if (!src.git?.[args.url]) throw 'Репозиторий не найден или нет доступа: проверьте ссылку, ключ SSH или вход в git на этом Mac';
              return src.git[args.url].refs;
            }
            if (cmd === 'git_probe') {
              const g = src.git?.[args.url];
              const refs = g?.refs ?? { head: null, tags: [], branches: [] };
              const ref = args.ref ?? refs.tags.find(([t]: [string]) => !t.includes('-'))?.[0] ?? refs.head;
              const files = refFiles(args.url, ref);
              const track = refs.tags.some(([t]: [string]) => t === ref) ? 'tag' : 'branch';
              const commit = (track === 'tag' ? refs.tags : refs.branches).find(([t]: [string]) => t === ref)?.[1] ?? '';
              return { refs, ref, track, commit, manifest: files['manifest.json'], dir: '' };
            }
            if (cmd === 'plugin_install_git') {
              const files = refFiles(args.url, args.ref);
              const m = JSON.parse(files['manifest.json']);
              const refs = src.git[args.url].refs;
              const commit = (args.track === 'tag' ? refs.tags : refs.branches).find(([t]: [string]) => t === args.ref)?.[1] ?? '';
              return put(m.id, files, { kind: 'git', url: args.url, track: args.track, ref: args.ref, commit, checkUpdates: args.checkUpdates });
            }
          }
          if (cmd === 'read_plugin_file') {
            if (String(args.file).split('/').includes('..')) throw 'a plugin reads only its own folder';
            const t = disk[`/config/plugins/${args.dir}/${args.file}`];
            if (t === undefined) throw 'No such file';
            return t;
          }
          if (cmd === 'open_plugins_folder') return null;
          // a plugin's net.fetch (roadmap 1.3): Rust checks the manifest; here the answer is the test's
          if (cmd === 'net_fetch') {
            w.__log.push(['net', args.plugin, args.method, args.url]);
            return w.__net ?? { status: 200, headers: [['content-type', 'application/json']], text: '{"ok":true}' };
          }
          if (cmd === 'read_feature_file') return disk[(root() ?? '/mock') + '/.orgnotes/plugins/' + args.id + '.json'] ?? null;
          if (cmd === 'write_feature_file') {
            disk[(root() ?? '/mock') + '/.orgnotes/plugins/' + args.id + '.json'] = args.text;
            return;
          }
          if (cmd === 'write_project_config') {
            disk['/mock/.orgnotes/config.json'] = args.text;
            emit();
            return;
          }
          if (cmd === 'list_folders') {
            if (listDelay) await new Promise((r) => setTimeout(r, listDelay));
            const out = new Set<string>(folders);
            const r = (root() ?? '/mock') + '/';
            for (const p of Object.keys(disk).filter((k) => k.startsWith(r))) {
              const parts = p.slice(r.length).split('/').slice(0, -1);
              if (parts.some((x) => x.startsWith('.'))) continue;
              parts.forEach((_, i) => out.add(parts.slice(0, i + 1).join('/')));
            }
            return [...out];
          }
          const badName = (n: string) => !n.trim() || /[/\\:]/.test(n) || n.trim().startsWith('.');
          const exists = (p: string) => p in disk || folders.has(p.replace('/mock/', '')) || Object.keys(disk).some((k) => k.startsWith(p + '/'));
          if (cmd === 'create_entry') {
            if (badName(args.name)) throw 'bad name';
            // as the app: «.org» added, unless it is there or it is an archive («platform.org_archive»)
            const n = args.isDir ? args.name.trim() : /\.org(_archive)?$/.test(args.name.trim()) ? args.name.trim() : args.name.trim() + '.org';
            const path = args.parent + '/' + n;
            if (exists(path)) throw 'exists';
            if (args.isDir) folders.add(path.replace('/mock/', ''));
            else disk[path] = '#+TITLE: ' + n.replace(/\.org$/, '') + '\n\n';
            emit();
            return path;
          }
          const relocate = (from: string, to: string) => {
            if (from in disk) {
              disk[to] = disk[from];
              delete disk[from];
            }
            for (const k of Object.keys(disk)) {
              if (k.startsWith(from + '/')) {
                disk[to + k.slice(from.length)] = disk[k];
                delete disk[k];
              }
            }
            const rel = from.replace('/mock/', '');
            const nrel = to.replace('/mock/', '');
            for (const f of [...folders]) {
              if (f === rel || f.startsWith(rel + '/')) {
                folders.delete(f);
                folders.add(nrel + f.slice(rel.length));
              }
            }
          };
          if (cmd === 'rename_entry') {
            if (badName(args.newName)) throw 'bad name';
            const isFile = args.path in disk;
            const n = isFile ? args.newName.trim().replace(/(\.org)?$/, '.org') : args.newName.trim();
            const to = args.path.slice(0, args.path.lastIndexOf('/')) + '/' + n;
            if (to !== args.path && exists(to)) throw 'exists';
            relocate(args.path, to);
            emit();
            return to;
          }
          if (cmd === 'move_entry') {
            if (args.dest === args.path || args.dest.startsWith(args.path + '/')) throw 'cannot move into itself';
            const to = args.dest + '/' + args.path.slice(args.path.lastIndexOf('/') + 1);
            if (exists(to)) throw 'exists';
            relocate(args.path, to);
            emit();
            return to;
          }
          if (cmd === 'save_new_file') {
            if (badName(args.name)) throw 'bad name';
            if (args.name.trim() === 'fail') throw 'disk full';
            const n = /\.org$/i.test(args.name.trim()) ? args.name.trim() : args.name.trim() + '.org';
            const path = args.parent + '/' + n;
            if (path in disk && !args.overwrite) throw 'exists';
            disk[path] = args.text;
            w.__log.push(['save_new', path]);
            emit();
            return path;
          }
          if (cmd === 'quit_app') {
            w.__log.push(['quit']);
            return;
          }
          if (cmd === 'trash_entry') {
            for (const k of Object.keys(disk)) if (k === args.path || k.startsWith(args.path + '/')) delete disk[k];
            folders.delete(args.path.replace('/mock/', ''));
            w.__log.push(['trash', args.path]);
            emit();
            return;
          }
          if (cmd === 'plugin:window|get_all_windows') return (w.__windows as string[]) ?? ['main'];
          if (cmd === 'plugin:webview|create_webview_window') {
            w.__log.push(['window', args.options]);
            (w.__windows ??= ['main']).push(args.options.label);
            return;
          }
          if (cmd === 'plugin:event|emit_to' || cmd === 'plugin:event|emit') {
            w.__log.push(['emit', args.target?.label ?? args.target ?? null, args.event, args.payload]);
            return null;
          }
          if (cmd.startsWith('plugin:event|')) return null;
          // the mini window (ТЗ 31): its native panel is Rust's and Swift's; here only what the page asks
          if (cmd === 'set_mini_shortcut' || cmd.startsWith('mini_')) {
            w.__log.push([cmd, args ?? null]);
            return null;
          }
          if (cmd === 'set_capture_shortcut') {
            if (w.__shortcutTaken === args.accelerator) throw 'HotKey already registered';
            w.__log.push(['shortcut', args.accelerator, args.global]);
            return null;
          }
          if (cmd === 'show_main_window') return null;
          if (cmd === 'clipboard_text') return (window as any).__clipText ?? ''; // the test sets what the clipboard holds
          if (cmd === 'plugin:opener|open_url') {
            w.__log.push(['open_url', args.url]);
            return;
          }
          if (cmd === 'plugin:opener|reveal_item_in_dir') {
            w.__log.push(['reveal', args.paths]);
            return;
          }
          throw new Error('unmocked invoke: ' + cmd);
        },
      };
    },
    { files, eventDelay: opts.eventDelayMs ?? 300, listDelay: opts.listDelayMs ?? 0, today: !!opts.today, remind: !!opts.remind },
  );
}

/** ⌘, in the main window: the settings sheet, at a section. The app must be loaded (it is waited for). */
export async function openSettingsSheet(page: import('@playwright/test').Page, section = 'Статусы') {
  const { expect } = await import('@playwright/test');
  await expect(page.locator('.toolbar, .start').first()).toBeVisible();
  await page.keyboard.press('Meta+Comma');
  await expect(page.getByRole('dialog', { name: 'Настройки' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Настройки' }).getByRole('tab', { name: section, exact: true }).click();
}

/** «Развернуть всё» in the navigator: the tree is folded by default (ТЗ 02); tests that click deep rows open it. */
export async function expandTree(page: import('@playwright/test').Page) {
  const { expect } = await import('@playwright/test');
  const b = page.getByRole('button', { name: 'Развернуть всё' });
  await expect(b).toBeVisible();
  if (await b.isEnabled()) await b.click();
}

/** The plugins are started (their commands are in the palette): the window comes first, the plugins after it. */
export async function pluginsReady(page: import('@playwright/test').Page) {
  const { expect } = await import('@playwright/test');
  // polled from here: a function given to waitForFunction must not be async (a promise is always truthy)
  await expect.poll(() => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.pluginsReady === true)).toBe(true);
}

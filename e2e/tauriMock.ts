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
      // the files' modification times: set before the start by a test (`__mtimeInit`), else 0; a write sets now
      const mtime: Record<string, number> = { ...(w.__mtimeInit ?? {}) };
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
      // ---- what the commands share ----
      // the notes folder: a test can start without one (__noDir), with a remembered one that is gone (__missing),
      // or pick folders in the system dialog (__picks); files of another folder live under its own prefix
      const root = () => (w.__noDir ? null : (w.__dir ?? '/mock'));
      // the plugins' file types (ТЗ 39): listed and kept as notes
      const isNote = (p: string) => /\.org(_archive)?$/.test(p) || ((w.__noteTypes ?? []) as string[]).some((t) => p.toLowerCase().endsWith('.' + t));
      const badName = (n: string) => !n.trim() || /[/\\:]/.test(n) || n.trim().startsWith('.');
      const exists = (p: string) => p in disk || folders.has(p.replace('/mock/', '')) || Object.keys(disk).some((k) => k.startsWith(p + '/'));
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
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      // where plugins come from (ТЗ 37): a test's fixtures in window.__sources —
      //   catalog: { plugins, stats }, raw: { 'repo/file': text }, releases: { 'repo@version': { file: text } },
      //   git: { url: { refs, refsFor?: { ref: files } } } — files of a ref: { 'manifest.json': text, … }
      const src = () => w.__sources ?? {};
      const put = (id: string, files: Record<string, string>, source: object) => {
        for (const k of Object.keys(disk)) if (k.startsWith(`/config/plugins/${id}/`)) delete disk[k];
        for (const [f, t] of Object.entries(files)) disk[`/config/plugins/${id}/${f}`] = t;
        disk[`/config/plugins/${id}/.source.json`] = JSON.stringify(source);
        return files['manifest.json'];
      };
      const NO_REPO = 'Репозиторий не найден или нет доступа: проверьте ссылку, ключ SSH или вход в git на этом Mac';
      const refFiles = (url: string, ref: string) => {
        const g = src().git?.[url];
        if (!g) throw NO_REPO;
        const files = g.refsFor?.[ref];
        if (!files) throw 'В репозитории нет manifest.json (ни в корне, ни в dist/)';
        return files as Record<string, string>;
      };

      // ---- the commands, by area ----
      const handlers: Record<string, (args: any) => unknown> = {
        // events of the Rust side
        'plugin:event|listen': (a) => ((listeners[a.event] = a.handler), 1),
        'plugin:event|unlisten': () => undefined,
        'plugin:event|emit': (a) => (w.__log.push(['emit', a.target?.label ?? a.target ?? null, a.event, a.payload]), null),
        'plugin:event|emit_to': (a) => (w.__log.push(['emit', a.target?.label ?? a.target ?? null, a.event, a.payload]), null),

        // the notes folder
        get_notes_dir: () => root(),
        notes_dir_status: () => ({ dir: w.__missing ? null : root(), missing: w.__missing ?? null }),
        retry_notes_dir: () => {
          if (!w.__missing) return w.__gone ? null : root();
          if (!w.__missingBack) return null;
          w.__dir = w.__missing;
          w.__missing = null;
          w.__noDir = false;
          return w.__dir;
        },
        set_notes_dir: (a) => {
          w.__dir = a.path;
          w.__noDir = false;
          w.__missing = null;
          w.__log.push(['set_dir', a.path]);
        },
        scan_folder: async (a) => {
          if (w.__scanDelay) await wait(w.__scanDelay);
          const keys = Object.keys(disk).filter((k) => k.startsWith(a.path + '/') && !k.slice(a.path.length + 1).split('/').some((x) => x.startsWith('.')));
          const dirs = new Set<string>();
          for (const k of keys) {
            const parts = k.slice(a.path.length + 1).split('/').slice(0, -1);
            parts.forEach((_, i) => dirs.add(parts.slice(0, i + 1).join('/')));
          }
          const org = keys.filter((k) => k.endsWith('.org')).length;
          const name = a.path.split('/').pop();
          return { name, path: a.path, shown: a.path.replace(/^\/Users\/[^/]+/, '~'), org, folders: dirs.size, other: keys.length - org, capped: !!w.__big, big: !!w.__big };
        },
        sample_notes_dir: () => null,

        // the notes: list, save, the plugins' file types
        set_note_types: (a) => ((w.__noteTypes = (a.types as string[]).map((t) => t.toLowerCase())), null),
        list_org_files: async () => {
          // snapshot first, answer later: like a slow disk read racing with the user's typing
          if (w.__gone) throw 'unavailable'; // the folder went away while the app runs
          const r = (root() ?? '/mock') + '/';
          const snapshot = Object.entries(disk)
            .filter(([path]) => path.startsWith(r) && isNote(path) && !path.slice(r.length).split('/').some((p) => p.startsWith('.')))
            .map(([path, text]) => ({ name: path.slice(r.length), path, text, mtime: mtime[path] ?? 0 }));
          if (listDelay) await wait(listDelay);
          return snapshot;
        },
        save_org_file: async (a) => {
          // a test can make a file unwritable: window.__failWrites = ['/mock/work.org']
          if ((w.__failWrites ?? []).includes(a.path)) throw 'нет прав на запись';
          if (disk[a.path] !== a.base) {
            w.__log.push(['conflict', a.path]);
            throw 'conflict';
          }
          // a slow disk when a test says so: window.__saveDelay = 150
          await wait(w.__saveDelay ?? 5);
          disk[a.path] = a.text;
          w.__log.push(['save', a.path]);
          emit();
        },
        save_new_file: (a) => {
          if (badName(a.name)) throw 'bad name';
          if (a.name.trim() === 'fail') throw 'disk full';
          const n = /\.org$/i.test(a.name.trim()) ? a.name.trim() : a.name.trim() + '.org';
          const path = a.parent + '/' + n;
          if (path in disk && !a.overwrite) throw 'exists';
          disk[path] = a.text;
          w.__log.push(['save_new', path]);
          emit();
          return path;
        },

        // folders and entries
        list_folders: async () => {
          if (listDelay) await wait(listDelay);
          const out = new Set<string>(folders);
          const r = (root() ?? '/mock') + '/';
          for (const p of Object.keys(disk).filter((k) => k.startsWith(r))) {
            const parts = p.slice(r.length).split('/').slice(0, -1);
            if (parts.some((x) => x.startsWith('.'))) continue;
            parts.forEach((_, i) => out.add(parts.slice(0, i + 1).join('/')));
          }
          return [...out];
        },
        create_entry: (a) => {
          if (badName(a.name)) throw 'bad name';
          // as the app: «.org» added, unless it is there or it is an archive («platform.org_archive»)
          const n = a.isDir ? a.name.trim() : isNote(a.name.trim()) ? a.name.trim() : a.name.trim() + '.org';
          const path = a.parent + '/' + n;
          if (exists(path)) throw 'exists';
          if (a.isDir) folders.add(path.replace('/mock/', ''));
          else disk[path] = typeof a.text === 'string' ? a.text : n.endsWith('.org') ? '#+TITLE: ' + n.replace(/\.org$/, '') + '\n\n' : '';
          emit();
          return path;
        },
        rename_entry: (a) => {
          if (badName(a.newName)) throw 'bad name';
          const isFile = a.path in disk;
          const n = isFile ? (isNote(a.newName.trim()) ? a.newName.trim() : a.newName.trim().replace(/(\.org)?$/, '.org')) : a.newName.trim();
          const to = a.path.slice(0, a.path.lastIndexOf('/')) + '/' + n;
          if (to !== a.path && exists(to)) throw 'exists';
          relocate(a.path, to);
          emit();
          return to;
        },
        move_entry: (a) => {
          if (a.dest === a.path || a.dest.startsWith(a.path + '/')) throw 'cannot move into itself';
          const to = a.dest + '/' + a.path.slice(a.path.lastIndexOf('/') + 1);
          if (exists(to)) throw 'exists';
          relocate(a.path, to);
          emit();
          return to;
        },
        trash_entry: (a) => {
          for (const k of Object.keys(disk)) if (k === a.path || k.startsWith(a.path + '/')) delete disk[k];
          folders.delete(a.path.replace('/mock/', ''));
          w.__log.push(['trash', a.path]);
          emit();
        },

        // the project config and the features' files in the notes folder (roadmap 0.6)
        read_project_config: () => disk['/mock/.orgnotes/config.json'] ?? null,
        // the agents' briefs (fix-59-1 §5)
        read_agent_file: (a) => disk[`${root() ?? '/mock'}/.orgnotes/agents/${a.name}.md`] ?? null,
        write_agent_file: (a) => {
          const p = `${root() ?? '/mock'}/.orgnotes/agents/${a.name}.md`;
          disk[p] = a.text;
          w.__log.push(['write_agent_file', a.name]);
          return p;
        },
        write_project_config: (a) => {
          disk['/mock/.orgnotes/config.json'] = a.text;
          emit();
        },
        // the touches of headings (ТЗ 40): written whole, no event (the folder's watcher does not see .orgnotes)
        read_touch_file: () => disk[(root() ?? '/mock') + '/.orgnotes/touch.json'] ?? null,
        write_touch_file: (a) => {
          disk[(root() ?? '/mock') + '/.orgnotes/touch.json'] = a.text;
        },
        read_feature_file: (a) => disk[(root() ?? '/mock') + '/.orgnotes/plugins/' + a.id + '.json'] ?? null,
        write_feature_file: (a) => {
          disk[(root() ?? '/mock') + '/.orgnotes/plugins/' + a.id + '.json'] = a.text;
        },

        // own editor themes (ТЗ 25): files under /config/themes/
        list_themes: () => Object.keys(disk).filter((k) => k.startsWith('/config/themes/')).sort().map((k) => disk[k]),
        write_theme: (a) => {
          disk['/config/themes/' + a.file] = a.text;
          w.__log.push(['write_theme', a.file]);
        },
        delete_theme: (a) => {
          delete disk['/config/themes/' + a.file];
          w.__log.push(['delete_theme', a.file]);
        },

        // the system's panels and exports: the save panel answers from __savePicks, the open panel from __picks
        'plugin:dialog|save': (a) => (w.__log.push(['save_panel', a.options]), (w.__savePicks ?? []).shift() ?? null),
        'plugin:dialog|open': (a) => (w.__log.push(['pick', a.options]), (w.__picks ?? []).shift() ?? null),
        // the panels Rust shows for an export or an import (tech sprint 5.1): logged as the plugin's were
        pick_save: (a) => (w.__log.push(['save_panel', { title: a.title, defaultPath: a.defaultName, ...(a.filter ? { filters: [a.filter] } : {}) }]), (w.__savePicks ?? []).shift() ?? null),
        pick_open: (a) => (w.__log.push(['pick', { title: a.title, ...(a.filter ? { filters: [a.filter] } : {}) }]), (w.__picks ?? []).shift() ?? null),
        export_bytes: (a) => {
          disk[a.path] = 'base64:' + a.data;
        },
        export_text: (a) => {
          disk[a.path] = a.text;
        },
        // a plugin's binary files (ТЗ 59, API 1.19): kept as «base64:…» on the mock's disk
        read_bytes: (a) => {
          const v = disk[a.path];
          if (typeof v !== 'string') throw 'not a file';
          const b64 = v.startsWith('base64:') ? v.slice(7) : btoa(unescape(encodeURIComponent(v)));
          const bin = atob(b64);
          const out = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
          return out.buffer;
        },
        write_bytes: (a) => {
          if (a.path in disk) throw 'exists';
          disk[a.path] = 'base64:' + a.data;
          w.__log.push(['write_bytes', a.path]);
          return a.path;
        },
        // a plugin's show (ТЗ 59 §9.2): the screens a test sets (`__screens`), else one
        present_screens: () => w.__screens ?? [{ x: 0, y: 0, w: 1440, h: 900, main: true }],
        present_begin: () => void w.__log.push(['present_begin']),
        present_end: () => void w.__log.push(['present_end']),
        // its PDF (§9.3): logged with the pages laid out for print
        pdf_print: (a) => {
          w.__log.push(['pdf_print', a.path, a.w, a.h, document.querySelectorAll('.pdf-pages > .pdf-page').length]);
        },
        pdf_done: () => true,
        import_text: (a) => {
          if (!(a.path in disk)) throw 'нет такого файла';
          return disk[a.path];
        },
        'plugin:opener|open_url': (a) => void w.__log.push(['open_url', a.url]),
        'plugin:opener|reveal_item_in_dir': (a) => void w.__log.push(['reveal', a.paths]),
        clipboard_text: () => w.__clipText ?? '', // the test sets what the clipboard holds
        // the font families of the Mac (ТЗ 57 §6): a few, one without Cyrillic
        font_families: () => JSON.stringify([{ name: 'Georgia', cyr: true }, { name: 'Helvetica Neue', cyr: true }, { name: 'Menlo', cyr: true }, { name: 'Zapfino', cyr: false }]),

        // the installed plugins (roadmap 1.2): folders under /config/plugins/<dir>/
        list_plugins: () => {
          const dirs = [...new Set(Object.keys(disk).filter((k) => k.startsWith('/config/plugins/')).map((k) => k.split('/')[3]))].sort();
          return dirs.map((dir) => ({ dir, manifest: disk[`/config/plugins/${dir}/manifest.json`] ?? null, source: disk[`/config/plugins/${dir}/.source.json`] ?? null }));
        },
        read_plugin_file: (a) => {
          if (String(a.file).split('/').includes('..')) throw 'a plugin reads only its own folder';
          const t = disk[`/config/plugins/${a.dir}/${a.file}`];
          if (t === undefined) throw 'No such file';
          return t;
        },
        open_plugins_folder: () => null,
        // a plugin's net.fetch (roadmap 1.3): Rust checks the manifest; here the answer is the test's
        // the terminal's processes (ТЗ 55): a pretend shell — a prompt, the input echoed, «echo …», «exit», ⌃C;
        // `__ptyOut(id, text)` puts any output, `__ptys` what is alive
        pty_spawn: (a) => {
          const id = `pty${(w.__ptyN = (w.__ptyN ?? 0) + 1)}`;
          (w.__ptys ??= {})[id] = { plugin: a.plugin, line: '', args: a };
          w.__log.push(['pty_spawn', a.plugin, a.command ?? null, a.cwd ?? null, a.cols, a.rows]);
          const out = (d: string) => setTimeout(() => w.__emitEvent('pty-data', { id, data: d }), 0);
          w.__ptyOut = (pid: string, d: string) => w.__emitEvent('pty-data', { id: pid, data: d });
          out(a.command ? `${a.command}\r\n$ ` : '$ ');
          return id;
        },
        pty_write: (a) => {
          const p = w.__ptys?.[a.id];
          if (!p) throw 'нет такого процесса';
          w.__log.push(['pty_write', a.id, a.data]);
          const send = (d: string) => w.__emitEvent('pty-data', { id: a.id, data: d });
          for (const ch of a.data as string) {
            if (ch === '\r') {
              const cmd = p.line.trim();
              p.line = '';
              if (cmd === 'exit') {
                send('\r\n');
                delete w.__ptys[a.id];
                setTimeout(() => w.__emitEvent('pty-exit', { id: a.id, code: 0 }), 0);
                return null;
              }
              send('\r\n' + (cmd.startsWith('echo ') ? cmd.slice(5) + '\r\n' : cmd ? `${cmd}: command not found\r\n` : '') + '$ ');
            } else if (ch === '\u0003') {
              p.line = '';
              send('^C\r\n$ ');
            } else if (ch === '\u007f') {
              p.line = p.line.slice(0, -1);
              send('\b \b');
            } else {
              p.line += ch;
              send(ch);
            }
          }
          return null;
        },
        pty_resize: (a) => (w.__log.push(['pty_resize', a.id, a.cols, a.rows]), null),
        pty_kill: (a) => {
          w.__log.push(['pty_kill', a.id, a.signal ?? null]);
          if (w.__ptys?.[a.id]) {
            delete w.__ptys[a.id];
            setTimeout(() => w.__emitEvent('pty-exit', { id: a.id, code: null }), 0);
          }
          return null;
        },
        pty_kill_plugin: (a) => {
          w.__log.push(['pty_kill_plugin', a.plugin]);
          for (const [id, p] of Object.entries((w.__ptys ?? {}) as Record<string, { plugin: string }>)) {
            if (p.plugin !== a.plugin) continue;
            delete w.__ptys[id];
            setTimeout(() => w.__emitEvent('pty-exit', { id, code: null }), 0);
          }
          return null;
        },
        notify_system: (a) => (w.__log.push(['notify_system', a.title, a.body, a.tag]), true),
        pty_count: () => Object.keys(w.__ptys ?? {}).length,
        net_fetch: (a) => (w.__log.push(['net', a.plugin, a.method, a.url]), w.__net ?? { status: 200, headers: [['content-type', 'application/json']], text: '{"ok":true}' }),

        // the windows, the mini window, the shortcuts
        'plugin:window|hide': () => void w.__log.push(['hide']),
        'plugin:window|set_fullscreen': (a) => void w.__log.push(['fullscreen', a.value]),
        'plugin:window|start_dragging': () => void w.__log.push(['drag']),
        'plugin:window|toggle_maximize': () => void w.__log.push(['zoom']),
        'plugin:window|minimize': () => void w.__log.push(['minimize']),
        // macOS's double click on a title bar (fix #304): the test sets it
        double_click_action: () => w.__dblAction ?? 'Maximize',
        'plugin:window|get_all_windows': () => (w.__windows as string[]) ?? ['main'],
        'plugin:webview|create_webview_window': (a) => {
          w.__log.push(['window', a.options]);
          (w.__windows ??= ['main']).push(a.options.label);
        },
        set_mini_shortcut: (a) => (w.__log.push(['set_mini_shortcut', a ?? null]), null),
        set_capture_shortcut: (a) => {
          if (w.__shortcutTaken === a.accelerator) throw 'HotKey already registered';
          w.__log.push(['shortcut', a.accelerator, a.global]);
          return null;
        },
        show_main_window: () => null,
        quit_app: () => void w.__log.push(['quit']),
      };
      // the plugins' sources (ТЗ 37): each logged with its arguments
      const sources: Record<string, (args: any) => unknown> = {
        catalog_fetch: () => {
          if (!src().catalog) throw 'нет связи с GitHub';
          return { plugins: JSON.stringify(src().catalog.plugins), stats: JSON.stringify(src().catalog.stats ?? {}), fetched: Date.now(), repo: 'Panopticon-Org-Notes/plugins' };
        },
        catalog_raw: (a) => {
          const t = src().raw?.[`${a.repo}/${a.file}`];
          if (t === undefined) throw 'не найдено';
          return t;
        },
        catalog_releases: (a) => JSON.stringify(src().releaseList?.[a.repo] ?? []),
        plugin_install_release: (a) => {
          const files = src().releases?.[`${a.repo}@${a.version}`];
          if (!files) throw `нет релиза ${a.version} в ${a.repo}`;
          return put(a.id, files, { kind: 'catalog', repo: a.repo, version: a.version });
        },
        plugin_cancel: () => null,
        plugin_remove: (a) => {
          // to the Trash: kept under /Trash/<id>/ so «Вернуть» can bring it back (a test empties it by hand)
          const ks = Object.keys(disk).filter((k) => k.startsWith(`/config/plugins/${a.id}/`));
          if (!ks.length) throw `нет плагина «${a.id}»`;
          for (const k of ks) {
            disk[`/Trash/${a.id}/` + k.slice(`/config/plugins/${a.id}/`.length)] = disk[k];
            delete disk[k];
          }
          return `/Trash/${a.id}`;
        },
        plugin_restore: (a) => {
          const ks = Object.keys(disk).filter((k) => k.startsWith(a.from + '/'));
          if (!a.from || !ks.length) throw 'Корзину уже очистили';
          for (const k of ks) {
            disk[`/config/plugins/${a.id}/` + k.slice(a.from.length + 1)] = disk[k];
            delete disk[k];
          }
          return null;
        },
        plugin_reveal: () => null,
        git_refs: (a) => {
          if (!src().git?.[a.url]) throw NO_REPO;
          return src().git[a.url].refs;
        },
        git_probe: (a) => {
          const g = src().git?.[a.url];
          const refs = g?.refs ?? { head: null, tags: [], branches: [] };
          const ref = a.ref ?? refs.tags.find(([t]: [string]) => !t.includes('-'))?.[0] ?? refs.head;
          const files = refFiles(a.url, ref);
          const track = refs.tags.some(([t]: [string]) => t === ref) ? 'tag' : 'branch';
          const commit = (track === 'tag' ? refs.tags : refs.branches).find(([t]: [string]) => t === ref)?.[1] ?? '';
          return { refs, ref, track, commit, manifest: files['manifest.json'], dir: '' };
        },
        plugin_install_git: (a) => {
          const files = refFiles(a.url, a.ref);
          const m = JSON.parse(files['manifest.json']);
          const refs = src().git[a.url].refs;
          const commit = (a.track === 'tag' ? refs.tags : refs.branches).find(([t]: [string]) => t === a.ref)?.[1] ?? '';
          return put(m.id, files, { kind: 'git', url: a.url, track: a.track, ref: a.ref, commit, checkUpdates: a.checkUpdates });
        },
      };
      for (const [name, fn] of Object.entries(sources)) handlers[name] = (args) => (w.__log.push([name, args]), fn(args));

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
          const h = handlers[cmd];
          if (h) return h(args ?? {});
          if (cmd.startsWith('plugin:event|')) return null;
          // the mini window (ТЗ 31): its native panel is Rust's and Swift's; here only what the page asks
          if (cmd.startsWith('mini_')) {
            w.__log.push([cmd, args ?? null]);
            return null;
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

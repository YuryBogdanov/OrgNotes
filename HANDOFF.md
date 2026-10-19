# HANDOFF — Panopticon (repo: OrgNotes)

Written 2026-10-11 for the next Claude account taking over. Read this first; it replaces re-reading the code history.
Feature reference (Russian, user-facing) is `README.md`; this file is how the project and the collaboration work.

## 1. What it is

A macOS-only desktop app for Org-mode notes, tasks and agendas, built by an IT manager (the user) for himself.
**Panopticon** is the app name; **OrgNotes** is the repo (github.com/YuryBogdanov/OrgNotes, private).
Stack: **Tauri 2** (Rust, `src-tauri/`) + **Svelte 5 runes** + **CodeMirror 6** (`src/`), Vite, TypeScript.
No sync, no server. `.org` files on disk are the source of truth, kept 1:1 compatible with Emacs: the app patches
text, it never re-serialises a tree. The UI is in Russian; code comments are in English.

## 2. How the user works with you

- The user writes in Russian; answer in Russian, short and concrete.
- Specs also live in the repo as `docs/NN-name.md` (e.g. «реализуй ТЗ 16-perenos-v-drugoy-fayl.md»).
- Work comes as **ТЗ (specs) in Claude Docs**, as claude.ai artifact links. Read them with the docs tools: `read`
  on `{"object":"project","id":<id>}`, then on the tab's content node. They may be updated later; re-read the
  changed parts.
- **Mockups** are on the design canvas https://claude.ai/artifact/TqT3qN5s92pZKQKcvNWNaG. Read `project/canvas.json`
  for the boards, then `project/<Board>.dc.html`. Many boards are thin wrappers (`dc-import name="Main" sec=... overlay=...`),
  so read the base file (Main / Split / SettingsPage / AgendaBuilder…) and grep for the props.
  Mockups sometimes miss parts (e.g. the Inbox list); say so and build in the style of neighbouring screens.
- **Per spec, the routine is:**
  1. Make a new branch from up-to-date `main`. Check that the previous PR is merged first.
  2. Ask 2–4 real decisions with AskUserQuestion, if any. Mark the recommended option.
  3. Implement. Add unit tests (vitest) and e2e tests (Playwright/WebKit).
  4. Take screenshots in light and dark and compare them with the mockup by eye. Screenshots catch what tests miss.
  5. Publish an **acceptance page** as an HTML artifact, styled like the earlier ones (template in §8).
  6. Open a **PR** and add the acceptance link to its body. Bind it with the ccd_pr tools.
  7. The user merges, then often says «сделай релиз» (§5).
- **In the final message**, state honestly what was not verified (e.g. native behaviour you cannot drive), and every
  deviation from the spec or the mockup.

## 3. Hard rules (learned the hard way)

- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **PR body footer:**
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Never commit `sample-notes/`.** The user's running app edits it. Around branch switches use
  `git stash -q -u -- sample-notes; git checkout …; git stash pop -q`. Add files explicitly, never `git add -A`.
- **Never kill the user's processes.** They often run `npm run tauri dev` (vite on :1420). Run e2e with `E2E_PORT=1431`.
  Never `pkill -f "tauri dev"` or kill whatever holds :1420. (This once stopped the user's dev session.)
- **Commit only after tests pass**, and only on a branch whose PR is still open.
- **Term:** «статус», never «состояние». The inspector still says «Состояние»: it is a known leftover (§9).
- **Shell rm safety check:** `rm -f $VAR/*` is blocked; use `"${VAR:?}"/…`.

## 4. Commands

```bash
npm run tauri dev                     # the app (dev). The runner wraps the binary in Panopticon-dev.app (§6)
npm run check                         # types: svelte-check (--tsgo; must be 0 errors) + tsc of the tests and e2e (tsconfig.tests.json)
npm test                              # unit tests, vitest (~435)
E2E_PORT=1431 npm run e2e             # e2e, WebKit, Tauri mocked (~626, ~4 min; three runs in a row with no flaky test since tech 0.2)
npm run test:rust                     # Rust: safe save, config, plugins, menu accelerators
E2E_PORT=1431 npm run verify          # all of the above in turn
scripts/release-mac.sh                # build + verify the signature + zip → dist-release/
```

CI (`.github/workflows/ci.yml`, macOS): on every PR and on main — `npm run check`, `npm run lint`, vitest, Playwright (WebKit in two shards; one retry, a test passed only on it is reported flaky; the waits twice as long and `budget()` of speed tests ×4 — the runners are slower; traces uploaded on failure) and `cargo test` (after `npm run build`: the crate embeds `dist`). The repository is public since tech sprint 6.1.

TypeScript: `typescript` is 6 and `@typescript/native` is 7 (an npm alias): svelte-check 4 needs both to check with TS 7 (`--tsgo`); Vite does not use tsc.

PATH needs `/opt/homebrew/bin` (node, cargo; Rust is Homebrew's, **no rustup**, so arm64 only).

## 5. Releases

- **Bump** `version` in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, then
  `npm install --package-lock-only`. The Cargo.lock updates on build.
- **Build:** `scripts/release-mac.sh`. Then unzip the result in the scratchpad with `ditto -x -k` and check
  `codesign --verify --deep --strict` and `CFBundleShortVersionString`.
- **Branch and PR:** branch `release/X.Y.Z`, commit «Release X.Y.Z», PR. Then
  `gh release create vX.Y.Z dist-release/Panopticon-X.Y.Z-macos-arm64.zip --target <full sha> --prerelease --notes-file …`.
  The notes are in Russian: what is new, how to update, and the Gatekeeper step. The user merges the PR afterwards.
- **Signing:** ad-hoc (`bundle.macOS.signingIdentity: "-"`), no Developer ID or notarisation. On another Mac it
  needs «Всё равно открыть» or `xattr -dr com.apple.quarantine /Applications/Panopticon.app`. Minimum macOS 13.
- **Releases so far:** v0.1.0 (first build, new icon), v0.1.1 (path-bar menus), v0.2.0 (Inbox), v0.3.0 (Inbox review, refile tree, drawers), v0.4.0 (rich text, date calendar), v0.5.0 (search), v0.5.1 (no accent bar with one editor), v0.6.0 (settings sheet and «Клавиши», navigator tree, promote one heading, selection), v0.7.0 (goals of the quarter, ⌥↩ in lists), v0.8.0 (the calendar), v0.9.0 (appearance and editor themes), v1.0.0 (plugins: the core and the API v1, «Настройки → Плагины», the Emacs themes as a plugin), v1.1.0 (the goals of the quarter as a plugin, API 1.1, the guide and the template of a plugin), v1.2.0 (the Inbox and the calendar as plugins, API 1.2), v1.3.0 (Org-level operations in a transaction, API 1.3; the month under the review's card follows the calendar), v1.4.0 (the mini window over other programs; «Сегодня» and «Завершить день» with the journal and the reminder; API 1.4), v1.5.0 (the board of «Канбан» as a built-in plugin, `.org_archive`, API 1.5; #103, #105, #106), v1.6.0 (actions on a task in the lists — the agenda, «Сегодня», the calendar, the board — and API 1.6; «Далее» and Enter on the review's card), v1.7.0 (links: ⌘V on a selection, ⌃C L, «Ссылка на» ⌃C ⌃L, the editor's context menu, the tooltip over a link), v1.7.1 (statuses as capsules on «Сегодня» and in «Завершить день»; the reminder by 15 minutes), v1.8.0 (the catalog of plugins — Panopticon-Org-Notes/plugins, install, update, remove — and install by a git link; API 1.7–1.8: heading properties, events, body, setTitle, full-width «Сегодня» blocks, slots, plugin exports, reschedules in LOGBOOK; «Неделя» as an outside plugin; a file tab keeps its scroll and folds), v1.8.1 (the settings in groups — the app's, «ПЛАГИНЫ», «НАСТРОЙКИ ПЛАГИНОВ» with a plugin's head; plugin commands marked in the palette), v1.9.0 (tags: the navigator's «Теги» and the tab «Тег» — И, inheritance, «часто вместе», saved as an agenda; the tags' colours and «не наследовать»; rename, merge, colour, remove in every file; ⌃C Q and the tags offered while typing; «Задачи» gone from the bar), v1.10.0 (plugin API 1.9–1.11 for «Холст» — Panopticon-Org-Notes/canvas: a view on one heading, heading menu items, plugins' own file types (.canvas), heading IDs, drag data from the lists, the save panel for exports), v1.10.1 (removing a plugin: «⋯», the dialog, «Вернуть» from the Trash; ⌘Z pressed quickly twice takes back two steps), v1.11.0 (the technical sprint: the store, the plugins' host, the components, the editor and Rust cut into modules; CI and ESLint; exports and imports only to a path chosen in the system panel; a note in a plugin's review keeps the focus through an autosave; the lists of «Сегодня» keep their keys; `readOrg` in `@panopticon/api/org`), v1.12.0 (ТЗ 40: the touches of headings — the index, API 1.12 `touched` / `lastNote` / `markReviewed` / `Tx.addNote`, the agenda's «Касание»; «Добавить заметку…» ⌃C ⌃Z; the built-in plugin «Долгие дела» — the list, the navigator, the actions, the block on «Сегодня», its settings; `commands.when`, `custom` settings fields). v1.13.0 (ТЗ 42: the new interface behind «Новый интерфейс (бета)» — the frame, «Синька», the tabs, «Оформление» and «Исходник», «Структура», find, the link card, its settings; in both shells: narrowing ⌃X N S / ⌃X N W, «Заменить…» ⌥⌘F, ⌃⌘E). v1.14.0 (ТЗ 43: the new interface's sidebar with the sections, the compatibility layer, every screen and plugin there, its own «Агенда», «Теги», «Поиск»; the alarm badge, API 1.13; the editor's grid and overlay scrollbars). The user's other
  machine is Apple Silicon.
- **Icon:** `src-tauri/icons/source.png` (designer square) → a script makes `app-icon.png` (824/1024 rounded square,
  radius 185, shadow) and `src/assets/app-icon.png` (512, welcome screen) → `npx tauri icon …` →
  `rm -rf src-tauri/icons/{android,ios}`. The exact PIL snippet is in the v0.1.0 commit (74a6edd).

## 6. Architecture map

**Frontend (`src/`)**

| File | What |
|---|---|
| `store.svelte.ts` (2.2k) | The single `Store` class (`$state` fields). Files, reload/watch, autosave (500 ms) and `save()` with conflict detection, layout, config, agendas, Inbox, quick entry, history. Most features hook in here. |
| `notify.svelte.ts`, `prefs.svelte.ts`, `themes.svelte.ts`, `storage.ts` | Split out of the store (tech sprint 2.1): the toast and the lines at the bottom (`notify`); the view preferences of this Mac — panels, widths, levels, rich text, links, drawers, find options (`prefs`); the appearance and the themes (`themes`); `lsGet`/`lsSet`/`lsDel`/`lsGetJson` (never throw). The store forwards every moved member (`store.toast`, `store.setRich`, `store.theme`…), so callers did not change; new code may import the module directly. |
| `shortcuts.svelte.ts`, `pluginData.svelte.ts`, `searchAll.svelte.ts`, `tauri.ts` | Split out of the store (tech sprint 2.2), forwarded the same way: the shortcuts, the quick entry's and the mini window's system keys, the scopes of keys (`shortcuts`); what features keep — their files in the folder, their settings of this Mac, the old keys of config.json (`PluginStore`, owned by the store: it gives the parsed config and `updateConfig`); ⇧⌘F's query, results and recent queries (`searchAll`; the store runs it on its files and opens the hits); `isTauri` and `invoke` for every module. The agendas and the Inbox stay in the store: they are the files and the layout (stage 2.4). |
| `mirror.svelte.ts` | The mini window's sync (ТЗ 31; tech sprint 2.3): `MiniSync`, owned by the store through a `MirrorHost` (its files, folder, config; what to do with an edit, a snapshot, a file from the other window). The main window `serve()`s, the mini window `load()`s; `miniNote` and `setMiniNote` are forwarded. The panes stay in the store: they are thin calls of `layout.ts`. |
| `agendaStore.svelte.ts`, `inboxStore.svelte.ts`, `refileStore.svelte.ts`, `appWindow.ts` | Owned by the store (tech sprint 2.4), each through a small host interface: the custom agendas and their builder (`AgendaStore`: `updateConfig`, `show`); the Inbox and the quick entry (`InboxStore`: files, `transaction`, `create` a file in the root); «Перенести» (`RefileStore`: files, `saveNow`, `writeAll`, `undo`, the caret after the move). `appWindow.ts`: leave full screen, hide the window. The rest of the store is its core — the files, the disk, the journal, the tabs and closing them — and stays (stage 2 ends here). |
| `org.ts` | Org parsing (`parseHeadings`, `headingLines` skips #+BEGIN blocks), workflows/sequences, `setKeyword` (CLOSED/LOGBOOK), dates, colours. |
| `edits.ts` | Text patches: planning dates, tags, refile, appendTask. |
| `outline.ts` | Editor structure commands (promote/move subtree, cycle fold, status/priority cycling). |
| `layout.ts` | Panes/tabs model (1–2 panes), serialise/restore. Agenda tabs carry `agenda` (custom agenda id). |
| `Editor.svelte` | CodeMirror setup, decorations (keywords, links shown descriptive), fold service, keymaps; compartments for undo and the structural view. `scrollPastEnd`. |
| Drawers (in `Editor.svelte`, `org.ts` `drawerRanges`) | Folded like headings via the same `foldService`; folded on open and when the app adds one (a `transactionExtender` skips typed/pasted/undone text); ⇧Tab and heading Tab leave them as they are. |
| `FindBar.svelte`, `findView.ts`, `SearchPanel.svelte`, `search.ts` | Search (ТЗ 21). ⌘F: a pane's bar (state in `Pane.svelte`) → `Editor` `find` prop → `findField` (matches over the whole file, highlight, «N в свёрнутом», scroll ticks). ⇧⌘F: `store.search` + `runSearch` (over `store.files` in memory, in portions, cancellable, cap 1000) → `SearchPanel`; a result → `store.openHit` → the pane's bar with `at`. |
| `Calendar.svelte`, `calendar.ts` | The palette's date calendar (ТЗ 20): a step with `calendar: CalSpec` (`calStep` in `commands.ts`); keys live in `Palette.svelte` (⇧/⌥⇧ + arrows, «.», ↩, ⌫). Opened on its own with `store.openCalendar` (the review's «Отложить», a date chip of «Оформленный текст»). |
| `orgRich.ts`, `rich.ts`, `RichMenu.svelte` | «Оформленный текст» (ТЗ 19, like org-modern): replaces the structural view in the `structure` compartment when `store.rich`; line decorations + widgets per visible line; lines touched by a user-placed caret (`userCaret` field) show raw text. Clicks on status/priority/date open `RichMenu` (writes via `store.patchAt`). Stage 2 (proportional font) and 3 (blocks) not built. |
| `orgIndent.ts` | «Структурный вид»: one star per level (marker widget; hidden stars stay in DOM with `display:none`), indents, atomic ranges, Backspace = level up. |
| `links.ts` | Link extraction line by line (uniorg per candidate line, cached by line text; a whole-file parse was ~9 s on 50k lines), resolution, backlinks, rewrite on rename. |
| `App.svelte` | Window shell: toolbar (grid, centred path), `NavPanel`, panes, inspector, sheets/overlays, menu actions (the menu is rebuilt from the shortcuts), the window's key handler. `#capture` hash = the quick-entry panel. |
| `NavPanel.svelte` | Navigator mode bar (Файлы, Задачи*, Агенда, Календарь, Теги*, Поиск, then the plugins' sections: Цели, Inbox; * = disabled) → `Navigator` / `AgendaList` / a plugin's section. ⌃⌘1/2/3. |
| `calIndex.ts`, `CalReview.svelte`, `CalDayList.svelte`, `calOpen.ts` | The core's part of the calendar (ТЗ 24; the calendar itself is the plugin `src/plugins/calendar`, ТЗ 29). `calIndex.ts`: dated entries of the files (scheduled, deadline, events — a timestamp in the title or under it, with `HH:MM-HH:MM`, ranges `<a>--<b>` — and the finished by CLOSED), repeats unfolded only in the days shown, cached per file text; the day order; month/week grids; exported to plugins by `@panopticon/api/org`. `CalReview.svelte` is the widget `month` under a review's card (the Inbox's): folded by default, a compact month of the dated entries in the calendar's layers and files (the plugin tells them: `ui.setMonthFilter` → `plugins.monthFilter`, #99; every entry without it), the task's cell dashed, «— эта задача» in `CalDayList` (`mark`). |
| `goals.ts`, `GoalsPanel.svelte`, `Goals.svelte`, `GoalAdd.svelte`, `GoalForm.svelte`, `textList.ts` | Goals of the quarter (ТЗ 23, part 1 of 3). A source = file + level-1 heading (`goals` in config.json, one `me`); quarters are level-2 «Квартал Q4 2026», goals level 3 (BACKLOG/ACTIVE/COMPLETED), fields level 4 «Что буду делать» / «Ожидаемый результат» / «Отметки» (`- [date] text`). Navigator mode «Цели» (⌃⌘4), a tab of kind `goals` (`goals`: source key or `*` = «Обзор квартала»), «Добавить цели», «Новая цель» (written by `insertGoal`, the quarter made if needed). «Молчит» = ACTIVE without a mark > 14 days. The set «Цели на квартал» is added to the statuses when a source or goal is added and no set knows ACTIVE. Part 2: `GoalReview.svelte`, a tab of kind `goalReview` (`path` = the person's file, `goals` = the source) — the card narrows an Editor to the goal (`folded`, `lineNote` props), marks on the right; the queue/actions are `store.goalReview*` (goals are known by quarter + title); key scope `goalReview` (⌘↩ ⌘1 ⌘2 ⌘[ ⌘]) nested over window/editor/review. Part 3: `GoalReport.svelte` (the report of the quarter, copied by `reportText` as text or Markdown), `GoalCarry.svelte` (`carryOver`: open goals under the next quarter, a deadline of the old quarter → its last day, a mark «Перенесена из …»), `goalSettings` in config.json (silent 7/14/21/30 days, soon 2/4/6/8 weeks) in «Настройки → Агенды». |
| `Navigator.svelte`, `navTree.ts` | The file tree (ТЗ 02): folded by default, an explicit set of open keys per notes folder (`nav:open:<dir>`); the path to the current file and heading opens when it changes. «Свернуть всё» keeps only that path, «Развернуть всё» opens all (headings left closed over `EXPAND_CAP` = 2000 nodes). ⌥-click / ⌥→ ⌥← on a subtree. Keys: `folder/`, file path, `path#Title › Sub` for headings. |
| `JumpBar.svelte` | Toolbar path, Xcode style; ⌃⌘J keyboard; segment menu = everything in the segment's folder (folders, separator, files); filter. |
| `Palette.svelte` + `commands.ts` + `fuzzy.ts` | Command palette (⇧⌘P), goto file (⇧⌘O), new file (⇧⌘N), `#` headings. |
| `Agenda.svelte`, `AgendaList.svelte`, `AgendaBuilder.svelte`, `agendas.ts` | Built-in agenda + custom agendas (blocks of conditions, stored in config.json); the builder is a modal sheet. `agendas.ts` is the pure engine. |
| `Picker.svelte`, `Capture.svelte`, `CaptureWindow.svelte`, `inbox.ts` | The core's part of the Inbox: where-to palette (choose file / refile), quick entry (in-window overlay and the `#capture` panel window), the quick entry's settings and writing. The section and «Разбор Inbox» are the plugin `src/plugins/inbox` (ТЗ 28). |
| `Refile.svelte`, `refile.ts` | Move a heading: file → place in a tree (ТЗ 16); `from` palette / inbox / review. |
| `themes.ts`, `appearance.ts`, `AppearanceSettings.svelte`, `colors.ts` | Appearance and editor themes (ТЗ 25, part 1 of 3). `data-appearance` on the root switches the app tokens of `app.css` (no `prefers-color-scheme` in CSS any more); «Системное» follows `matchMedia`; the native window gets `setTheme`. The editor takes `--ed-*` (bg, fg, dim, cur, sel, caret, h1–h9, date, tag, link, meta, code, hl) and statuses/tags `--p-<named>` from the theme of the current appearance (a `<style id="editor-theme">`, applied in `main.ts` before the first paint and by an effect in `App.svelte`). Choice and theme names are in localStorage (`appearance`, `theme:light`, `theme:dark`). Status colours are 8 named ones (red orange yellow green teal blue purple gray); an old pink/hex is read as the nearest (`asNamed`). Part 2: own themes are `themes/<name>.json` in the app config folder (Rust `list_themes`, `write_theme`, `delete_theme`; `export_text`/`import_text` for the save/open panels); `parseTheme`/`themeJson`/`copyOf`/`uniqueName` in `themes.ts`; `store.ownThemes`, `copyTheme`, `renameTheme`, `deleteTheme`, `exportTheme`, `importTheme`. The last own theme applied is cached in localStorage (`theme:last:<appearance>`) so it paints before the folder is read. The card menu and the delete dialog are portalled to the body (the sheet's transform). Part 3: `ThemeEditor.svelte` takes the place of the section while `store.themeEditing` is set («Оформление › Тема редактора»): rows by groups (`lowContrast` marks text < 4.5:1, headings < 3:1), levels 5–9 behind a link (inherit level 4, «Как уровень 4» in the row menu), a live example — the real `Editor` with the theme's `themeVars` on its wrapper, «Текст / Оформление». `ColorPop.svelte` is the picker (HSV field, hue, alpha for the current line and the selection, hex, the palette); it is portalled to the body. `store.setThemeColors` shows a change at once and writes the file 300 ms later; `editTheme` copies a built-in one first; `resetTheme` takes the colours of `basedOn`. |
| `Settings.svelte` + `workflowEditor.ts` | Settings: a sheet over the main window (ТЗ 22), sections in a column on the left (`store.settingsSection`, remembered). Ready: Основные, Оформление, Статусы, Агенды, Календарь, Inbox, Клавиши. Теги/Файлы are disabled. `Picker.svelte` takes `onpick` for any file setting. ⌘, toggles, ⎋/«Готово» close, ⌘[ ⌘] switch. |
| `keys.ts`, `keyDispatch.ts`, `editorKeys.ts`, `KeysSettings.svelte` | Shortcuts (ТЗ 22). `keys.ts`: the registry (id, title, group, scope, defaults of «Как в Emacs» / «Как в macOS»), presses as shown («⇧⌘O», chords «⌃C S»), accelerators, recording rules, clashes (nested scopes review⊃window, heading⊃editor don't clash). `keyDispatch.ts`: one window keydown handler (capture phase) runs everything by scope: review → editor/heading (the focused editor's commands, `editorKeys.ts`) → window; chords wait 1.5 s. The menu shows the same accelerators; WebKit gives keys to the page first, and `menuMayRun` keeps one key from running twice. New commands go into `KEY_COMMANDS` and, if in the menu, `src-tauri/tests/menu_accelerators.rs` (a vitest checks the list). |
| `Inspector.svelte`, `Outline.svelte` | Right panel: task properties / file structure. |
| `CloseSheet`, `SaveAsSheet`, `DiskSheet`, `Dialogs`, `StartScreen`, `EmptyFolder`, `ColorPicker`, `ContextMenu`, `Splitter`, `Pane` | As named. `DiskSheet` = file changed on disk (diff in `diff.ts`). |
| `menu.ts` | Native menu (Tauri). Every accelerator must also be listed in `src-tauri/tests/menu_accelerators.rs` (regenerate it with a regex over `it('…','…','ACC')`). |

**Rust (`src-tauri/src/`; tech sprint 5.2 cut `lib.rs` into modules)**
- **Modules:** `lib.rs` (the shared structs `Config`, `MiniFrame`, `AppState`, the bookmark, `run()` with the handler
  list — commands by their module path), `util.rs` (`Error`/`Res`, `lock`, `atomic_write`, `on_main`), `config.rs`,
  `notes.rs` (the folder, its watcher, scan, list, save), `files.rs`, `themes.rs`, `plugins.rs` (+ `BUILTIN_MANIFESTS`,
  net), `exchange.rs` (`pick_save`/`pick_open`, exports), `capture.rs`, `mini.rs`, `system.rs`, `titlebar.rs`,
  `plugin_sources.rs`, `tests.rs`. Each module `use super::*`; `lib.rs` globs the modules whose items others use.
- **Errors:** commands return `Res<T>` = `Result<T, Error>`; `Error::Conflict` / `Exists` reach the page as «conflict» /
  «exists» (it checks those words), `Error::Msg` as its text; `?` converts I/O, JSON, Tauri, trash, shortcut errors.
  `plugin_sources.rs` keeps `String` errors (`From<Error> for String`).
- **Commands:** notes dir status/set/retry (with a macOS bookmark so renamed folders are found), `scan_folder`,
  `list_org_files`, `save_org_file` (atomic, refuses when the disk changed under us: "conflict"), `list_folders`,
  `create/rename/move/trash_entry`, `read/write_project_config`, `save_new_file`, `quit_app`,
  `set_capture_shortcut`, `show_main_window`.
- **Watcher:** notify-debouncer emits `notes-changed` for .org files, folders and `.orgnotes/config.json`.
- **Window:** CloseRequested hides it; Dock click reopens. Vibrancy.
- **`titlebar` module:** polls every 80 ms in full screen. It hides the system title strip and emits `titlebar`
  {fullscreen, lights, menu}; the toolbar draws its own traffic lights (see §9).
- **Global shortcut:** `tauri-plugin-global-shortcut`. With the main window focused it emits `capture-here`;
  otherwise it shows the hidden `capture` window. That window hands the task to main with `capture-submit`; main
  writes it and replies `capture-result`.
- **`scripts/runner.sh`** (`build.runner`): `tauri dev` runs the binary inside `target/debug/Panopticon-dev.app`, so the
  Dock name and the Stage Manager icon are right. Any `build` is passed straight to cargo.

## 7. Storage

- **Per notes folder:** `<notes>/.orgnotes/config.json`:
  - `workflows` (status sets), `behavior` (closedTimestamp, logbook);
  - `agendas` (custom agendas);
  - `inbox` {file, status, created, add (top|end, default top), confirm}; defaults are omitted. The list's and the review's keys (order, counter, details, reviewDone, reviewCancel, reviewOrder, stale) are the plugin «inbox»'s (`.orgnotes/plugins/inbox.json` `{ settings }`), read from here until it writes them (ТЗ 28).
  Written via `store.updateConfig(raw => …)`, which re-reads the newest text first.
- **App config (Rust):** the notes dir and its bookmark, in the app config dir. Identifier `dev.local.panopticon`.
- **localStorage (per Mac):**
  - `layout:<dir>`, `lastFile:<dir>`, `saveAsDir:…`;
  - `nav:mode`, `nav:headings`, `nav:open:<dir>` (open nodes of the tree), `cal:layers`, `cal:hidden`, `inspector:tab`, `editor:levels`, `editor:drawers` ('0' = drawers open on open), `editor:rich`, `editor:richNumbers`, `find:cs`, `find:word`, `search:recent`;
  - `capture:key`, `capture:global`, `capture:draft`, `capture:file`;
  - `keys` {preset: emacs|mac, overrides: {commandId: [shortcuts]}}, `settings:section`.

## 8. Testing notes

- **e2e:** `e2e/tauriMock.ts` replaces `__TAURI_INTERNALS__`. Helpers on `window`:
  - `__disk` (path → text), `__setDisk/__rmDisk/__mvDisk/__touchDisk` (external changes + watcher event);
  - `__emitEvent(name, payload)`, `__log` (saves, emits, shortcuts…);
  - `__failWrites`, `__noDir/__missing/__picks/__big/__gone`, `__shortcutTaken`, `__windows`.

  The root is `/mock`. Fixtures: `agendaFixture.ts`, `levelsFixture.ts`, `inboxFixture.ts`.
- **WebKit quirks:**
  - A clicked `<button>` does not get focus. Listen on window, or pass the element explicitly.
  - `keyboard.type` with Cyrillic inserts text without keydown. Dispatch keydown manually (`typeKeys` in `jumpbar.spec.ts`).
  - With the structural view, `innerText` shows one star; `textContent` / `toHaveText` show the real text.
- **Async writes:** assert with `expect.poll`, not right after a click.
- **Svelte 5:** a child's props are gone after it is unmounted. Read them before calling `onclose()`.
- **Screenshots:** a throwaway `e2e/_shots.spec.ts` writes to the scratchpad; delete it after. Viewport 1440×900,
  `emulateMedia({colorScheme})`.
- **Acceptance page template:** reuse the HTML head and CSS of a previous page. Earlier ones are
  https://claude.ai/artifact/WgmAFq5R3mnnYU3kkjtusb (Inbox) and https://claude.ai/artifact/NHXjFvcW794a6xVBrhLq7b
  (heading levels); read one with the Artifact tool. Sections: «Что важно знать», «Сцены» (light/dark pairs),
  «Приёмка» (table: пункт ТЗ / Готово / чем подтверждено).
- **No access to the screen or system keys** (no Screen Recording/Accessibility for Claude). Native behaviour
  (global shortcut, full screen) cannot be verified by you; say so and ask the user to check, or ask for the
  permissions.

## 9. Open items / known issues

- **Edits and undo (roadmap 0.1):** features never write files directly: `store.transaction(label, tx => …)` (Org operations on a `HeadingRef` — `setStatus`, `setPlanning`, `setTags`, `remove`, `update`) or `store.writeAll(label, texts)`; each is a step of `Journal` (`src/journal.ts`), taken back by `store.undo(step)` (toasts) or `store.undoLast()` — the one ⌘Z outside text fields, wired in `App.svelte`. `onUndo` puts a feature's own state back (a review card, goal counters). An outside change to an open editor is its own history step (`isolateHistory`). Review actions are serialized (`inTurn`).
- **Feature modules (roadmap 0.2):** the features became plugins (the goals, the Inbox, the calendar: ТЗ 27–29); `src/features/` keeps their migrations. A feature reads its keys of config.json with `store.onConfig(fn)`, registers its sheets with `store.addSheet(() => open)`, and moves its headings with `store.refileHeading(f, h, { before, busy, done })`. The quick entry and the Inbox file setting stay in the core.
- **Shell registries (roadmap 0.3):** `src/views.ts` — `registerView` (a kind of tab: label, icon, component, crumbs, inspector, transient, fileOf, restore, single, onGone), `registerNav`, `registerSettings`; `keys.ts` — `registerKeys` (`after` places a command), `registerGroup`, `registerScope` (nesting, «Вне …» note, rank). A feature's tab keeps its state in `tab.data`; a kind nobody registers is restored as «Функция выключена» and saved back unchanged. The built-in features register in `src/features/index.ts` (imported first by `App.svelte`) and `src/features/keys.ts` (imported first by `main.ts`, so saved overrides of their keys are not dropped). A tab's keys: `store.setScopeKeys(scope, { active, run })`.
- **Review by cards (roadmap 0.4):** `CardReview.svelte` is the frame of a review (stage, card with `head` / `quick` / `body` / `below` snippets, the bar with `back` and `actions` / `barEnd`, the `summary`, `empty`); it registers the review's key scope (`scope`, `keys`). `NarrowEditor.svelte` shows one heading with its subtree (the card's body). Both reviews use them.
- **Choice of a place (roadmap 0.5):** `PlacePicker.svelte` — `variant: 'palette'` (two steps: a file, then a heading tree or `top` «1-й уровень»; `kind: 'file'` stops at the file; `plate` snippet, `recent`, `self` / `exclude`, `blocked` subtree, `onpick` returns an error text to stay open; portalled to the body) or `variant: 'columns'` (files and headings of `levels` in a sheet, `extra` «+ Создать», `move` / `focusList` for the sheet's ↑↓). Refile, Picker and GoalAdd use it.
- **Feature storage (roadmap 0.6):** a feature's settings live in the notes folder — `store.folderData(id)` / `setFolderData(id, v)` (`.orgnotes/plugins/<id>.json`, Rust `read_feature_file` / `write_feature_file`, read in `load()` before the config) — or on this Mac — `store.localData(id)` / `setLocalData` (localStorage `feature:<id>`). `registerStorage(id, { legacy, legacyKeys, localLegacy })` reads the old place in config.json until the first folder write, which drops `legacyKeys` from config.json. A feature's set of statuses is registered in memory with `registerStatusSet(id, def, when)` (marked `feature`, never written, hidden in the statuses editor). The goals and the calendar use it; the Inbox file and the quick entry stay in config.json. `legacyKeys` may name a key inside one (`inbox.order`): the outer key goes when it is empty.
- **Settings by schema (roadmap 0.6):** `src/settingsSchema.ts` — a feature describes a section as groups of fields (`choice` segments/menu, `switch`, `text`, `file`, `pair`), each with `label`, `hint` (may be a function of the values) and `where` (`folder` / `local`); `values()` / `set(patch)` are the feature's. `SchemaSettings.svelte` draws it: a section (`registerSettings({ id, icon, order, schema })`) or a block in another section (`registerSettingsBlock({ section, order, schema })`, drawn by `Settings.svelte` via `blocksOf`). Menus keep the option's type (`optValue` / `optOf`). Plugins' settings are drawn from their manifests the same way (`schemaOf` in the host).
- **Plugins API (roadmap 1.1, ТЗ 26):** `src/api/index.ts` is `@panopticon/api` (vite alias): the types and `definePlugin`. `src/api/manifest.ts` parses manifests (`parseManifest`, `satisfies`, `incompatible`). `src/api/declare.ts` (imported by `main.ts` after `features/keys`) finds the built-in manifests (`src/plugins/*/manifest.json`), reads on/off (`localStorage plugins:enabled`; built-ins on unless `defaultEnabled: false`) and registers their commands' keys before the store reads bindings. `src/api/host.svelte.ts` (`plugins`) registers what the manifests declare — nav sections (`PluginNav.svelte`), kinds of tabs (`PluginView.svelte`, state in `tab.data`, `redraw` on `ui.open`), settings schemas, palette commands (`registerAction` in views.ts), status sets — and `start()` (App onMount) activates the code with a `ctx`; `guard` turns a failing plugin off until restart and disposes everything it registered. A plugin's storage is `{ data, settings }` in `.orgnotes/plugins/<id>.json` and `feature:<id>`. Paths in the API are relative (`f.name`); `apiTx` maps them to the core's. Cut out of the host (tech sprint 3.1): `api/refs.ts` (paths and headings as the plugins see them: `fileOf`, `findHeading`, `infoOf`, `coreRef`/`apiRef`, `apiTx`), `api/query.ts` (`index.query`), `api/coreCommands.ts` (the core's commands of `commands.run`), `api/trust.ts` (the plugins let in with their rights, `RIGHTS`). Tech sprint 3.2: `api/review.svelte.ts` (`ReviewController`: the run of `ui.review`, its cards, actions, steps; `REVIEW_KIND`; the host forwards `plugins.review…`), `api/events.svelte.ts` (`events.on`, `headingChanged`), `api/pluginSettings.ts` (a plugin's `{ data, settings }`, the values with defaults, the schema the sheet draws), `api/watch.svelte.ts` (`watch`, `clone`). `teardown` and `dropLate` share `takeBack`. Tech sprint 3.3: `api/ctxData.ts` builds the ctx's namespaces that are the core's data (`index`, `files`, `edit`, `net`, `clipboard`); `ctxOf` keeps `commands`, `ui`, `settings`, `storage` — they hang on the host's state. `readOrg(ctx, path)` in `@panopticon/api/org` is the one loader of a file as Org (text, `info`, `wf`, headings) the built-in plugins share. `e2e/apiSurface.spec.ts` holds the shape of `ctx` (every right and none) against `e2e/fixtures/apiSurface.json`: a change of the API changes it on purpose — delete the file and run the test to write it anew. `src/plugins/boundary.test.ts` enforces that plugins import only `@panopticon/api`, svelte and their own files. Example: `src/plugins/hello` (off by default).
- **Plugins' sheets and review (roadmap 1.1 B):** `plugins.form` / `plugins.place` are drawn by `PluginSheets.svelte` (in App; a sheet for `sheetOpen`): the form is `SchemaSettings` with `where={false}` over local values, the place is `PlacePicker` (relative paths back). `ui.pickDate` opens the palette's calendar with kind `DATE` (no «Вставится» line) and resolves null when the palette closes unpicked. `ui.review` keeps one `plugins.review` (refs, cur, done) shown by the core's view `plugin.review` (`PluginReview.svelte`, transient); action keys are manifest commands with `"scope": "review"` in the scope `pluginReview` (declare.ts); the promise resolves at the summary or when the tab is closed.
- **Plugin loader (roadmap 1.2):** installed plugins live in `<app config dir>/plugins/<id>/` (Rust `list_plugins`, `read_plugin_file` — path checked to stay inside, `open_plugins_folder`). `declare.ts` keeps the last list on this Mac (`plugins:installed`) so their keys are declared before the store reads bindings; `plugins.start()` lists anew (`listInstalled`), then activates. Installed `main.js` is imported from a Blob (one bundled ES module, `export default { activate }`), `styles.css` becomes a `<style data-plugin>`. `plugins.setEnabled(id, on)` and `plugins.reload()` work at once: `declareAll` / `teardown` register and take back everything (keys via `declareKeys` / `undeclareKeys` + `store.keysVersion++`, which `store.bindings` reads). Overrides of plugin commands (ids with a dot) survive in `parseState` while the plugin is off. `PluginsSettings.svelte` is «Настройки → Плагины» (order 85); `Pane.svelte`'s placeholder offers «Включить» for a plugin's tab. In e2e, installed plugins are mock files under `/config/plugins/<dir>/`.
- **Plugin rights (roadmap 1.3):** a `ctx` field exists only with its right. `ctx.net.fetch` checks the host (`hostOf` / `hostAllowed` in manifest.ts) and calls Rust `net_fetch`, which reads the plugin's manifest itself (built-ins via `include_str!` in `BUILTIN_MANIFESTS` — add a new built-in plugin's manifest there) and runs `/usr/bin/curl` (30 s, 10 MB). The window has a CSP: `tauri.conf.json` (`csp`, `devCsp` with ws://localhost:1420, `dangerousDisableAssetCspModification: ["style-src"]` so inline styles keep working) and a meta in `index.html` (dev and e2e) — no `fetch` to the outside from the page. Installed plugins are let in by the sheet in `PluginSheets.svelte` (`plugins.trustReq`); the consent is kept with the rights (`plugins:trusted`), other rights at start turn the plugin off (`plugins.untrusted`). `PluginSheets` sits outside the inert `.win`, over the settings.
- **Themes as a plugin (roadmap 1.4):** `themes.ts` `BUILTIN` holds only the two Panopticon themes; the Emacs ones are `src/plugins/theme-pack` (manifest `contributes.themes` → JSON in the ТЗ 25 format). The host reads a plugin's themes (built-in: `DATA` glob of `src/plugins/*/**/*.json?raw`; installed: `read_plugin_file`) and calls `store.addThemes(id, list)` (they become `builtin: true, plugin: id`); `store.themes` = core + plugin + own. A chosen plugin theme is cached (`theme:last:<a>`) and shown until `store.pluginsReady`; turning the pack off calls `store.resetMissingThemes()`. A new built-in plugin must also be added to `BUILTIN_MANIFESTS` in plugins.rs (a test checks it).
- **Extension points for plugins with their own structure (roadmap 2.1 A, ТЗ 27 §2):** `@panopticon/api/org` (`src/api/org.ts`, vite alias; re-exports the pure Org code: parseHeadings, setKeyword, setPlanning, stampText, listEnter, insertHeading…; `workflow()` from `index.workflow(path)`). `tx.update(path, fn)` and `transaction(label, build, { onUndo })`. Form fields `textarea` / `date` (`inline` | `chip`, value «yyyy-mm-dd») / `place` (PlacePicker columns: `note`, `headNote`, `create`) / `custom` (`render(el, ctrl)`) are drawn by `FormField.svelte` under their label (`WIDE` in settingsSchema.ts); `FormSpec.onChange` and `headerExtra`; a form with wide fields is 800 px. `ui.sheet` (keys on the window: ⎋, ↩ = primary), `ui.menu` (ContextMenu), `ui.choose` (a palette step: `store.openStep`), `ui.close`. `index.statusTone` / `index.workflow`, `statusSets.set`, `commands.setAvailable` (unregisters the action while off), core command `heading.status` (the heading's file must be the tab's). In e2e wait for a plugin's command row in the palette before ↩ (the plugin starts after the window).
- **Review parts, bare sheets, widgets (roadmap 2.1 B1, ТЗ 27 §2.3, §2.5½):** `PluginReview.svelte` draws `spec.head` / `quick` / `aside` (a `use:part` action with its own effect: redrawn per card and on `plugins.reviewRedraw`), `narrow(h)` → NarrowEditor `folded` / `lineNote`, `summary(el, { …, end })`; actions have `disabled` (re-read on `plugins.reviewBar`), `sub`, `kind`. `plugins.reviewStep` awaits `spec.beforeStep` first; `done` counts distinct cards. `ui.currentReview()` → `step`, `redraw`, `update`. `ui.sheet({ bare: true })` gives only the scrim and a fixed layer (`.bare`, pointer-events on its children); the plugin draws and keys its dialog. `ui.widget(el, field, value, onChange)` mounts `FormField.svelte` (`api/widgets.svelte.ts`). The window is inert while a plugin's sheet is open.
- **The goals of the quarter are a plugin (roadmap 2.1 B2–2.2, ТЗ 27):** `src/plugins/quarter-goals/` — `plugin.svelte.ts` (activate: storage, status set `ifMissing`, events, section, view `quarter-goals.overview`, commands with `setAvailable`), `core.svelte.ts` (the files read through `index.files` / `files.read` / `index.workflow`, parsed with `@panopticon/api/org`, refreshed on `file.changed`), `state.svelte.ts` (sources, people, writes as Org-level operations of `ops.ts`: `addGoal`, `addMark`, `moveGoal`, `carryOver`, `ensureQuarter` — no `tx.update`, ТЗ 30), `actions.ts` (bare sheets `Form` / `Add` / `Report` / `Carry`; the 1-1 review on `ui.review` with `Head` / `Quick` / `Marks` / `Summary`), `styles.css` (`.greview` layout). The core migrates the old id once (`features/goalsMigration.ts`: storages `goals` → `quarter-goals` `{ data }` / `{ settings }`, layout kind alias; `keys.ts` RENAMED; `nav:mode` goals → quarter-goals). `tsconfig.json` (paths for `@panopticon/api`, tests excluded) lets svelte-check see the plugins. In e2e, `pluginsReady(page)` waits until the plugins have started.
- **Writing plugins (roadmap 2.3):** API version 1.1.0 (`API_VERSION`). The guide is `docs/plugins/README.md` (Russian; manifest, lifecycle, the whole `ctx`, rights, look, limits). The template is `templates/plugin/` (TS + Svelte, `vite.config.js` builds `dist/main.js` + `manifest.json` with styles injected; `panopticon-api.ts` must equal `src/api/index.ts` — a vitest checks it; `dist/` is ignored). `e2e/pluginTemplate.spec.ts` builds it and installs it in the mock. The settings sheet's sections are `$derived`, so a plugin turned on shows its section at once.
- **The Inbox is a plugin (roadmap 3.1 B, ТЗ 28):** `src/plugins/inbox/` — `plugin.svelte.ts` (activate: section, badge and `setAvailable` in an `$effect.root`, settings' dynamic statuses), `state.svelte.ts` (`data`: the Inbox file via `index.inbox()` + `files.read` + `index.workflow` (its `sets`, so `sequenceFor` works), the files tasks were moved to; refreshed on `file.changed` / `inbox.changed` / `folder.changed`), `session.svelte.ts` (`session`: the review on `ui.review` — its own order `next`, bar `Bar` / `More`, `Head`, `Quick`, `Summary`, the `month` widget below; actions return 'stay' and move with `currentReview().show`; writes are transactions with `onUndo`; `synced()` drops tasks gone from disk), `Panel.svelte` (the section), `list.ts` / `review.ts` (pure, with tests). The core migrates once (`features/inboxMigration.ts`: `inbox.*` keys of config.json → the plugin's storage, kind `review` alias; `keys.ts` RENAMED `navInbox`, `review`, `reviewDone`… → `inbox.*`). API 1.2.0 grew for it: `ReviewSpec.bar / barEnd / next / onClose / drawers`, `ReviewHandle.show / setItems / end` (`gen` redraws the card when another heading is at the shown index), `ui.refile { onUndo }`, `index.workflow().sets`, `index.inbox().chosen`. The card's heading follows only edits typed in the card (`Editor` `onnarrow` gets `typed`). Plugin review scopes are `alone` in keys.ts: two of them never clash.
- **Org-level operations in a transaction (roadmap 4.6, ТЗ 30; API 1.3.0):** the core's `Tx` (journal.ts) runs the operations in order on its texts in memory: `insertHeading` returns the made heading's ref (`orgOps.insertHeadingAt`: `{ under, before }` too; the last child goes before the blank lines ending its parent, `refile.place`), `ensureChild(under, title, { before })` (a direct child by title, case and spaces aside, else made), reads `headings` / `heading` / `children` / `body` (`orgOps.bodyOf`). `apiTx` maps refs back to the plugins' paths (`apiRef`) and gives `HeadingInfo` of the text now (`txInfo`). «Привет: заметка» and the goals (`quarter-goals/ops.ts`) use them. The calendar still writes with `tx.update` (event stamps in titles and ranges are its own structure: the fallback the API keeps). A heading inserted at the end of a file gets a blank line after the headings above (not after the header alone).
- **The mini window (ТЗ 31, PR A — the prototype):** the Tauri window `mini` (`index.html#mini`, `MiniWindow.svelte`) made a non-activating floating panel by the Swift package `src-tauri/swift/MiniPanel` (built by `build.rs` with `swift-rs`; `@_cdecl` functions `mini_setup` / `mini_options` / `mini_show` / `mini_hide` / `mini_is_key` / `mini_is_visible` / `mini_typed` / `mini_pin` / `mini_return_focus`, called from Rust's `mini_native` on the main thread — `on_main` runs at once when already there, a sync command or a shortcut's handler). The window's class is swapped to an `NSPanel` subclass (as tauri-nspanel does); `collectionBehavior` canJoinAllSpaces + fullScreenAuxiliary; `sharingType = .none`; the pointer by an `NSTrackingArea` view; the alpha animated in Swift. Global shortcuts go through `set_global` (each in its own slot: the quick entry's and the mini window's ⌃⌥⌘M no longer unregister each other). Build with `CARGO_TARGET_DIR` elsewhere to keep off the user's `tauri dev`.
- **The mini window (ТЗ 31, PR B1 — the note):** the mini window's store is a mirror (`store.mirror`, `loadMirror`): `mini-hello` → the main window's `mini-snapshot` (files, config, note); its edits go as `mini-edit` (from `scheduleSave` / `save` in mirror mode), the main window's changes come as `mini-file` (an `$effect.root` in `serveMini` compares with what the mini window has, `this.mini`). `store.miniNote` ({path name, line, title, whole?}, in localStorage `mini:note`, shared by both windows); ⇧⌘M (`miniOpen`) → `openInMini` → Rust `mini_open` (shows the panel, emits `mini-open`). `MiniWindow.svelte`: the `Editor` (`gutter={false}`, narrowed or whole), the root found by title near its line (or the only one of that title in another file), followed by line while edited here; ⌥↩ in the root's own lines makes the next heading after its subtree (its own key listener, `stopImmediatePropagation` before `keyHandler`); ⌘P → `MiniPalette.svelte`; window commands say «Доступно в главном окне». `Editor`'s narrowing takes a new range (`setNarrow`) when the heading's lines change from elsewhere.
- **The mini window (ТЗ 31, PR B2 — settings and keys):** «Настройки → Мини-окно» (`features/mini.ts`, order 75, before «Клавиши»; `MiniSettings.svelte` = `SchemaSettings` over `miniSchema` + a КЛАВИШИ block). The options live in `miniOptions.svelte.ts` (localStorage `mini:settings`; not `miniSettings.svelte.ts` — the name clashes with `MiniSettings.svelte` on a case-insensitive disk); `mini.apply()` → Rust `mini_options` (opacity, linger, smooth, fullscreen, hideFromCapture, remember), kept in `MINI_OPTS` and applied again when the panel is made. «Что открывать» sets `openInMini`'s default. The size and position: `Config.mini_frame`, saved on Moved/Resized of `mini`, restored if a monitor still holds it, otherwise bottom-right of the cursor's monitor. Keys: group and scope `mini` in `features/keys.ts` (`miniShow` global ⌃⌥⌘M, re-registered by an `$effect.root` in `applyMiniKey`; `miniBack` ⎋, `miniPalette` ⌘P, `miniHide` ⌘W, read by `MiniWindow.svelte` from the bindings); «Окно → Показать мини-окно». ⌘F in the mini window is the main window's FindBar over its editor.
- **«Сегодня» (ТЗ 32, PR A — the screen):** a core feature (`features/today.svelte.ts`): the view `today` (`Today.svelte`) is `pinned` (ViewSpec): `layout.pinFirst` keeps it the first tab of the left pane after any change (called in `persistLayout`), `moveTab` / `duplicateTab` refuse it, Pane draws a pin and a thicker divider. Pure logic in `today.ts` (the day starts at 4:00 — `dayOf`; `shouldShow`; the settings' readers; `taskGroups`, `overdue`, `agendaRows` over `calIndex.entriesIn`; the journal's datetree `journalDays` / `lastDay` / `focusRows` by `:ID:`; `noteLines` for the read-only note). The store's side in `todayState.svelte.ts` (`today.folder` in `.orgnotes/plugins/today.json`, `today.local` on this Mac, `today.open()`, `today.check(launch)` at launch, on coming back to the window and on the first key or click every 30 s; `today:shown` in localStorage). The blocks are a registry (`todayBlocks.ts`: `wide`, `attach`, `component`, `empty`) laid out by `arrange`; the core's draw in `Today.svelte`. «Настройки → Сегодня» (`TodaySettings.svelte`, order 5): two schemas + the chips and the blocks' order. ⇧⌘H (`today`, group СЕГОДНЯ in `features/keys.ts`), «Вид → Сегодня», the palette. The e2e mock marks it shown unless `installTauriMock(…, { today: true })`.
- **«Сегодня» (ТЗ 32, PR B — «Завершить день»):** `EndDay.svelte` (a sheet registered by `store.addSheet`, ⎋ / ⌘↩, the note in an `Editor` without gutter); the command `endDay` (no key, palette, the screen's button). Pure in `endDay.ts`: `doneOn` (CLOSED on the day), `leftOn` (SCHEDULED on it), `openTasks`, `nextWorkday`, `newId` (UUID), `writeDay` — the datetree «* 2026 › ** 2026-10 Октябрь › *** 2026-10-13 Вт», its «На завтра» (with :CREATED:), «Главное», «Сделано» put anew, the hand-written subheadings kept. `today.finishDay` is one transaction (one ⌘Z): the moves, an :ID: for every linked task without one, the journal (made first by `store.ensureFile`); then `today.toast` for 3 s. Drawn as «Оформленный текст», a plain click on a link follows it (Editor's mousedown).
- **«Сегодня» (ТЗ 32, PR C — 1-1, goals, the reminder):** `oneOnOne.ts` (pure): `oneOnOnes` — a heading with the tag (`today.folder.tag`) whose repeated stamp falls on the day; the name (#+TITLE / the file), `everyWords`, the last meeting (a child dated before today), its open tasks; `newMeeting` puts «** [date]» first with an empty line. The card is the core's block `oneOnOne` (`attach`) in `Today.svelte`; what a plugin adds to it comes from `ui.oneOnOne({ line, action })`. **API 1.4.0:** `contributes.todayBlocks` + `ui.todayBlock(id, render(el, { setHidden }))` (host: `todayRenders`, `todayHidden`, `PluginTodayBlock.svelte`; a block left out stays mounted in a hidden div so it can come back), `ui.oneOnOne`. «Цели квартала» is now the plugin's block (`quarter-goals/Today.svelte`, `todayPerson` / `oneOnOneLine` in its goals.ts); `today.blocks` merges the saved order with the blocks registered since. The reminder: `today.tick` → `remindDue` (working day, after `remindAt`, till midnight, once a day — `today:reminded`, not when the journal has the day) → Rust `remind_end_day` → Swift `Notify.swift` (UNUserNotificationCenter; only in an .app bundle — `notify_available`) ; a click → `end-day` event → the sheet. Without a bundle (`tauri dev`, e2e) the core's toast (`store.note`, now with an `icon`) asks instead. `remind_prepare` asks the permission once while the reminder is on. The e2e mock turns the reminder off unless `installTauriMock(…, { remind: true })`.
- **Действия с задачами в списках (ТЗ 34, PR A — the core and the agenda):** `taskLists.svelte.ts` — a list registers a `ListSpec` (`el`, `tab`, `selected` → a `ListTask` = HeadingRef + `dk`, the date its row stands by; `open(other)`, `clear`, `refresh`, `freeze`, `more`). `lists.active` is the list the focus went into last (the palette, a menu, the tags field keep it). Actions (`status`, `cycleStatus`, `priority`, `date`, `shiftDate`, `tags`, `copyLink`, `refile`, `pickDate`) go through `lists.apply`: a `Tx` built first, the list frozen, its texts noted in `lists.own` (not a change from outside), then `store.writeAll` — a journal step pushed on the lists' own stack (⌘Z in a list → `lists.undo`); the toast `ListToast.svelte` (6 s). The keys: scope `list` (alone, over window/editor/heading; group «ЗАДАЧИ В СПИСКАХ» in `features/keys.ts`; `refusal` lets ↩ ⎋ ⇧+arrows be recorded there), run by `lists.run` while the focus is in a list. The menu (`menuItems`; ContextMenu got `capsule`, `width`, `tall`, `subWidth`) and the tags field live in `TaskListHost.svelte` (App). The palette: `commands.ts` `Ctx.task` + `taskCommands` («ВЫДЕЛЕННАЯ ЗАДАЧА», a grey `note` after the group's header), the heading steps write through `Ctx.act` (`HeadingAct`; `editorAct` by default). The inspector shows `lists.forTab(store.tab)` and writes through its `act`. The agenda: a click chooses, double click / ↩ open in the neighbour, ⌥↩ here; rows keyed by path + title + n (not by line); `frozen` keeps the rows of before the first change, drawn with the values of now (`staleOf`: dimmed, struck when done) until ⌘R, another agenda or day, a new tab, or a change not in `lists.own`.
- **Действия с задачами в списках (ТЗ 34, PR B — «Сегодня»):** the rows of all the blocks are one list (`today:<pane>`): rows carry `data-k` = block + path + title + n; ↑ ↓ go over `[data-k]` in the screen's order and focus the row's button; a click chooses, a double click / ↩ open in a tab here, ⌥↩ in the neighbour. `shownRows` overlays the frozen rows of «Агенда на сегодня», «Задачи», «Просрочено» (`.stale`, `.gone` when done); «Главное» keeps its rows by ID anyway. The box of «Главное» and the chips of «Просрочено» still write at once (not through the lists: a change from outside, so the list refreshes). The navigator's «Задачи» does not exist yet: it will register as a list when made.
- **Действия с задачами в списках (ТЗ 34, PR C1 — API 1.6, the board, the goals):** `ui.taskList(el, spec)` registers a plugin's list in `lists` (`plugin:<id>:<n>`; `selected` → `{ ref, date? }`, `open(other)`, `clear`, `refresh`, `otherLabel`, `more(ref)` → its items at the end of the menu; no freeze: a card goes to its column at once — decided) and gives `menu(at)` (`lists.openMenuAt`). `ui.taskAction({ label, when(info), run(ref) })` → `lists.addAction`: an item after «Копировать ссылку» in every list and «Задача: …» in the palette's group (`setMoreTaskCommands`). `lists.focused()` ignores a focus in a field, an editor or a `[role=dialog]` inside a list (the board's new card, its side panel). The board: a click chooses, a double click / ↩ open the side panel (a click while it is open switches it), the menu = the core's + «В архив», «Удалить»; its own view keys (⇧← → as columns, ⌥↑ ↓, ↩, ⎋…) win over the list's (rank 25 > 20). The goals: «Добавить отметку…» on a goal heading (`goals.goalAt`, `markFromList`: the core's form, then `addMark`).
- **«Неделя» — внешний плагин (ТЗ 36, PR A; API 1.7.0):** the plugin lives in its own repo `../panopticon-week` (built `dist/` installed into `<folder>/.orgnotes/plugins/week/`). The API grew for it: `HeadingInfo.properties` / `event` (`orgOps.propertiesOf`, `extraOf` in host), `index.body(ref)`, `tx.setTitle` (`orgOps.setTitle`), «Сегодня» blocks `width: "full"` + `before` / `after` (`todayBlocks.arrange` returns `rows`; `withNew` places a block seen the first time next to its anchor). `e2e/weekPlugin.spec.ts` loads the built plugin and skips when `../panopticon-week/dist` is missing.
- **«Неделя» (ТЗ 36, PR B — the review):** all in `../panopticon-week`, no core change. The review is a scene of the tab «Неделя» (state `2026-W42/review`; the API cannot close a tab, so «Только итоги» goes back to the week): marks write `:RESULT:` at once, answers are headings under `** Итоги` written 700 ms after typing, `:REVIEWED:` / `:SKIPPED:`; a week past its time is skipped quietly on load. The banner is a second todayBlock `week.banner` (`width: full`, `before: note`, hidden when nothing is due). e2e fixes the time with `page.clock.setFixedTime` (W42 = 12–18 Oct 2026). «Перенесено» (LOGBOOK) is left for PR C.
- **API 1.8.0 (ТЗ 36, PR C1 — a plugin extends a plugin):** `contributes.slots` + `ui.slot(id, render)` / `ui.drawSlot(el, id, data)` (host `slots`, `drawSlot`: a child `div[data-plugin]` per piece, `display: contents`, redrawn as pieces come and go). The calendar declares `calendar.weekCell` (the month's week-number column, 32 px when a piece is there — `:has(:global(...))`, Svelte drops the plain selector; the week view's title). Top-level `exports` + `ctx.exports` + `ctx.plugins.call(id, fn, ...args)` (JSON-cloned, undefined when off); «Цели квартала» export `myActiveGoals`. The journal (`behavior.logbook`) now notes a SCHEDULED moved to another day (`edits.setPlanning(…, log)` → `org.logNote`, `- Rescheduled from "<old>" on [now]`, through the store and the Tx); `HeadingInfo.reschedules` (`orgOps.reschedulesOf`), `workflow().logbook`. `extraOf` reuses the split lines of a text (one-entry cache). e2e: `pluginExtensions.spec.ts` (an inline plugin «Зонд»).
- **API 1.9.0 (ТЗ 39, PR A — a view on one heading, for «Холст»):** a file tab may carry `scope { line, title }` (`layout.openScoped`): a plugin's file view on one branch, named «file › heading» in Pane; `openFile` / `openFromJump` never reuse such a tab. `PluginFileView` gives `file.heading` and `view.setHeading` (the scope follows a renamed root); «Текст» drops the scope and reveals the heading. `ui.openFileView(view, { path, heading? }, where)` (one tab per branch and view), `ui.currentHeading()`, `ui.headingAction` → `headingActions.svelte.ts` (a registry by file name and 0-based line), shown after «Копировать ссылку на заголовок» in the navigator's heading menu and after «Теги…» in the editor's menu on a heading line. e2e: `headingViews.spec.ts` (an inline plugin «Зонд»).
- **«Холст» — внешний плагин (ТЗ 39, part A — the mindmap):** repo `Panopticon-Org-Notes/canvas` (local `../panopticon-canvas`, public; README and docs in English, UI in Russian). A file view `canvas.mindmap` («Mindmap»), «Показать ветку как mindmap» (`ui.headingAction` → `ui.openFileView` with a heading), commands «Холст: mindmap файла / ветки». `tree.ts` (the outline → nodes keyed by their titles from the root, sides by weight, `:COLOR:` inherited), `layout.ts` (columns from the root, no overlaps, arrows' moves), `Mindmap.svelte` (measures the nodes, zoom/pan, edits as transactions, the app's task list for the menu — its ↩ is «sibling», its menu's «Открыть» the side panel — the heading's text at the side). Folds by hand in `storage.local`. `e2e/canvasPlugin.spec.ts` loads `../panopticon-canvas/dist`, skipped when missing. Next: part B (`.canvas`, API fileTypes, drag data, heading IDs), part C (export, «Разложить на холсте»).
- **API 1.10.0 (ТЗ 39, PR B — a plugin's file type, for «.canvas»):** `contributes.fileTypes` { ext, title, icon, view, template, newLabel } → `fileTypes.svelte.ts` (`registerFileType`, `fileTypeOf`, `isOrgName`, `withExt`); a change sends `set_note_types` to Rust (`NOTE_TYPES`: `is_org` lists, watches, writes those extensions; `create_entry` takes `text`, a non-org file is made empty) and reads the folder again. Such a file is in `store.files` with no headings (`build`), so the agenda, tags, links ignore it; the search, `refile.fileRows` (refile, pickPlace), the mini palette leave it out. `store.viewOf` → always the type's view, Pane never shows the Org editor for it (PluginFileView says «Загрузка плагина…» meanwhile), no «Показать как ›». Navigator: the type's icon (`data-type`), no extension (`displayName` too), «Новый …» in a folder's menu (`creating.type`), a rename keeps the extension. `tx.ensureId`, `index.byId`. Drag data (`dragData.ts`, `DRAG_TYPE` / `droppedOf` / `draggingOurs` in the API): navigator files and headings (heading rows are draggable now), «Структура», the agenda, search hits, the tag tab. e2e: `fileTypes.spec.ts`.
- **API 1.11.0 (ТЗ 39, PR C — export):** `ui.saveFile({ name, title, filter, text | base64 })` → the dialog plugin's `save` + Rust `export_text` / `export_bytes` (base64, its own decoder — no crate); core command `file.reveal` {path} (`store.revealEntry`). «Холст» 0.3.0 builds a scene (`scene.ts`: boxes, frames, arrows → Excalidraw elements with bound text / arrows / frames, the clipboard JSON, SVG; PNG via an `<img>` of the SVG on a 2× canvas), colours resolved to hex through a probe element and a 2D context (`exporting.solid`); «Разложить на холсте» (`spreadRun.ts`, `board.spread`). e2e: `canvasPlugin.spec.ts` part C (the mock writes bytes as `base64:…`).
- **UI kit (tech sprint 1.1–1.2):** tokens `--danger`, `--on-danger`, `--dlg-scrim`, `--dlg-shadow`, `--knob`; global `.switch` and `.btn` (`.pri`, `.danger`) in app.css. Components: `Modal.svelte` (portal, dim, ⎋ and a click on the dim close, focus on `[autofocus]` else the last button, ⇥ kept inside), `ConfirmDialog.svelte` (title, text, «Отмена» + actions; an action runs, then `onclose`), `Switch.svelte`, `Segmented.svelte` (generic value, sizes small/medium/large, `fill`, `push`, ← →). Actions: `clickOutside.ts` (`also` — the anchor, `capture`), `pointer.ts` `moved` (hover picks a row only when the pointer moved). New UI uses them, not copies.
- **Settings split (tech sprint 4.2):** `SettingsGeneral.svelte`, `SettingsInbox.svelte` (`onpick`: the sheet's file palette), `SettingsAgendas.svelte` (`onremove`: the sheet asks) — the pages; their dialogs and ⎋ stay in `Settings.svelte`, and so does «Статусы» (its draft must outlive a switch of sections). Their shared look is `.spage` in app.css (SchemaSettings keeps its own copy: its embedded groups have no page around them). Checked by comparing screenshots of every section, light and dark, before and after: identical.
- **Rust hardening (tech sprint 5.1):** `lock(&m)` (a poisoned mutex still gives its data, no panic), `atomic_write(tmp, target, data)` (synced, then renamed; the five writers of notes, config, plugin files, new files, themes), `MiniOpts` (named fields instead of a tuple). Exports and imports: `pick_save` / `pick_open` show the system panel from Rust and remember the path chosen; `export_text`, `export_bytes`, `import_text` take only such a path, once (`PICKED`) — the page and a plugin's code cannot write or read a file the user did not choose. JS: `pickSave` / `pickOpen` in `src/tauri.ts` (themes, `ui.saveFile`); the e2e mock logs them as the plugin's panels were. The folder picker (`set_notes_dir`) is not covered yet.
- **Touches of headings (ТЗ 40.1):** when each heading was last changed, its subtree included. `touch.ts` (pure): the
  subtree's fingerprint (no spaces at the ends of lines, no blank lines, stars relative to the heading), the key (`id:…`,
  else `file › chain` with `#2` for twins), the first date (the latest `:LOGBOOK:` entry, CLOSED, else the file's
  mtime; `approx`), `reconcileFile` (the same fingerprint keeps the touch; a changed one is touched; a new key takes the
  record of a heading moved unchanged — from the pool of the gone, or still in another file when it has a body —, or
  of the heading renamed in place). `touchIndex.svelte.ts` (`touches`): `open` (the folder: the records from
  `.orgnotes/touch.json`, every file matched with its mtime), `change(file, at)` (the store calls it after a write —
  now — and after a file read from disk — its mtime), `removeFile`, `at(file, line)`; written a second after a change
  (Rust `read_touch_file` / `write_touch_file`, atomic). Tests: `src/touch.test.ts`, `e2e/touches.spec.ts`
  (`__mtimeInit` sets the mock's file times).
- **Touches in the API and the agenda (ТЗ 40.2, API 1.12):** `HeadingInfo.touched`, `index.touched` / `lastNote` /
  `markReviewed` (right `index.touch`: `touches.review`, the index only), `Tx.addNote` (`logbook.ts` `addNote`: a note
  of Org on top of :LOGBOOK:, the file's weekday names; `lastNote` reads the heading's own), event `heading.touched`
  (`touches.onTouched`, batched a second). Mass edits are not touches: `store.transaction(…, { touch: false })` (the
  tag renamed in every file, ТЗ 38; a plugin's `edit.transaction(…, { touch: false })`; their ⌘Z too) and
  `renameKeywordInFiles` (ТЗ 15) call `touches.quietly(file, text)`: the next write of that text keeps the dates. The
  agenda's field «Касание» (`touched`, ops `older` / `within`, `days`): `Task.touched` from `setTouchSource`.
- **«Добавить заметку…» (ТЗ 40.3):** `⌃C ⌃Z` (keys `addNote`, editor scope: the heading the caret is in), the editor's
  menu, the palette (`addNote`; outside a file's tab at the top of the window) and the core's command `heading.note
  {ref, x?, y?}` for plugins all call `openNote(fileName, line, at?, back?)` (`noteReq.svelte.ts`); App renders
  `NotePop.svelte`: the field «Новый статус» (↩ writes, ⇧↩ a line, ⎋), the three last notes (`logbook.ts`
  `notesOf`, the newest first; `lastNote` is its first), written by `store.transaction('Заметка', tx.addNote)` — one
  ⌘Z. The module is not `notePop.svelte.ts`: macOS sees it as the same file as `NotePop.svelte` for svelte-check.
- **«Долгие дела» (ТЗ 40.4, the built-in plugin `src/plugins/long-matters/`):** `long.ts` (pure): the settings
  (`readSettings`, the defaults Midterm.org level 1 and the own tag `long`, 14 days, WAIT, the block on «Сегодня» —
  their sheet comes in 40.6), `longIn` (not done, no `:ARCHIVE:` up the tree, not an archive file), `shown` (age,
  the day to look — `:NEXT_REVIEW:` or the touch + the norm —, group `due` / `waiting` / `ok`, tone: late, soon
  under 30% of the norm left), `grouped`, the words. `state.svelte.ts`: `readOrg` of the files the sources need, then
  `index.heading` (properties, `touched` with `src`) and `index.lastNote` per matter; read again 150 ms after
  `file.changed` / `heading.touched`, and each second while a touch is unknown. `Panel.svelte` (the navigator, mode
  after «Цели», ⌃⌘9: ⌃⌘5 stays the calendar's), `List.svelte` (the tab: filter as the tab's state, «В норме» folded
  in «Все» only, the bar of approximate dates dismissed in `storage.local`, ↑↓ ↩ ⌘↩). «Источники…» opens Settings →
  Плагины until 40.6. `HeadingInfo.touched.src` (API 1.12) gives the hint «Примерно: по записи от …».
- **«Долгие дела»: the actions (ТЗ 40.5):** `long-matters/actions.ts` — «Статус…» (`heading.note` under the row),
  «Проверить через…» (a menu at a row, `ui.choose` from the palette / the heading's menu; `:NEXT_REVIEW:` as
  `stampOf` with the file's day names), «Ждём…» (`ui.form`: a custom field with the earlier `WAITING_ON` values, a
  date chip, the switch «Поставить статус WAIT» when the file knows it — one transaction), «Больше не ждём»
  (`statusBefore` from the :LOGBOOK:, else the first open status of the set), «Осмотрено» (`index.markReviewed`),
  «Убрать из долгих дел» (the own tag away; by place — off, with the reason), `rowMenu`. In the list: S R W O by
  `e.code`; the list takes the focus back after an action from a menu. A `:NEXT_REVIEW:` on or before the last
  touch's day is old (`shown`): the norm from the touch. The palette's «Проверить через…» / «Ждём…» / «Больше не
  ждём» / «Осмотрено» and the heading's menu show on a long matter only: API 1.12 `commands.when(id, fn)` (host
  `whens`, asked in the palette's `when`), `ui.headingAction`. `file.open {newTab}` for «Открыть в новой вкладке».
- **«Долгие дела»: «Сегодня» and the settings (ТЗ 40.6):** the settings are the plugin's (`ctx.settings`, section
  «Долгие дела»): `sources` (folder) is a `custom` field — API 1.12 lets a manifest declare it and the plugin draw it
  with `settings.dynamic(key, { render })` (`pluginSettings.schemaOf`, drawn by `FormField`): `Sources.svelte`
  (a file with its level, a tag; «+ Источник»: `pickPlace` or a tag; «Файл не найден»); `norm` and `wait` (its
  options: the open statuses of the files read, `long.openStates`) with the folder; `today` on this Mac.
  «Источники…» and «⋯» open the section. `Today.svelte`: `ui.todayBlock('long-matters.today')`, up to three due, «и
  ещё N», hidden when none or turned off.
- **The new interface (ТЗ 42, under a flag):** `uiFlag.ts` (`ui:next` in localStorage: this Mac; `setNext` reloads),
  `store.setInterface(on)` (closes the settings, asks about unsaved tabs as quitting does, flushes, reloads), the switch
  «Настройки → Основные → Экспериментальное» and the palette's «Включить новый интерфейс» / «Вернуть старый». `main.ts`
  mounts `next/App.svelte` (a dynamic import) in the main window when on; it failing, the old App and a toast, the
  flag kept. The mini window and the quick entry (`#mini`, `#capture`) stay old. **Boundary** (eslint.config.js, test
  `src/next/boundary.test.ts`): `src/next/` imports any module of `src/` but no old component (a capital `.svelte`
  name), except in `next/bridges.ts` (Settings, Palette, CloseSheet, DiskSheet, PluginSheets — one line each, with
  what replaces it); the old code never imports `next/`. 42.1 is the frame: `next/App.svelte` starts the store, the
  plugins, the window's keys (settings, quit, palette) and the menu, and shows a card until 42.3–42.5.
  42.2: `next/tokens.ts` (the concept's `PAL`, light «бумага» / dark «синька», on the shell's root with the
  appearance; ink2/ink3/lampink made darker than the mockups for §9's contrast — `tokens.test.ts`), the old
  variables mapped onto them (`--fg`→ink, `--line`→rule, `--acc`→lampink…) so the bridges draw in the new colours;
  `next/fonts.ts` (@fontsource Yeseva One, Cormorant Garamond 400–700 + 500 italic, IBM Plex Mono 400/500 —
  Cyrillic and Latin only), credited in «О программе» (`menu.ts` CREDITS); the themes «Синька — светлая / тёмная»
  in `themes.ts` BUILTIN (both shells), the new shell's default (`readThemeNames`: `NEXT_THEME` till one is chosen).
  42.3: `next/Sidebar.svelte` (the lights' strip, «Файлы» — `visibleRows` without headings and the old navigator's
  open folders, ⌥-click `openFile(…, { replace: false })`, inline new / rename, the folder's line with its gear; the
  edge 200–360, `next:sideWidth`) and `next/Toolbar.svelte` (⌘0 `store.showNav`, the file and its path, «Искать
  везде» ⌘K — the palette, new shell only — and «+» `newFile`). The menu of a row: `fileMenu.ts` (`createItems`,
  `entryItems`, `headingItems`), shared with the old Navigator; drawn by the bridges `ContextMenu` and `Dialogs`.
  42.4: `next/Tabs.svelte` (36 pt; a pinned tab — its icon; a file's tab — its path with the extension, «1on1 /
  boris.org»; «×», a dot while unsaved; «+»; «Оформление / Исходник» = `store.rich`), the tab's menu from
  `tabMenu.ts` (`tabMenuItems`, shared with PaneTabs). One pane: `layout.foldPanes` / `unfoldPanes` — the new shell
  folds a second pane in on load (`store.foldPanesForNext`, the record in `next:folded:<dir>`),
  `setInterface(false)` brings it back with its tabs still open; `store.splitRight` says «Скоро в новом интерфейсе».
  42.5: the editor's logic is out of Editor.svelte: `cm/orgEditor.ts` `OrgEditor` (the state and extensions, the
  commands of the keys, the menu's items, the tags' popover, links, the text followed — `syncText` / `syncNarrow` /
  `syncLook` / `syncFind` / `syncReveal`, run in that order by `update(props)`; it asks its component to draw the
  menu and the popover through `EditorUi`). Editor.svelte (old) and `next/Editor.svelte` are thin wrappers over it.
  `next/EditorArea.svelte`: a file — the editor (or `PluginFileView`), untitled — the editor, a plugin's tab — its
  registered view, the agenda — a word (later). `richPick.ts` `pickDate` (out of Pane). Bridges added: TagPop,
  RichMenu, PluginFileView, Refile. ⌘F: `next/FindPanel.svelte` (42.10).
  42.6: «Оформление» of the new shell = `orgRich` with `next` (only the new editor passes it, `EditorProps.next`):
  no level dot, (N−1)×22 px; tags as `:dev:` (`Tags` `colons`); a cookie a chip; a folded drawer «⋯ 3 свойства» /
  «⋯ журнал · 3» / «⋯ ИМЯ» (`drawerChip`); the caret's line keeps its line class (font, size) and marks its markup
  `cm-n-mk` / the status `cm-n-kw` (`rawMarks`; a link's brackets stay decorate.ts's `cm-linkmark`); an unfolded
  drawer's lines `cm-r-dline head|body|end` (a click on the head folds it); the title's `data-eyebrow` (EditorArea:
  the file and its last exact touch). `cm/section.ts` `sectionBar`: the current section's lines `cm-n-sec`. The look
  is `next/editor.css` (scoped `.next`): the column 700, the grid, Cormorant 19 / 27 / 22 / 19 / 17, the chips.
  An empty file: a word over the column (EditorArea). e2e `nextRich.spec.ts` measures that the lines do not move.
  42.7: tables and blocks in `next` (`orgRich`): a table row is a `TableRow` widget with the table's column widths
  (`columnWidths`, canvas-measured in the head's and cells' fonts, again when `document.fonts.ready` — the
  `fontsCame` effect), 36 px drawn or raw (the frame is inner shadows), `ignoreEvent() false` so a click puts the
  caret there; the rule line 0 px (shown only under the caret). Blocks (`rich.ts` `blocksIn`, `blockRolesOf`):
  fences `cm-n-bfence` (thin, their text only under the caret), the body `cm-n-bline src|quote|example` (SRC's
  language as `data-lang`). No syntax highlighting: no CodeMirror language package is installed. A file of 50 000
  lines: the same open, typing and scroll times as the old «Оформленный текст» (a probe, not a test).
  42.8: «Исходник» of the new shell is `next/editor.css` over `.cm-editor:not(.cm-rich)` (IBM Plex Mono 13.5 / 24,
  the grid, up to 880 from the left, the marks in the tokens' colours; the structural view's `cm-org-marker` grey).
  decorate.ts marks more for it — `cm-stars`, `cm-plan-scheduled|deadline|closed`, `cm-boxx` (no style in the old
  shell); a folded drawer's placeholder counts its lines, «⋯ 3», in the new editor only (`preparePlaceholder`).
  42.9: `next/Structure.svelte` right of the editor (EditorArea, a file's tab): the headings of levels 1–3 (the
  current: the caret's, a deeper one counted as its ancestor of level ≤ 3), a click `store.open`; «Ссылаются» —
  `links.backlinks` of the deepest heading under the caret, 6 and «ещё N». On by `nextPrefs.svelte.ts`
  (`next:structure`, ⌥⌘0 = the old `insp` key) and only when the area is ≥ 900 px wide.
  The grid of 24 pt is EditorArea's `.grid` (the text and «Структура» on one ground, as the mockup has it); the
  editor's own ground (`--ed-bg`) is transparent there.
  §7.1 scrolling: the editor's scroller runs to the window's edge (its bar there); «Структура» is absolute over its
  right part (`pointer-events` only on its content), the text kept clear by the scroller's `padding-right: var(--sw)`
  (FindPanel, the empty file's word and the link card's `tooltipSpace` read the same). No `::-webkit-scrollbar` in
  `.next` (app.css scopes them `:not(.next, .next *)`): macOS's overlay bars. The column's list has no bar and fades
  24 pt at the edge it goes on past (`.ft`/`.fb` masks).
  ТЗ 43.1 (`docs/43-novyy-interfeys-sajdbar-i-razdely.md`): the sidebar's sections — `next/sections.ts` (`sectionsOf`:
  the core's «Сегодня» (no panel: `today.open()`), «Файлы», «Входящие» while the Inbox plugin's nav is there, «Агенда»,
  «Теги», «Поиск»; the plugins' navs (`views.allNavs`) in their order; `shownSection`: the picked `store.navMode`, else
  «Файлы»). `next/Sidebar.svelte` draws them, a line, the head of the panel and the panel: `next/FilesPanel.svelte`
  (the tree, moved out of the sidebar), the bridges AgendaList / TagsPanel / SearchPanel, a plugin's `NavSpec.component`.
  The new App runs `today`, `navFiles/Agendas/Tags/Search`, `findAll`, `searchNext/Prev` and `actionOf(id)` (the
  plugins' commands and section keys).
  ТЗ 43.2, the compatibility layer: `next/compat.ts` `COMPAT` — each variable app.css defines → the new tokens (null:
  the same name, inherited), `compatPalette` (the «Синька» `--p-*`), `compatVars`; `compat.test.ts` fails on a variable
  of app.css with no line there. `next/Compat.svelte` (`display: contents`, `data-ui="next"`) sets the tokens and the
  layer — so a menu moved to <body> keeps them. Wrapped so far: the App's sheets, palette, settings, menus, refile,
  plugin sheets; the editor's menu and tags popover; RichMenu; PluginFileView. The root's small `BRIDGE` of tokens.ts
  stays till the old screens and the plugins' tabs get the layer (43.3–43.4). e2e locate the window by
  `.next[data-ui="next"]` (the layer has the attribute too).
  ТЗ 43.3: a plugin's section is `next/PluginPanel.svelte` (its own host of `plugins.navs`' render, in Compat);
  a feature's own `NavSpec.component` otherwise. A panel failing turns the plugin off as before (`plugins.guard`);
  the sidebar remembers the plugin of the panel shown (`$effect.pre`, before the panel draws) and, it being in
  `plugins.failed`, says «Раздел плагина не загрузился» with the reason and «Подробнее» (settings → «Плагины») till
  another section is picked. Shots of the sidebar: clip a page screenshot — WebKit's element screenshot misses a
  plugin's panel mounted just before.
  ТЗ 43.4: the agenda tab (bridge `Agenda`), the views (`viewOf(kind).component`: «Сегодня», «Тег», the Inbox review,
  the plugins' views and reviews), the agenda builder (bridge `AgendaBuilder`, the window inert under it), the sidebar's
  old panels — all in Compat; so the root's small `BRIDGE` is gone (`tokenVars` gives the new tokens only). The new
  editor's host carries `editorCompatVars()` (the old names but `--field`, `--shadow` and the palette): app.css draws
  its tooltips with them. Toolbar: a screen's name and its crumbs («Сегодня» — `fmtLong` of the day, the agenda — its
  name, a view — its crumbs after the first, else its `title(state)`). «Оформление / Исходник» over a file or an
  untitled tab only. e2e `nextScreens` scans a screen for the old theme's blues.
  ТЗ 43.5: the sidebar's own panels in `next/` — `AgendaPanel` (built-in, «Мои агенды» with the first block's colour,
  «Новая агенда…»; the menu and «Удалить?» bridged), `TagsPanel` (find, по частоте / А–Я, mono names; the menu,
  TagRename and «Убрать тег?» bridged, in Compat), `SearchPanel` (Aa, «.*», «только заголовки»; by file, the match on
  lampsoft, the heading under it grey; the recent queries). The global search takes `re` (`search.ts` `searchFile` by
  `findRanges`, `SearchState.re` / `ranRe`, `findReq.re`); the new EditorArea handles `findReq` `jump` (the match the
  current one, as Pane does).
  ТЗ 43.6, API 1.13: `ui.setBadge(nav, n, { tone: 'alert' })` → `plugins.badgeAlerts`, `NavSpec.alert`, `Section.alert`;
  the new sidebar draws it red (`todo`), the old navigator as any. «Долгие дела»: `long.ts` `badgeOf` — «Пора
  проверить» as an alarm, else how many (so the old navigator now shows a number on its button too); «Цели»:
  `goals.ts` `silentCount` — the quarter's goals silent past the threshold, an alarm (none — no number).
  ТЗ 44 (`docs/44-novyy-interfeys-palitra-menyu-listy-kartochki.md`), 44.9: `next/tabNames.ts` `tabNames(rels)` — a file
  tab's name without `.org`; the same name open twice — the nearest folder that tells them apart («корень» past the
  top), grey after « — », the tab 280 pt then (it gives way first). Narrowed: «имя › заголовок». The toolbar: the name
  by `displayName`, the path under it. To use in the new palette's «Вкладки» and the save sheet (44.2, 44.4).
  44.10: the capsules by a heading (status, priority, tags, cookie; the link card's status) centred on its capitals'
  middle: boxes with `overflow: hidden` (their baseline the bottom edge) raised by `calc(var(--hfs) * var(--capc) -
  half the box)`; `--hfs` is each level's size in editor.css (19 on the text), `--capc` half the cap height of «Шрифт
  текста», measured by a canvas in App («H»'s ascent). e2e `nextCapsule` measures the offset (≤ 1 pt) in all fonts.
  44.1: the new interface's controls in `src/next/ui/` — `Popover` (card, rule, popshadow, 10 pt, kept in the window,
  120 ms in), `Menu` (the old menu's items, now typed in `src/menuItems.ts` with `isCommand`; rows 28 pt, the chosen on
  `lamp`, ↑↓ ↩, → / a 150 ms hover a submenu, ← / ⎋ back), `Sheet` (from under the toolbar, 440 pt, lower corners 14,
  `dim`, ⎋), `Button` (30 / small 24, main · plain · danger, its key at 60%), `Field` (30 pt, `lampline` in focus, the
  reason in `todo`). `Kit.svelte` shows them all (e2e `nextKit` mounts it). The window's menu (tabs, the files' tree)
  and the sidebar panels' menus use `Menu` already; the editor's menu waits for 44.3.
  44.2 (the palette; the refile step comes next): its workings out of Palette.svelte into `src/paletteCtl.svelte.ts`
  (`PaletteCtl`: the step, the query, the row chosen, the calendar's day and month, the keys; `effects()` from the
  component), the old palette on it unchanged. `next/Palette.svelte` — the new look (the plate on `chip` with the
  capsule, the field with «esc» or the day in words, rows 40 pt on `lamp`, groups 11 pt caps, the foot with «> # @»);
  `next/PaletteCalendar.svelte` — three months, today framed by `lampline`, the chosen on `lamp`, past days faded, a
  `next` dot on busy days, the chips «Сегодня», «Завтра», the next Monday, «Через неделю», «Убрать дату»
  (`CalSpec.clear`, set by calendarStep when the date is there). `Palette` is gone from the bridges.
  44.2, the refile step: the palette look of the choice of a place out of PlacePicker into `src/placePalette.svelte.ts`
  (`PlacePaletteCtl`: the two steps, the tree's open branches, the keys, the foot), the old PlacePicker on it;
  `next/PlacePalette.svelte` (680 pt, the label «Перенести › файл», the pinned «на 1-й уровень» in a dashed frame,
  the tree with guides, level marks, capsules, the children's pill, «станет N-м уровнем») and `next/Refile.svelte`
  (the plate «Переносим»). `Refile` is gone from the bridges; the columns' look (forms, sheets) stays old till 44.4.
  44.3, the menus: `MenuItem` (menuItems.ts) has `{ head }` (a section's head, a plugin's name) and `soft` (its
  submenu chosen on `lampsoft`). The new editor passes `headingMenu` (EditorProps) — `next/headingMenu.ts` builds the
  §3.1 heading part (status submenu as capsules, palette steps, refile, narrow, note, link, mini window, each plugin's
  section via `headingActionsByPlugin`, «Удалить заголовок» — `OrgEditor.removeHeading`, one step of ⌘Z); the editing
  items follow. `next/StatusMenu.svelte` (a drawn capsule, 30 pt rows, soft) and `next/TagsPop.svelte` (⌃C Q) replace
  RichMenu and TagPop; their data shared with the old ones: `headingChoices.ts` (`statusChoices`), `headingWrite.ts`
  (`setStatusAt`, `setPriorityAt`), `tags.ts` `tagRows`. ContextMenu, RichMenu, TagPop gone from the bridges.
  44.4, the sheets (the plugins' forms and sheets come next): `next/CloseSheet.svelte` («Сохранить изменения?», the
  tabs by `tabNames`, ⌘D; its words `closeSheet.ts` `closeWords`, shared with the old), `next/DiskSheet.svelte`
  (520 pt, the plates «Моя версия» / «На диске» with `diff.ts` `diffSummary`; «Сравнить…» 720 pt; the vanished
  file), `next/ConfirmSheet.svelte`, `next/Dialogs.svelte` (the tree's delete and move), `next/TagRename.svelte`
  (workings `tagRenameCtl.svelte.ts`), `next/SaveAsSheet.svelte` (`saveAsCtl.svelte.ts`); `next/sheetKeys.ts` —
  the sheets' keys. The new shell had lacked, now as in the old: the «Сохранить как» and error sheets, the quick
  entry, ⌃C ⌃Z's note popover, TaskListHost, StartScreen (bridged), the disk pump, the layout's persisting, the
  views' `onGone`, `capture:file`, and the keys capture, captureHere, pasteText, copyLink, newFolder,
  paletteNewFile, paletteGoto, openFolder, revealInNav, back, miniOpen, miniShow, endDay. Bridges left: Settings,
  PluginSheets, PluginFileView, Agenda, AgendaBuilder, Capture, InboxPicker, NotePop, TaskListHost, StartScreen.
  44.4, the plugins' sheets: their workings out of PluginSheets.svelte into `src/pluginFormCtl.svelte.ts`
  (`PluginFormCtl`: the values, `onChange`, `validate`, `headerExtra`, the keys; `pluginSheetKey`, `mountPluginSheet`,
  `placePicked`/`placeClosed`), the columns' into `src/placeColumns.svelte.ts` (`PlaceColumnsCtl`), the old ones on
  them. `next/PluginSheets.svelte` — the form (460 pt, 640 with a place; the plugin's name and icon over the title in
  `plug`), the plugin's sheet (620 pt; its content and `bare` sheets in Compat), `ui.menu` on `Menu`, «Включить
  плагин?», `ui.place` on PlacePalette; `next/FormFields.svelte` (labels over the fields; a day is a field with «◷»
  that opens the palette's calendar, both looks; a switch a check; a file from PlacePalette kind file; `custom` in
  Compat; `validate`'s reason under the first field; `month` nothing) and `next/PlaceColumns.svelte`. API 1.14: a
  text field's `suggest(q, v)` → `{ value, hint? }[]` — a popover under it in the new interface (the typed text first
  as «новое», ↓↑, ↩ takes one, ⎋ closes it), chips under it in the old; «Ждём…» of «Долгие дела» uses it (its own
  field and styles.css gone). `PluginSheets` gone from the bridges.
  44.5, the cards of a file (API 1.14): the manifest's `contributes.fileCards` {id, title, icon — else the plugin's,
  its section's, its view's}; a plugin with cards gets the core's switch `core.fileCards` (CARDS_KEY, on this Mac, on
  by default) in its own settings section, a group «Редактор» (a section under its name if it has none).
  `ui.fileCard(id, { match, render, count? })` → `plugins.fileCards`; the event `editor.heading` {path, heading} (100
  ms). `next/fileCards.svelte.ts` (`FileCardsCtl`: the cards that said yes for the file shown, in the sidebar's
  order of the plugins, the folded ones by card in `next:cardsFolded`, a failed plugin's card kept with its reason
  until another file) and `next/FileCard.svelte` (the head folds; the body in Compat, drawn again on a new heading
  under the caret, up to 260 pt with the fade; classes `fc-stats`, `fc-stat`, `fc-under`, `fc-btns`, `fc-btn` for
  the plugins). Structure takes `cards` and `width` (268 with a card, else 220). «Привет» has a card (open tasks).
  Nothing in the old interface.
  44.6, the cards' keys: a manifest command's `cardKey` (one letter or digit, upper-cased) with no `keys` gets
  «⌃C K <letter>» (`declare.ts` `cardChord`); a chord another command declared first has — none, and its note in
  «Клавиши» says whose. The dispatch's three-press chords take it from the text; the plugin's handler checks the
  heading under the caret. «Долгие дела»: R «Проверить через…», W «Ждём…», O «Осмотрено».
  44.7 (the first half): the built-in plugins' cards. «Долгие дела» (`long-matters/Card.svelte`, mounted once per
  element, its `{ path, heading }` a $state the later renders assign): its matters of the file — on a file of its
  sources or with a matter, after the first reading (`match` reads `long.progress`, so the core asks again) —
  the groups, «Открыть список»; under the caret the capsule and title, untouched, the day to look, the last status;
  «Статус», «Ждём…» / «Больше не ждём», «Проверить через…», «Осмотрено» with `keyOf`, off on no matter. «Канбан»: a
  file whose level-1 headings have statuses — «Колонки — статусы файла» (or «#+BOARD»'s), «Открыть доской ⌥⌘B»
  (`.kb-fcard`). The cards' container is 4 pt off the editor and 18 off the edge, as the mockup.
  44.7 (the second half): the Inbox's card (`inbox/Card.svelte`, on its file: how many, the oldest's days, «Разобрать»;
  under the caret «Перенести» `ui.refile`, «Запланировать» / «Теги» the core's `heading.schedule` / `heading.tags`,
  «Удалить» one transaction) and «Цели квартала»'s (`quarter-goals/Card.svelte`, on a found source's file: the open
  goals of this quarter with weeks since a mark, the silent in `todo` and the longest said in words; «Разбор целей
  на 1-1» = `startReview` — not on «Мои цели»; «Отметить прогресс…» = `markFromList` on the goal under the caret,
  else the most silent). The core's switch of the cards goes into the plugin's section, else its block (the Inbox's
  in «Inbox», the goals' in «Агенды»): a section under its name only when it has neither.
  44.8, the column: «Ссылаются» is «Связи» with its number; «Структура» and «Связи» fold on a click on their head
  (⌄ / ›), `nextPrefs.structFolded` / `linksFolded` (`next:structFolded`, `next:linksFolded`), one for every file;
  folded «Связи» is its head with the number. Left of ТЗ 44 by its own «Чего нет»: the screens (Agenda, the builder,
  the plugins' views) stay bridges; Capture, InboxPicker, NotePop, TaskListHost, StartScreen too, for now.
  45.1, «Сегодня» in the new style: its workings out of Today.svelte into `src/todayCtl.svelte.ts` (`TodayCtl`: the
  journal's note and choice, the agenda of the day, the tasks, the overdue ones, the meetings, the rows as one list —
  frozen till a refresh, the chosen one, the keys, `lists.register` — the layout, the actions; `effects()`), the 1-1
  card's into `src/meetingsCtl.svelte.ts` (`MeetingsCtl`; not «todayMeetings» — the casing clash with
  TodayMeetings.svelte); the old screen on them. `next/Today.svelte` (the kicker in IBM Plex Mono, the title in Yeseva
  36, cards on `card` 12 pt, the note on `lampsoft`, rows 32 pt with the capsule in 46 pt, the files' names without
  «.org»; a plugin's block — the core's card, its content in Compat; its own head stays the plugin's till 45.6) and
  `next/ListToast.svelte`; EditorArea draws it for the tab TODAY. A regex in a Svelte template's `{…}` breaks the
  compile and svelte-check does not say so: put it in a function.
  45.2, «Завершить день»: its workings out of EndDay.svelte into `src/endDayCtl.svelte.ts` (`EndDayCtl`: done, left
  and the choice for each, the three for tomorrow found as in the palette, their order by drag and ⌥↑↓, the note,
  `finish`, the window's keys), the old sheet on it. `next/EndDay.svelte`: a Sheet of 640 pt, the parts one under
  another, «Не успел»'s choices under each row (the chosen on `lampsoft`), «Главное на завтра» numbered with «+
  выбрать задачу…» as the last row, the note a textarea in Cormorant 18 with the lists going on (textList), not a
  CodeMirror. The new window had shown no «Завершить день» at all, nor had it the window's ⌘Z (`store.undoLast` off a
  text field): both as in the old one now. `svelte-ignore` takes several codes comma-separated, no `--` reason.
  45.3, the built-in «Агенда» in the mode «День» (new interface only; a custom agenda stays the bridged Agenda till
  45.4): `src/agendaDay.ts` (pure: `dayOf` — the timed entries as chips, past / now, the planned without a time and
  the deadlines of the day, done struck; `horizonOf` the 30 days after, by date, `due` on a deadline; `weekOf`,
  `weekCounts`, `horizonDate` «СР 21 · СРОК») and `next/AgendaDay.svelte` (the day in its state, opened on today; the
  overdue from today.ts `overdue` on today only; the rows a list of tasks, `lists.register` id `agendaDay:<pane>`;
  ← → «.» ↑↓ ↩, ⌘↩ opens the task behind the agenda, ⌘↓ «Неделя»; «Неделя» / «Месяц» put a `calendar.view` tab with
  `{ view, date }` in the agenda's place, the switch only while the calendar plugin is live). The way back from the
  calendar to «День» is the calendar's own keys: not there yet. Decided with the user (2026-10-17): left as it is
  till the calendar's own ТЗ in the new style — that ТЗ must give its view switch a «День» (back to the agenda's day
  on the same date, in the same tab) and ⌘↑; else the jump from «Агенда» is one-way and jarring.
  45.4, the agendas of blocks: an agenda tab's workings out of Agenda.svelte into `src/agendaListCtl.svelte.ts`
  (`AgendaListCtl`: the built-in 30 days, a custom agenda's blocks — `Section.cond` its `query()` line, `.total` —
  the frozen rows, the choice, the keys, `lists.register` id `agenda:<pane>`, `menu`), the old screen on it.
  `next/AgendaBlocks.svelte` draws a custom agenda and the presets; `src/builtinAgendas.ts` `PRESETS` — «Неделя»
  `builtin:week`, «Сегодня» `builtin:today`, «Все задачи» `builtin:all`: plain agendas run by `runAgenda`, not in
  config.json, no «Редактировать…»; `AgendaStore.of` resolves them. The sidebar's panel lists them under «Встроенные»
  after «Агенда · 30 дней». The bridge `Agenda` is gone.
  ТЗ 46 (the Inbox's review in the editor) replaces ТЗ 45 §4: the review a mode of the inbox file's tab — narrowed to
  the entry, the card «Разбор Inbox», the queue in «Структура». PR #233 (the review's tab in the new style) was closed
  unmerged (2026-10-17); 45.6 and 45.7 come after ТЗ 46.
  46.1, the narrowing's strip (any narrowing, new interface): already the whole width of the area with the column
  under it (it sits above `.with`); now it slides in in 180 ms and out in 150 (`svelte/transition` slide, cubicOut),
  none with «Уменьшить движение»; its size is `height: 40px` — a flex-basis would hold it and stop the slide.
  ТЗ 46 was stopped after 46.1 (2026-10-17: the review's concept changed again); ТЗ 41 (обход долгих дел) is next.
- **«Архивировать поддерево» (ТЗ 41.0, §7):** `src/archive.ts`, pure, shared with the board's «В архив» (ТЗ 33; moved
  from `plugins/kanban/archive.ts`, exported by `@panopticon/api/org`): `archiveTarget` — `:ARCHIVE:` of the heading or
  its nearest ancestor, then the header's «#+ARCHIVE:», then `%s_archive::` (`readLocation`: «file::* heading», an
  empty file part — the same file, `%s`, `../`); `archiveEntry` adds ARCHIVE_TIME/FILE/OLPATH/CATEGORY/TODO. The default
  is `<file>.org_archive` as in Emacs, not the ТЗ's `<имя>_archive.org` (`isArchive` and the board use `.org_archive`).
  `store.archiveSubtree(at?)`: `ensureFile`, one transaction (another file: the archive first; the same file: out
  first), the entry at the end or under its top-level heading (made when missing), the toast «В архиве: …» with
  «Открыть» / «Отменить». Key `archive` ⌃C ⌃X ⌃S (heading scope, `keyDispatch.runOne`), the palette, «В архив» in both
  editors' heading menus (`linkHooks.archive` in the old one); none in an `.org_archive` file.
  ⌘Z in an editor after a step over several files (a move, «В архив»): `linkHooks.undoAlong` → `store.undoAlong` takes
  the step's other files back when the editor's text is what the step made of it, then CodeMirror undoes its own file
  (before, the copy stayed in the target). The editor's `path` is the file's name, not its `path`: hooks go through
  `fileNamed`. e2e `archive.spec.ts`.
- **A review in the file (ТЗ 41.1a, on ТЗ 46 §1–§4, §7, §8):** `ui.review({ place: 'file' })` in the new interface
  (`store.nextUi`) is a mode of a file's tab; the old interface keeps the tab. The host marks the run `inFile` and
  opens no tab (`onGone` of `REVIEW_KIND` skips such a run — the view's watch would end it at once); the controller
  calls `file.front()` / `file.end()` (`FileReviewHooks`) instead of activating / closing the tab. `next/fileReview.svelte.ts`
  (`fileReview`, effects in next/App): the tab (`openFile` replace in pane 0 — the file's own tab if open, else the
  active file tab, else a new one) narrowed to the card's heading, the caret at `spec.narrow().reveal`; follows the
  card while its tab is on the card's file (`on`: the tab active and on that file; away — no strip, no keys, it
  follows on return); the tab closed — the review ends; ⎋ (not in a field / dialog / menu) ends it; the review's
  scope keys (⌘1…, ⌘[, ⌘↩) while `on`; «другой файл» in the strip 2 s after a file change. EditorArea: the strip
  (icon, the title's first word, the path, «⌘↩ дальше» from the action keyed ⌘↩, «Закончить ⎋»); `SessionCard`
  first in the column (counter, segments by `reviewMark`, the non-`hidden` actions in a column — `kind: 'ok'` green,
  `'primary'` lamp —, «← Назад», «Закончить», `below` in Compat; after the queue «… окончен» with the outcome counts
  and «Готово»); the session plugin's own file card hidden; `Structure`'s `queue` snippet → `ReviewQueue` («Очередь
  N», groups by file when more than one, the dot by tone, `mark.text` or `header(h)`, faded/struck, a click →
  `reviewShow`); `onnarrow` → `reviewEdited`. API 1.14: `ReviewAction.mark {tone, text?}` (the core records it on
  «next»), `hidden`; `ReviewSpec.place`, `mark(i)` (the plugin's own record, over the actions'); `ReviewTone`
  (done, cancel, moved, later, skip, wait, seen, arch; colours and words in `next/reviewTones.ts`); `ReviewHandle.place`.
  Inbox: `place: 'file'`, `mark` = `markOf(item)`, `header` = `createdShort`, «Выполнено» `ok` with the closing
  status as `sub`, «Перенести…» primary, «Далее» / «Календарь» hidden; in the file «Отложить…» is `ui.pickDate`
  (no popover of ours), `below` (the month) not drawn, `narrow` does `sync` (no head there); a second ⇧⌘R goes to
  the review going on. Its sidebar panel during it: the plain list, the task on the card `.row.now`, no progress.
  e2e `nextFileReview.spec.ts`.
  41.1b: `ReviewSpec.calendar {date?, defer?, command?}` → `next/ReviewCalendar.svelte` under the card while the
  plugin «Календарь» is on (the month of `allDays` — the calendar's layers and files —, today `lampline`, the past
  faded, a `next` dot under a day with entries, the card's day dashed; ‹ ›; a day's list with «Отложить сюда» →
  `defer`; folds by its head or by `command` (the scope keys call `fileReview.calToggle`), kept in
  `next:reviewCalFolded`). `ReviewSpec.endActions` — the summary's buttons before «Готово» (`when()`); typing in the
  text while the summary shows ends it (keydown on `.ed`, not `onchange`: a write from outside must not). The
  column hidden: «N из M» and «Действия ▾» (EditorArea's own `Menu`) in the strip. `ReviewHandle.anchor(actionId)`
  — the rect of the action's button (`data-act` in `[data-review]`); API `MenuItem.shortcut` passed to the core's
  menu. Inbox: «Отложить…» in the file — `ui.menu` of `deferDates` with their days, «Выбрать дату…», 292 pt left of
  the button; `calendar: { command: 'inbox.calendar', defer }`; `endActions` «Разобрать пропущенные» (⇧⌘R from the
  summary too: `start()` there) and «Разобрать и новые»; `session.again(list)`.
- **«Обход долгих дел» (ТЗ 41.2–41.3):** `plugins/long-matters/walk.svelte.ts` (`walk`) on the core's review in the
  file: `long-matters.walk` ⌃⌘O (the palette «Долгие дела: начать обход»), «Обход» on the plugin's file card, «Обход ›»
  on «Сегодня», «Начать обход» in the tab's header. The queue: `long.groups.due` in the list's order; none — the
  toast «Проверять нечего. Ближайшая проверка — пт, 23 окт» (the nearest due of the others). The decisions, scope
  `review` keys in the manifest (`long-matters.walk.*`): ⌘1 «Продолжаем» (`subOf` «WAIT → NEXT»: no more waiting,
  `statusAfterWaiting`, `:NEXT_REVIEW:` by «Проверить снова через»), ⌘2 «Ждём…» (`actions.wait(m, {days, also})` —
  the sheet, its days for no date, the note in the same step), ⌘3 «Осмотрено» (`markReviewed`, the note before),
  ⌘4 «В архив» (the core command `heading.archive {ref, note?}` → `store.archiveSubtree(at, {note})`: the note goes
  into the entry, one step), ⌘5 «Закрыть» (the first done status of its set), ⌘↩ on with no decision («пропущено»,
  a typed status written), ⌘[ back. The plugin keeps each matter's mark (`spec.mark`, `group` — the summary's word).
  `WalkCard.svelte` (the card's `below`): the line «≈45 дн. без касания · по дате файла · проверить надо было 15 сен»,
  «Новый статус» (↩ `writeNote` — a note, the focus stays; ⇧↩ a line; the focus there at each matter), the chips
  «неделя / 2 нед. / месяц / дата…» (the norm by default, kept till the end). The status typed goes in the decision's
  transaction (⌘Z takes both back). The core for it (API 1.14): `ReviewAction.subOf(h)`, `ReviewMark.group`,
  `ReviewSpec.queueNote(h) {text, late}` (red in the queue), `endNote()` (under the summary's figures); the summary
  titled «<first word> окончен»; a card gone from its file meanwhile is passed over «нет в файле» (not during an
  action: `reviewActing`; not for a review of its own order); one review in the window — another plugin's going on
  asks «Закончить «…» и начать «…»?» (`host.openReview`). Fixed on the way: the tab did not follow a card into another
  file (the follow effect checked the new file, not the one the tab was on); the queue's rows took no clicks (the
  column's `pointer-events` rule is scoped to Structure). e2e `nextWalk.spec.ts`.
  41.4–41.5: the summary's figures (`src/reviewSums.ts` `sumsOf` — by `group`, the nil ones left out, in
  `spec.endOrder`, else the tones' order) in both shells; the walk's order продолжаем, ждём, осмотрено, в архив,
  закрыто, пропущено. The controller's `markOf` had dropped the plugin's `group` (the walk's «продолжаем» counted as
  «выполнено»). The old interface: the walk is the review's tab (`place: 'file'` there is a tab); PluginReview leaves
  out `hidden` actions, draws `subOf`, and with no summary of the plugin's shows the figures and `endNote`;
  `WalkCard` offers «Проверить снова через» in the file only (`walk.inFile` = `currentReview().place`), the tab goes
  by the norm. e2e `walkOld.spec.ts`. ТЗ 41 is done.
- **ТЗ 47 (the plugins' screens in the new look), 47.1:** `--font-display` (Yeseva One) and `--font-mono` (IBM Plex
  Mono) in the compatibility layer (`COMPAT`, not in app.css: old screens fall back), `ctx.ui.look` `'next' | 'old'`
  (API 1.14, `store.nextUi`; fixed while the window is open). The guide's «В новом интерфейсе» says them and the
  tokens a plugin's own new screen draws with. The PRs of ТЗ 47 are stacked: each on the one before.
  47.2, «Календарь» (`ui.look === 'next'`, the same workings): View.svelte — the header of the new screens (`.nh`: the
  range as the kicker in `--font-mono`, the title in `--font-display` 38, «‹ Сегодня ›» `chip2` 28 pt, «Месяц /
  Неделя»; «‹ К агенде» when `CalState.back === 'agenda'`), the month in `.frame` (8 pt corners), `.next` styles
  for the cells (past 75 %, weekends `chip`, the chosen `lampsoft` + `lampline`, today `lamp`), the chips (events
  `lampink`), the week (heads, «весь день», hours in mono, events with a 3 pt stripe — `box-shadow: inset`, the line of
  now `lamp`); the chosen day is a column of the tab (`aside.side` 268 pt, `Day.svelte next`: «Выбранный день» and
  «Впереди» fold, kept in localStorage `calendar:fold:*`). Panel.svelte `next`: ticks of 14 pt (`appearance: none`, on
  — `lamp`), the layers' dots by the new tokens, the files with `datedCount` (`@panopticon/api/org`), «БЕЗ ДАТЫ · N».
  DayList is the ТЗ 44 popover under `[data-ui=next]`. «Агенда» ⇄ calendar: AgendaDay's «Неделя» / «Месяц» put
  `back: 'agenda'`; the core command `agenda.open {date, here}` → `store.agendaInTab(date)` (the tab becomes the
  agenda, `data.date`); AgendaDay opens on `tab.data.date`. e2e `nextCalendar.spec.ts`.
  47.3, the tab «Долгие дела» (List.svelte `next`): the header `.nh` — the kicker made of the sources («Midterm.org ·
  первый уровень + тег :long:»), «Долгие дела» in `--font-display` 38; the filter, «Источники…» `chip2`, «Начать обход
  ⌃⌘O» on `lamp`; «Давность · черта = норма»; the groups 15 pt («Пора проверить» `todo`), rows with a `rule` line, 15 pt
  titles, «ждём: …» `lampink`, the age by its state (`done` / `wait` / `todo`) on `track` with the norm's mark `ink3`.
  The sidebar's panel is as it was (in the layer's colours). e2e `nextLongList.spec.ts`.
  47.4, «Цели квартала» (`next`): Panel.svelte — «Мои цели» a card (avatar 30, «N цели · отметка 6 дней назад» by
  `lastMark`), «Обзор квартала» with the goal's target icon, «КОМАНДА» (avatars 22: the person's colour at 22 % over
  `card`, the initials in it), the silent dot `wait`, «+ Добавить ещё цели» dashed `rule` 1.5 in `lampink`; no hint.
  Overview.svelte — the header `.nh` (the kicker `quarterSub`, «Цели квартала» / the person's name; «‹ Q3 · Q4 2026 ·
  Q1 ›», the current quarter `lampsoft` / `lampink`; «Разобрать цели» for a person, «Отчёт за квартал», «+ Новая
  цель» on `lamp`), the tiles (`card`, 12 pt, the figures in `--font-display` 30, the filter on `lampsoft`), the
  groups unboxed (avatar 30, «Квартальные задачи · Работа/Тимлиды/petrov»), the rows a grid 84 pt | title | deadline
  | 150 pt, the closed at 60 %. e2e `nextGoals.spec.ts`.
  47.5, the wheel (`Wheel.svelte`, the overview only, «Список / Колесо» in its header): the tab's state is the key
  with «~wheel» after it (`splitView`, `WHEEL` in state.svelte.ts; `openGoals('*')` keeps it; old tabs read as
  before). An SVG of 600: a sector per person found (me first, «Я», then the team), the dots — the active goals, the
  radius by `quietDays` to 5 weeks; «молчит» is the list's `goalSilent` (the setting's threshold, 14 days → «2+
  недели»; ТЗ 47 says 3 weeks, the list and the wheel must agree — the dashed ring is that threshold); the fill `lamp`
  3–18 % by the share of the fresh; the frames drawn over the sectors (silent `todo`, chosen `lampink`); the hub —
  «ЦЕЛИ Q4», the silent ones in `--font-display` 44 `todo`. A sector: chosen (a ray, the column of 340 pt with the
  person's goals, «Разобрать цели», «Открыть файл»); a dot: `openGoalFile`. ТЗ 47 is done.
- **ТЗ 48 (the small bridges), 48.1 — a task in the lists:** `next/TaskListHost.svelte` — the menu of ТЗ 44
  (`ui/Menu`, 260 pt, `label="Задача"`) and «Теги…» as `TagsPop` (its changes kept, applied by `lists.tags` when it
  closes). `taskLists.menuItems` in the new interface (`store.nextUi`): «Открыть во второй панели» off (no second
  pane yet), «Статус ›» soft (capsules on `lampsoft`), the date submenus with the days grey on the right («пт 16»),
  «Снять дату» `danger`, «Копировать ссылку» with ⌃C L; the old interface's menu as it was. The toast: one
  `next/ListToast.svelte` in EditorArea (`.area` relative) for every list, the plugins' too (the screens' own are
  gone) — `lead`, `value` bold, `title` («Запланировано на **завтра** · …», words set per action in `lists.words`),
  4 s (6 in the old one), `holdToast` while the pointer is over it. e2e `nextTaskMenu.spec.ts`. The bridge
  `TaskListHost` is gone.
  48.2, «Добавить заметку…»: `next/NotePop.svelte` on `ui/Popover`, 440 pt under the line (over it with no room
  below: the height measured once mounted); «Заметка», the status capsule, the title; the field in `--text`
  (Cormorant) 17, `field`, `lampline` in focus, to 5 lines; the two last notes, no block with none; ↩ with an
  empty field does nothing (the old one closed). The plugins' `heading.note` (long matters' «Статус…») opens it
  too. e2e `nextNotePop.spec.ts`. The bridge `NotePop` is gone.
  48.3, the quick entry and the Inbox's file: `next/Capture.svelte` (the old one's workings and draft
  `capture:draft`; a box 600 pt at 150 pt over `dim`, the Inbox's icon `lampink`, the title in `--text` 600 24,
  «Tab — детали», the details 1–8 lines, the foot «→ inbox» (a click: the picker), the keys, ⇧⌘I); «Добавлено в
  Inbox» is the window's toast — `lists.tell({lead, action})` (ListToast draws the action's button in place of
  «Отменить»), «Открыть» goes to the Inbox's end. `next/InboxPicker.svelte` — Sheet 460 «Куда складывать
  входящие?», Field «Найти файл…», the org files (not archives; inbox.org first) with their number of headings,
  ↑↓ ↩, «+ Создать inbox.org в корне папки» while there is none. The quick window outside the app (`CaptureWindow`)
  stays old till the ТЗ of the other windows. e2e `nextCapture.spec.ts`. The bridges `Capture` and `InboxPicker`
  are gone.
  48.4, the agenda builder as a tab: `AGENDA_EDIT = 'agenda.edit'` (store.svelte.ts), a view registered by next/App
  (transient, single, «<name> — правка», `ViewSpec.dirty` → the tab's dot via `tabLabels.isDirty`, `onGone` →
  `closeBuilder`); an effect opens the tab when `store.builder` is set and takes it away when it is gone. The
  workings — `src/agendaBuilderCtl.svelte.ts` (`AgendaBuilderCtl`: the popover of a choice, its keys, the date
  forms, the blocks, dragging, `save` with the checks); `next/AgendaBuilder.svelte` draws them (the header with the
  name in `--title` 36 edited in place, «Источники: … · архивы не входят», the blocks on `card`, the open one
  `lampline`, values as chips with «×», «+ условие», «+ Блок» dashed, the preview 340 pt on `panel`; the block's
  colour from the 8 named). The old sheet AgendaBuilder.svelte keeps its own copy of the workings (the old
  interface, unchanged). `saveAgenda(a, { keep: true })` keeps the builder open, clean; ⌘S in the tab →
  `builderSave++`. Closing it unsaved: `Unsaved.kind 'agenda'` in `unsavedOf`, `closeWords` «Сохранить изменения
  в агенде «…»?» / «Сохранить агенду»; «Не сохранять» → `closeBuilder`; «Сохранить» → `store.builderSaveFn` (the
  tab's checks may stop the closing). In the new interface `sheetOpen` leaves the builder out and the window is not
  inert. e2e `nextAgendaBuilder.spec.ts`. The bridge `AgendaBuilder` is gone.
  48.5, the first start: `next/StartScreen.svelte` (the old one's workings: the slow «Считаем файлы…», the poll of
  a missing folder, ↩ the main button, ⎋ back from «Папка найдена») — `bg` with the grid, 620 pt in the middle;
  «ПЕРВЫЙ ЗАПУСК», the title in `--title` 44; «Папка найдена» (the icon 72, a card 440 with the folder, its path
  in mono, three figures in `--title` 28 with their words), «Папка пустая» when it has no org files, «Папка
  недоступна» (the warning on `wait`). While it shows, next/App hides its window (`display: none`: no sidebar, no
  tabs). `src/next/bridges.ts` keeps `Settings` and `PluginFileView` only (boundary.test.ts checks it). e2e
  `nextStart.spec.ts`. ТЗ 48 is done.
- **ТЗ 49 (the file view and the board), 49.1 — the host:** `next/FileView.svelte` in place of the bridge
  PluginFileView (the same `showText`, `setHeading`, drawing again on another file, `plugins.guard`): the layer's
  variables (`tokenVars` + `compatVars`) and `data-ui="next"` on the element itself, no Compat around it; `bg` with
  the grid of 24 pt under it; «Загрузка плагина…» after 300 ms; a stopped plugin — «Плагин «…» остановлен из-за
  ошибки», «Показать текст» (not for a file of its own type), «Настройки плагинов». A view chosen whose plugin
  stopped keeps its place: `store.wantedView(tab)` (the tab's choice, the file's memory, its file type) and
  EditorArea's `stopped`; the view chosen by default only («#+BOARD» with no choice yet) goes back to the text, its
  plugin's `defaultFor` gone with it. `bridges.ts` keeps `Settings` only (boundary.test.ts). e2e `nextFileView.spec.ts`.
  49.2, the view switch (next/Tabs.svelte «Вид текста»): «Оформление / Исходник» and a segment per file view that
  is on (`allFileViews()` less the file types' own), titled from the manifest; lit — `store.viewOf(tab)`, else the
  text's mode; «Оформление» / «Исходник» on a view → `showAs(tab, '')` (a tab on one heading — the text at it) and
  the mode; a view's segment → `showAs(tab, id)` (no «#+BOARD»: the board asks for the workflow, «Отмена» back to
  the text). One view with a key — its `kbd` by the switch (⌥⌘B); more — the keys in the segments' titles. A file of
  its own type (`.canvas`) has no switch. ⌃⌘E (`rich`) on a view: back to the text in its mode. e2e
  `nextViewSwitch.spec.ts`.
  49.3, the plugins' fonts and editor: `--font-text` (the file's text's font — Cormorant, Lora, the system's) is the
  first of `compatVars` (`var(--text)`: COMPAT may name tokens only). `ui.editor` in the new interface mounts
  `next/PluginEditor.svelte` — the new Editor narrowed to the heading (`narrow`, `onnarrow`), «Оформление», the
  store's levels / drawers / numbers, edits by `store.setText`; the host's `plugins.editorComponent` is set by
  next/App (the old code may not import src/next). No `reveal`: an async one moved the caret after the first click.
  FileView's draw effect reads `path` through a `$derived` — the parent's file object is new at every edit, and the
  view drawn anew lost the board's open card. e2e `nextPluginEditor.spec.ts`.
  49.4, the board's look in the new interface (kanban Board.svelte by `ctx.ui.look`, styles.css by
  `[data-ui='next']`): the header — the kicker «work/platform.org · доска» (Plex Mono 11 `ink3`), the name without
  «.org» in Yeseva One 34, on the right «Workflow: … ▾» 28 pt, the filter 200 pt (`lampline` in focus), «Не на доске»;
  no «Текст» (the view switch). The columns 272 on the host's grid (`.kanban` transparent), `chip`, radius 12, as
  tall as their cards; the folded one — the count, the name bottom to top, no capsule. The cards `card` / `rule` /
  radius 9, the title in `--font-text` 18/600, the chips (`kb-chip`): the priority, `Card.dates` (board.ts
  `cardDates`: «⚑ ср 21» — the weekday within a week, else «⚑ 21 окт», red today or past; «◷ 19 окт»; «закрыта 12
  окт» on a finished one), the progress, the tags; chosen — `lamp` with a 3 pt `lampsoft` ring; finished — 0.55.
  The old interface unchanged. e2e `nextBoard.spec.ts`.
  49.5, the board's dragging, card at the side, choice of a workflow in the new interface (styles.css): the copy
  −2° in `lampline` with `popshadow`, the old place 0.35 dashed, the new one dashed `lampline` on `lampsoft` radius 9;
  the zones 32 from the sides, 20 from the bottom, 16 apart, radius 12 (Board's `zones` by `next`); the folded column
  under the pointer — `lamp`. The card at the side: header 48, the status capsule ▾, «В файле ›» `lampink`, the footer
  «⎋ закрыть · ⌘↩ открыть в файле». Setup.svelte by `ctx.ui.look`: the sheet of ТЗ 44 (the core's bare sheet is in
  Compat, `data-ui="next"`), 500 pt, «Показать «name» как доску», «10 из 12», the plate with «N заголовков без
  статуса на доску не попадут», «Отмена esc» / «Показать доску ↩». «Workflow не найден» with the ТЗ 44 buttons. Fixed
  for both interfaces: a plugin's view keys (`viewScope`, host.svelte.ts `inView`) are off while a plugin's sheet is
  open or the focus is in a dialog — ↩ in the choice of a workflow went to the board's command. README «Вид файла в
  новом интерфейсе» (49.6 in this PR). e2e `nextBoardDrag.spec.ts`.
  50.1, the rail of the sections (next/Sidebar.svelte): the aside is the rail (52 pt) and the panel (`width`, 260 by
  default, 200–360, `next:paneWidth`); the aside's width is set (52 + panel + 1 — WebKit shrank it by its content).
  Buttons 34 pt from 58, 4 apart, the label a hidden `.sr` (the names and texts the tests and readers find), the
  badge `.bd` («99+», alert on `todo`), the picked one `lampsoft` / `lampink` with a 2 pt `lamp` bar. What fits is
  counted from the rail's height (`railH - 108`; the list's own height looped the ResizeObserver with «⋯»); the rest
  in «⋯» — the window's menu (icon, name, the badge as its shortcut), lit while its section is picked. The gear in
  the rail; the folder's line without it. The panel's head: the name and the section's key (`kbd`). e2e
  `nextRail.spec.ts`; nextSidebar / nextWindow / nextAlertBadge / nextPluginPanel follow the new layout.
  50.2, the panel hidden, the rail kept: next/App always mounts the Sidebar with `open={store.showNav}`, kept on this
  Mac as `next:showNav` (the new interface only — the old window keeps it per run, as before). A click on the
  section picked hides it (`pick`), any other shows it (`setNavMode` shows); ⌘0 and the toolbar's button as before.
  Hidden: the aside 53 (`.side.closed`), the width eased 180 ms (none while dragging the edge, none with reduced
  motion), the pane `inert` and `visibility: hidden` after the ease; nothing lit; the rail's top is the toolbar's —
  `bg` and its line on `.lights`, the 1 pt over the line by `::before`, the rail's line from 52 (`::after`); the
  toolbar's content 32 pt in (`.bar.lights`, the lights over it). e2e `nextHidePanel.spec.ts`.
  50.3, «Сегодня» a section and a tab as any in the new interface: layout.ts `setPinning(false)` from next/App
  (before the layout is restored) — `isPinned` false, so no `pinFirst`, a «×», dragging; `today.open()` with
  `store.nextUi` makes the tab there active or puts a new one after the active tab (by its index: the state holds a
  proxy of the tab, `indexOf` of the tab itself is -1); the start of the day opens it so. The section has its panel
  (`sections.ts` panel true; next/TodayPanel.svelte — its foot «Полная версия» / «Завершить день», the body comes in
  50.4), the date under its head (today.ts `panelDate`). ⇧⌘H: the panel, again while shown — the tab (next/App
  `today`). The palette: `todayPanel` «Сегодня» (⇧⌘H) and `todayFull` «Сегодня — полная версия»; the old `today`
  only in the old shell. e2e `nextTodayTab.spec.ts`.
  50.4, the panel «Сегодня» (next/TodayPanel.svelte): its own TodayCtl (`list` 'todayPanel' — its list of tasks
  apart from the screen's, the pane the active one), so the data are the screen's. By another tab — the compact day:
  «Сделано N из M» (today.ts `dayProgress`: «Главное» and the agenda's tasks of the day, the ones closed today with
  them) and «до 18:00 — 3 ч» (`untilRemind`), a bar of 4 pt; the screen's blocks in its order — «Главное» (none:
  the first of «Задачи»), «Встречи» (the agenda's events, the time in a 34 pt column, the past struck, the one going
  on lit with «сейчас», `isNow`), «Просрочено» with «N дн.»; five rows, the fifth «Ещё N ›» to the full version at
  that block. «Из плагинов» comes with 50.5. By the tab «Сегодня» — its contents: a row a block (`c.layout`), the
  numbers («1 из 3», the agenda's count, «23:30», the overdue red), a click scrolls (the screen's blocks are
  wrapped in `.bw[data-block]`, `display: contents`; the screen's child selectors follow), the block highest still
  seen at the top lit; «Настроить блоки…». e2e `nextTodayPanel.spec.ts`. Tests fixed with it: nextScreens («Сегодня»
  a tab as any) and narrowing (the strip's coming read from its animation — a CI runner had too few frames).
  50.5, API 1.15: `block.setSummary({ text, tone? } | null)` on the handle of `ui.todayBlock` (index.ts
  `TodayBlockHandle`; PluginTodayBlock trims it to 40, `plugins.todaySummary`, cleared with its block and plugin). The
  panel «Сегодня»: «Из плагинов» in the compact day — a row a plugin's block with a summary, in the screen's order (a
  click: the full version at it); the contents take it as the number (alert red bold, wait `wait`). With no screen
  open the panel draws the plugins' blocks that are on out of sight (as the screen its resting ones), so the summaries
  keep coming. «Долгие дела»: the due ones, alert; «Цели» (goals.ts `goalsSummary`): the person longest without a
  mark of their active goals — «Борис · 5 нед.», alert past the section's threshold, else wait; their manifests ask
  `^1.15`. The surface snapshot (apiSurface.json) has the ctx only — the handle is not in it, so it is the same.
  README: `ui.todayBlock`. e2e `nextTodaySummary.spec.ts`.
  50.6, the search of the panel one line a result (next/SearchPanel.svelte): a result 24 pt — a heading's capsule (9
  pt) and title, or the line of text, the match on `lampsoft` bold, the heading it is under in its `title`; a file's
  row 24 pt with its icon. `searchAll.dense` (set by next/App; the old window keeps the first five files open):
  every file open, past 40 results the ones after the third folded. The keys go over the files' rows too (`sel.i`
  -1): ↩ on one folds it, → ← unfold and fold it, ← on a result folds its file and chooses its row; ⌥⌘G from a
  file's row goes to its first result (`searchStep`). e2e `nextSearchLines.spec.ts` (25 rows in a window of 900 pt);
  nextPanels follows.
  51, «Неделя» in the new interface — its look is the outside repo's (panopticon-week PRs #3–#7: `week.next` by
  `ui.look`, the tab on the grid, the overview, the review, the plan, «Сегодня» with its summaries, the calendar's
  buttons and card; the card mounts inside `[data-ui="next"]` for its tokens). Here: the calendar's column of the
  weeks' numbers in the new look (40 pt with a plugin's button, Plex Mono 10.5 `ink3`, this week `lampink`); the panel
  «Сегодня»'s foot buttons shrink with an ellipsis (they ran out of 260 pt). e2e weekPlugin.spec.ts runs every
  scenario of ТЗ 36 in both shells (`UI`, a describe per shell; the plugin's block by `.ptb[data-block]` — the new
  screen wraps its blocks in a place of the same name) and «the new look (ТЗ 51)»: fonts, the lamp, the grid, the
  compact day's rows «можно» / «1 из 3» / «нет плана», the column of 40 and the button of 24. It needs
  ../panopticon-week built from its latest branch.
  52.1, the mini window and the quick entry in the new interface: main.ts mounts next/SideWindow.svelte for #mini and
  #capture when `ui:next` is on (the old code may not import src/next; the old App mounted only their components
  there anyway) — its root has the tokens by the appearance (`effective(readChoice())`, followed by `storage` and the
  system's), `data-ui="next"`, `--ui`/`--mono`. They reload when the flag changes (a `storage` listener in main.ts,
  the main window writes it). next/MiniWindow (the old one's workings: the new Editor with `rich={false}` and the new
  `gutter` prop, FindPanel), next/MiniPalette, next/CaptureWindow (next/Capture with `standalone` — no `dim`); their
  look comes in 52.2–52.4. e2e miniNote.spec.ts runs in both shells; nextSideWindows.spec.ts.
  52.2, the mini window's look (next/MiniWindow.svelte): the side window's root has the class `next`, so editor.css
  is its; 12 pt corners, a line of `rule`; the header of 32 on `side` — the dot, the file's name without «.org» (`displayName`)
  ` ›` `ink3` and the heading `ink` 600, the palette's key as a `kbd` on `chip`, «Открыть в главном окне» `ink3`; the
  text «Исходник» always (`rich={false}`, no `gutter`) in Plex Mono 12.5 on lines of 22, 14 pt on top and 16 at the
  sides on the lines (the caret's line on `lampsoft` the whole width), headings 13; on the grid. «Заголовок удалён» with
  a button of ТЗ 44; «Доступно в главном окне» a popover; ⌘F the new editor's panel across the top.
  52.3, ⌘P of the mini window (next/MiniPalette.svelte): a popover of ТЗ 44 in the window, 8 pt inside its line, on
  `card`, radius 10, 6 inside; the field 34 on `field` with an inset 1.5 of `lampline`; rows 34, radius 7 — the
  level in stars (Plex Mono 11 `ink3`, a column of 22) or the file's icon, the title, the path without «.org» with
  « / » or «весь файл»; the one chosen on `lampsoft` bold; five in sight; the foot «↩ открыть здесь · ⌘↩ весь файл ·
  ⎋ закрыть». The workings as ТЗ 31 §4.
  52.4, the quick entry (next/Capture.svelte, one for ⇧⌘I and #capture): the interface's font — the title 19 / 600
  (was Cormorant 24), the details 14 / 1.5, 1–8 lines, 48 pt in under a line of `rule`; the foot on `side` with «→ inbox»
  (no «.org»), the keys, the key. Over another program (`standalone`): no `dim`, no shadow (native); added — a strip
  of 64 pt (a check in a circle of `done`, «Добавлено в Inbox», the task, «Открыть») for 1.5 s, then hidden; «Открыть»
  emits `capture-open-inbox` to the main window (store.listen opens the Inbox's file at its end) after
  `show_main_window`; not added — «Не удалось добавить…» `todo` under the title, the text kept. «Inbox пока не
  настроен» with the buttons of ТЗ 44. ListToast reads its action guarded (the toast is cleared before the action
  runs — it threw). e2e nextSideWindows.spec.ts, nextCapture.spec.ts follows.
  53.1, the results of the search in a tab (next/SearchTab.svelte, next/searchTabState.svelte.ts — not «searchTab»:
  the Mac's file system takes it for SearchTab.svelte): the view `search` registered by next/App (transient, single,
  no inspector), «Поиск: <запрос>» (cut to 24), its crumbs the count. One a window: `openSearchTab()` makes the one
  there active or opens it after the active tab, runs a query typed and not run, focuses its field (`tabFocus` — the
  panel's `focusN` would take the focus to the panel). From the panel ⌘↩ (field or list) and «Открыть все во вкладке
  ⌘↩» at its foot; ⇧⌘F with the panel shown; the palette's «Поиск: открыть результаты во вкладке» (registered from
  next/App — commands.ts may not import next; `commandIds`, a «search» icon). The header of ТЗ 47, the field up to 560
  with ×, «Aa» «.*» «Слово» (the panel's options), the count. The results are a plain list yet (53.2). e2e
  nextSearchTab.spec.ts.
  53.2, the results with their context (src/searchContext.ts `contextBlocks`, pure, tested): a match with the line
  before and after — a neighbour left out when missing, empty, a heading's line or in a drawer, or under another
  heading; matches two lines apart or nearer under one heading — one block, the lines shared once; a heading's line
  without its stars and status (the block's capsule), the marks moved by what is cut. The tab draws the blocks of the
  open groups from the text searched (`g.stamp`, its headings parsed when the file changed since; cached): the
  group's head sticky — chevron, icon, the name, the folder («корень»), «изменён — ↩ обновить» `wait` (runs again),
  the count; a block — the capsule and the path 42 pt in, the lines with their numbers (Plex Mono 10.5 in 30, the
  match's `lampink`), 13.5 / 1.55, three lines at most, the marks on `lampsoft` with a `lampline` ring; four blocks,
  then «Ещё N в <файл> ›»; «Ничего не найдено»; «Показаны первые 1000…» `wait`.
  53.3, the filters (src/searchFilters.ts `passes`/`facetCounts`, pure, tested; the state in searchTabState
  `tabFilters` — replaced whole on a change, dropped when `search.ran` changes, `liveFilters` pure for deriveds): a
  match's facet is its file, the status of the heading it is under (`Hit.under`) and that heading's tags with the
  inherited ones (`tagsOf`, the noInherit of tagsState), lower case. Files off, statuses ИЛИ, tags И; each facet's
  numbers over the others, not itself. «Где искать» is `search.scope` (runs again, the filters stay). The blocks are
  built on the kept matches and mapped back to the group's indices (`openHit`). The tab: the results and the 268 pt
  column scroll apart; «Файлы» top 5 + «Ещё N файлов ›», «Статус» with «без статуса» last, «Теги» top 12 + «Ещё N ›»
  (the chosen first); «N из M — с фильтрами»; «С фильтрами ничего не найдено» + «Сбросить фильтры».
  53.4, the keys and the panel: the tab's list — ↑↓ over the blocks shown (an open group's head passed by, a folded
  one a stop, `sel.i` -1), ← → fold and unfold, ↩ `openHit` (openFile puts the file after the active tab, or uses its
  tab there); ⌘F in the tab — its field (`find` action), ⎋ in the field — the list. ⌥⌘G with the tab open goes over
  the kept matches: `store.searchKept`, set by next/App to `keptForStep`. The find panel shows «из глобального
  поиска» after a jump (`fb.global`, off when the query is changed). While the tab is active the panel shows the
  field, a plate «Результаты — во вкладке «…»» (a click — `tabFocus.list`) and up to 8 recent queries with the time.
  ТЗ 54 (the settings in the new look), 54.1, the sheet: `src/settingsNav.svelte.ts` (both shells) — the sections
  and their order (`settingsSections`: own by `order`, the plugins' own, «Плагины»), which are made, the icons,
  `stepSection` (⌘[ ⌘], ↑↓ in the column, in the shell's order), `settingsLayers`/`setLayer` (a section's popover or
  dialog: ⎋ closes it, not the sheet). The statuses' editor moved out of the old Settings.svelte into
  `StatusesSettings.svelte` (the same code; its draft is made when the section is shown). `next/Settings.svelte`: the
  head 56 (the gear `lampink`, «Настройки» and the section, «Изменения применяются сразу», «Готово» with the keys in
  its tip), the column 220 on `side` (rows 30, the chosen `lampsoft`; «Настройки плагинов»; «Плагины» at the foot past
  a rule, the dot of updates), the section on the grid — Yeseva 30 title, a column of 720 (960 «Статусы», «Клавиши»),
  the theme editor across; the whole window under `dim`; under 820 the column is a strip on top. The sections' bodies
  still old, through bridges.ts in Compat — each replaced by 54.2–54.7, bridges.ts gone in 54.8. e2e
  nextSettingsSheet.spec.ts.
  54.2, the rows: `next/SetGroup.svelte` (the caption in capitals with its note, a card), `SetRow.svelte` (from 46,
  the name and hint, the control right or `wide` under them, the dot `lamp` of a changed value, a link row), and in
  `next/ui/` `Toggle` (36 × 22), `Segments`, `MenuButton` (28 pt «value ▾», a menu of ТЗ 44; it says its layer to
  settingsNav so ⎋ closes it first). `SetSchema.svelte` draws any schema with them (the long fields by FormFields
  `bare` — no label of its own; a file — the value and «Выбрать…» with the palette's files). `Field.default` (and
  `changedOf`, JSON-compared) gives the dot; a plugin's manifest fields have it already. `SetPluginHead.svelte`: the icon
  in a square of 30 on 14 % `plug`, the name, version · source, «включён». FormFields' plugin field is an attachment
  now — drawn again when its `render` comes after the plugin starts. The sheet is centred without a transform (a menu
  inside it is fixed to the window). e2e nextSettingsRows.spec.ts.
  54.3, «Основные» and «Оформление» (next/SetGeneral, SetLook): the folder (its path, «N файлов · size», «Изменить…»),
  «Интерфейс» (no «(бета)»), «Заголовки» (the step as segments Меньше/Обычный/Больше/Крупный = 1–4), «Ссылки»;
  dots by DEFAULT_LEVELS and «По ID». «Оформление»: the appearance as segments; the light themes as cards (a
  preview of 74: h1, `fg` and `cursor` bars; the name and «✓»; ←→ over them), a right click — the theme's menu
  (next Menu; «Удалить» by ConfirmSheet), «Импорт… / Новая тема»; the dark one's as a MenuButton; «Текст» — the
  font, the width (four segments as before), «Структура» right, the drawers folded. Gone in the new interface:
  «Экспериментальное», «заголовки в навигаторе», «Оформленный текст», the line numbers (the old sheet keeps all).
  The theme's editor is still the old one through a bridge (54.8). Mind the class `.tcard`: a global one exists.
  e2e nextSettingsLook.spec.ts, nextSettings.spec.ts moved to «Оформление».
  54.4, «Клавиши» and «Мини-окно»: the recording's logic moved out of KeysSettings.svelte into
  `src/keysEditor.svelte.ts` (`KeyEditor`: the query, `rec`, `pend`, the errors, start/stop/key/replace/reset, the
  texts; both shells' sections use it). `next/SetKeys.svelte`: the field, «Как в Emacs / Как в macOS» (Segments),
  «Сбросить все» (ConfirmSheet); a group per GROUPS with its note; a row — the name, `sub` (the chord spelt out), the
  chips (Plex Mono 12 on `field`, a changed one ringed `lampline`, recording `lamp` with a `lampsoft` ring, «Назначить»
  dashed, «+» in every row's slot, ↺), the clash and the recording's hint under the name; «Не настраиваются» a group.
  The old info plate is gone; the hints are the chips' tips. `next/SetMini.svelte`: the mini window's schema in rows
  («Не гаснуть после ввода» as segments, a copy of the schema), its three keys; a click sets `keysFocus` and opens
  «Клавиши» on that row. `SetRow` takes `dataId`. e2e nextSettingsKeys.spec.ts.
  54.5, «Плагины» (next/SetPlugins): one page — «Найти в каталоге» (over the installed and the catalog), «Установить
  по ссылке…»; «Установлены · N» (rows of 54: the icon on 14 % `plug`, the name and version, the description · its
  source, the problems and warnings under them, «Обновить · v» main, «⋯» — settings, a check, Finder, the plugin's keys,
  «Удалить плагин…»; «включён»); «Каталог · repo» — the not installed ones with «★ N» (downloads), «Установить» or why
  not, the progress as a bar of 3 with «Отменить»; «Папка плагинов» with API and the app's version. The old catalog
  page and a plugin's page are not in the new one. Sheets of ТЗ 44: PluginInstallSheet, PluginLinkSheet (its logic
  moved to `src/pluginLink.svelte.ts` `LinkInstall`, the old UrlSheet uses it too), PluginRemoveSheet (also for
  «Удалить плагин…» of a plugin's own section). The rights' sheet is next/PluginSheets' as before. e2e
  nextSettingsPlugins.spec.ts.
  54.6, «Статусы»: the draft's logic moved out of StatusesSettings.svelte into `src/statusesEditor.svelte.ts`
  (`StatusEditor`; `effects()` called in the component's init — the writes, a new row's focus, the layers); both shells'
  sections use it. `next/SetStatuses.svelte`: «Наборы» 220 (rows of 44, the keywords under the name, dragged by the
  row, «+ Набор» dashed), the set's name and «Удалить набор» (danger; «в заметках: N?» first); «В работе» and
  «Завершённые» groups of rows of 40 (the grip, the colour — a next Menu of «Авто» and the named ones, the capsule, the
  keyword in Plex Mono, the key 44, «новая задача» / «сделать новой» on hover, ×), «+ Состояние»; «В файле» plate;
  «Поведение» (CLOSED, LOGBOOK — kept though not on the mockup). The rename and delete dialogs are ConfirmSheets. A new
  state starts grey. No set is a plugin's in the editor, so «только чтение» is not shown. e2e
  nextSettingsStatuses.spec.ts.
  54.7, the other core sections by the rules of §2: next/SetToday (its two schemas, «Задачи» — the statuses' chips
  with a menu, the files' chips with the palette, the overdue; «Блоки» on/off, dragged or ⌥↑↓), SetTags (not
  inherited — chips and «+ тег»; each tag's colour — a MenuButton-like button with a menu of «Авто» and the named),
  SetAgendas (mine with their blocks and ×, «Новая агенда…», the plugins' blocks), SetInbox (the file by the palette,
  «В начало / В конец», the capture's key — to «Клавиши» on «capture», the switches, the status as a menu, the
  plugins' blocks). «Файлы» stays not made (disabled), as before. Only the theme's editor is bridged now; a feature's
  own settings component (none of the core's) would draw in Compat. e2e nextSettingsRest.spec.ts, nextCompat via the
  theme's editor.
  54.8, no bridges: the theme's editor is `next/SetThemeEditor.svelte` (the old one's logic, the groups as cards of
  rows, the example in next/Editor, «Исходник / Оформление» segments, the level menu a next Menu) with
  `next/ColorPop.svelte` (the old picker on the new tokens, not portalled — the sheet has no transform). `next/bridges.ts`
  is gone; eslint forbids an old component in `src/next/` with no exception; boundary.test checks the file is gone.
  The compatibility layer stays for what plugins draw the old way (their panels, tabs, sheets, own fields). The old
  sheet (src/Settings.svelte and its sections) stays for the old interface till it goes. e2e nextThemeEditor.spec.ts.
- **ТЗ 55, the plugin «Терминал» (`docs/55-plagin-terminal.md`)** — worked in a git worktree
  (`.claude/worktrees/t55`, node_modules a symlink; `.claude/` in `.git/info/exclude`) and cargo with its own
  `CARGO_TARGET_DIR`, so the user's `tauri dev` was not rebuilt. 55.1, the core: `src-tauri/src/pty.rs`
  (`portable-pty`, `libc`): `pty_spawn` (the right «process» checked by the manifest Rust reads; `$SHELL -l`, a
  command as `-c 'exec "$0" "$@"' cmd args…`; cwd the notes folder by default; TERM, COLORTERM, LANG from
  `AppleLocale` when not given, PANOPTICON, PANOPTICON_FOLDER), `pty_write`, `pty_resize`, `pty_kill` (the group:
  -pid), `pty_kill_plugin`, `pty_count`; a reader thread per process emits `pty-data` (UTF-8 with a cut character
  kept — `utf8_chunk`, tested) and `pty-exit` {code}; `RunEvent::Exit` kills all. JS: `src/api/process.ts`
  (`processApi`: one listener for both events, handles by id, output before `onData` kept, `livePtys`); `ctx.process`
  with the right, its `pty_kill_plugin` among the plugin's disposers; `pty()` returns a Promise (the spawn is async)
  and takes `shell`. `store.quit` asks `quitReq` («Завершить N процессов в терминале?», both shells) when processes
  live. API 1.16.0, README «Процессы», the template's copy, apiSurface. The e2e mock has a pretend shell (prompt, echo,
  `echo`, `exit`, ⌃C; `__ptyOut`). e2e processApi.spec.ts.
  55.2, `ui.drawer(id, { title, render })` → `DrawerHandle` (show, hide, toggle, shown, dispose; kept among the
  plugin's disposers): the host's `drawers` (by `plugin:id`) and `drawerShown`; `next/Drawer.svelte` under
  EditorArea in `.main` — always mounted, height 0 when hidden (180 ms CSS transition), each panel drawn once when
  first shown and kept (hidden by `display: none`, so the terminals live), the top edge dragged 160 … 70 % of the
  area, `next:drawerH` (330). The old interface: `show()` does nothing. ⌃` is the plugin's command (55.3). e2e
  drawerApi.spec.ts.
  55.3, the plugin `src/plugins/terminal` (off by default; rights process, clipboard; in Rust's BUILTIN_MANIFESTS;
  `@xterm/xterm` 6 with fit, web-links, search — the plugins' boundary test lets a plugin's own `@xterm/*` in):
  `term.ts` (`makeTerm`: IBM Plex Mono, lines of 20; `themeOf(el)` — the tokens laid solid on `bg` through a canvas,
  ANSI from todo/done/wait/next/plug/lampink/ink/ink3, the bright ones 15 % lighter; the file links `FILE_RE` and
  URLs on ⌘-click; the keys — ⌃` / ⌃⇧` the plugin's, ⌃ and ⌥ to the process, ⌘C/A/F/=/−/0 its own, the other ⌘ the
  app's), `sessions.svelte.ts` (`Session`: its own `host` element with `data-own-keys`, moved into what shows it,
  opened and the process started on first attach, ↩ restarts an ended one, «Процесс завершён (код N)»; `Terminals`:
  the list, the active one, `add`, `close` — a live one asks by `ui.sheet`, `toggle` — §2's rule by the focus), and
  `Panel.svelte` (the head of 32: the sessions' tabs with the dot, «+», «Во вкладку» (55.5), ⌃`, ⌄; the body;
  ⌘F's bar). The core: `keyDispatch` — an element with `data-own-keys` gets every non-⌘ press and the ⌘ ones it names
  (the press marked run by keys, so the menu leaves it); `url.open` and an absolute / «~/» path in `file.open`.
  The old interface: the commands say «Терминал — в новом интерфейсе» (the tab comes in 55.5). e2e terminal.spec.ts.
  55.4, the states: `Session.mood` (busy within 2 s of output, idle, bell, ended) and `moodText` («ждёт ввода»,
  «ждёт ответа», «завершена · код N»); xterm's `onBell` marks a session that is not in sight (`terms.inSight`: its
  panel shown, it active, `document.hasFocus()`), the mark cleared once it is; the section «Терминал» in the strip
  (manifest `navSections`, `Section.svelte` — «Сессии», the foot «Новая сессия ⌃⇧`») with `setBadge(n, alert)` for
  the ones that rang unseen. A notification of macOS when the window is not in front: API 1.16 `ui.systemNotify({
  title, body }, onClick)` → Rust `notify_system` → Swift `notify_text` (the id «tag:<plugin:n>|<ms>»; a click →
  `notify_on_tag`'s callback → the window forward, `notify-click` {tag} to the page, the host runs its `onClick`).
  Without a bundle (`tauri dev`, e2e) it is not shown (false); the mock logs it. e2e terminalMoods.spec.ts.
  55.5, the section, the tab, the profiles: the manifest's view `terminal` with `"transient": true` (API 1.16:
  `ManifestView.transient` → `registerView`); `terms.where` ('panel' | 'tab') — the sessions live in one place, the
  Panel of that place moves their `host` elements in (the other says «Сессии — в панели… · Показать»); «Во вкладку»
  (`toTab`: the drawer hidden, `ui.open('terminal')`), «В панель» (`toPanel`, a command; the tab closed brings them
  back too); the old interface — every show opens the tab, its Panel maps the old variables to the tokens (`.old`).
  `profiles.svelte.ts` (storage.local `profiles`; «Оболочка» by default and an empty «Агент» that asks its command;
  the form of `ui.form` — name, command split into args, folder, `KEY=value` lines, by default); the section adds
  «Профили» (their key of `terminal.profile1…5` or the command, a right click — edit, by default, remove; «+ Профиль…»),
  the sessions' right-click menu (rename, restart, to the tab / panel, end); ⌥-click on «+» the profiles. e2e
  terminalTab.spec.ts.
  42.10, in both shells unless said: narrowing a tab to a heading (`narrowTab.ts` `narrowRangeOf`/`narrowTarget`,
  `Tab.narrow` serialized, `store.narrowTab`/`widenTab`, keys `narrow` ⌃X N S and `widen` ⌃X N W — keyDispatch now
  takes three-press chords); find and replace (`search.ts` `findRanges`/`replacementOf` with `re`, `findView`
  `replaceFound`, `find.rep`, key `replace` ⌥⌘F; «Все» is one edit). The new shell's panel is `next/FindPanel.svelte`
  («.*» — a regular expression, `$1` in the replacement). Its link card (new shell only): `linkHooks.preview` in the
  store → `LinkPreview`, drawn by `cm/linkCard.ts` in a 500 ms hoverTooltip of `OrgEditor` instead of `linkTip`;
  «Исправить…» on a broken link opens «Ссылка на…» (`pickLink`). «⌘⌥-клик — рядом» is shown off: no such action yet.
  42.11: `src/nextPrefs.svelte.ts` (outside `next/`: the shared «Основные → Экспериментальное» shows it, disabled
  without the flag) — «Шрифт текста» `next:font` (serif / system / mono → `--text` and `data-font` on `.next`, the
  sizes in editor.css), «Ширина текста» `next:width` (`--col`: 620 / 700 / 860 / 100%), «Структура справа»
  `next:structure`. A change of font or width passes `look` to OrgEditor → `orgRich.refont` (tables measured again).
  Keys: `rich` ⌃⌘E (both shells), `searchAll` ⌘K (an action of the new shell only; the toolbar shows its key),
  the menu names `rich` «Оформление» and `insp` «Структура» in the new shell (`menu.ts` reads `nextOn`).
- **Reordering by dragging (tech sprint 4.3):** `reorder.svelte.ts`, `new Reorder(onDrop, onStart?)` with `use:r.handle={{ id, image? }}` (what is dragged; `image`: the closest element drawn while dragging) and `use:r.zone={id}` (a row or a place: 'end', 'separator'); `r.dragId` / `r.overId` draw the line. Used by the agenda builder's blocks, the statuses and their sets (Settings), the blocks of «Сегодня» (TodaySettings), «Главное на завтра» (EndDay). The keys (⌥↑ ⌥↓) stay with each list. The lists' ↑↓ were not made one action: they differ (wrap or stop, with Esc, Tab, a field).
- **Editor split (tech sprint 4.3):** `src/cm/` holds the editor's CodeMirror parts that do not hang on the component: `doc.ts` (heading lines, drawers, links per document version), `drawers.ts` (folding drawers and asked-for headings), `structure.ts` (applying an outline command, M-RET, S-Tab's cycle, `orgFold`), `decorate.ts` (the plain editor's marks), `narrow.ts` (narrowing to a subtree: `narrowing(n, onnarrow)` gives `{ field, ext }`), `lineLinks.ts`, `lineNote.ts`. Editor.svelte keeps the state, the commands table, the menus and the effects. Checked by screenshots (plain and rich, folded with S-Tab, light and dark): identical.
- **Pane and App split (tech sprint 4.2):** `PaneTabs.svelte` (a pane's row of tabs: scrolling with faded edges, «⌵», a tab's menu, the path tooltip), `tabLabels.ts` (`tabLabel`, `isCore`, `isGone`, `isDirty`, `OFF_ICON`; Pane uses them too), `Toolbar.svelte` (the window's toolbar and title bar: our traffic lights in full screen, the path, «Открыть в панели»). Checked by screenshots (many tabs, a dirty one, the menus, the tooltip, two panes, the agenda pressed, full screen; light and dark): identical, but for a scrollbar thumb that differs between runs of the same code.
- **Today split (tech sprint 4.2):** `TodayNote.svelte` («Записка со вчера»), `TodayMeetings.svelte` (the 1-1 cards, the plugins' lines and buttons on them, «Новая встреча»). The card's box and head are global `.tcard`, `.tcard-head/-name/-sub/-link/-none` in app.css (Today and its blocks share them). The rows (focus, agenda, tasks, overdue) stay in Today.svelte: they are one list of tasks with one selection. Checked by screenshots (light, dark; 1440 and 900): identical.
- **Agenda builder split (tech sprint 4.2):** `AgendaPreview.svelte` (the live preview, with its container rule) and `builderOptions.ts` (what each popover offers, `isChecked`, `dateOfForm`, `statusSets`, `folderTree`; tests in `builderOptions.test.ts`). Checked by 36 screenshots (the builder and every popover, light and dark, 1440 and 900 wide): identical.
- **ESLint (tech sprint 6.3):** `eslint.config.js` — the recommended rules of JS, typescript-eslint and eslint-plugin-svelte, no formatting rules. Off on purpose: `no-explicit-any` (JSON, the plugins' bridge), `no-unused-expressions` (`a && b()`, `(a(), b())`, an effect's dependency read), `no-control-regex` (`\u0000` placeholders), `svelte/prefer-svelte-reactivity`, `svelte/require-each-key`, `svelte/no-useless-mustaches` (`{' '}`). `{@html}` stays checked: each use says where its text is escaped. `npm run lint`; in `verify` and CI.
- **Logic out of the components (tech sprint 4.1):** `navRows.ts` (`visibleRows`: the navigator's rows), `layout.ts` `fitPanels`/`dividerRatio` (room for two panes, App), `statusFit.ts` (what fits in a pane's bottom bars, a measure injected), `builtinAgenda.ts` (the built-in agenda's items and day sections), `org.ts` `titleIndex` (which of the same titles; Agenda and Today had a copy each) and `DateKind`, `navTree.ts` `parentOf` (exported; JumpBar, Navigator, App), `lists.changedOutside` (a frozen list computed again; Agenda, TagsView, Today). Tests: `src/componentLogic.test.ts`.
- **e2e helpers (tech sprint 0.3):** `e2e/helpers.ts` — `diskAll`, `diskFile`, `log`, `settingsSheet`, `palette`, `openPalette`, `toast`, `openApp({ files, plugins: { id: rights }, now, viewport, local, mock, ready })`; specs import them under their old local names. New specs use `openApp`. The mock (`tauriMock.ts`) is a table of handlers by area (`handlers`, `sources` logged with their arguments) over shared helpers (`root`, `isNote`, `relocate`, `put`…); an unknown command throws «unmocked invoke».
- **Удаление плагина (fix of ТЗ 37):** «⋯» of an installed plugin (`PluginsSettings`: «Настройки плагина», «Проверить обновления» — catalog and git, «Страница в каталоге», «Показать в Finder» — Rust `plugin_reveal`, «Удалить плагин…»; the menu is portalled to <body>: the sheet's transform clips fixed children). «Удалить плагин…» also at the end of its settings page (`SchemaSettings`) and on its catalog page (`CatalogItem`). One dialog `RemovePlugin.svelte` (mounted in `Settings`, state `pluginUpdates.removing`), a box «Удалить и настройки плагина» off by default. `plugin_remove` moves the folder into `~/.Trash` itself and returns the path (another volume: the `trash` crate, no way back); `plugin_restore` moves it back. With the box: `store.forgetPluginData` (feature file → `{}`, `feature:<id>` in localStorage, key overrides `<id>.*`), kept in the toast's «Вернуть» (`restorePluginData`), the plugin on again if it was. The toast moved out of the inert `.win` (it is live over a sheet).
- **«Неделя» (ТЗ 36, PR C2 — in `../panopticon-week`, v0.3.0):** the buttons of the weeks via `ui.slot('calendar.weekCell')` (`weeks.cellOf`: ok / due / skip / now / plan / planned), the card of a week (`card.ts`: fixed over the page, ⎋ or a click aside closes, a second click on its button too); the plan sheet calls `plugins.call('quarter-goals', 'myActiveGoals')`; «перенесено» counts `HeadingInfo.reschedules` in the week while `workflow().logbook`. e2e in `weekPlugin.spec.ts` (9).
- **Каталог плагинов (ТЗ 37 `docs/37-katalog-plaginov.md`, PR A — the mechanics):** the catalog is the public repo `Panopticon-Org-Notes/plugins` (`plugins.json`, `stats.json` by a daily Action, `validate.yml` on PRs; local clone `../panopticon-plugins`). Rust `plugin_sources.rs`: `catalog_fetch` (raw `plugins.json`/`stats.json`, cache `plugins/.catalog.json`), `catalog_raw` (a repo's `manifest.json`/`README.md` at HEAD), `catalog_releases`, `plugin_install_release` (the release's assets by curl with `plugin-progress` events and `plugin_cancel`, checked, the old folder to the Trash), `git_refs` / `git_probe` / `plugin_install_git` (system git, `GIT_TERMINAL_PROMPT=0`, ssh BatchMode, 60 s; the built files from the root or `dist/`), `plugin_remove`; `.source.json` beside each plugin, read by `list_plugins` → `Entry.source` (`api/sources.ts`). `pluginUpdates.svelte.ts`: a check once a day (and in «Плагины»), `update` (other rights asked first: `plugins.askRights`, the trust sheet's `update`), `remove`; `plugins.refreshInstalled()` restarts only what changed. «Плагины»: search, icon (manifest `icon`), source, «Обновить · x», «…» (code ↗, check, «Удалить…»), a dot by the section (`SettingsSpec.dot`). The mock answers these commands from `window.__sources`; `cargo test -- --ignored` hits GitHub for real.
- **Каталог плагинов (ТЗ 37, PR B — the catalog):** pages inside «Плагины» (`PluginsSettings` `page`: 'list' | 'catalog' | an entry; `store.settingsCrumb` adds «› Каталог» to the sheet's title). `pluginCatalog.svelte.ts` (not `catalog.svelte.ts`: macOS would take `./catalog.svelte` for `Catalog.svelte`): the list + stats, each plugin's manifest from its repo, `stateOf` (install / installed / update / old / progress), `install` (`plugin-progress` events, `plugins.allow` when on at once, `refreshInstalled`, a toast with «Настройки плагина»), `cancel`. `Catalog.svelte` (search, order, categories, skeleton, error), `CatalogButton`, `CatalogItem` (README by `readme.ts` — a small Markdown, everything escaped, links outside; «Версии» from the releases), `InstallSheet` (rights, size, «Включить сразу»). Dialogs inside the settings sheet go to <body> with `use:portal` (the sheet clips what is fixed in it). e2e `pluginCatalog.spec.ts`.
- **Каталог плагинов (ТЗ 37, PR C — by a link):** «Установить по ссылке…» in the catalog's head → `UrlSheet.svelte`: «Проверить» = `git_probe` (the newest release tag, else the default branch; the segments «Последний тег · x» / «Ветка y» probe again), the plugin found (rights, fits, a built-in id refused), «Проверять обновления в этом репозитории» → `.source.json` `checkUpdates`; installed on at once (`plugins.allow`). The updates of such plugins are A's `pluginUpdates` (a newer release tag / a new commit of the branch). A Rust test runs the real git on a local `file://` repository. e2e `pluginLink.spec.ts`.
- **The plugins marked (the mockups of ТЗ 37):** the settings' column in three groups — the app's sections, «ПЛАГИНЫ» (`Плагины`), «НАСТРОЙКИ ПЛАГИНОВ» (the sections a plugin registers: `SettingsSpec.plugin`, by name); such a section starts with `PluginHead` (back, icon — `iconOf(m)`: own, nav, view or file view — name, version · author, switch, rights, «Сочетания плагина ›»); a gear in the list opens it. The palette: `Command`/`Row` `plugin` + `iconPath` — a purple mark on the icon and the plugin's name as a capsule (`.pm`, `.plug`); the row's label says «плагин «X»».
- **Теги (ТЗ 38 `docs/38-tegi.md`, PR A — the section and the tab):** «Задачи» is gone from the bar; the built-in plugins' sections stand in their places (`BUILTIN_NAV` in host: Файлы 0, Inbox 10, Агенда 30, Цели 40, Календарь 50, Теги 60, Поиск 70), «Теги» ⌃⌘8 (`navTags`; the Rust test `menu_accelerators.rs` lists it). `tags.ts` (pure: `tagCounts` — set on headings, #+FILETAGS with 0; `tagsOf` — own, parents' nearest first, the file's, minus «не наследовать»; `headingsWith` — all of them (И), with or without inheritance; `oftenWith`; `foundText`). `tagsState.svelte.ts` (`tags.colors` / `tags.noInherit` in .orgnotes/config.json, the order in localStorage, `open(tags, fresh)` — one tab «Тег» per pane, `add(tag)`). `TagsPanel.svelte` (the navigator), `TagsView.svelte` (the tab, kind `tags`, `features/tags.ts`; its rows are a list of ТЗ 34 — `lists.register('tags:'+pane)`, frozen until ⌘R), `TagsSettings.svelte` («Настройки → Теги» is ready now). The agenda's tag condition has «все из» (`op: 'all'`); `store.newAgendaInBuilder(from, draft)` opens the builder with a draft («Сохранить как агенду…»). `layout.openViewNew`. e2e `tags.spec.ts`.
- **Теги (ТЗ 38, PR B — the tag's menu):** the navigator's right click (290 pt): show, add, a new tab · «Переименовать во всех файлах…», «Объединить с…» (`TagRename.svelte`: the name checked as Org's, the preview `tagsState.preview` — headings, files, `perFile`, the tag there already → «объединятся»), «Цвет тега ›» (a submenu of the eight colours as capsules, «Без цвета»), «Убрать из всех файлов…» (asks). `tags.retag(text, lines, from, to|null)` changes the headings' tags (the spaces before them kept, a tag twice kept once, none left — the spaces go) and #+FILETAGS, only on the lines the parser found (not in blocks). `tagsState.rename` / `remove`: one `store.transaction` over the files (⌘Z outside the editor, or «Отменить» of the toast, takes it back whole); the colour, «не наследовать», the agendas' tag conditions and the open tabs follow. e2e `tagMenu.spec.ts`.
- **Теги (ТЗ 38, PR C — the editor):** «Теги…» (`tags` in keys.ts) is now an editor command, ⌃C Q in both sets (⌃C ⌃Q too in Emacs'); the palette's «Теги…» runs it in the editor once the focus is back (`commands.inEditor`, the heading's line passed: `EditorKeys.run(id, line)`); the editor's menu has «Теги…» on a heading's line. `TagPop.svelte` (capsules ×, the folder's tags by substring with how many headings, «Создать тег», ↩ ⌫ ⎋, a click aside): `Editor` puts each change in the line with `addToHistory: false`, and on closing swaps it back and in again as one step (`isolateHistory`) — one ⌘Z per opening. `tags.lineTags` / `withTags` keep the spaces before the tags. Typing « :» in a heading's line: `@codemirror/autocomplete` (`tagSource`, boosted by count; styled in app.css; a ↩ in its first ~75 ms is ignored by CodeMirror). A click on a tag — a capsule in «Оформленный текст» (`RichDeps.onTag`, `data-tag`), ⌘-click on `.cm-tags` in plain text — opens its tab. e2e `tagEdit.spec.ts`; `weekPlugin.spec` uses the local day now.
- **Действия с задачами в списках (ТЗ 34, PR C2 — the calendar):** `cal.picked` (path, line, layer, day) is the entry chosen, shared by the grid (chips, events of the week), «… ещё N» (`DayList`, not in the review's month: `mark`), the day panel (`Day.svelte`: a «ЗАДАЧА» block with «Выполнено» — the set's first final status — and «Перенести…» — `ui.pickDate`, then `cal.move` as a drag) and «Без даты» of the navigator. The grid registers `ui.taskList` (`cal.tasks`; `menuOf` opens the core's menu); a click chooses (and its day), a double click / ↩ opens, ⌘-click the neighbour pane as before; ↑ ↓ go over the entries of the chosen one's day, ← → leave it and move the day; a click on a day lets it go. No freeze: an entry goes to its new day at once.
- **Ссылки (ТЗ 35, PR A — ⌘V на выделение, ⌃C L):** `linkEdit.ts` (pure): `clipTarget` (an address with a scheme — http(s), mailto, file, id — or a whole `[[…]]` on one line), `relTarget` (a root-relative `file:` made relative to the file it goes into), `linkPaste` (the selection → `[[target][selection]]`; the exact label of a link → its target only; null → the web view's own paste), `headingLink` / `fileLink` / `labelOf` (by title without the cookie: `links.findLine` finds «Чек-лист» for «Чек-лист [2/5]»). `linkHooks` — what the editor asks of the app without importing the store (the store sets them at the end of store.svelte.ts): the editor's file is its `path` prop = the file's name in the folder (now passed by NarrowEditor and the mini window too). The editor's `paste` handler; commands `copyLink` (⌃C L, scope editor, group «Заголовки и задачи») and `pasteText` (⌥⇧⌘V, the new group «РЕДАКТОР»), both in «Правка». `store.headingLinkAt` / `copyHeadingLink` (the format `store.linkFormat`, «Основные → Ссылки», this Mac, `editor:links`; an :ID: added as one step), `store.readClipboard` → Rust `clipboard_text` → Swift `Clip.swift` (NSPasteboard; WebKit would ask the user). The lists' «Копировать ссылку» (ТЗ 34) uses the same. The palette's «Копировать ссылку на заголовок» (on a heading), the navigator's menu of a heading.
- **Ссылки (ТЗ 35, PR B — «Ссылка на», the editor's menu, the tooltip):** `linkStep` (commands.ts): the headings of every file but the archives, fuzzy, 40 at most, then «ИЛИ АДРЕС»; a row's `alt` runs on ⌘↩ (Palette). `linkPicker.ts` (imported by App, apart from the store: commands import the store) sets `linkHooks.pick`: `store.headingLinkPlan` gives the target at once and the :ID: write for later — the link goes into the editor first, then the :ID: (the editor's positions stay). The editor: commands `insertLink` ⌃C ⌃L, `editLink` ⌥⌘K (group «Редактор»); `contextmenu` → the menu of §4 drawn by the editor itself (ContextMenu in a portal: works in every editor; `detail` — a grey second line of an item); `hoverTooltip` (400 ms) with `linkHooks.describe` (the store: resolveLink → «billing.org › title», «Заголовок не найден»). The mini window has no palette: ⌃C ⌃L does nothing there.
- **«Канбан» (ТЗ 33, PR A — the board to read; API 1.5.0):** a built-in plugin `src/plugins/kanban`. The core's **view of a file**: `contributes.fileViews` → `views.registerFileView`; a file tab's `view` ('' text, else a view id; unset — as the file was last: `store.viewOf`, `store.showAs`, the memory `fileView:<dir>` in localStorage; `defaultFor(text)` — a file opened the first time). Pane draws `PluginFileView` (one component: a spec registered anew must not draw the view anew; the condition does not depend on the file object, which a reread replaces) and the view's icon on the tab; the tab's menu has «Показать как ›» (`ContextMenu` got submenus and grey notes). `ui.showAs`, `ui.editorLink` (`lineLinks.ts`: widgets at the end of lines in `Editor`, which now gets the file's `path`), `tab.active` gives `view`, `ui.menu` items take `checked` and `hint`. The plugin: `board.ts` (pure: `#+BOARD`, `boardFor`, `countFor` / `bestSet`, `titleHtml`), `state.svelte.ts` (the files it shows, read through `files.read` + `index.workflow`; folded columns per file on this Mac), `Board.svelte`, `Setup.svelte` (a bare sheet). A status belongs to one set in the core: a set's columns are the statuses the core gives it.
- **«Канбан» (ТЗ 33, PR B — the actions):** the core's `Tx.move(ref, { before | after })` and `Tx.insertHeading({ after }, org)` (`orgOps.moveBeside`, `insertAfter`: at the level of the other heading, the file keeps its ending blank lines); a plugin's command `"scope": "view"` — its keys work while a file tab shows a view of the plugin and no field has the focus (`declare.viewScope`, its own group of «Клавиши» «ДОСКА», «только в виде «Доска»»; the palette offers it while the view is shown). The board: pointer dragging in `Board.svelte` (a tilted copy, the card at 35 %, a dashed place; `targetAt` finds the column by `data-col` and the place by the cards' middles) → `kanban.moveCard` (one transaction: the status, then right after the card above / before the one below — the heading's own title, with its cookie, finds it; a repeated task finished goes back to the first status by `setKeyword` and does not move: «Повторяющаяся задача: следующая дата — …»); ⇧← ⇧→ change the status only, ⌥↑ ⌥↓ the place; ← → ↑ ↓ ⎋ in the board itself; «+» / «+ Карточка» — a field, ↩ «* STATUS text» after the column's last heading (an empty column: the end of the file).
- **«Канбан» (ТЗ 33, PR C — the archive, deleting, the card at the side):** the app reads `*.org_archive` (Rust `is_org`, `with_org` keeps it; the mock too): in the navigator and openable, not in the agenda, the calendar, «Сегодня», the dates' month, a plugin's `index.files()` / `query` — they read `store.agendaFiles` (the same list, an archive without headings: the indexes stay). API 1.5: `edit.ensureFile(path)`, `ui.editor(el, ref, { onRef })` (`PluginEditor.svelte`: `NarrowEditor` without the gutter, following the heading by its title near its line, by its line while typed). The plugin: `archive.ts` (`archivePath` — «#+ARCHIVE: loc::» of the header, «%s_archive» by default, relative to the file's folder; the «::heading» part is not used yet; `archiveEntry` — the subtree with ARCHIVE_TIME, _FILE (the folder's path + the file), _OLPATH when nested, _CATEGORY, _TODO); `kanban.archiveCard` — the file made first, then one transaction (`insertHeading` at the archive's end + `remove`); `removeCard`; both say so with «Отменить» (`edit.undo`). The zones show while dragging (fixed, placed from the board's rect at the drag's start); the side panel: `opened` (what the editor is made for) apart from `peek` (where the heading is now, from `onRef`), or the effect loops.
- **The navigator and the inspector slide** (App.svelte `slide`): a `.slot` around the panel and its splitter, its width animated (220 ms, none with reduced motion); the navigator's content is held by its right edge, the inspector's by its left one, so they slide out to their sides as in Xcode.
- **The calendar is a plugin (roadmap 3.2 B, ТЗ 29):** `src/plugins/calendar/` — `plugin.svelte.ts` (view `calendar.view` with `inspector` = `Day`, the toolbar button by the manifest, section `calendar` = `Panel`, command `calendar.open`, «+ Задача / + Событие» as a bare sheet `NewSheet`/`New`, the settings' dynamic parts), `state.svelte.ts` (`cal`: every file read through the API and parsed, layers and hidden files in `storage.local` data `{ layers, hidden: { [folder]: [...] } }`, the last files in `storage.folder` data, moves and new entries as `tx.update` with the pure `edit.ts`), `View.svelte` (keeps its state, `setState` on changes), `DayList.svelte` (a copy of the core's `CalDayList`). The core keeps `calIndex.ts` (in `@panopticon/api/org`), the month under the Inbox review's card (`CalReview.svelte`, `CalDayList.svelte`, `calOpen.ts`: the entries the calendar shows, by `plugins.monthFilter` — #99). Migration `features/calendarMigration.ts`: `StorageSpec.upgrade` reads the old flat `calendar.json` / `feature:calendar` as `{ settings, data }`; kind alias `calendar` → `calendar.view`; RENAMED `navCalendar`, `calendar`. Host: `PluginView` does not redraw on the view's own `setState`; plugin settings' first change writes the folder file when config.json still has the old key; a plugin turned off while activating drops what it registered (`dropLate`); plugin settings sections go after «Клавиши» (order 81+).
- **The calendar's extension points (roadmap 3.2 A, ТЗ 29 §1):** a plugin view's `inspector` (`PluginInspector.svelte`, registered for every plugin view with `hasInspector` = the spec has one; redrawn on the tab's state); manifest `views[].toolbar` → a button in «Открыть в панели» after the core's (`plugins.toolbarViews`, `plugins.toggleSecond(kind)`: a new tab gets `restore(null)`); `index.inbox().add`; `calIndex` exported by `@panopticon/api/org`. The month under the Inbox review's card stays the core's and shows every dated entry (no calendar layers or hidden files: tech debt #99).
- **Inbox's extension points (roadmap 3.1 A, ТЗ 28 §1; API 1.2.0):** `index.inbox()` + event `inbox.changed`; core commands `capture.open`, `inbox.pickFile`, `inbox.createFile`, `heading.schedule|deadline|tags|priority` (as `heading.status`: the palette's step on the tab's file), `file.open { beside, focus }`; `ui.setBadge` (`plugins.badges`, NavSpec `badge`); `ui.refile(ref, { before, quiet })` (resolves after the core's write; `writing` keeps the dialog's close from reading as a cancel); `edit.undo()` = `store.undoLast()`; widget `month` (`CalReview.svelte` now takes `open` / `ontoggle` / `keyId`). Each plugin with review commands has its own key scope `pluginReview:<id>` (declare.ts `reviewScope`). PluginReview follows a card's heading edited in place (`onnarrow` → `plugins.reviewEdited`, same title or same line; `reviewHeading` falls back to the heading at the ref's line); its card key is `cur|gen|path` and `below` is redrawn only when the card changes.
- **Core and plugins roadmap:** `docs/roadmap-yadro-i-plaginy.md` (from `docs/brief-yadro-i-plaginy.md`). Every PR of the roadmap updates its task's status there. Stage 0 (core preparation) changes no behaviour except one ⌘Z everywhere.

1. **Full-screen traffic lights**: the lights drawn in the toolbar showed their glyphs on hover but did nothing on a
   click. The cause was not the strip: `setFullscreen` (and `toggleMaximize`, the toolbar's double click) were not in
   `src-tauri/capabilities/default.json`, so Tauri refused them silently. Allowed now; `src/capabilities.test.ts`
   checks that every window call of the frontend is allowed. To be confirmed by the user on the native app.
2. **⇧⌘I from another program** (Inbox) — verified by the user by hand on 2026-10-11: works.
3. **Inspector says «Состояние»** — should be «Статус».
4. **Not built yet:**
   - the six built-in agendas from the mockup (Неделя, Сегодня…) and «Дублировать в мои»;
   - navigator modes Задачи, Теги, Поиск;
   - Settings tabs Теги, Файлы;
   - hotkeys for Inbox row actions (postponed by decision);
   - the «Структурный вид» shortcut (decide after a week of use);
   - circles instead of stars (the architecture is ready: `Marker` widget in `orgIndent.ts`).
5. **Small known deviations:**
    - «Создать inbox.org» writes `#+TITLE: inbox`.
    - Shortcuts (ТЗ 22): not checked in the built app yet — that WebKit gives ⌘1 in the review tab to the page before
      the menu's «Заметки» (the design relies on it), and that the menu is rebuilt without flicker. ⌥← and ⌥⇧← both
      move the heading with its subtree, as before.
6. **`sample_notes_dir`** is compiled from `CARGO_MANIFEST_DIR`. It only works on the build machine; elsewhere the
   button is hidden, which is fine.

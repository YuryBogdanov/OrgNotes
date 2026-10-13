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
npx vitest run                        # unit tests (~209)
E2E_PORT=1431 npx playwright test     # e2e, WebKit, Tauri mocked (~288, ~1.2 min)
(cd src-tauri && cargo test)          # Rust: safe save, config, menu accelerators
npx svelte-check                      # 4 errors are pre-existing (png imports, JumpBar :148, Settings InputEvent cast)
scripts/release-mac.sh                # build + verify the signature + zip → dist-release/
```

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
- **Releases so far:** v0.1.0 (first build, new icon), v0.1.1 (path-bar menus), v0.2.0 (Inbox), v0.3.0 (Inbox review, refile tree, drawers), v0.4.0 (rich text, date calendar), v0.5.0 (search), v0.5.1 (no accent bar with one editor), v0.6.0 (settings sheet and «Клавиши», navigator tree, promote one heading, selection), v0.7.0 (goals of the quarter, ⌥↩ in lists), v0.8.0 (the calendar), v0.9.0 (appearance and editor themes), v1.0.0 (plugins: the core and the API v1, «Настройки → Плагины», the Emacs themes as a plugin), v1.1.0 (the goals of the quarter as a plugin, API 1.1, the guide and the template of a plugin). The user's other
  machine is Apple Silicon.
- **Icon:** `src-tauri/icons/source.png` (designer square) → a script makes `app-icon.png` (824/1024 rounded square,
  radius 185, shadow) and `src/assets/app-icon.png` (512, welcome screen) → `npx tauri icon …` →
  `rm -rf src-tauri/icons/{android,ios}`. The exact PIL snippet is in the v0.1.0 commit (74a6edd).

## 6. Architecture map

**Frontend (`src/`)**

| File | What |
|---|---|
| `store.svelte.ts` (1.6k) | The single `Store` class (`$state` fields). Files, reload/watch, autosave (500 ms) and `save()` with conflict detection, layout, config, agendas, Inbox, quick entry, toasts, history. Most features hook in here. |
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
| `NavPanel.svelte` | Navigator mode bar (Файлы, Inbox, Задачи*, Агенда, Теги*, Поиск*; * = disabled) → `Navigator` / `InboxPanel` / `AgendaList`. ⌃⌘1/2/3. |
| `calIndex.ts`, `CalendarView.svelte`, `CalDayList.svelte`, `CalendarPanel.svelte`, `CalendarDay.svelte` | The calendar (ТЗ 24, part 1 of 3). `calIndex.ts`: dated entries of the files (scheduled, deadline, events — a timestamp in the title or under it, with `HH:MM-HH:MM`, ranges `<a>--<b>` — and the finished by CLOSED), repeats unfolded only in the days shown, cached per file text; the day order; month/week grids. A tab of kind `calendar` (`calendar: {view, date}`, one per pane, ⌘3; the toolbar button opens it in the second pane). The navigator mode «Календарь» (⌃⌘5) has the layers (`cal:layers`) and files (`cal:hidden`), «Без даты»; the inspector shows the chosen day. «… ещё N» → `CalDayList` (click: a new tab, ⌘-click: the neighbour pane). Part 2: `calEdit.ts` — `moveEntry` (a chip dropped on a day / a time: SCHEDULED, DEADLINE or the event stamp; ranges keep length), `insertEntry` (a new task/event at the end of a level-1 heading, made if missing, or as the Inbox does), `CalSettings` (`calendar` in config.json, `store.calCfg`). HTML5 drag via `store.calDrag`; repeats ask first (the whole series moves); `store.calUndo` for ⌘Z in the calendar. `CalNew.svelte` is the quick entry of «+ Задача / + Событие» (double click, N); no file set → the Inbox file. Part 3: `CalReview.svelte` under the review's card — folded at every new review (`store.reviewCal`), ⌘K (`reviewCalendar`, review scope); a compact month of the same layers/files, the month of the task's SCHEDULED/DEADLINE (leafing holds until the next card), its cell dashed, two entries a cell, «— эта задача» in `CalDayList` (`mark`). No dragging there. |
| `goals.ts`, `GoalsPanel.svelte`, `Goals.svelte`, `GoalAdd.svelte`, `GoalForm.svelte`, `textList.ts` | Goals of the quarter (ТЗ 23, part 1 of 3). A source = file + level-1 heading (`goals` in config.json, one `me`); quarters are level-2 «Квартал Q4 2026», goals level 3 (BACKLOG/ACTIVE/COMPLETED), fields level 4 «Что буду делать» / «Ожидаемый результат» / «Отметки» (`- [date] text`). Navigator mode «Цели» (⌃⌘4), a tab of kind `goals` (`goals`: source key or `*` = «Обзор квартала»), «Добавить цели», «Новая цель» (written by `insertGoal`, the quarter made if needed). «Молчит» = ACTIVE without a mark > 14 days. The set «Цели на квартал» is added to the statuses when a source or goal is added and no set knows ACTIVE. Part 2: `GoalReview.svelte`, a tab of kind `goalReview` (`path` = the person's file, `goals` = the source) — the card narrows an Editor to the goal (`folded`, `lineNote` props), marks on the right; the queue/actions are `store.goalReview*` (goals are known by quarter + title); key scope `goalReview` (⌘↩ ⌘1 ⌘2 ⌘[ ⌘]) nested over window/editor/review. Part 3: `GoalReport.svelte` (the report of the quarter, copied by `reportText` as text or Markdown), `GoalCarry.svelte` (`carryOver`: open goals under the next quarter, a deadline of the old quarter → its last day, a mark «Перенесена из …»), `goalSettings` in config.json (silent 7/14/21/30 days, soon 2/4/6/8 weeks) in «Настройки → Агенды». |
| `Navigator.svelte`, `navTree.ts` | The file tree (ТЗ 02): folded by default, an explicit set of open keys per notes folder (`nav:open:<dir>`); the path to the current file and heading opens when it changes. «Свернуть всё» keeps only that path, «Развернуть всё» opens all (headings left closed over `EXPAND_CAP` = 2000 nodes). ⌥-click / ⌥→ ⌥← on a subtree. Keys: `folder/`, file path, `path#Title › Sub` for headings. |
| `JumpBar.svelte` | Toolbar path, Xcode style; ⌃⌘J keyboard; segment menu = everything in the segment's folder (folders, separator, files); filter. |
| `Palette.svelte` + `commands.ts` + `fuzzy.ts` | Command palette (⇧⌘P), goto file (⇧⌘O), new file (⇧⌘N), `#` headings. |
| `Agenda.svelte`, `AgendaList.svelte`, `AgendaBuilder.svelte`, `agendas.ts` | Built-in agenda + custom agendas (blocks of conditions, stored in config.json); the builder is a modal sheet. `agendas.ts` is the pure engine. |
| `InboxPanel.svelte`, `Picker.svelte`, `Capture.svelte`, `CaptureWindow.svelte`, `inbox.ts` | Inbox section, where-to palette (choose file / refile), quick entry (in-window overlay and the `#capture` panel window), pure Inbox logic. |
| `Review.svelte`, `review.ts` | «Разбор Inbox» (ТЗ 18): a tab of kind `review` whose `path` follows the card's file (so `store.file`/`selected`, the palette and the inspector work on the card); the card is an `Editor` with `narrow` (hidden lines outside the subtree, a change filter for user edits). Queue/actions in the store (`review*`). Action keys ⌘1–5, ⌘[ (scope «Разбор Inbox» of `keys.ts`: they win over the window's ⌘1/⌘2/⌘[ while the tab is shown; registered as `store.reviewKeys`). |
| `Refile.svelte`, `refile.ts` | Move a heading: file → place in a tree (ТЗ 16); `from` palette / inbox / review. |
| `themes.ts`, `appearance.ts`, `AppearanceSettings.svelte`, `colors.ts` | Appearance and editor themes (ТЗ 25, part 1 of 3). `data-appearance` on the root switches the app tokens of `app.css` (no `prefers-color-scheme` in CSS any more); «Системное» follows `matchMedia`; the native window gets `setTheme`. The editor takes `--ed-*` (bg, fg, dim, cur, sel, caret, h1–h9, date, tag, link, meta, code, hl) and statuses/tags `--p-<named>` from the theme of the current appearance (a `<style id="editor-theme">`, applied in `main.ts` before the first paint and by an effect in `App.svelte`). Choice and theme names are in localStorage (`appearance`, `theme:light`, `theme:dark`). Status colours are 8 named ones (red orange yellow green teal blue purple gray); an old pink/hex is read as the nearest (`asNamed`). Part 2: own themes are `themes/<name>.json` in the app config folder (Rust `list_themes`, `write_theme`, `delete_theme`; `export_text`/`import_text` for the save/open panels); `parseTheme`/`themeJson`/`copyOf`/`uniqueName` in `themes.ts`; `store.ownThemes`, `copyTheme`, `renameTheme`, `deleteTheme`, `exportTheme`, `importTheme`. The last own theme applied is cached in localStorage (`theme:last:<appearance>`) so it paints before the folder is read. The card menu and the delete dialog are portalled to the body (the sheet's transform). Part 3: `ThemeEditor.svelte` takes the place of the section while `store.themeEditing` is set («Оформление › Тема редактора»): rows by groups (`lowContrast` marks text < 4.5:1, headings < 3:1), levels 5–9 behind a link (inherit level 4, «Как уровень 4» in the row menu), a live example — the real `Editor` with the theme's `themeVars` on its wrapper, «Текст / Оформление». `ColorPop.svelte` is the picker (HSV field, hue, alpha for the current line and the selection, hex, the palette); it is portalled to the body. `store.setThemeColors` shows a change at once and writes the file 300 ms later; `editTheme` copies a built-in one first; `resetTheme` takes the colours of `basedOn`. |
| `Settings.svelte` + `workflowEditor.ts` | Settings: a sheet over the main window (ТЗ 22), sections in a column on the left (`store.settingsSection`, remembered). Ready: Основные, Оформление, Статусы, Агенды, Календарь, Inbox, Клавиши. Теги/Файлы are disabled. `Picker.svelte` takes `onpick` for any file setting. ⌘, toggles, ⎋/«Готово» close, ⌘[ ⌘] switch. |
| `keys.ts`, `keyDispatch.ts`, `editorKeys.ts`, `KeysSettings.svelte` | Shortcuts (ТЗ 22). `keys.ts`: the registry (id, title, group, scope, defaults of «Как в Emacs» / «Как в macOS»), presses as shown («⇧⌘O», chords «⌃C S»), accelerators, recording rules, clashes (nested scopes review⊃window, heading⊃editor don't clash). `keyDispatch.ts`: one window keydown handler (capture phase) runs everything by scope: review → editor/heading (the focused editor's commands, `editorKeys.ts`) → window; chords wait 1.5 s. The menu shows the same accelerators; WebKit gives keys to the page first, and `menuMayRun` keeps one key from running twice. New commands go into `KEY_COMMANDS` and, if in the menu, `src-tauri/tests/menu_accelerators.rs` (a vitest checks the list). |
| `Inspector.svelte`, `Outline.svelte` | Right panel: task properties / file structure. |
| `CloseSheet`, `SaveAsSheet`, `DiskSheet`, `Dialogs`, `StartScreen`, `EmptyFolder`, `ColorPicker`, `ContextMenu`, `Splitter`, `Pane` | As named. `DiskSheet` = file changed on disk (diff in `diff.ts`). |
| `menu.ts` | Native menu (Tauri). Every accelerator must also be listed in `src-tauri/tests/menu_accelerators.rs` (regenerate it with a regex over `it('…','…','ACC')`). |

**Rust (`src-tauri/src/lib.rs`, one file)**
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
  - `inbox` {file, status, created, add (top|end, default top), order, counter, details, confirm, reviewDone, reviewCancel, reviewOrder, stale}; defaults are omitted.
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
- **Feature modules (roadmap 0.2):** the calendar, the goals, the Inbox review and the Inbox list live in `src/features/*.svelte.ts` (a class and a singleton: `calendar`, `goals`, `inboxReview`, `inbox`); components import them, the core (`store.svelte.ts`) does not. A feature reads its keys of config.json with `store.onConfig(fn)`, registers its sheets with `store.addSheet(() => open)`, and moves its headings with `store.refileHeading(f, h, { before, busy, done })`. The quick entry and the Inbox file setting stay in the core.
- **Shell registries (roadmap 0.3):** `src/views.ts` — `registerView` (a kind of tab: label, icon, component, crumbs, inspector, transient, fileOf, restore, single, onGone), `registerNav`, `registerSettings`; `keys.ts` — `registerKeys` (`after` places a command), `registerGroup`, `registerScope` (nesting, «Вне …» note, rank). A feature's tab keeps its state in `tab.data`; a kind nobody registers is restored as «Функция выключена» and saved back unchanged. The built-in features register in `src/features/index.ts` (imported first by `App.svelte`) and `src/features/keys.ts` (imported first by `main.ts`, so saved overrides of their keys are not dropped). A tab's keys: `store.setScopeKeys(scope, { active, run })`.
- **Review by cards (roadmap 0.4):** `CardReview.svelte` is the frame of a review (stage, card with `head` / `quick` / `body` / `below` snippets, the bar with `back` and `actions` / `barEnd`, the `summary`, `empty`); it registers the review's key scope (`scope`, `keys`). `NarrowEditor.svelte` shows one heading with its subtree (the card's body). Both reviews use them.
- **Choice of a place (roadmap 0.5):** `PlacePicker.svelte` — `variant: 'palette'` (two steps: a file, then a heading tree or `top` «1-й уровень»; `kind: 'file'` stops at the file; `plate` snippet, `recent`, `self` / `exclude`, `blocked` subtree, `onpick` returns an error text to stay open; portalled to the body) or `variant: 'columns'` (files and headings of `levels` in a sheet, `extra` «+ Создать», `move` / `focusList` for the sheet's ↑↓). Refile, Picker and GoalAdd use it.
- **Feature storage (roadmap 0.6):** a feature's settings live in the notes folder — `store.folderData(id)` / `setFolderData(id, v)` (`.orgnotes/plugins/<id>.json`, Rust `read_feature_file` / `write_feature_file`, read in `load()` before the config) — or on this Mac — `store.localData(id)` / `setLocalData` (localStorage `feature:<id>`). `registerStorage(id, { legacy, legacyKeys, localLegacy })` reads the old place in config.json until the first folder write, which drops `legacyKeys` from config.json. A feature's set of statuses is registered in memory with `registerStatusSet(id, def, when)` (marked `feature`, never written, hidden in the statuses editor). The goals and the calendar use it; the Inbox settings stay in config.json.
- **Settings by schema (roadmap 0.6):** `src/settingsSchema.ts` — a feature describes a section as groups of fields (`choice` segments/menu, `switch`, `text`, `file`, `pair`), each with `label`, `hint` (may be a function of the values) and `where` (`folder` / `local`); `values()` / `set(patch)` are the feature's. `SchemaSettings.svelte` draws it: a section (`registerSettings({ id, icon, order, schema })`) or a block in another section (`registerSettingsBlock({ section, order, schema })`, drawn by `Settings.svelte` via `blocksOf`). Menus keep the option's type (`optValue` / `optOf`). The calendar (`features/calendarSettings.ts`) and the goals block (`goalsSchema`) use it.
- **Plugins API (roadmap 1.1, ТЗ 26):** `src/api/index.ts` is `@panopticon/api` (vite alias): the types and `definePlugin`. `src/api/manifest.ts` parses manifests (`parseManifest`, `satisfies`, `incompatible`). `src/api/declare.ts` (imported by `main.ts` after `features/keys`) finds the built-in manifests (`src/plugins/*/manifest.json`), reads on/off (`localStorage plugins:enabled`; built-ins on unless `defaultEnabled: false`) and registers their commands' keys before the store reads bindings. `src/api/host.svelte.ts` (`plugins`) registers what the manifests declare — nav sections (`PluginNav.svelte`), kinds of tabs (`PluginView.svelte`, state in `tab.data`, `redraw` on `ui.open`), settings schemas, palette commands (`registerAction` in views.ts), status sets — and `start()` (App onMount) activates the code with a `ctx`; `guard` turns a failing plugin off until restart and disposes everything it registered. A plugin's storage is `{ data, settings }` in `.orgnotes/plugins/<id>.json` and `feature:<id>`. Paths in the API are relative (`f.name`); `apiTx` maps them to the core's. `src/plugins/boundary.test.ts` enforces that plugins import only `@panopticon/api`, svelte and their own files. Example: `src/plugins/hello` (off by default).
- **Plugins' sheets and review (roadmap 1.1 B):** `plugins.form` / `plugins.place` are drawn by `PluginSheets.svelte` (in App; a sheet for `sheetOpen`): the form is `SchemaSettings` with `where={false}` over local values, the place is `PlacePicker` (relative paths back). `ui.pickDate` opens the palette's calendar with kind `DATE` (no «Вставится» line) and resolves null when the palette closes unpicked. `ui.review` keeps one `plugins.review` (refs, cur, done) shown by the core's view `plugin.review` (`PluginReview.svelte`, transient); action keys are manifest commands with `"scope": "review"` in the scope `pluginReview` (declare.ts); the promise resolves at the summary or when the tab is closed.
- **Plugin loader (roadmap 1.2):** installed plugins live in `<app config dir>/plugins/<id>/` (Rust `list_plugins`, `read_plugin_file` — path checked to stay inside, `open_plugins_folder`). `declare.ts` keeps the last list on this Mac (`plugins:installed`) so their keys are declared before the store reads bindings; `plugins.start()` lists anew (`listInstalled`), then activates. Installed `main.js` is imported from a Blob (one bundled ES module, `export default { activate }`), `styles.css` becomes a `<style data-plugin>`. `plugins.setEnabled(id, on)` and `plugins.reload()` work at once: `declareAll` / `teardown` register and take back everything (keys via `declareKeys` / `undeclareKeys` + `store.keysVersion++`, which `store.bindings` reads). Overrides of plugin commands (ids with a dot) survive in `parseState` while the plugin is off. `PluginsSettings.svelte` is «Настройки → Плагины» (order 85); `Pane.svelte`'s placeholder offers «Включить» for a plugin's tab. In e2e, installed plugins are mock files under `/config/plugins/<dir>/`.
- **Plugin rights (roadmap 1.3):** a `ctx` field exists only with its right. `ctx.net.fetch` checks the host (`hostOf` / `hostAllowed` in manifest.ts) and calls Rust `net_fetch`, which reads the plugin's manifest itself (built-ins via `include_str!` in `BUILTIN_MANIFESTS` — add a new built-in plugin's manifest there) and runs `/usr/bin/curl` (30 s, 10 MB). The window has a CSP: `tauri.conf.json` (`csp`, `devCsp` with ws://localhost:1420, `dangerousDisableAssetCspModification: ["style-src"]` so inline styles keep working) and a meta in `index.html` (dev and e2e) — no `fetch` to the outside from the page. Installed plugins are let in by the sheet in `PluginSheets.svelte` (`plugins.trustReq`); the consent is kept with the rights (`plugins:trusted`), other rights at start turn the plugin off (`plugins.untrusted`). `PluginSheets` sits outside the inert `.win`, over the settings.
- **Themes as a plugin (roadmap 1.4):** `themes.ts` `BUILTIN` holds only the two Panopticon themes; the Emacs ones are `src/plugins/theme-pack` (manifest `contributes.themes` → JSON in the ТЗ 25 format). The host reads a plugin's themes (built-in: `DATA` glob of `src/plugins/*/**/*.json?raw`; installed: `read_plugin_file`) and calls `store.addThemes(id, list)` (they become `builtin: true, plugin: id`); `store.themes` = core + plugin + own. A chosen plugin theme is cached (`theme:last:<a>`) and shown until `store.pluginsReady`; turning the pack off calls `store.resetMissingThemes()`. A new built-in plugin must also be added to `BUILTIN_MANIFESTS` in lib.rs (a test checks it).
- **Extension points for plugins with their own structure (roadmap 2.1 A, ТЗ 27 §2):** `@panopticon/api/org` (`src/api/org.ts`, vite alias; re-exports the pure Org code: parseHeadings, setKeyword, setPlanning, stampText, listEnter, insertHeading…; `workflow()` from `index.workflow(path)`). `tx.update(path, fn)` and `transaction(label, build, { onUndo })`. Form fields `textarea` / `date` (`inline` | `chip`, value «yyyy-mm-dd») / `place` (PlacePicker columns: `note`, `headNote`, `create`) / `custom` (`render(el, ctrl)`) are drawn by `FormField.svelte` under their label (`WIDE` in settingsSchema.ts); `FormSpec.onChange` and `headerExtra`; a form with wide fields is 800 px. `ui.sheet` (keys on the window: ⎋, ↩ = primary), `ui.menu` (ContextMenu), `ui.choose` (a palette step: `store.openStep`), `ui.close`. `index.statusTone` / `index.workflow`, `statusSets.set`, `commands.setAvailable` (unregisters the action while off), core command `heading.status` (the heading's file must be the tab's). In e2e wait for a plugin's command row in the palette before ↩ (the plugin starts after the window).
- **Review parts, bare sheets, widgets (roadmap 2.1 B1, ТЗ 27 §2.3, §2.5½):** `PluginReview.svelte` draws `spec.head` / `quick` / `aside` (a `use:part` action with its own effect: redrawn per card and on `plugins.reviewRedraw`), `narrow(h)` → NarrowEditor `folded` / `lineNote`, `summary(el, { …, end })`; actions have `disabled` (re-read on `plugins.reviewBar`), `sub`, `kind`. `plugins.reviewStep` awaits `spec.beforeStep` first; `done` counts distinct cards. `ui.currentReview()` → `step`, `redraw`, `update`. `ui.sheet({ bare: true })` gives only the scrim and a fixed layer (`.bare`, pointer-events on its children); the plugin draws and keys its dialog. `ui.widget(el, field, value, onChange)` mounts `FormField.svelte` (`api/widgets.svelte.ts`). The window is inert while a plugin's sheet is open.
- **The goals of the quarter are a plugin (roadmap 2.1 B2–2.2, ТЗ 27):** `src/plugins/quarter-goals/` — `plugin.svelte.ts` (activate: storage, status set `ifMissing`, events, section, view `quarter-goals.overview`, commands with `setAvailable`), `core.svelte.ts` (the files read through `index.files` / `files.read` / `index.workflow`, parsed with `@panopticon/api/org`, refreshed on `file.changed`), `state.svelte.ts` (sources, people, writes through `tx.update` with the plugin's pure functions of `goals.ts`), `actions.ts` (bare sheets `Form` / `Add` / `Report` / `Carry`; the 1-1 review on `ui.review` with `Head` / `Quick` / `Marks` / `Summary`), `styles.css` (`.greview` layout). The core migrates the old id once (`features/goalsMigration.ts`: storages `goals` → `quarter-goals` `{ data }` / `{ settings }`, layout kind alias; `keys.ts` RENAMED; `nav:mode` goals → quarter-goals). `tsconfig.json` (paths for `@panopticon/api`, tests excluded) lets svelte-check see the plugins. In e2e, `pluginsReady(page)` waits until the plugins have started.
- **Writing plugins (roadmap 2.3):** API version 1.1.0 (`API_VERSION`). The guide is `docs/plugins/README.md` (Russian; manifest, lifecycle, the whole `ctx`, rights, look, limits). The template is `templates/plugin/` (TS + Svelte, `vite.config.js` builds `dist/main.js` + `manifest.json` with styles injected; `panopticon-api.ts` must equal `src/api/index.ts` — a vitest checks it; `dist/` is ignored). `e2e/pluginTemplate.spec.ts` builds it and installs it in the mock. The settings sheet's sections are `$derived`, so a plugin turned on shows its section at once.
- **Inbox's extension points (roadmap 3.1 A, ТЗ 28 §1; API 1.2.0):** `index.inbox()` + event `inbox.changed`; core commands `capture.open`, `inbox.pickFile`, `inbox.createFile`, `heading.schedule|deadline|tags|priority` (as `heading.status`: the palette's step on the tab's file), `file.open { beside, focus }`; `ui.setBadge` (`plugins.badges`, NavSpec `badge`); `ui.refile(ref, { before, quiet })` (resolves after the core's write; `writing` keeps the dialog's close from reading as a cancel); `edit.undo()` = `store.undoLast()`; widget `month` (`CalReview.svelte` now takes `open` / `ontoggle` / `keyId`). Each plugin with review commands has its own key scope `pluginReview:<id>` (declare.ts `reviewScope`). PluginReview follows a card's heading edited in place (`onnarrow` → `plugins.reviewEdited`, same title or same line; `reviewHeading` falls back to the heading at the ref's line); its card key is `cur|path` and `below` is redrawn only when the card changes.
- **Core and plugins roadmap:** `docs/roadmap-yadro-i-plaginy.md` (from `docs/brief-yadro-i-plaginy.md`). Every PR of the roadmap updates its task's status there. Stage 0 (core preparation) changes no behaviour except one ⌘Z everywhere.

1. **Full-screen traffic lights** (PR #27, merged anyway): the lights drawn in the toolbar in full screen do not take
   clicks.
   - Hypothesis A: the invisible NSToolbarFullScreenWindow strip still eats mouse events, and `setIgnoresMouseEvents`
     doesn't take.
   - Hypothesis B: the menu bar hides when the pointer leaves the strip.

   Known: the reveal = the strip's `alphaValue` (its frame never moves). Hiding its whole contentView breaks the reveal
   and the exit from full screen. On notch MacBooks the window starts below the menu bar. Next step: get the
   permissions, or ask the user (1) do the lights stay while the pointer goes down, (2) do the glyphs show on hover.
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

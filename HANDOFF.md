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
- **Releases so far:** v0.1.0 (first build, new icon), v0.1.1 (path-bar menus), v0.2.0 (Inbox), v0.3.0 (Inbox review, refile tree, drawers), v0.4.0 (rich text, date calendar), v0.5.0 (search), v0.5.1 (no accent bar with one editor), v0.6.0 (settings sheet and «Клавиши», navigator tree, promote one heading, selection). The user's other
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
| `Navigator.svelte`, `navTree.ts` | The file tree (ТЗ 02): folded by default, an explicit set of open keys per notes folder (`nav:open:<dir>`); the path to the current file and heading opens when it changes. «Свернуть всё» keeps only that path, «Развернуть всё» opens all (headings left closed over `EXPAND_CAP` = 2000 nodes). ⌥-click / ⌥→ ⌥← on a subtree. Keys: `folder/`, file path, `path#Title › Sub` for headings. |
| `JumpBar.svelte` | Toolbar path, Xcode style; ⌃⌘J keyboard; segment menu = everything in the segment's folder (folders, separator, files); filter. |
| `Palette.svelte` + `commands.ts` + `fuzzy.ts` | Command palette (⇧⌘P), goto file (⇧⌘O), new file (⇧⌘N), `#` headings. |
| `Agenda.svelte`, `AgendaList.svelte`, `AgendaBuilder.svelte`, `agendas.ts` | Built-in agenda + custom agendas (blocks of conditions, stored in config.json); the builder is a modal sheet. `agendas.ts` is the pure engine. |
| `InboxPanel.svelte`, `Picker.svelte`, `Capture.svelte`, `CaptureWindow.svelte`, `inbox.ts` | Inbox section, where-to palette (choose file / refile), quick entry (in-window overlay and the `#capture` panel window), pure Inbox logic. |
| `Review.svelte`, `review.ts` | «Разбор Inbox» (ТЗ 18): a tab of kind `review` whose `path` follows the card's file (so `store.file`/`selected`, the palette and the inspector work on the card); the card is an `Editor` with `narrow` (hidden lines outside the subtree, a change filter for user edits). Queue/actions in the store (`review*`). Action keys ⌘1–5, ⌘[ (scope «Разбор Inbox» of `keys.ts`: they win over the window's ⌘1/⌘2/⌘[ while the tab is shown; registered as `store.reviewKeys`). |
| `Refile.svelte`, `refile.ts` | Move a heading: file → place in a tree (ТЗ 16); `from` palette / inbox / review. |
| `Settings.svelte` + `workflowEditor.ts` | Settings: a sheet over the main window (ТЗ 22), sections in a column on the left (`store.settingsSection`, remembered). Ready: Основные, Статусы, Агенды, Inbox, Клавиши. Теги/Календарь/Файлы are disabled. ⌘, toggles, ⎋/«Готово» close, ⌘[ ⌘] switch. |
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
  - `nav:mode`, `nav:headings`, `nav:open:<dir>` (open nodes of the tree), `inspector:tab`, `editor:levels`, `editor:drawers` ('0' = drawers open on open), `editor:rich`, `editor:richNumbers`, `find:cs`, `find:word`, `search:recent`;
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
   - Settings tabs Теги, Календарь, Файлы;
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

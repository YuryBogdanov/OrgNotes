use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use notify_debouncer_mini::{
    new_debouncer,
    notify::{RecommendedWatcher, RecursiveMode},
    DebounceEventResult, Debouncer,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

/// Per-project settings live with the notes: `<notes folder>/.orgnotes/config.json`.
const CONFIG_DIR: &str = ".orgnotes";
const CONFIG_FILE: &str = "config.json";

#[derive(Serialize)]
struct OrgFile {
    name: String,
    path: String,
    text: String,
    /// last modification, ms since the epoch (shown when the file changed under an edit)
    mtime: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct Config {
    notes_dir: Option<String>,
    /// macOS bookmark of the folder: survives a rename or a move of it
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bookmark: Option<Vec<u8>>,
}

#[cfg(target_os = "macos")]
mod bookmark {
    use objc2_foundation::{NSData, NSString, NSURLBookmarkCreationOptions, NSURLBookmarkResolutionOptions, NSURL};

    /// The app is not sandboxed, so a plain bookmark is enough (no security scope needed to read the folder).
    pub fn make(path: &str) -> Option<Vec<u8>> {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        url.bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(NSURLBookmarkCreationOptions(0), None, None)
            .ok()
            .map(|d| d.to_vec())
    }
    pub fn resolve(data: &[u8]) -> Option<String> {
        let d = NSData::with_bytes(data);
        let mut stale = objc2::runtime::Bool::NO;
        let url = unsafe {
            NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(
                &d,
                NSURLBookmarkResolutionOptions::WithoutUI | NSURLBookmarkResolutionOptions::WithoutMounting,
                None,
                &mut stale,
            )
        }
        .ok()?;
        url.path().map(|p| p.to_string())
    }
}
#[cfg(not(target_os = "macos"))]
mod bookmark {
    pub fn make(_: &str) -> Option<Vec<u8>> {
        None
    }
    pub fn resolve(_: &[u8]) -> Option<String> {
        None
    }
}

/// Full screen and the traffic lights. In full screen macOS hides the window buttons and slides them down in a thin
/// title bar of their own (under the menu bar) while the pointer is at the top of the screen. That bar is made
/// invisible and click-through, and the page draws the buttons in its own toolbar instead, below the menu bar. AppKit
/// says nothing about the reveal, so the bar is checked a few times a second and every change goes to the page as
/// `titlebar` {fullscreen, lights, menu}: `lights` = the buttons are shown now, `menu` = how much of the window the
/// menu bar covers then.
#[cfg(target_os = "macos")]
mod titlebar {
    use objc2::{class, msg_send, rc::Retained, runtime::AnyObject};
    use objc2_foundation::NSRect;
    use serde::Serialize;
    use std::sync::Mutex;
    use std::time::Duration;
    use tauri::{AppHandle, Emitter, Manager};

    #[derive(Serialize, Clone, Copy, PartialEq)]
    pub struct State {
        pub fullscreen: bool,
        pub lights: bool,
        pub menu: f64,
    }

    const FULL_SCREEN: usize = 1 << 14; // NSWindowStyleMaskFullScreen
    const WINDOWED: State = State { fullscreen: false, lights: true, menu: 0.0 };

    /// Views of the full-screen bar we hid, with whether they were hidden before; put back when full screen ends.
    /// Only touched on the main thread.
    struct Hidden(Vec<(Retained<AnyObject>, bool)>);
    unsafe impl Send for Hidden {}
    static HIDDEN: Mutex<Hidden> = Mutex::new(Hidden(Vec::new()));

    /// Hide everything the bar draws — its backgrounds (AppKit shows them again on every reveal, so this runs on every
    /// check), the buttons — except the views that hold the buttons: hiding those, or the bar's content view, stops
    /// macOS from showing the menu bar and from leaving full screen.
    unsafe fn quiet(bar: *mut AnyObject, btn: *mut AnyObject) {
        let mut keep: Vec<*mut AnyObject> = Vec::new(); // the chain from the content view down to the buttons
        let mut v: *mut AnyObject = msg_send![btn, superview];
        while !v.is_null() {
            keep.push(v);
            v = msg_send![v, superview];
        }
        let content: *mut AnyObject = msg_send![bar, contentView];
        if content.is_null() {
            return;
        }
        let mut hidden = HIDDEN.lock().unwrap();
        let mut stack = vec![content];
        while let Some(v) = stack.pop() {
            if keep.contains(&v) {
                let subs: *mut AnyObject = msg_send![v, subviews];
                let n: usize = msg_send![subs, count];
                for i in 0..n {
                    stack.push(msg_send![subs, objectAtIndex: i]);
                }
                continue;
            }
            let was: bool = msg_send![v, isHidden];
            if !hidden.0.iter().any(|(x, _)| Retained::as_ptr(x) as *mut AnyObject == v) {
                if let Some(r) = Retained::retain(v) {
                    hidden.0.push((r, was));
                }
            }
            if !was {
                let _: () = msg_send![v, setHidden: true];
            }
        }
        let clear: *mut AnyObject = msg_send![class!(NSColor), clearColor];
        let _: () = msg_send![bar, setBackgroundColor: clear];
        let _: () = msg_send![bar, setIgnoresMouseEvents: true]; // clicks go to our toolbar under it
    }

    /// Back from full screen: the buttons and the title bar's views go home to the window, as they were.
    unsafe fn restore() {
        let mut hidden = HIDDEN.lock().unwrap();
        for (v, was) in hidden.0.drain(..) {
            let _: () = msg_send![&*v, setHidden: was];
        }
    }

    /// Must run on the main thread.
    unsafe fn read(ns_window: *mut std::ffi::c_void) -> Option<State> {
        if ns_window.is_null() {
            return None;
        }
        let w = &*(ns_window as *const AnyObject);
        let mask: usize = msg_send![w, styleMask];
        let btn: *mut AnyObject = msg_send![w, standardWindowButton: 0usize];
        if mask & FULL_SCREEN == 0 {
            restore();
            return Some(WINDOWED);
        }
        let none = State { fullscreen: true, lights: false, menu: 0.0 };
        if btn.is_null() {
            return Some(none);
        }
        // in full screen the buttons live in a title bar window of their own, under the menu bar
        let bar: *mut AnyObject = msg_send![btn, window];
        if bar.is_null() || bar == ns_window as *mut AnyObject {
            return Some(none);
        }
        quiet(bar, btn);
        // the bar stays in place; showing and hiding it is its opacity
        let visible: bool = msg_send![bar, isVisible];
        let alpha: f64 = msg_send![bar, alphaValue];
        if !(visible && alpha > 0.5) {
            return Some(none);
        }
        // how much of the window the menu bar covers: nothing on a screen with a notch (the window starts below the
        // menu bar there), its height on a screen without one
        let screen: *mut AnyObject = msg_send![w, screen];
        let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        let main_menu: *mut AnyObject = msg_send![app, mainMenu];
        let menu = if screen.is_null() || main_menu.is_null() {
            0.0
        } else {
            let height: f64 = msg_send![main_menu, menuBarHeight];
            let f: NSRect = msg_send![w, frame];
            let s: NSRect = msg_send![screen, frame];
            let menu_bottom = s.origin.y + s.size.height - height;
            (f.origin.y + f.size.height - menu_bottom).max(0.0).round()
        };
        Some(State { fullscreen: true, lights: true, menu })
    }

    pub fn watch(app: &AppHandle) {
        let app = app.clone();
        std::thread::spawn(move || {
            let mut last: Option<State> = None;
            loop {
                std::thread::sleep(Duration::from_millis(80));
                let Some(win) = app.get_webview_window("main") else { continue };
                let (tx, rx) = std::sync::mpsc::channel();
                let w2 = win.clone();
                if app
                    .run_on_main_thread(move || {
                        let _ = tx.send(w2.ns_window().ok().and_then(|p| unsafe { read(p) }));
                    })
                    .is_err()
                {
                    return;
                }
                let Ok(Some(st)) = rx.recv() else { continue };
                if last != Some(st) {
                    last = Some(st);
                    let _ = win.emit("titlebar", st);
                }
            }
        });
    }
}

#[derive(Default)]
struct AppState {
    dir: Mutex<Option<PathBuf>>,
    /// the remembered folder when it cannot be opened (deleted, renamed beyond the bookmark, unmounted)
    missing: Mutex<Option<String>>,
    watcher: Mutex<Option<Debouncer<RecommendedWatcher>>>,
}

fn config_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("config.json"))
}

fn read_config(app: &AppHandle) -> Config {
    config_path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_config(app: &AppHandle, cfg: &Config) {
    if let Some(p) = config_path(app) {
        if let Ok(s) = serde_json::to_string_pretty(cfg) {
            let _ = fs::write(p, s);
        }
    }
}

fn collect(dir: &Path, root: &Path, out: &mut Vec<OrgFile>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        // hidden files also cover Emacs lock files (.#foo.org)
        if name.starts_with('.') {
            continue;
        }
        if p.is_dir() {
            collect(&p, root, out);
        } else if p.extension().map_or(false, |x| x == "org") {
            if let Ok(text) = fs::read_to_string(&p) {
                let rel = p
                    .strip_prefix(root)
                    .unwrap_or(&p)
                    .to_string_lossy()
                    .to_string();
                let mtime = fs::metadata(&p)
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_millis() as u64);
                out.push(OrgFile {
                    name: rel,
                    path: p.to_string_lossy().to_string(),
                    text,
                    mtime,
                });
            }
        }
    }
}

fn watch(app: &AppHandle, dir: &Path) -> Option<Debouncer<RecommendedWatcher>> {
    let handle = app.clone();
    let mut deb = new_debouncer(
        Duration::from_millis(300),
        move |res: DebounceEventResult| {
            let Ok(events) = res else { return };
            let relevant = events.iter().any(|e| {
                let hidden = e
                    .path
                    .file_name()
                    .map_or(false, |n| n.to_string_lossy().starts_with('.'));
                let org = e.path.extension().map_or(false, |x| x == "org");
                // the project config (statuses, agendas): every window reads it again
                let config = e.path.ends_with(Path::new(CONFIG_DIR).join(CONFIG_FILE));
                // no extension: a folder was added, renamed or removed
                config || (!hidden && (org || e.path.extension().is_none()))
            });
            if relevant {
                let _ = handle.emit("notes-changed", ());
            }
        },
    )
    .ok()?;
    deb.watcher().watch(dir, RecursiveMode::Recursive).ok()?;
    Some(deb)
}

fn activate(app: &AppHandle, state: &AppState, dir: PathBuf) {
    *state.watcher.lock().unwrap() = watch(app, &dir);
    *state.dir.lock().unwrap() = Some(dir);
}

#[tauri::command]
fn get_notes_dir(state: State<AppState>) -> Option<String> {
    state
        .dir
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
}

#[derive(Serialize)]
struct DirStatus {
    /// the open notes folder
    dir: Option<String>,
    /// the remembered folder that cannot be opened now
    missing: Option<String>,
}

/// At start: is there a notes folder, and can it be opened?
#[tauri::command]
fn notes_dir_status(state: State<AppState>) -> DirStatus {
    DirStatus {
        dir: state.dir.lock().unwrap().as_ref().map(|p| p.to_string_lossy().to_string()),
        missing: state.missing.lock().unwrap().clone(),
    }
}

/// The remembered folder, by its path or, if it was renamed or moved, by its bookmark.
fn remembered_dir(app: &AppHandle) -> Option<PathBuf> {
    let cfg = read_config(app);
    let by_path = cfg.notes_dir.as_ref().map(PathBuf::from).filter(|p| p.is_dir());
    let found = by_path.or_else(|| cfg.bookmark.as_deref().and_then(bookmark::resolve).map(PathBuf::from).filter(|p| p.is_dir()))?;
    if cfg.notes_dir.as_deref() != Some(&*found.to_string_lossy()) {
        remember(app, &found.to_string_lossy()); // moved: keep the new path
    }
    Some(found)
}

fn remember(app: &AppHandle, path: &str) {
    write_config(app, &Config { notes_dir: Some(path.to_string()), bookmark: bookmark::make(path) });
}

/// «Повторить»: open the remembered folder if it is back.
#[tauri::command]
fn retry_notes_dir(app: AppHandle, state: State<AppState>) -> Option<String> {
    let dir = remembered_dir(&app)?;
    *state.missing.lock().unwrap() = None;
    activate(&app, &state, dir.clone());
    Some(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn set_notes_dir(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err("not a directory".into());
    }
    activate(&app, &state, dir);
    *state.missing.lock().unwrap() = None;
    remember(&app, &path);
    Ok(())
}

#[derive(Serialize, Debug, PartialEq)]
struct Scan {
    name: String,
    path: String,
    /// the path as shown: ~ for the home folder
    shown: String,
    org: usize,
    folders: usize,
    other: usize,
    /// the scan stopped at the limit: a home folder or a whole disk
    capped: bool,
    big: bool,
}

const SCAN_LIMIT: usize = 10_000;

/// Emacs keeps lock (.#name), auto-save (#name#) and backup (name~) files next to the notes.
fn emacs_service(name: &str) -> bool {
    name.starts_with(".#") || (name.starts_with('#') && name.ends_with('#')) || name.ends_with('~')
}

/// «Папка найдена»: what the app would see in a folder. Hidden entries (.git too) and Emacs service files are not
/// counted; symbolic links are not followed (they count as other files).
#[tauri::command]
fn scan_folder(path: String) -> Result<Scan, String> {
    scan_in(Path::new(&path), std::env::var("HOME").ok().as_deref())
}

fn scan_in(root: &Path, home: Option<&str>) -> Result<Scan, String> {
    if !root.is_dir() {
        return Err("not a directory".into());
    }
    let (mut org, mut folders, mut other, mut seen) = (0, 0, 0, 0usize);
    let mut stack = vec![root.to_path_buf()];
    'walk: while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || emacs_service(&name) {
                continue;
            }
            seen += 1;
            if seen > SCAN_LIMIT {
                break 'walk;
            }
            let Ok(t) = e.file_type() else { continue };
            if t.is_dir() {
                folders += 1;
                stack.push(e.path());
            } else if t.is_file() && name.ends_with(".org") {
                org += 1;
            } else {
                other += 1;
            }
        }
    }
    let path = root.to_string_lossy().to_string();
    let shown = match home {
        Some(h) if path == h => "~".to_string(),
        Some(h) if path.starts_with(&format!("{h}/")) => format!("~{}", &path[h.len()..]),
        _ => path.clone(),
    };
    let capped = seen > SCAN_LIMIT;
    let big = capped || shown == "~" || root.parent().is_none();
    Ok(Scan {
        name: root.file_name().map_or(path.clone(), |n| n.to_string_lossy().to_string()),
        path,
        shown,
        org,
        folders,
        other,
        capped,
        big,
    })
}

/// Bundled sample notes (development convenience); None when the folder is not there.
#[tauri::command]
fn sample_notes_dir() -> Option<String> {
    let p = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../sample-notes"));
    p.is_dir().then(|| p.to_string_lossy().to_string())
}

#[tauri::command]
fn list_org_files(state: State<AppState>) -> Result<Vec<OrgFile>, String> {
    let Some(root) = state.dir.lock().unwrap().clone() else {
        return Ok(Vec::new());
    };
    // the folder went away while the app runs (deleted, unmounted): say so, the open tabs keep their text
    if !root.is_dir() {
        return Err("unavailable".into());
    }
    let mut out = Vec::new();
    collect(&root, &root, &mut out);
    Ok(out)
}

/// Atomic write (temp file + rename) restricted to .org files inside the notes folder.
/// `base` is the text we last read from disk: if the file changed since, nothing is written
/// and "conflict" is returned, so an edit made in another editor is never clobbered.
fn save_checked(root: &Path, path: &str, text: &str, base: &str) -> Result<(), String> {
    let root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let target = fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !target.starts_with(&root) || target.extension().map_or(true, |x| x != "org") {
        return Err("path outside notes folder".into());
    }
    let disk = fs::read_to_string(&target).map_err(|e| e.to_string())?;
    if disk != base {
        return Err("conflict".into());
    }
    let tmp = target.with_extension("org.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_org_file(
    state: State<AppState>,
    path: String,
    text: String,
    base: String,
) -> Result<(), String> {
    let root = state.dir.lock().unwrap().clone().ok_or("no notes folder")?;
    save_checked(&root, &path, &text, &base)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("org-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn saves_when_disk_matches_base() {
        let d = tmp("ok");
        let f = d.join("a.org");
        fs::write(&f, "* TODO a\n").unwrap();
        save_checked(&d, f.to_str().unwrap(), "* DONE a\n", "* TODO a\n").unwrap();
        assert_eq!(fs::read_to_string(&f).unwrap(), "* DONE a\n");
    }

    #[test]
    fn refuses_to_clobber_external_edit() {
        let d = tmp("conflict");
        let f = d.join("a.org");
        fs::write(&f, "* TODO a\nedited in emacs\n").unwrap();
        let r = save_checked(&d, f.to_str().unwrap(), "* DONE a\n", "* TODO a\n");
        assert_eq!(r, Err("conflict".to_string()));
        assert_eq!(
            fs::read_to_string(&f).unwrap(),
            "* TODO a\nedited in emacs\n"
        );
    }

    #[test]
    fn rejects_paths_outside_root_and_non_org() {
        let d = tmp("outside");
        let other = tmp("outside-other");
        let f = other.join("b.org");
        fs::write(&f, "x").unwrap();
        assert!(save_checked(&d, f.to_str().unwrap(), "y", "x").is_err());
        let g = d.join("c.txt");
        fs::write(&g, "x").unwrap();
        assert!(save_checked(&d, g.to_str().unwrap(), "y", "x").is_err());
    }
    #[test]
    fn creates_files_and_folders() {
        let d = tmp("create");
        let f = create_in(&d, d.to_str().unwrap(), "План", false).unwrap();
        assert!(f.ends_with("План.org"));
        assert_eq!(fs::read_to_string(&f).unwrap(), "#+TITLE: План\n\n");
        let dir = create_in(&d, d.to_str().unwrap(), "Команда", true).unwrap();
        assert!(Path::new(&dir).is_dir());
        let nested = create_in(&d, &dir, "a.org", false).unwrap();
        assert!(nested.ends_with("Команда/a.org"));
        assert_eq!(
            create_in(&d, d.to_str().unwrap(), "План", false),
            Err("exists".to_string())
        );
    }

    #[test]
    fn rejects_bad_names_and_outside_parents() {
        let d = tmp("names");
        let other = tmp("names-other");
        for bad in ["", "  ", "..", ".hidden", "a/b", "a\\b", "a:b"] {
            assert!(
                create_in(&d, d.to_str().unwrap(), bad, false).is_err(),
                "{bad:?}"
            );
        }
        assert!(create_in(&d, other.to_str().unwrap(), "x", false).is_err());
    }

    #[test]
    fn renames_keeping_extension_and_refusing_overwrite() {
        let d = tmp("rename");
        let a = create_in(&d, d.to_str().unwrap(), "a", false).unwrap();
        let b = create_in(&d, d.to_str().unwrap(), "b", false).unwrap();
        let r = rename_in(&d, &a, "c").unwrap();
        assert!(r.ends_with("c.org") && Path::new(&r).exists() && !Path::new(&a).exists());
        assert_eq!(rename_in(&d, &r, "b"), Err("exists".to_string()));
        assert!(Path::new(&b).exists());
        assert!(rename_in(&d, d.to_str().unwrap(), "x").is_err());
    }

    #[test]
    fn moves_into_folders_but_not_into_itself() {
        let d = tmp("move");
        let root = d.to_str().unwrap();
        let team = create_in(&d, root, "Team", true).unwrap();
        let sub = create_in(&d, &team, "Sub", true).unwrap();
        let note = create_in(&d, root, "n", false).unwrap();
        let moved = move_in(&d, &note, &team).unwrap();
        assert!(moved.ends_with("Team/n.org") && Path::new(&moved).exists());
        assert!(move_in(&d, &team, &sub).is_err());
        // a name clash is refused, nothing is overwritten
        let again = create_in(&d, root, "n", false).unwrap();
        assert_eq!(move_in(&d, &again, &team), Err("exists".to_string()));
        assert!(Path::new(&again).exists());
        // moving a folder carries its content
        let top = move_in(&d, &team, root).unwrap();
        assert_eq!(top, team);
    }

    #[test]
    fn refuses_to_touch_paths_outside_the_root() {
        let d = tmp("outside-ops");
        let other = tmp("outside-ops-other");
        let f = other.join("x.org");
        fs::write(&f, "x").unwrap();
        assert!(rename_in(&d, f.to_str().unwrap(), "y").is_err());
        assert!(move_in(&d, f.to_str().unwrap(), d.to_str().unwrap()).is_err());
        assert!(trash_in(&d, f.to_str().unwrap()).is_err());
        assert!(f.exists());
    }

    #[test]
    fn project_config_roundtrip_and_isolation() {
        let d = tmp("config");
        assert_eq!(read_config_in(&d), None);
        write_config_in(&d, "{\"version\":1}").unwrap();
        assert_eq!(read_config_in(&d).as_deref(), Some("{\"version\":1}"));
        write_config_in(&d, "{\"version\":2}").unwrap();
        assert_eq!(read_config_in(&d).as_deref(), Some("{\"version\":2}"));
        // the config folder is hidden, so it never shows up as notes or folders
        let mut files = Vec::new();
        collect(&d, &d, &mut files);
        assert!(files.is_empty());
        let mut dirs = Vec::new();
        dirs_in(&d, &d, &mut dirs);
        assert!(dirs.is_empty());
        assert!(!d.join(".orgnotes/config.json.tmp").exists());
    }

    #[test]
    fn scans_a_folder_like_the_navigator_sees_it() {
        let d = std::env::temp_dir().join(format!("scan-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(d.join("Команда/Рост")).unwrap();
        fs::create_dir_all(d.join(".git/objects")).unwrap();
        for f in ["a.org", "Команда/b.org", "Команда/Рост/c.org", "readme.md", ".git/HEAD", ".#a.org", "#a.org#", "a.org~", ".DS_Store"] {
            fs::write(d.join(f), "x").unwrap();
        }
        let s = scan_in(&d, None).unwrap();
        assert_eq!((s.org, s.folders, s.other, s.capped, s.big), (3, 2, 1, false, false));
        let home = scan_in(&d, Some(&d.to_string_lossy())).unwrap();
        assert_eq!(home.shown, "~");
        assert!(home.big); // the home folder itself is too big a workspace
        let inside = scan_in(&d.join("Команда"), Some(&d.to_string_lossy())).unwrap();
        assert_eq!(inside.shown, "~/Команда");
        assert!(emacs_service(".#x.org") && emacs_service("#x.org#") && emacs_service("x.org~") && !emacs_service("x.org"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn saves_a_new_file_and_asks_before_replacing() {
        let d = tmp("save-new");
        let root = d.to_str().unwrap();
        let p = save_new_in(&d, root, "Идеи для ретро", "* Идеи\n", false).unwrap();
        assert!(p.ends_with("Идеи для ретро.org"));
        assert_eq!(fs::read_to_string(&p).unwrap(), "* Идеи\n");
        assert_eq!(save_new_in(&d, root, "Идеи для ретро", "* другое\n", false), Err("exists".to_string()));
        assert_eq!(fs::read_to_string(&p).unwrap(), "* Идеи\n");
        save_new_in(&d, root, "Идеи для ретро", "* другое\n", true).unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "* другое\n");
        // .org is added once, whatever else the name ends with
        let typed = save_new_in(&d, root, "Привет.org", "x", false).unwrap();
        assert!(typed.ends_with("/Привет.org"));
        let dotted = save_new_in(&d, root, "report.v2", "x", false).unwrap();
        assert!(dotted.ends_with("/report.v2.org"));
        // never outside the notes folder, never over a folder
        let other = tmp("save-new-other");
        assert!(save_new_in(&d, other.to_str().unwrap(), "x", "x", false).is_err());
        fs::create_dir(d.join("dir.org")).unwrap();
        assert!(save_new_in(&d, root, "dir", "x", true).is_err());
        assert!(!d.join(".Идеи для ретро.org.tmp").exists());
    }

    #[test]
    fn lists_folders_including_empty_ones() {
        let d = tmp("dirs");
        let root = d.to_str().unwrap();
        let a = create_in(&d, root, "A", true).unwrap();
        create_in(&d, &a, "B", true).unwrap();
        fs::create_dir(d.join(".git")).unwrap();
        let mut out = Vec::new();
        dirs_in(&d, &d, &mut out);
        assert_eq!(out, vec!["A".to_string(), "A/B".to_string()]);
    }
}

// ---- file operations -----------------------------------------------------------
// Everything below works on paths inside the notes folder only. Functions take the root
// explicitly so they can be tested on a temp directory.

fn check_name(name: &str) -> Result<String, String> {
    let n = name.trim();
    let bad = n.is_empty()
        || n == "."
        || n == ".."
        || n.starts_with('.')
        || n.len() > 200
        || n.chars().any(|c| matches!(c, '/' | '\\' | ':' | '\0'));
    if bad {
        Err("bad name".into())
    } else {
        Ok(n.to_string())
    }
}

fn inside(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let r = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let p = fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !p.starts_with(&r) {
        return Err("path outside notes folder".into());
    }
    Ok(p)
}

/// Same location, expressed under the root as the app knows it (not canonicalised), so the
/// returned path matches the ones `list_org_files` hands out.
fn as_known(root: &Path, canon: &Path) -> String {
    let r = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    root.join(canon.strip_prefix(&r).unwrap_or(canon))
        .to_string_lossy()
        .to_string()
}

fn with_org(name: String) -> String {
    if name.ends_with(".org") {
        name
    } else {
        format!("{name}.org")
    }
}

fn create_in(root: &Path, parent: &str, name: &str, is_dir: bool) -> Result<String, String> {
    let parent = inside(root, Path::new(parent))?;
    if !parent.is_dir() {
        return Err("parent is not a folder".into());
    }
    let name = check_name(name)?;
    let name = if is_dir { name } else { with_org(name) };
    let target = parent.join(&name);
    if target.exists() {
        return Err("exists".into());
    }
    if is_dir {
        fs::create_dir(&target).map_err(|e| e.to_string())?;
    } else {
        let title = name.trim_end_matches(".org");
        fs::write(&target, format!("#+TITLE: {title}\n\n")).map_err(|e| e.to_string())?;
    }
    Ok(as_known(root, &target))
}

fn rename_in(root: &Path, path: &str, new_name: &str) -> Result<String, String> {
    let src = inside(root, Path::new(path))?;
    if src == fs::canonicalize(root).map_err(|e| e.to_string())? {
        return Err("cannot rename the notes folder".into());
    }
    let name = check_name(new_name)?;
    let name = if src.is_dir() { name } else { with_org(name) };
    let target = src.parent().ok_or("no parent")?.join(&name);
    // a case-only rename "exists" on a case-insensitive volume but is the same file
    let same_file = fs::canonicalize(&target).map_or(false, |t| t == src);
    if target.exists() && !same_file {
        return Err("exists".into());
    }
    fs::rename(&src, &target).map_err(|e| e.to_string())?;
    Ok(as_known(root, &target))
}

fn move_in(root: &Path, path: &str, dest: &str) -> Result<String, String> {
    let src = inside(root, Path::new(path))?;
    let dest = inside(root, Path::new(dest))?;
    let canon_root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    if src == canon_root {
        return Err("cannot move the notes folder".into());
    }
    if !dest.is_dir() {
        return Err("destination is not a folder".into());
    }
    if dest.starts_with(&src) {
        return Err("cannot move a folder into itself".into());
    }
    let target = dest.join(src.file_name().ok_or("no name")?);
    if target == src {
        return Ok(as_known(root, &src));
    }
    if target.exists() {
        return Err("exists".into());
    }
    fs::rename(&src, &target).map_err(|e| e.to_string())?;
    Ok(as_known(root, &target))
}

fn trash_in(root: &Path, path: &str) -> Result<(), String> {
    let src = inside(root, Path::new(path))?;
    if src == fs::canonicalize(root).map_err(|e| e.to_string())? {
        return Err("cannot delete the notes folder".into());
    }
    trash::delete(&src).map_err(|e| e.to_string())
}

fn dirs_in(dir: &Path, root: &Path, out: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let name = e.file_name().to_string_lossy().to_string();
        let p = e.path();
        if name.starts_with('.') || !p.is_dir() {
            continue;
        }
        out.push(
            p.strip_prefix(root)
                .unwrap_or(&p)
                .to_string_lossy()
                .to_string(),
        );
        dirs_in(&p, root, out);
    }
}

fn root_of(state: &State<AppState>) -> Result<PathBuf, String> {
    state
        .dir
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "no notes folder".to_string())
}

#[tauri::command]
fn list_folders(state: State<AppState>) -> Vec<String> {
    let Some(root) = state.dir.lock().unwrap().clone() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    dirs_in(&root, &root, &mut out);
    out
}

#[tauri::command]
fn create_entry(
    state: State<AppState>,
    parent: String,
    name: String,
    is_dir: bool,
) -> Result<String, String> {
    create_in(&root_of(&state)?, &parent, &name, is_dir)
}

#[tauri::command]
fn rename_entry(state: State<AppState>, path: String, new_name: String) -> Result<String, String> {
    rename_in(&root_of(&state)?, &path, &new_name)
}

#[tauri::command]
fn move_entry(state: State<AppState>, path: String, dest: String) -> Result<String, String> {
    move_in(&root_of(&state)?, &path, &dest)
}

/// Moves to the system Trash (recoverable), never deletes permanently.
#[tauri::command]
fn trash_entry(state: State<AppState>, path: String) -> Result<(), String> {
    trash_in(&root_of(&state)?, &path)
}


// ---- project config ---------------------------------------------------------------

fn read_config_in(root: &Path) -> Option<String> {
    fs::read_to_string(root.join(CONFIG_DIR).join(CONFIG_FILE)).ok()
}

fn write_config_in(root: &Path, text: &str) -> Result<(), String> {
    let dir = root.join(CONFIG_DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(CONFIG_FILE);
    let tmp = dir.join(format!("{CONFIG_FILE}.tmp"));
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_project_config(state: State<AppState>) -> Option<String> {
    let root = state.dir.lock().unwrap().clone()?;
    read_config_in(&root)
}

#[tauri::command]
fn write_project_config(state: State<AppState>, text: String) -> Result<(), String> {
    write_config_in(&root_of(&state)?, &text)
}


/// "Сохранить как…" for a tab that has no file yet. `.org` is added unless the name already has an
/// extension; an existing file is only replaced when `overwrite` is set (the user confirmed "Заменить").
fn save_new_in(root: &Path, parent: &str, name: &str, text: &str, overwrite: bool) -> Result<String, String> {
    let parent = inside(root, Path::new(parent))?;
    if !parent.is_dir() {
        return Err("parent is not a folder".into());
    }
    let name = check_name(name)?;
    let name = with_org(name); // "Привет" and "Привет.org" both become "Привет.org"
    let target = parent.join(&name);
    if target.exists() && !overwrite {
        return Err("exists".into());
    }
    if target.is_dir() {
        return Err("a folder has that name".into());
    }
    let tmp = parent.join(format!(".{name}.tmp"));
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    Ok(as_known(root, &target))
}

#[tauri::command]
fn save_new_file(state: State<AppState>, parent: String, name: String, text: String, overwrite: bool) -> Result<String, String> {
    save_new_in(&root_of(&state)?, &parent, &name, &text, overwrite)
}

/// Quit after the page has asked about unsaved tabs.
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Before it was called Panopticon the app had another identifier: its saved settings (the notes folder) move over once.
fn migrate_config(app: &AppHandle) {
    let Ok(dir) = app.path().app_config_dir() else { return };
    let new = dir.join("config.json");
    let old = dir.with_file_name("dev.local.org-prototype").join("config.json");
    if !new.exists() && old.exists() {
        let _ = fs::create_dir_all(&dir);
        let _ = fs::copy(old, new);
    }
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_notes_dir,
            notes_dir_status,
            retry_notes_dir,
            set_notes_dir,
            scan_folder,
            sample_notes_dir,
            list_org_files,
            save_org_file,
            list_folders,
            read_project_config,
            write_project_config,
            create_entry,
            save_new_file,
            quit_app,
            rename_entry,
            move_entry,
            trash_entry
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                if let Some(window) = app.get_webview_window("main") {
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None);
                }
            }
            let handle = app.handle().clone();
            #[cfg(target_os = "macos")]
            titlebar::watch(&handle);
            migrate_config(&handle);
            let state = app.state::<AppState>();
            // ORG_DIR overrides the remembered folder (handy for development)
            if let Some(dir) = std::env::var("ORG_DIR").ok().map(PathBuf::from).filter(|p| p.is_dir()) {
                activate(&handle, &state, dir);
            } else if let Some(dir) = remembered_dir(&handle) {
                activate(&handle, &state, dir);
            } else if let Some(p) = read_config(&handle).notes_dir {
                // remembered but not there: the page shows «Папка недоступна»; the setting is never dropped by itself
                *state.missing.lock().unwrap() = Some(p);
            }
            Ok(())
        })
        // as on macOS: closing the window keeps the app (in the Dock); its text stays in memory, nothing is lost
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                if w.label() == "main" {
                    api.prevent_close();
                    let _ = w.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // a click on the Dock icon brings the window back
            tauri::RunEvent::Reopen { .. } => show_main(app),
            // «Завершить» from the Dock or a logout: the page asks about unsaved tabs first, then calls quit_app
            tauri::RunEvent::ExitRequested { code: None, api, .. } => {
                api.prevent_exit();
                show_main(app);
                let _ = app.emit("quit-requested", ());
            }
            _ => {}
        });
}

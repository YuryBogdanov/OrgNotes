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
    /// The mini window's place and size, logical points (ТЗ 31 §1: «Запоминать размер и положение»)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    mini_frame: Option<MiniFrame>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Default)]
struct MiniFrame {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
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
        } else if is_org(&p) {
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
                let org = is_org(&e.path);
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
    // the folder changes; what else this Mac keeps (the mini window's frame) stays
    let cfg = read_config(app);
    write_config(app, &Config { notes_dir: Some(path.to_string()), bookmark: bookmark::make(path), ..cfg });
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

/// A note: an `.org` file, or its archive as Emacs makes them (`.org_archive`, ТЗ 33).
fn is_org(p: &Path) -> bool {
    matches!(p.extension().and_then(|x| x.to_str()), Some("org" | "org_archive"))
}

/// Atomic write (temp file + rename) restricted to .org files inside the notes folder.
/// `base` is the text we last read from disk: if the file changed since, nothing is written
/// and "conflict" is returned, so an edit made in another editor is never clobbered.
fn save_checked(root: &Path, path: &str, text: &str, base: &str) -> Result<(), String> {
    let root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let target = fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !target.starts_with(&root) || !is_org(&target) {
        return Err("path outside notes folder".into());
    }
    let disk = fs::read_to_string(&target).map_err(|e| e.to_string())?;
    if disk != base {
        return Err("conflict".into());
    }
    let mut tmp_name = target.file_name().unwrap_or_default().to_os_string();
    tmp_name.push(".tmp");
    let tmp = target.with_file_name(tmp_name);
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
        // a note: .org, or its archive as Emacs makes them (ТЗ 33)
        assert!(is_org(Path::new("a.org")) && is_org(Path::new("a.org_archive")) && !is_org(Path::new("a.md")) && !is_org(Path::new("a.org.tmp")));
        assert_eq!((with_org("a".into()), with_org("a.org".into()), with_org("a.org_archive".into())), ("a.org".into(), "a.org".into(), "a.org_archive".into()));
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
    if name.ends_with(".org") || name.ends_with(".org_archive") {
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


// ---- a feature's own settings in the notes folder (roadmap 0.6): `.orgnotes/plugins/<id>.json` ------------------

fn feature_file(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("bad feature id".into());
    }
    Ok(root.join(CONFIG_DIR).join("plugins").join(format!("{id}.json")))
}

#[tauri::command]
fn read_feature_file(state: State<AppState>, id: String) -> Result<Option<String>, String> {
    let p = feature_file(&root_of(&state)?, &id)?;
    Ok(fs::read_to_string(p).ok())
}

#[tauri::command]
fn write_feature_file(state: State<AppState>, id: String, text: String) -> Result<(), String> {
    let p = feature_file(&root_of(&state)?, &id)?;
    let dir = p.parent().ok_or("no folder")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
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

// ---- editor themes (ТЗ 25): own themes are `<name>.json` in the app's config folder, `themes/` -----------------

fn themes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("themes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
/// A theme's file name as the page made it: a plain `<name>.json`, nothing that leaves the folder.
fn theme_file(dir: &Path, file: &str) -> Result<PathBuf, String> {
    if file.is_empty() || file.starts_with('.') || file.contains(['/', '\\', ':']) || !file.ends_with(".json") {
        return Err("bad theme file name".into());
    }
    Ok(dir.join(file))
}

// ---- plugins (ТЗ 26 §4, roadmap 1.2): `plugins/<id>/` in the app's settings folder, next to `themes/` ------------

fn plugins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("plugins");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
/// A plugin's folder name as a manifest's id: `[a-z0-9-]`, up to 64.
fn plugin_dir_ok(dir: &str) -> bool {
    !dir.is_empty() && dir.len() <= 64 && dir.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

#[derive(serde::Serialize)]
struct ListedPlugin {
    dir: String,
    /// The text of `manifest.json`; none when there is no readable one.
    manifest: Option<String>,
}

/// The folders of the installed plugins with their manifests.
#[tauri::command]
fn list_plugins(app: AppHandle) -> Vec<ListedPlugin> {
    let Ok(dir) = plugins_dir(&app) else { return vec![] };
    let Ok(rd) = fs::read_dir(dir) else { return vec![] };
    let mut out: Vec<ListedPlugin> = rd
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                return None;
            }
            Some(ListedPlugin { manifest: fs::read_to_string(e.path().join("manifest.json")).ok(), dir: name })
        })
        .collect();
    out.sort_by(|a, b| a.dir.cmp(&b.dir));
    out
}

/// A file of a plugin (its `main.js`, `styles.css`): only inside its own folder.
#[tauri::command]
fn read_plugin_file(app: AppHandle, dir: String, file: String) -> Result<String, String> {
    if !plugin_dir_ok(&dir) {
        return Err("bad plugin folder".into());
    }
    let ok_part = |p: &str| !p.is_empty() && p != "." && p != ".." && p.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c));
    if file.starts_with('/') || !file.split('/').all(ok_part) {
        return Err("bad plugin file".into());
    }
    let base = plugins_dir(&app)?.join(&dir).canonicalize().map_err(|e| e.to_string())?;
    let p = base.join(&file).canonicalize().map_err(|e| e.to_string())?;
    if !p.starts_with(&base) {
        return Err("a plugin reads only its own folder".into());
    }
    fs::read_to_string(p).map_err(|e| e.to_string())
}

// ---- permissions (ТЗ 26 §6, roadmap 1.3): checked here by the manifest Rust reads itself, not by what the window says

/// The built-in plugins' manifests, as built into the app.
const BUILTIN_MANIFESTS: &[&str] = &[
    include_str!("../../src/plugins/calendar/manifest.json"),
    include_str!("../../src/plugins/hello/manifest.json"),
    include_str!("../../src/plugins/inbox/manifest.json"),
    include_str!("../../src/plugins/kanban/manifest.json"),
    include_str!("../../src/plugins/quarter-goals/manifest.json"),
    include_str!("../../src/plugins/theme-pack/manifest.json"),
];

/// A plugin's manifest: a built-in one, else `plugins/<id>/manifest.json`.
fn plugin_manifest(app: &AppHandle, id: &str) -> Result<serde_json::Value, String> {
    for m in BUILTIN_MANIFESTS {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(m) {
            if v["id"] == id {
                return Ok(v);
            }
        }
    }
    if !plugin_dir_ok(id) {
        return Err("bad plugin id".into());
    }
    let text = fs::read_to_string(plugins_dir(app)?.join(id).join("manifest.json")).map_err(|_| format!("нет плагина «{id}»"))?;
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if v["id"] != id {
        return Err("id не совпадает с папкой".into());
    }
    Ok(v)
}
fn has_permission(m: &serde_json::Value, p: &str) -> bool {
    m["permissions"].as_array().is_some_and(|a| a.iter().any(|x| x == p))
}
/// The host of an http(s) address: no user part, lower case, without the port; none when it is not one.
fn host_of(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"))?;
    let auth = rest.split(['/', '?', '#']).next()?;
    if auth.is_empty() || auth.contains('@') {
        return None;
    }
    let host = if auth.starts_with('[') { auth.split(']').next()?.to_string() + "]" } else { auth.split(':').next()?.to_string() };
    if host.is_empty() || !host.chars().all(|c| c.is_ascii_alphanumeric() || ".-[]:".contains(c)) {
        return None;
    }
    Some(host.to_ascii_lowercase())
}
/// The manifest's `net` lets it go there: the same host, or «*.company.ru» for its subdomains.
fn host_allowed(m: &serde_json::Value, host: &str) -> bool {
    m["net"].as_array().is_some_and(|a| {
        a.iter().filter_map(|x| x.as_str()).any(|h| {
            let h = h.to_ascii_lowercase();
            match h.strip_prefix("*.") {
                Some(base) => host.ends_with(&format!(".{base}")),
                None => host == h,
            }
        })
    })
}

#[derive(serde::Serialize)]
struct NetResponse {
    status: u16,
    headers: Vec<(String, String)>,
    text: String,
}
const NET_LIMIT: usize = 10 * 1024 * 1024;

/// `net.fetch` of a plugin: only with the right «net» and only to the hosts of its manifest. Made by the system's
/// curl (its TLS and proxies); 30 s, 10 MB.
#[tauri::command]
async fn net_fetch(app: AppHandle, plugin: String, url: String, method: Option<String>, headers: Option<Vec<(String, String)>>, body: Option<String>) -> Result<NetResponse, String> {
    let m = plugin_manifest(&app, &plugin)?;
    if !has_permission(&m, "net") {
        return Err(format!("Плагин «{plugin}»: нужно право net"));
    }
    let host = host_of(&url).ok_or("адрес — http или https")?;
    if !host_allowed(&m, &host) {
        return Err(format!("Плагин «{plugin}»: хоста {host} нет в манифесте"));
    }
    let method = method.unwrap_or_else(|| "GET".into()).to_ascii_uppercase();
    if !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].contains(&method.as_str()) {
        return Err("метод не поддерживается".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Write;
        let mut cmd = std::process::Command::new("/usr/bin/curl");
        cmd.args(["-sS", "--max-time", "30", "--max-filesize", &NET_LIMIT.to_string(), "--proto", "=http,https", "-X", &method, "-D", "-", "-o", "-"]);
        for (k, v) in headers.unwrap_or_default() {
            if k.contains(['\r', '\n', ':']) || v.contains(['\r', '\n']) {
                return Err("заголовок с переводом строки".to_string());
            }
            cmd.args(["-H", &format!("{k}: {v}")]);
        }
        if body.is_some() {
            cmd.args(["--data-binary", "@-"]);
        }
        cmd.arg("--").arg(&url).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        if let Some(b) = body {
            child.stdin.take().ok_or("no stdin")?.write_all(b.as_bytes()).map_err(|e| e.to_string())?;
        } else {
            drop(child.stdin.take());
        }
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
        parse_curl(&out.stdout)
    })
    .await
    .map_err(|e| e.to_string())?
}
/// curl's `-D - -o -`: the header blocks (one per redirect or 100), then the body.
fn parse_curl(raw: &[u8]) -> Result<NetResponse, String> {
    let mut rest = raw;
    let mut status = 0u16;
    let mut headers = vec![];
    while rest.starts_with(b"HTTP/") {
        let end = rest.windows(4).position(|w| w == b"\r\n\r\n").ok_or("ответ без заголовков")?;
        let block = String::from_utf8_lossy(&rest[..end]).to_string();
        rest = &rest[end + 4..];
        let mut lines = block.split("\r\n");
        status = lines.next().and_then(|l| l.split_whitespace().nth(1)).and_then(|c| c.parse().ok()).unwrap_or(0);
        headers = lines.filter_map(|l| l.split_once(':')).map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string())).collect();
    }
    if rest.len() > NET_LIMIT {
        return Err("ответ больше 10 МБ".into());
    }
    Ok(NetResponse { status, headers, text: String::from_utf8_lossy(rest).to_string() })
}

/// «Открыть папку плагинов»: the folder in Finder.
#[tauri::command]
fn open_plugins_folder(app: AppHandle) -> Result<(), String> {
    let dir = plugins_dir(&app)?;
    std::process::Command::new("open").arg(dir).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// The text of every own theme.
#[tauri::command]
fn list_themes(app: AppHandle) -> Vec<String> {
    let Ok(dir) = themes_dir(&app) else { return vec![] };
    let Ok(rd) = fs::read_dir(dir) else { return vec![] };
    let mut out: Vec<(String, String)> = rd
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .filter_map(|p| Some((p.file_name()?.to_string_lossy().into_owned(), fs::read_to_string(&p).ok()?)))
        .collect();
    out.sort();
    out.into_iter().map(|(_, t)| t).collect()
}

#[tauri::command]
fn write_theme(app: AppHandle, file: String, text: String) -> Result<(), String> {
    let p = theme_file(&themes_dir(&app)?, &file)?;
    let tmp = p.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_theme(app: AppHandle, file: String) -> Result<(), String> {
    let p = theme_file(&themes_dir(&app)?, &file)?;
    match fs::remove_file(&p) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// «Экспорт…»: the path comes from the system save panel.
#[tauri::command]
fn export_text(path: String, text: String) -> Result<(), String> {
    fs::write(path, text).map_err(|e| e.to_string())
}

/// «Импорт…»: the path comes from the system open panel; a theme is small, anything big is refused.
#[tauri::command]
fn import_text(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 256 * 1024 {
        return Err("файл слишком большой".into());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
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

// ---- quick entry (⇧⌘I) ----------------------------------------------------------------------------------------
// A system-wide shortcut. With the main window in front the entry opens inside it; from any other program it is a
// panel of its own (the «capture» window, made hidden at start) that does not bring the main window forward. The
// page writes the task: the panel hands it to the main window, which owns the files.

const CAPTURE: &str = "capture";

fn make_capture_window(app: &AppHandle) {
    if app.get_webview_window(CAPTURE).is_some() {
        return;
    }
    let _ = tauri::WebviewWindowBuilder::new(app, CAPTURE, tauri::WebviewUrl::App("index.html#capture".into()))
        .title("Новая задача в Inbox")
        .inner_size(640.0, 172.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .visible(false)
        .center()
        .build();
}

fn show_capture(app: &AppHandle) {
    let main_in_front = app
        .get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false);
    if main_in_front {
        let _ = app.emit_to("main", "capture-here", ());
        return;
    }
    make_capture_window(app);
    if let Some(w) = app.get_webview_window(CAPTURE) {
        let _ = w.center();
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.emit_to(CAPTURE, "capture-open", ());
    }
}

/// The quick entry's shortcut (e.g. "Shift+CmdOrCtrl+KeyI"); `global` = from any program. Off: only the menu item
/// of the app has it. An error says the shortcut is taken or not valid.
#[tauri::command]
fn set_capture_shortcut(app: AppHandle, accelerator: String, global: bool) -> Result<(), String> {
    set_global(&app, &CAPTURE_KEY, if global { accelerator } else { String::new() }, show_capture)
}

/// The system-wide shortcuts of the app (the quick entry's, the mini window's): each one is put in place of its own
/// earlier one, the others stay.
static CAPTURE_KEY: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());
static MINI_KEY: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());
fn set_global(app: &AppHandle, slot: &std::sync::Mutex<String>, accelerator: String, run: fn(&AppHandle)) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    let mut was = slot.lock().unwrap();
    if !was.is_empty() {
        let _ = gs.unregister(was.as_str());
        was.clear();
    }
    if accelerator.trim().is_empty() {
        return Ok(());
    }
    gs.on_shortcut(accelerator.as_str(), move |app, _shortcut, event| {
        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
            run(app);
        }
    })
    .map_err(|e| e.to_string())?;
    *was = accelerator;
    Ok(())
}

// ---- the mini window (ТЗ 31) --------------------------------------------------------------------------------------
// A small window with one note over every program, full-screen ones too. It is the Tauri window «mini» (index.html
// #mini) made a non-activating floating panel by the Swift package swift/MiniPanel: a click or typing in it neither
// activates the app nor leaves a full-screen program; away from the pointer and not typed in, it fades.

const MINI: &str = "mini";

#[cfg(target_os = "macos")]
mod mini_native {
    use swift_rs::{swift, Bool};
    swift!(pub fn mini_setup(window: *mut std::ffi::c_void, fullscreen: Bool, hide_from_capture: Bool));
    swift!(pub fn mini_options(opacity: f64, linger: f64, smooth: Bool, fullscreen: Bool, hide_from_capture: Bool));
    swift!(pub fn mini_show(focus: Bool));
    swift!(pub fn mini_hide());
    swift!(pub fn mini_is_key() -> Bool);
    swift!(pub fn mini_is_visible() -> Bool);
    swift!(pub fn mini_typed());
    swift!(pub fn mini_pin(on: Bool));
    swift!(pub fn mini_return_focus());
}

// ---- «Напоминать завершить день» (ТЗ 32 §5) ------------------------------------------------------------------------
// A notification of macOS (swift/MiniPanel/Notify.swift); a click on it brings the window forward and opens the sheet
// «Завершить день» (the event `end-day`). Without an app bundle (`tauri dev`) there is none: the page says it itself.

#[cfg(target_os = "macos")]
mod notify_native {
    extern "C" {
        pub fn notify_available() -> bool;
        pub fn notify_setup(on_click: extern "C" fn());
        pub fn notify_end_day() -> bool;
    }
}
static APP: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();

#[cfg(target_os = "macos")]
extern "C" fn end_day_clicked() {
    let Some(app) = APP.get() else { return };
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    let _ = app.emit_to("main", "end-day", ());
}
/// The reminder is on: the notifications' delegate and the permission (asked once). Whether they can be shown.
#[tauri::command]
fn remind_prepare(app: AppHandle) -> bool {
    let _ = APP.set(app.clone());
    #[cfg(target_os = "macos")]
    return on_main(&app, || unsafe {
        notify_native::notify_setup(end_day_clicked);
        notify_native::notify_available()
    })
    .unwrap_or(false);
    #[cfg(not(target_os = "macos"))]
    false
}
/// «Завершить день?» now; false — not shown (no bundle): the page shows its own.
#[tauri::command]
fn remind_end_day(app: AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    return on_main(&app, || unsafe { notify_native::notify_end_day() }).unwrap_or(false);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        false
    }
}

/// The text of the clipboard (ТЗ 35): the page cannot read it without WebKit asking the user.
#[tauri::command]
fn clipboard_text() -> String {
    #[cfg(target_os = "macos")]
    unsafe {
        extern "C" {
            fn clip_text() -> *mut std::os::raw::c_char;
            fn free(p: *mut std::ffi::c_void);
        }
        let p = clip_text();
        if p.is_null() {
            return String::new();
        }
        let s = std::ffi::CStr::from_ptr(p).to_string_lossy().into_owned();
        free(p as *mut std::ffi::c_void);
        s
    }
    #[cfg(not(target_os = "macos"))]
    String::new()
}

/// On the main thread, as AppKit wants it: at once when this is it (a sync command, a shortcut's handler), else
/// sent there and waited for.
fn on_main<R: Send + 'static>(app: &AppHandle, f: impl FnOnce() -> R + Send + 'static) -> Option<R> {
    #[cfg(target_os = "macos")]
    if objc2::MainThreadMarker::new().is_some() {
        return Some(f());
    }
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(f());
    })
    .ok()?;
    rx.recv().ok()
}

/// The settings of «Мини-окно» as last given by the page: opacity, the pause after typing (s), smooth, over full-screen
/// programs, hidden from capture, remember the frame. Kept here: the panel is made later, on its first show.
static MINI_OPTS: std::sync::Mutex<(f64, f64, bool, bool, bool, bool)> = std::sync::Mutex::new((0.3, 3.0, true, true, true, true));

/// The saved frame, if the settings keep it and a screen still has its corner.
fn mini_saved_frame(app: &AppHandle) -> Option<MiniFrame> {
    if !MINI_OPTS.lock().unwrap().5 {
        return None;
    }
    let f = read_config(app).mini_frame?;
    let on_screen = app.available_monitors().ok()?.iter().any(|m| {
        let s = m.scale_factor();
        let pos = m.position().to_logical::<f64>(s);
        let size = m.size().to_logical::<f64>(s);
        f.x >= pos.x && f.y >= pos.y && f.x < pos.x + size.width && f.y < pos.y + size.height
    });
    on_screen.then_some(f)
}
/// The window moved or resized: its frame kept (when the settings say so).
fn mini_keep_frame(w: &tauri::Window) {
    if !MINI_OPTS.lock().unwrap().5 {
        return;
    }
    let (Ok(pos), Ok(size), Ok(s)) = (w.outer_position(), w.inner_size(), w.scale_factor()) else { return };
    let (p, z) = (pos.to_logical::<f64>(s), size.to_logical::<f64>(s));
    let app = w.app_handle();
    let mut cfg = read_config(app);
    cfg.mini_frame = Some(MiniFrame { x: p.x, y: p.y, w: z.width, h: z.height });
    write_config(app, &cfg);
}

fn make_mini_window(app: &AppHandle) {
    if app.get_webview_window(MINI).is_some() {
        return;
    }
    let Ok(w) = tauri::WebviewWindowBuilder::new(app, MINI, tauri::WebviewUrl::App("index.html#mini".into()))
        .title("Мини-окно")
        .inner_size(440.0, 330.0)
        .min_inner_size(280.0, 180.0)
        .decorations(false)
        .transparent(true)
        .resizable(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
    else {
        return;
    };
    #[cfg(target_os = "macos")]
    if let Ok(ns) = w.ns_window() {
        let ptr = ns as usize;
        let o = *MINI_OPTS.lock().unwrap();
        on_main(app, move || unsafe {
            mini_native::mini_setup(ptr as *mut std::ffi::c_void, o.3.into(), o.4.into());
            mini_native::mini_options(o.0, o.1, o.2.into(), o.3.into(), o.4.into());
        });
    }
    if let Some(f) = mini_saved_frame(app) {
        let _ = w.set_size(tauri::LogicalSize::new(f.w.max(280.0), f.h.max(180.0)));
        let _ = w.set_position(tauri::LogicalPosition::new(f.x, f.y));
        return;
    }
    // by default in the bottom right corner of the screen the pointer is on, 24 pt from its edges
    let m = app
        .cursor_position()
        .ok()
        .and_then(|c| app.monitor_from_point(c.x, c.y).ok().flatten())
        .or_else(|| w.current_monitor().ok().flatten());
    if let Some(m) = m {
        let s = m.scale_factor();
        let size = m.size().to_logical::<f64>(s);
        let pos = m.position().to_logical::<f64>(s);
        let _ = w.set_position(tauri::LogicalPosition::new(pos.x + size.width - 440.0 - 24.0, pos.y + size.height - 330.0 - 24.0));
    }
}

/// ⌃⌥⌘M: hidden — shown, the keys in it; shown, the keys elsewhere — the keys in it; the keys in it — back to the
/// program before.
fn toggle_mini(app: &AppHandle) {
    make_mini_window(app);
    #[cfg(target_os = "macos")]
    {
        let state = on_main(app, || unsafe { (mini_native::mini_is_visible(), mini_native::mini_is_key()) });
        match state {
            Some((true, true)) => {
                on_main(app, || unsafe { mini_native::mini_return_focus() });
            }
            _ => {
                on_main(app, || unsafe { mini_native::mini_show(true) });
                let _ = app.emit_to(MINI, "mini-focus", ());
            }
        }
    }
}

#[tauri::command]
fn set_mini_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
    set_global(&app, &MINI_KEY, accelerator, toggle_mini)
}
#[tauri::command]
fn mini_toggle(app: AppHandle) {
    toggle_mini(&app);
}
/// ⇧⌘M: the note in the mini window, shown with the keys in it.
#[tauri::command]
fn mini_open(app: AppHandle, note: Option<serde_json::Value>) {
    make_mini_window(&app);
    #[cfg(target_os = "macos")]
    on_main(&app, || unsafe { mini_native::mini_show(true) });
    if let Some(n) = note {
        let _ = app.emit_to(MINI, "mini-open", n);
    }
    let _ = app.emit_to(MINI, "mini-focus", ());
}
#[tauri::command]
fn mini_hide(app: AppHandle) {
    #[cfg(target_os = "macos")]
    on_main(&app, || unsafe { mini_native::mini_hide() });
}
/// A key typed in the mini window: it stays full for the pause set.
#[tauri::command]
fn mini_typed(app: AppHandle) {
    #[cfg(target_os = "macos")]
    on_main(&app, || unsafe { mini_native::mini_typed() });
}
/// The palette, the search or a menu of the mini window open: full until it closes.
#[tauri::command]
fn mini_pin(app: AppHandle, on: bool) {
    #[cfg(target_os = "macos")]
    on_main(&app, move || unsafe { mini_native::mini_pin(on.into()) });
}
/// ⎋ with nothing to close: the keys back to the program in front before.
#[tauri::command]
fn mini_return_focus(app: AppHandle) {
    #[cfg(target_os = "macos")]
    on_main(&app, || unsafe { mini_native::mini_return_focus() });
}
/// The settings of «Мини-окно» (ТЗ 31 §6), applied at once (and kept for the panel made later).
#[tauri::command]
fn mini_options(app: AppHandle, opacity: f64, linger: f64, smooth: bool, fullscreen: bool, hide_from_capture: bool, remember: bool) {
    *MINI_OPTS.lock().unwrap() = (opacity, linger, smooth, fullscreen, hide_from_capture, remember);
    #[cfg(target_os = "macos")]
    on_main(&app, move || unsafe { mini_native::mini_options(opacity, linger, smooth.into(), fullscreen.into(), hide_from_capture.into()) });
}

/// The panel asks the main window to show itself (e.g. «Выбрать файл…» when the Inbox is not set up).
#[tauri::command]
fn show_main_window(app: AppHandle) {
    show_main(&app);
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
            trash_entry,
            set_capture_shortcut,
            set_mini_shortcut,
            mini_toggle,
            mini_open,
            mini_hide,
            mini_typed,
            mini_pin,
            mini_return_focus,
            mini_options,
            remind_prepare,
            remind_end_day,
            clipboard_text,
            show_main_window,
            list_themes,
            write_theme,
            delete_theme,
            export_text,
            import_text,
            read_feature_file,
            write_feature_file,
            list_plugins,
            read_plugin_file,
            open_plugins_folder,
            net_fetch
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
            make_capture_window(&handle);
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
            if w.label() == MINI && matches!(e, tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)) {
                mini_keep_frame(w);
            }
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

#[cfg(test)]
mod plugin_tests {
    use super::*;

    #[test]
    fn hosts_of_addresses() {
        assert_eq!(host_of("https://Jira.Company.ru/rest/api?x=1").as_deref(), Some("jira.company.ru"));
        assert_eq!(host_of("http://localhost:8080/").as_deref(), Some("localhost"));
        assert_eq!(host_of("https://user@evil.com/"), None);
        assert_eq!(host_of("file:///etc/passwd"), None);
        assert_eq!(host_of("ftp://a.ru"), None);
    }
    #[test]
    fn hosts_of_the_manifest() {
        let m: serde_json::Value = serde_json::json!({ "net": ["jira.company.ru", "*.corp.ru"] });
        assert!(host_allowed(&m, "jira.company.ru"));
        assert!(!host_allowed(&m, "evil-jira.company.ru"));
        assert!(host_allowed(&m, "wiki.corp.ru"));
        assert!(!host_allowed(&m, "corp.ru.evil.com"));
        assert!(!host_allowed(&serde_json::json!({}), "jira.company.ru"));
    }
    #[test]
    fn curl_answers() {
        let raw = b"HTTP/1.1 301 Moved\r\nLocation: /b\r\n\r\nHTTP/2 200\r\nContent-Type: application/json\r\n\r\n{\"ok\":true}";
        let r = parse_curl(raw).unwrap();
        assert_eq!(r.status, 200);
        assert_eq!(r.headers, vec![("content-type".to_string(), "application/json".to_string())]);
        assert_eq!(r.text, "{\"ok\":true}");
    }
    #[test]
    fn the_builtin_manifests_are_read() {
        let ids: Vec<String> = BUILTIN_MANIFESTS.iter().map(|m| serde_json::from_str::<serde_json::Value>(m).unwrap()["id"].as_str().unwrap().to_string()).collect();
        assert_eq!(ids, ["calendar", "hello", "inbox", "kanban", "quarter-goals", "theme-pack"]);
    }
}

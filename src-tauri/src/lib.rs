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
}

#[derive(Serialize, Deserialize, Default)]
struct Config {
    notes_dir: Option<String>,
}

#[derive(Default)]
struct AppState {
    dir: Mutex<Option<PathBuf>>,
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
                out.push(OrgFile {
                    name: rel,
                    path: p.to_string_lossy().to_string(),
                    text,
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
                // no extension: a folder was added, renamed or removed
                !hidden && (org || e.path.extension().is_none())
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

#[tauri::command]
fn set_notes_dir(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err("not a directory".into());
    }
    activate(&app, &state, dir);
    write_config(
        &app,
        &Config {
            notes_dir: Some(path),
        },
    );
    Ok(())
}

/// Bundled sample notes (development convenience); None when the folder is not there.
#[tauri::command]
fn sample_notes_dir() -> Option<String> {
    let p = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../sample-notes"));
    p.is_dir().then(|| p.to_string_lossy().to_string())
}

#[tauri::command]
fn list_org_files(state: State<AppState>) -> Vec<OrgFile> {
    let Some(root) = state.dir.lock().unwrap().clone() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    collect(&root, &root, &mut out);
    out
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

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_notes_dir,
            set_notes_dir,
            sample_notes_dir,
            list_org_files,
            save_org_file,
            list_folders,
            read_project_config,
            write_project_config,
            create_entry,
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
            // ORG_DIR overrides the remembered folder (handy for development).
            let handle = app.handle().clone();
            let remembered = std::env::var("ORG_DIR")
                .ok()
                .or_else(|| read_config(&handle).notes_dir);
            if let Some(dir) = remembered.map(PathBuf::from).filter(|p| p.is_dir()) {
                let state = app.state::<AppState>();
                activate(&handle, &state, dir);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

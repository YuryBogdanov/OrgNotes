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
    let Ok(entries) = fs::read_dir(dir) else { return };
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
                let rel = p.strip_prefix(root).unwrap_or(&p).to_string_lossy().to_string();
                out.push(OrgFile { name: rel, path: p.to_string_lossy().to_string(), text });
            }
        }
    }
}

fn watch(app: &AppHandle, dir: &Path) -> Option<Debouncer<RecommendedWatcher>> {
    let handle = app.clone();
    let mut deb = new_debouncer(Duration::from_millis(300), move |res: DebounceEventResult| {
        let Ok(events) = res else { return };
        let relevant = events.iter().any(|e| {
            let hidden = e.path.file_name().map_or(false, |n| n.to_string_lossy().starts_with('.'));
            let org = e.path.extension().map_or(false, |x| x == "org");
            // no extension: a folder was added, renamed or removed
            !hidden && (org || e.path.extension().is_none())
        });
        if relevant {
            let _ = handle.emit("notes-changed", ());
        }
    })
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
    state.dir.lock().unwrap().as_ref().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn set_notes_dir(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err("not a directory".into());
    }
    activate(&app, &state, dir);
    write_config(&app, &Config { notes_dir: Some(path) });
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
    let Some(root) = state.dir.lock().unwrap().clone() else { return Vec::new() };
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
fn save_org_file(state: State<AppState>, path: String, text: String, base: String) -> Result<(), String> {
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
        assert_eq!(fs::read_to_string(&f).unwrap(), "* TODO a\nedited in emacs\n");
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
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_notes_dir,
            set_notes_dir,
            sample_notes_dir,
            list_org_files,
            save_org_file
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
            let remembered = std::env::var("ORG_DIR").ok().or_else(|| read_config(&handle).notes_dir);
            if let Some(dir) = remembered.map(PathBuf::from).filter(|p| p.is_dir()) {
                let state = app.state::<AppState>();
                activate(&handle, &state, dir);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

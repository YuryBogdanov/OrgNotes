use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
struct OrgFile {
    name: String,
    path: String,
    text: String,
}

/// Notes folder: `ORG_DIR` env var, otherwise the bundled sample-notes next to the project.
fn notes_dir() -> PathBuf {
    std::env::var("ORG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../sample-notes")))
}

fn collect(dir: &Path, root: &Path, out: &mut Vec<OrgFile>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
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

#[tauri::command]
fn list_org_files() -> Vec<OrgFile> {
    let root = notes_dir();
    let mut out = Vec::new();
    collect(&root, &root, &mut out);
    out
}

/// Atomic write (temp file + rename), restricted to .org files inside the notes folder.
#[tauri::command]
fn save_org_file(path: String, text: String) -> Result<(), String> {
    let root = fs::canonicalize(notes_dir()).map_err(|e| e.to_string())?;
    let target = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    if !target.starts_with(&root) || target.extension().map_or(true, |x| x != "org") {
        return Err("path outside notes folder".into());
    }
    let tmp = target.with_extension("org.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_org_files, save_org_file])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                if let Some(window) = app.get_webview_window("main") {
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None);
                }
            }
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

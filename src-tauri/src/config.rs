// The app's own settings (its config folder) and the project's (`<notes>/.orgnotes/config.json`), the features' files
// there (tech sprint 5.2: out of lib.rs).

use super::*;

pub(crate) fn config_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("config.json"))
}

pub(crate) fn read_config(app: &AppHandle) -> Config {
    config_path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub(crate) fn write_config(app: &AppHandle, cfg: &Config) {
    if let Some(p) = config_path(app) {
        if let Ok(s) = serde_json::to_string_pretty(cfg) {
            let _ = fs::write(p, s);
        }
    }
}

// ---- project config ---------------------------------------------------------------

pub(crate) fn read_config_in(root: &Path) -> Option<String> {
    fs::read_to_string(root.join(CONFIG_DIR).join(CONFIG_FILE)).ok()
}

pub(crate) fn write_config_in(root: &Path, text: &str) -> Res<()> {
    let dir = root.join(CONFIG_DIR);
    fs::create_dir_all(&dir)?;
    let target = dir.join(CONFIG_FILE);
    let tmp = dir.join(format!("{CONFIG_FILE}.tmp"));
    atomic_write(&tmp, &target, text.as_bytes())
}

#[tauri::command]
pub(crate) fn read_project_config(state: State<AppState>) -> Option<String> {
    let root = lock(&state.dir).clone()?;
    read_config_in(&root)
}

#[tauri::command]
pub(crate) fn write_project_config(state: State<AppState>, text: String) -> Res<()> {
    write_config_in(&root_of(&state)?, &text)
}


// ---- a feature's own settings in the notes folder (roadmap 0.6): `.orgnotes/plugins/<id>.json` ------------------

pub(crate) fn feature_file(root: &Path, id: &str) -> Res<PathBuf> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("bad feature id".into());
    }
    Ok(root.join(CONFIG_DIR).join("plugins").join(format!("{id}.json")))
}

#[tauri::command]
pub(crate) fn read_feature_file(state: State<AppState>, id: String) -> Res<Option<String>> {
    let p = feature_file(&root_of(&state)?, &id)?;
    Ok(fs::read_to_string(p).ok())
}

#[tauri::command]
pub(crate) fn write_feature_file(state: State<AppState>, id: String, text: String) -> Res<()> {
    let p = feature_file(&root_of(&state)?, &id)?;
    let dir = p.parent().ok_or("no folder")?;
    fs::create_dir_all(dir)?;
    let tmp = p.with_extension("json.tmp");
    atomic_write(&tmp, &p, text.as_bytes())
}

/// Before it was called Panopticon the app had another identifier: its saved settings (the notes folder) move over once.
pub(crate) fn migrate_config(app: &AppHandle) {
    let Ok(dir) = app.path().app_config_dir() else { return };
    let new = dir.join("config.json");
    let old = dir.with_file_name("dev.local.org-prototype").join("config.json");
    if !new.exists() && old.exists() {
        let _ = fs::create_dir_all(&dir);
        let _ = fs::copy(old, new);
    }
}

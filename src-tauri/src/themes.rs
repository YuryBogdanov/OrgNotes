// Editor themes (ТЗ 25): `themes/*.json` in the app's config folder (tech sprint 5.2: out of lib.rs).

use super::*;

// ---- editor themes (ТЗ 25): own themes are `<name>.json` in the app's config folder, `themes/` -----------------

pub(crate) fn themes_dir(app: &AppHandle) -> Res<PathBuf> {
    let dir = app.path().app_config_dir()?.join("themes");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}
/// A theme's file name as the page made it: a plain `<name>.json`, nothing that leaves the folder.
pub(crate) fn theme_file(dir: &Path, file: &str) -> Res<PathBuf> {
    if file.is_empty() || file.starts_with('.') || file.contains(['/', '\\', ':']) || !file.ends_with(".json") {
        return Err("bad theme file name".into());
    }
    Ok(dir.join(file))
}

/// The text of every own theme.
#[tauri::command]
pub(crate) fn list_themes(app: AppHandle) -> Vec<String> {
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
pub(crate) fn write_theme(app: AppHandle, file: String, text: String) -> Res<()> {
    let p = theme_file(&themes_dir(&app)?, &file)?;
    let tmp = p.with_extension("json.tmp");
    atomic_write(&tmp, &p, text.as_bytes())
}

#[tauri::command]
pub(crate) fn delete_theme(app: AppHandle, file: String) -> Res<()> {
    let p = theme_file(&themes_dir(&app)?, &file)?;
    match fs::remove_file(&p) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

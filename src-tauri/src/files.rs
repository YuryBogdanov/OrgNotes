// File operations in the notes folder: names checked, create, rename, move, trash, «Сохранить как…» (tech sprint 5.2:
// out of lib.rs).

use super::*;

// ---- file operations -----------------------------------------------------------
// Everything below works on paths inside the notes folder only. Functions take the root
// explicitly so they can be tested on a temp directory.

pub(crate) fn check_name(name: &str) -> Res<String> {
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

pub(crate) fn inside(root: &Path, path: &Path) -> Res<PathBuf> {
    let r = fs::canonicalize(root)?;
    let p = fs::canonicalize(path)?;
    if !p.starts_with(&r) {
        return Err("path outside notes folder".into());
    }
    Ok(p)
}

/// Same location, expressed under the root as the app knows it (not canonicalised), so the
/// returned path matches the ones `list_org_files` hands out.
pub(crate) fn as_known(root: &Path, canon: &Path) -> String {
    let r = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    root.join(canon.strip_prefix(&r).unwrap_or(canon))
        .to_string_lossy()
        .to_string()
}

pub(crate) fn with_org(name: String) -> String {
    if name.ends_with(".org") || name.ends_with(".org_archive") || is_org(Path::new(&name)) {
        name
    } else {
        format!("{name}.org")
    }
}

pub(crate) fn create_in(root: &Path, parent: &str, name: &str, is_dir: bool, text: Option<&str>) -> Res<String> {
    let parent = inside(root, Path::new(parent))?;
    if !parent.is_dir() {
        return Err("parent is not a folder".into());
    }
    let name = check_name(name)?;
    let name = if is_dir { name } else { with_org(name) };
    let target = parent.join(&name);
    if target.exists() {
        return Err(Error::Exists);
    }
    if is_dir {
        fs::create_dir(&target)?;
    } else if let Some(text) = text {
        // a plugin's file type: its empty file (a canvas with nothing on it)
        fs::write(&target, text)?;
    } else if !name.ends_with(".org") {
        fs::write(&target, "")?;
    } else {
        let title = name.trim_end_matches(".org");
        fs::write(&target, format!("#+TITLE: {title}\n\n"))?;
    }
    Ok(as_known(root, &target))
}

pub(crate) fn rename_in(root: &Path, path: &str, new_name: &str) -> Res<String> {
    let src = inside(root, Path::new(path))?;
    if src == fs::canonicalize(root)? {
        return Err("cannot rename the notes folder".into());
    }
    let name = check_name(new_name)?;
    let name = if src.is_dir() { name } else { with_org(name) };
    let target = src.parent().ok_or("no parent")?.join(&name);
    // a case-only rename "exists" on a case-insensitive volume but is the same file
    let same_file = fs::canonicalize(&target).map_or(false, |t| t == src);
    if target.exists() && !same_file {
        return Err(Error::Exists);
    }
    fs::rename(&src, &target)?;
    Ok(as_known(root, &target))
}

pub(crate) fn move_in(root: &Path, path: &str, dest: &str) -> Res<String> {
    let src = inside(root, Path::new(path))?;
    let dest = inside(root, Path::new(dest))?;
    let canon_root = fs::canonicalize(root)?;
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
        return Err(Error::Exists);
    }
    fs::rename(&src, &target)?;
    Ok(as_known(root, &target))
}

pub(crate) fn trash_in(root: &Path, path: &str) -> Res<()> {
    let src = inside(root, Path::new(path))?;
    if src == fs::canonicalize(root)? {
        return Err("cannot delete the notes folder".into());
    }
    trash::delete(&src).map_err(Error::from)
}

pub(crate) fn dirs_in(dir: &Path, root: &Path, out: &mut Vec<String>) {
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

pub(crate) fn root_of(state: &State<AppState>) -> Res<PathBuf> {
    lock(&state.dir)
        .clone()
        .ok_or_else(|| "no notes folder".into())
}

#[tauri::command]
pub(crate) fn list_folders(state: State<AppState>) -> Vec<String> {
    let Some(root) = lock(&state.dir).clone() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    dirs_in(&root, &root, &mut out);
    out
}

#[tauri::command]
pub(crate) fn create_entry(
    state: State<AppState>,
    parent: String,
    name: String,
    is_dir: bool,
    text: Option<String>,
) -> Res<String> {
    create_in(&root_of(&state)?, &parent, &name, is_dir, text.as_deref())
}

#[tauri::command]
pub(crate) fn rename_entry(state: State<AppState>, path: String, new_name: String) -> Res<String> {
    rename_in(&root_of(&state)?, &path, &new_name)
}

#[tauri::command]
pub(crate) fn move_entry(state: State<AppState>, path: String, dest: String) -> Res<String> {
    move_in(&root_of(&state)?, &path, &dest)
}

/// Moves to the system Trash (recoverable), never deletes permanently.
#[tauri::command]
pub(crate) fn trash_entry(state: State<AppState>, path: String) -> Res<()> {
    trash_in(&root_of(&state)?, &path)
}


/// "Сохранить как…" for a tab that has no file yet. `.org` is added unless the name already has an
/// extension; an existing file is only replaced when `overwrite` is set (the user confirmed "Заменить").
pub(crate) fn save_new_in(root: &Path, parent: &str, name: &str, text: &str, overwrite: bool) -> Res<String> {
    let parent = inside(root, Path::new(parent))?;
    if !parent.is_dir() {
        return Err("parent is not a folder".into());
    }
    let name = check_name(name)?;
    let name = with_org(name); // "Привет" and "Привет.org" both become "Привет.org"
    let target = parent.join(&name);
    if target.exists() && !overwrite {
        return Err(Error::Exists);
    }
    if target.is_dir() {
        return Err("a folder has that name".into());
    }
    let tmp = parent.join(format!(".{name}.tmp"));
    atomic_write(&tmp, &target, text.as_bytes())?;
    Ok(as_known(root, &target))
}

#[tauri::command]
pub(crate) fn save_new_file(state: State<AppState>, parent: String, name: String, text: String, overwrite: bool) -> Res<String> {
    save_new_in(&root_of(&state)?, &parent, &name, &text, overwrite)
}

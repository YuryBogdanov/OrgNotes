// The notes folder: which one, watching it, scanning a folder before it is opened, listing and saving the org files
// (tech sprint 5.2: out of lib.rs).

use super::*;

pub(crate) fn collect(dir: &Path, root: &Path, out: &mut Vec<OrgFile>) {
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

pub(crate) fn watch(app: &AppHandle, dir: &Path) -> Option<Debouncer<RecommendedWatcher>> {
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

pub(crate) fn activate(app: &AppHandle, state: &AppState, dir: PathBuf) {
    *lock(&state.watcher) = watch(app, &dir);
    *lock(&state.dir) = Some(dir);
}

#[tauri::command]
pub(crate) fn get_notes_dir(state: State<AppState>) -> Option<String> {
    lock(&state.dir)
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
}

#[derive(Serialize)]
pub(crate) struct DirStatus {
    /// the open notes folder
    dir: Option<String>,
    /// the remembered folder that cannot be opened now
    missing: Option<String>,
}

/// At start: is there a notes folder, and can it be opened?
#[tauri::command]
pub(crate) fn notes_dir_status(state: State<AppState>) -> DirStatus {
    DirStatus {
        dir: lock(&state.dir).as_ref().map(|p| p.to_string_lossy().to_string()),
        missing: lock(&state.missing).clone(),
    }
}

/// The remembered folder, by its path or, if it was renamed or moved, by its bookmark.
pub(crate) fn remembered_dir(app: &AppHandle) -> Option<PathBuf> {
    let cfg = read_config(app);
    let by_path = cfg.notes_dir.as_ref().map(PathBuf::from).filter(|p| p.is_dir());
    let found = by_path.or_else(|| cfg.bookmark.as_deref().and_then(bookmark::resolve).map(PathBuf::from).filter(|p| p.is_dir()))?;
    if cfg.notes_dir.as_deref() != Some(&*found.to_string_lossy()) {
        remember(app, &found.to_string_lossy()); // moved: keep the new path
    }
    Some(found)
}

pub(crate) fn remember(app: &AppHandle, path: &str) {
    // the folder changes; what else this Mac keeps (the mini window's frame) stays
    let cfg = read_config(app);
    write_config(app, &Config { notes_dir: Some(path.to_string()), bookmark: bookmark::make(path), ..cfg });
}

/// «Повторить»: open the remembered folder if it is back.
#[tauri::command]
pub(crate) fn retry_notes_dir(app: AppHandle, state: State<AppState>) -> Option<String> {
    let dir = remembered_dir(&app)?;
    *lock(&state.missing) = None;
    activate(&app, &state, dir.clone());
    Some(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) fn set_notes_dir(app: AppHandle, state: State<AppState>, path: String) -> Res<()> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err("not a directory".into());
    }
    activate(&app, &state, dir);
    *lock(&state.missing) = None;
    remember(&app, &path);
    Ok(())
}

#[derive(Serialize, Debug, PartialEq)]
pub(crate) struct Scan {
    pub(crate) name: String,
    pub(crate) path: String,
    /// the path as shown: ~ for the home folder
    pub(crate) shown: String,
    pub(crate) org: usize,
    pub(crate) folders: usize,
    pub(crate) other: usize,
    /// the scan stopped at the limit: a home folder or a whole disk
    pub(crate) capped: bool,
    pub(crate) big: bool,
}

pub(crate) const SCAN_LIMIT: usize = 10_000;

/// Emacs keeps lock (.#name), auto-save (#name#) and backup (name~) files next to the notes.
pub(crate) fn emacs_service(name: &str) -> bool {
    name.starts_with(".#") || (name.starts_with('#') && name.ends_with('#')) || name.ends_with('~')
}

/// «Папка найдена»: what the app would see in a folder. Hidden entries (.git too) and Emacs service files are not
/// counted; symbolic links are not followed (they count as other files).
#[tauri::command]
pub(crate) fn scan_folder(path: String) -> Res<Scan> {
    scan_in(Path::new(&path), std::env::var("HOME").ok().as_deref())
}

pub(crate) fn scan_in(root: &Path, home: Option<&str>) -> Res<Scan> {
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
pub(crate) fn sample_notes_dir() -> Option<String> {
    let p = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../sample-notes"));
    p.is_dir().then(|| p.to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) fn list_org_files(state: State<AppState>) -> Res<Vec<OrgFile>> {
    let Some(root) = lock(&state.dir).clone() else {
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

/// A note: an `.org` file, or its archive as Emacs makes them (`.org_archive`, ТЗ 33), or a file of a type a plugin
/// declares (`fileTypes`, «.canvas» of «Холст», ТЗ 39).
pub(crate) fn is_org(p: &Path) -> bool {
    match p.extension().and_then(|x| x.to_str()) {
        Some("org" | "org_archive") => true,
        Some(x) => lock(&NOTE_TYPES).iter().any(|t| t.eq_ignore_ascii_case(x)),
        None => false,
    }
}

/// The extensions of the plugins' file types (without the dot), as the window last set them.
pub(crate) static NOTE_TYPES: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// An extension a plugin may declare: letters and digits, not the app's own.
pub(crate) fn note_type_ok(x: &str) -> bool {
    !x.is_empty() && x.len() <= 16 && x.chars().all(|c| c.is_ascii_alphanumeric()) && !matches!(x.to_ascii_lowercase().as_str(), "org" | "org_archive")
}

#[tauri::command]
pub(crate) fn set_note_types(types: Vec<String>) {
    *lock(&NOTE_TYPES) = types.into_iter().filter(|t| note_type_ok(t)).map(|t| t.to_ascii_lowercase()).collect();
}

/// Atomic write (temp file + rename) restricted to .org files inside the notes folder.
/// `base` is the text we last read from disk: if the file changed since, nothing is written
/// and "conflict" is returned, so an edit made in another editor is never clobbered.
pub(crate) fn save_checked(root: &Path, path: &str, text: &str, base: &str) -> Res<()> {
    let root = fs::canonicalize(root)?;
    let target = fs::canonicalize(path)?;
    if !target.starts_with(&root) || !is_org(&target) {
        return Err("path outside notes folder".into());
    }
    let disk = fs::read_to_string(&target)?;
    if disk != base {
        return Err(Error::Conflict);
    }
    let mut tmp_name = target.file_name().unwrap_or_default().to_os_string();
    tmp_name.push(".tmp");
    let tmp = target.with_file_name(tmp_name);
    atomic_write(&tmp, &target, text.as_bytes())
}

#[tauri::command]
pub(crate) fn save_org_file(
    state: State<AppState>,
    path: String,
    text: String,
    base: String,
) -> Res<()> {
    let root = lock(&state.dir).clone().ok_or("no notes folder")?;
    save_checked(&root, &path, &text, &base)
}

// Exports and imports through the system panels: only a path the user chose there is written or read (tech sprint 5.2:
// out of lib.rs).

use super::*;

/// The paths the user picked in a panel shown by `pick_save` / `pick_open`, each good for one export or import: the
/// page (and a plugin's code in it) cannot write or read a file the user did not choose (tech sprint 5.1).
pub(crate) static PICKED: Mutex<Vec<String>> = Mutex::new(Vec::new());
pub(crate) fn take_picked(path: &str) -> Res<()> {
    let mut picked = lock(&PICKED);
    let i = picked.iter().position(|p| p == path).ok_or("путь не выбран в окне сохранения или открытия")?;
    picked.remove(i);
    Ok(())
}
pub(crate) fn remember_picked(p: Option<tauri_plugin_dialog::FilePath>) -> Option<String> {
    let path = p?.into_path().ok()?.to_string_lossy().to_string();
    let mut picked = lock(&PICKED);
    picked.push(path.clone());
    let n = picked.len();
    if n > 16 {
        picked.drain(..n - 16); // panels answered and never used: forgotten
    }
    Some(path)
}
#[derive(Deserialize)]
pub(crate) struct PanelFilter {
    name: String,
    extensions: Vec<String>,
}
pub(crate) fn panel(app: &AppHandle, title: &str, filter: &Option<PanelFilter>) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
    use tauri_plugin_dialog::DialogExt;
    let d = app.dialog().file().set_title(title);
    match filter {
        Some(f) => d.add_filter(&f.name, &f.extensions.iter().map(String::as_str).collect::<Vec<_>>()),
        None => d,
    }
}
/// The system save panel; the path chosen may then be written by `export_text` / `export_bytes`, once.
#[tauri::command]
pub(crate) async fn pick_save(app: AppHandle, title: String, default_name: String, filter: Option<PanelFilter>) -> Option<String> {
    remember_picked(panel(&app, &title, &filter).set_file_name(default_name).blocking_save_file())
}
/// The system open panel (a file); the path chosen may then be read by `import_text`, once.
#[tauri::command]
pub(crate) async fn pick_open(app: AppHandle, title: String, filter: Option<PanelFilter>) -> Option<String> {
    remember_picked(panel(&app, &title, &filter).blocking_pick_file())
}

/// «Экспорт…»: where the user said in `pick_save`.
#[tauri::command]
pub(crate) fn export_text(path: String, text: String) -> Res<()> {
    take_picked(&path)?;
    fs::write(path, text).map_err(Error::from)
}

/// A plugin's export (ТЗ 39: PNG of a canvas): bytes in base64 where the user said in `pick_save`.
#[tauri::command]
pub(crate) fn export_bytes(path: String, data: String) -> Res<()> {
    take_picked(&path)?;
    fs::write(path, from_base64(&data)?).map_err(Error::from)
}

pub(crate) fn from_base64(s: &str) -> Res<Vec<u8>> {
    let val = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32)
    };
    let clean: Vec<u8> = s.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=').collect();
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    for chunk in clean.chunks(4) {
        let mut n = 0u32;
        for (i, &c) in chunk.iter().enumerate() {
            n |= val(c).ok_or("not base64")? << (18 - 6 * i);
        }
        let bytes = [(n >> 16) as u8, (n >> 8) as u8, n as u8];
        out.extend_from_slice(&bytes[..chunk.len().saturating_sub(1)]);
    }
    Ok(out)
}

/// «Импорт…»: the file the user chose in `pick_open`; a theme is small, anything big is refused.
#[tauri::command]
pub(crate) fn import_text(path: String) -> Res<String> {
    take_picked(&path)?;
    let meta = fs::metadata(&path)?;
    if meta.len() > 256 * 1024 {
        return Err("файл слишком большой".into());
    }
    fs::read_to_string(&path).map_err(Error::from)
}

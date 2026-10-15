// The quick entry (⇧⌘I): its panel, its system-wide shortcut (tech sprint 5.2: out of lib.rs).

use super::*;

// ---- quick entry (⇧⌘I) ----------------------------------------------------------------------------------------
// A system-wide shortcut. With the main window in front the entry opens inside it; from any other program it is a
// panel of its own (the «capture» window, made hidden at start) that does not bring the main window forward. The
// page writes the task: the panel hands it to the main window, which owns the files.

pub(crate) const CAPTURE: &str = "capture";

pub(crate) fn make_capture_window(app: &AppHandle) {
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

pub(crate) fn show_capture(app: &AppHandle) {
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
pub(crate) fn set_capture_shortcut(app: AppHandle, accelerator: String, global: bool) -> Res<()> {
    set_global(&app, &CAPTURE_KEY, if global { accelerator } else { String::new() }, show_capture)
}

/// The system-wide shortcuts of the app (the quick entry's, the mini window's): each one is put in place of its own
/// earlier one, the others stay.
pub(crate) static CAPTURE_KEY: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());
pub(crate) static MINI_KEY: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());
pub(crate) fn set_global(app: &AppHandle, slot: &std::sync::Mutex<String>, accelerator: String, run: fn(&AppHandle)) -> Res<()> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    let mut was = lock(slot);
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
    ?;
    *was = accelerator;
    Ok(())
}

mod plugin_sources;
mod util;
mod config;
mod notes;
mod files;
mod themes;
mod plugins;
mod exchange;
mod capture;
mod mini;
mod system;
mod pty;
mod present;
#[cfg(test)]
mod tests;

use util::*;
use config::*;
use notes::*;
use files::*;
use plugins::*;
use capture::*;
use mini::*;

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
mod titlebar;

#[derive(Default)]
struct AppState {
    dir: Mutex<Option<PathBuf>>,
    /// the remembered folder when it cannot be opened (deleted, renamed beyond the bookmark, unmounted)
    missing: Mutex<Option<String>>,
    watcher: Mutex<Option<Debouncer<RecommendedWatcher>>>,
}

/// Quit after the page has asked about unsaved tabs.
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
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
        .manage(pty::Ptys::default())
        .invoke_handler(tauri::generate_handler![
            notes::set_note_types,
            exchange::export_bytes,
            exchange::pick_save,
            exchange::pick_open,
            plugin_sources::catalog_fetch,
            plugin_sources::catalog_raw,
            plugin_sources::catalog_releases,
            plugin_sources::plugin_install_release,
            plugin_sources::plugin_cancel,
            plugin_sources::plugin_remove,
            plugin_sources::plugin_restore,
            plugin_sources::plugin_reveal,
            plugin_sources::git_refs,
            plugin_sources::git_probe,
            plugin_sources::plugin_install_git,
            notes::get_notes_dir,
            notes::notes_dir_status,
            notes::retry_notes_dir,
            notes::set_notes_dir,
            notes::scan_folder,
            notes::sample_notes_dir,
            notes::list_org_files,
            notes::save_org_file,
            files::list_folders,
            config::read_project_config,
            config::write_project_config,
            config::read_touch_file,
            config::write_touch_file,
            files::create_entry,
            files::save_new_file,
            quit_app,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_kill_plugin,
            pty::pty_count,
            files::rename_entry,
            files::move_entry,
            files::trash_entry,
            files::read_bytes,
            files::write_bytes,
            present::present_screens,
            present::present_begin,
            present::present_end,
            present::pdf_print,
            present::pdf_done,
            capture::set_capture_shortcut,
            mini::set_mini_shortcut,
            mini::mini_toggle,
            mini::mini_open,
            mini::mini_hide,
            mini::mini_typed,
            mini::mini_pin,
            mini::mini_return_focus,
            mini::mini_options,
            system::remind_prepare,
            system::remind_end_day,
            system::notify_system,
            system::clipboard_text,
            system::font_families,
            system::double_click_action,
            show_main_window,
            themes::list_themes,
            themes::write_theme,
            themes::delete_theme,
            exchange::export_text,
            exchange::import_text,
            config::read_feature_file,
            config::write_feature_file,
            plugins::list_plugins,
            plugins::read_plugin_file,
            plugins::open_plugins_folder,
            net_fetch
        ])
        .setup(|app| {
            // the main window from its config, with the handler of `window.open` (a plugin's show, ТЗ 59 §9.2): built
            // here, not by Tauri, as only a builder takes it ("create": false in tauri.conf.json)
            if let Some(cfg) = app.config().app.windows.iter().find(|w| w.label == "main").cloned() {
                let w = tauri::WebviewWindowBuilder::from_config(app.handle(), &cfg)?
                    .on_new_window(present::new_window(app.handle().clone()))
                    .build()?;
                present::allow_windows(&w);
            }
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
                *lock(&state.missing) = Some(p);
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
            // the processes of the terminal do not outlive the app (ТЗ 55 §1)
            tauri::RunEvent::Exit => pty::kill_all(app),
            _ => {}
        });
}

// macOS around the app: the end-of-day reminder (ТЗ 32 §5), the clipboard read for the page (tech sprint 5.2: out of
// lib.rs).

use super::*;

// ---- «Напоминать завершить день» (ТЗ 32 §5) ------------------------------------------------------------------------
// A notification of macOS (swift/MiniPanel/Notify.swift); a click on it brings the window forward and opens the sheet
// «Завершить день» (the event `end-day`). Without an app bundle (`tauri dev`) there is none: the page says it itself.

#[cfg(target_os = "macos")]
pub(crate) mod notify_native {
    extern "C" {
        pub fn notify_available() -> bool;
        pub fn notify_setup(on_click: extern "C" fn());
        pub fn notify_end_day() -> bool;
    }
}
pub(crate) static APP: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();

#[cfg(target_os = "macos")]
extern "C" fn end_day_clicked() {
    let Some(app) = APP.get() else { return };
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    let _ = app.emit_to("main", "end-day", ());
}
/// The reminder is on: the notifications' delegate and the permission (asked once). Whether they can be shown.
#[tauri::command]
pub(crate) fn remind_prepare(app: AppHandle) -> bool {
    let _ = APP.set(app.clone());
    #[cfg(target_os = "macos")]
    return on_main(&app, || unsafe {
        notify_native::notify_setup(end_day_clicked);
        notify_native::notify_available()
    })
    .unwrap_or(false);
    #[cfg(not(target_os = "macos"))]
    false
}
/// «Завершить день?» now; false — not shown (no bundle): the page shows its own.
#[tauri::command]
pub(crate) fn remind_end_day(app: AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    return on_main(&app, || unsafe { notify_native::notify_end_day() }).unwrap_or(false);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        false
    }
}

/// The text of the clipboard (ТЗ 35): the page cannot read it without WebKit asking the user.
#[tauri::command]
pub(crate) fn clipboard_text() -> String {
    #[cfg(target_os = "macos")]
    unsafe {
        extern "C" {
            fn clip_text() -> *mut std::os::raw::c_char;
            fn free(p: *mut std::ffi::c_void);
        }
        let p = clip_text();
        if p.is_null() {
            return String::new();
        }
        let s = std::ffi::CStr::from_ptr(p).to_string_lossy().into_owned();
        free(p as *mut std::ffi::c_void);
        s
    }
    #[cfg(not(target_os = "macos"))]
    String::new()
}

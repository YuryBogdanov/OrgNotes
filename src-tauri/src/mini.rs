// The mini window (ТЗ 31): its panel, its settings, its shortcut (tech sprint 5.2: out of lib.rs).

use super::*;

// ---- the mini window (ТЗ 31) --------------------------------------------------------------------------------------
// A small window with one note over every program, full-screen ones too. It is the Tauri window «mini» (index.html
// #mini) made a non-activating floating panel by the Swift package swift/MiniPanel: a click or typing in it neither
// activates the app nor leaves a full-screen program; away from the pointer and not typed in, it fades.

pub(crate) const MINI: &str = "mini";

#[cfg(target_os = "macos")]
pub(crate) mod mini_native {
    use swift_rs::{swift, Bool};
    swift!(pub fn mini_setup(window: *mut std::ffi::c_void, fullscreen: Bool, hide_from_capture: Bool));
    swift!(pub fn mini_options(opacity: f64, linger: f64, smooth: Bool, fullscreen: Bool, hide_from_capture: Bool));
    swift!(pub fn mini_show(focus: Bool));
    swift!(pub fn mini_hide());
    swift!(pub fn mini_is_key() -> Bool);
    swift!(pub fn mini_is_visible() -> Bool);
    swift!(pub fn mini_typed());
    swift!(pub fn mini_pin(on: Bool));
    swift!(pub fn mini_return_focus());
}

/// The settings of «Мини-окно» as last given by the page. Kept here: the panel is made later, on its first show.
#[derive(Clone, Copy)]
pub(crate) struct MiniOpts {
    opacity: f64,
    /// The pause after typing before the panel fades (s).
    linger: f64,
    smooth: bool,
    /// Over full-screen programs.
    fullscreen: bool,
    hide_from_capture: bool,
    /// Remember the panel's frame.
    remember: bool,
}
pub(crate) static MINI_OPTS: std::sync::Mutex<MiniOpts> =
    std::sync::Mutex::new(MiniOpts { opacity: 0.3, linger: 3.0, smooth: true, fullscreen: true, hide_from_capture: true, remember: true });

/// The saved frame, if the settings keep it and a screen still has its corner.
pub(crate) fn mini_saved_frame(app: &AppHandle) -> Option<MiniFrame> {
    if !lock(&MINI_OPTS).remember {
        return None;
    }
    let f = read_config(app).mini_frame?;
    let on_screen = app.available_monitors().ok()?.iter().any(|m| {
        let s = m.scale_factor();
        let pos = m.position().to_logical::<f64>(s);
        let size = m.size().to_logical::<f64>(s);
        f.x >= pos.x && f.y >= pos.y && f.x < pos.x + size.width && f.y < pos.y + size.height
    });
    on_screen.then_some(f)
}
/// The window moved or resized: its frame kept (when the settings say so).
pub(crate) fn mini_keep_frame(w: &tauri::Window) {
    if !lock(&MINI_OPTS).remember {
        return;
    }
    let (Ok(pos), Ok(size), Ok(s)) = (w.outer_position(), w.inner_size(), w.scale_factor()) else { return };
    let (p, z) = (pos.to_logical::<f64>(s), size.to_logical::<f64>(s));
    let app = w.app_handle();
    let mut cfg = read_config(app);
    cfg.mini_frame = Some(MiniFrame { x: p.x, y: p.y, w: z.width, h: z.height });
    write_config(app, &cfg);
}

pub(crate) fn make_mini_window(app: &AppHandle) {
    if app.get_webview_window(MINI).is_some() {
        return;
    }
    let Ok(w) = tauri::WebviewWindowBuilder::new(app, MINI, tauri::WebviewUrl::App("index.html#mini".into()))
        .title("Мини-окно")
        .inner_size(440.0, 330.0)
        .min_inner_size(280.0, 180.0)
        .decorations(false)
        .transparent(true)
        .resizable(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
    else {
        return;
    };
    #[cfg(target_os = "macos")]
    if let Ok(ns) = w.ns_window() {
        let ptr = ns as usize;
        let o = *lock(&MINI_OPTS);
        on_main(app, move || unsafe {
            mini_native::mini_setup(ptr as *mut std::ffi::c_void, o.fullscreen.into(), o.hide_from_capture.into());
            mini_native::mini_options(o.opacity, o.linger, o.smooth.into(), o.fullscreen.into(), o.hide_from_capture.into());
        });
    }
    if let Some(f) = mini_saved_frame(app) {
        let _ = w.set_size(tauri::LogicalSize::new(f.w.max(280.0), f.h.max(180.0)));
        let _ = w.set_position(tauri::LogicalPosition::new(f.x, f.y));
        return;
    }
    // by default in the bottom right corner of the screen the pointer is on, 24 pt from its edges
    let m = app
        .cursor_position()
        .ok()
        .and_then(|c| app.monitor_from_point(c.x, c.y).ok().flatten())
        .or_else(|| w.current_monitor().ok().flatten());
    if let Some(m) = m {
        let s = m.scale_factor();
        let size = m.size().to_logical::<f64>(s);
        let pos = m.position().to_logical::<f64>(s);
        let _ = w.set_position(tauri::LogicalPosition::new(pos.x + size.width - 440.0 - 24.0, pos.y + size.height - 330.0 - 24.0));
    }
}

/// ⌃⌥⌘M: hidden — shown, the keys in it; shown, the keys elsewhere — the keys in it; the keys in it — back to the
/// program before.
pub(crate) fn toggle_mini(app: &AppHandle) {
    make_mini_window(app);
    #[cfg(target_os = "macos")]
    {
        let state = on_main(app, || unsafe { (mini_native::mini_is_visible(), mini_native::mini_is_key()) });
        match state {
            Some((true, true)) => {
                on_main(app, || unsafe { mini_native::mini_return_focus() });
            }
            _ => {
                on_main(app, || unsafe { mini_native::mini_show(true) });
                let _ = app.emit_to(MINI, "mini-focus", ());
            }
        }
    }
}

#[tauri::command]
pub(crate) fn set_mini_shortcut(app: AppHandle, accelerator: String) -> Res<()> {
    set_global(&app, &MINI_KEY, accelerator, toggle_mini)
}
#[tauri::command]
pub(crate) fn mini_toggle(app: AppHandle) {
    toggle_mini(&app);
}
/// ⇧⌘M: the note in the mini window, shown with the keys in it.
#[tauri::command]
pub(crate) fn mini_open(app: AppHandle, note: Option<serde_json::Value>) {
    make_mini_window(&app);
    #[cfg(target_os = "macos")]
    on_main(&app, || unsafe { mini_native::mini_show(true) });
    if let Some(n) = note {
        let _ = app.emit_to(MINI, "mini-open", n);
    }
    let _ = app.emit_to(MINI, "mini-focus", ());
}
#[tauri::command]
pub(crate) fn mini_hide(app: AppHandle) {
    #[cfg(target_os = "macos")]
    on_main(&app, || unsafe { mini_native::mini_hide() });
}
/// A key typed in the mini window: it stays full for the pause set.
#[tauri::command]
pub(crate) fn mini_typed(app: AppHandle) {
    #[cfg(target_os = "macos")]
    on_main(&app, || unsafe { mini_native::mini_typed() });
}
/// The palette, the search or a menu of the mini window open: full until it closes.
#[tauri::command]
pub(crate) fn mini_pin(app: AppHandle, on: bool) {
    #[cfg(target_os = "macos")]
    on_main(&app, move || unsafe { mini_native::mini_pin(on.into()) });
}
/// ⎋ with nothing to close: the keys back to the program in front before.
#[tauri::command]
pub(crate) fn mini_return_focus(app: AppHandle) {
    #[cfg(target_os = "macos")]
    on_main(&app, || unsafe { mini_native::mini_return_focus() });
}
/// The settings of «Мини-окно» (ТЗ 31 §6), applied at once (and kept for the panel made later).
#[tauri::command]
pub(crate) fn mini_options(app: AppHandle, opacity: f64, linger: f64, smooth: bool, fullscreen: bool, hide_from_capture: bool, remember: bool) {
    *lock(&MINI_OPTS) = MiniOpts { opacity, linger, smooth, fullscreen, hide_from_capture, remember };
    #[cfg(target_os = "macos")]
    on_main(&app, move || unsafe { mini_native::mini_options(opacity, linger, smooth.into(), fullscreen.into(), hide_from_capture.into()) });
}

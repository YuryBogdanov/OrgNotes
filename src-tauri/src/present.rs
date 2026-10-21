// A plugin's show on the whole screen (ТЗ 59 §9.2, API 1.19 `ui.present`): the page opens a window per screen with
// `window.open('about:blank#present-…', …, 'left=…,top=…,width=…,height=…')`; the main webview's new-window handler
// makes it a window without a frame on that screen, sharing the page's webview configuration — the page draws into
// its document as into its own (same origin). The main window hides for the show; the Mac neither sleeps nor dims
// the screen meanwhile (`caffeinate`). A PDF of a plugin's pages (§9.3, `ui.exportPdf`): WebKit prints the page
// (its print style shows only the pages) into the file chosen in the save panel — vector, its text selectable.

use super::*;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{WebviewUrl, WebviewWindowBuilder, Wry};

pub(crate) const PREFIX: &str = "present-";
static N: AtomicU32 = AtomicU32::new(0);
static AWAKE: Mutex<Option<Child>> = Mutex::new(None);

#[derive(Serialize)]
pub(crate) struct Screen {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    /// the screen the main window is on (the presenter's)
    main: bool,
}

/// The screens, in logical points, the one with the main window marked.
#[tauri::command]
pub(crate) fn present_screens(app: AppHandle) -> Vec<Screen> {
    let Some(w) = app.get_webview_window("main") else { return Vec::new() };
    let here = w.current_monitor().ok().flatten().map(|m| *m.position());
    w.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let s = m.scale_factor();
            let (p, z) = (m.position().to_logical::<f64>(s), m.size().to_logical::<f64>(s));
            Screen { x: p.x, y: p.y, w: z.width, h: z.height, main: Some(*m.position()) == here }
        })
        .collect()
}

/// The main webview's `window.open`: only the show's own blank windows, on the screen the features name.
pub(crate) fn new_window(app: AppHandle) -> impl Fn(tauri::Url, NewWindowFeatures) -> NewWindowResponse<Wry> + Send + 'static {
    move |url, features| {
        if url.as_str() != "about:blank" && !url.as_str().starts_with("about:blank#present") {
            return NewWindowResponse::Deny;
        }
        let label = format!("{PREFIX}{}", N.fetch_add(1, Ordering::Relaxed));
        let built = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External("about:blank".parse().unwrap()))
            .window_features(features)
            .title("Показ")
            .decorations(false)
            .resizable(false)
            .skip_taskbar(true)
            .build();
        match built {
            Ok(window) => {
                let w = window.clone();
                let a = app.clone();
                // on its screen first (the features' place), then — once WebKit has it and it is shown — over its
                // menu bar and Dock, no Space of its own (fix-59-1 §1: set on a window not shown yet, it did nothing)
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(250));
                    let _ = a.run_on_main_thread(move || {
                        let _ = w.show();
                        let _ = w.set_simple_fullscreen(true);
                        let _ = w.set_focus();
                    });
                });
                NewWindowResponse::Create { window }
            }
            Err(_) => NewWindowResponse::Deny,
        }
    }
}

/// `window.open` after an `await` too (fix-59-1 §1): WebKit lets a page open windows only right in a click unless
/// its preferences say otherwise; the new-window handler lets only the show's blank windows through.
pub(crate) fn allow_windows(w: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    let _ = w.with_webview(|v| unsafe {
        use objc2::{msg_send, runtime::AnyObject};
        let view = v.inner() as *mut AnyObject;
        let conf: *mut AnyObject = msg_send![view, configuration];
        let prefs: *mut AnyObject = msg_send![conf, preferences];
        let _: () = msg_send![prefs, setJavaScriptCanOpenWindowsAutomatically: true];
    });
    #[cfg(not(target_os = "macos"))]
    let _ = w;
}

/// The show begins: the main window hides, the Mac stays awake.
#[tauri::command]
pub(crate) fn present_begin(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    let mut awake = lock(&AWAKE);
    if awake.is_none() {
        // -d the display, -i the system; -w: ends with the app whatever happens
        *awake = Command::new("/usr/bin/caffeinate").args(["-d", "-i", "-w", &std::process::id().to_string()]).spawn().ok();
    }
}

/// The show ends: its windows close, the main window comes back, the Mac may sleep again.
#[tauri::command]
pub(crate) fn present_end(app: AppHandle) {
    for (label, w) in app.webview_windows() {
        if label.starts_with(PREFIX) {
            let _ = w.set_simple_fullscreen(false);
            let _ = w.destroy();
        }
    }
    if let Some(mut c) = lock(&AWAKE).take() {
        let _ = c.kill();
        let _ = c.wait();
    }
    show_main(&app);
}

// ---- PDF -----------------------------------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod native {
    extern "C" {
        pub fn pdf_print(webview: *mut std::ffi::c_void, window: *mut std::ffi::c_void, path: *const std::os::raw::c_char, w: f64, h: f64) -> u32;
        pub fn pdf_state(job: u32) -> i32;
    }
}

static PDF_JOB: Mutex<Option<(u32, String)>> = Mutex::new(None);

/// Print the main page (its print style shows only the pages) into `path` chosen in the save panel, pages of `w × h`
/// pt. Returns at once; `pdf_done` tells when the file is written.
#[tauri::command]
pub(crate) fn pdf_print(app: AppHandle, path: String, w: f64, h: f64) -> Res<()> {
    crate::exchange::take_picked(&path)?;
    let Some(win) = app.get_webview_window("main") else { return Err("no window".into()) };
    #[cfg(target_os = "macos")]
    {
        let ns = win.ns_window().map_err(|e| Error::from(e.to_string().as_str()))? as usize;
        let p = path.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        win.with_webview(move |v| {
            let c = std::ffi::CString::new(p.replace('\0', "")).unwrap_or_default();
            let job = unsafe { native::pdf_print(v.inner() as *mut _, ns as *mut _, c.as_ptr(), w, h) };
            let _ = tx.send(job);
        })
        .map_err(|e| Error::from(e.to_string().as_str()))?;
        let job = rx.recv_timeout(std::time::Duration::from_secs(10)).map_err(|_| Error::from("no answer"))?;
        *lock(&PDF_JOB) = Some((job, path));
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (win, w, h);
        Err("not supported".into())
    }
}

/// The print's state: null — still printing; true — written; false — failed or cancelled.
#[tauri::command]
pub(crate) fn pdf_done() -> Option<bool> {
    let job = lock(&PDF_JOB).as_ref().map(|j| j.0)?;
    #[cfg(target_os = "macos")]
    let s = unsafe { native::pdf_state(job) };
    #[cfg(not(target_os = "macos"))]
    let s = { let _ = job; -1 };
    match s {
        0 => None,
        1 => {
            *lock(&PDF_JOB) = None;
            Some(true)
        }
        _ => {
            *lock(&PDF_JOB) = None;
            Some(false)
        }
    }
}

use objc2::{class, msg_send, rc::Retained, runtime::AnyObject};
use objc2_foundation::NSRect;
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone, Copy, PartialEq)]
pub struct State {
    pub fullscreen: bool,
    pub lights: bool,
    pub menu: f64,
}

const FULL_SCREEN: usize = 1 << 14; // NSWindowStyleMaskFullScreen
const WINDOWED: State = State { fullscreen: false, lights: true, menu: 0.0 };

/// Views of the full-screen bar we hid, with whether they were hidden before; put back when full screen ends.
/// Only touched on the main thread.
struct Hidden(Vec<(Retained<AnyObject>, bool)>);
unsafe impl Send for Hidden {}
static HIDDEN: Mutex<Hidden> = Mutex::new(Hidden(Vec::new()));

/// Hide everything the bar draws — its backgrounds (AppKit shows them again on every reveal, so this runs on every
/// check), the buttons — except the views that hold the buttons: hiding those, or the bar's content view, stops
/// macOS from showing the menu bar and from leaving full screen.
unsafe fn quiet(bar: *mut AnyObject, btn: *mut AnyObject) {
    let mut keep: Vec<*mut AnyObject> = Vec::new(); // the chain from the content view down to the buttons
    let mut v: *mut AnyObject = msg_send![btn, superview];
    while !v.is_null() {
        keep.push(v);
        v = msg_send![v, superview];
    }
    let content: *mut AnyObject = msg_send![bar, contentView];
    if content.is_null() {
        return;
    }
    let mut hidden = super::lock(&HIDDEN);
    let mut stack = vec![content];
    while let Some(v) = stack.pop() {
        if keep.contains(&v) {
            let subs: *mut AnyObject = msg_send![v, subviews];
            let n: usize = msg_send![subs, count];
            for i in 0..n {
                stack.push(msg_send![subs, objectAtIndex: i]);
            }
            continue;
        }
        let was: bool = msg_send![v, isHidden];
        if !hidden.0.iter().any(|(x, _)| Retained::as_ptr(x) as *mut AnyObject == v) {
            if let Some(r) = Retained::retain(v) {
                hidden.0.push((r, was));
            }
        }
        if !was {
            let _: () = msg_send![v, setHidden: true];
        }
    }
    let clear: *mut AnyObject = msg_send![class!(NSColor), clearColor];
    let _: () = msg_send![bar, setBackgroundColor: clear];
    let _: () = msg_send![bar, setIgnoresMouseEvents: true]; // clicks go to our toolbar under it
}

/// Back from full screen: the buttons and the title bar's views go home to the window, as they were.
unsafe fn restore() {
    let mut hidden = super::lock(&HIDDEN);
    for (v, was) in hidden.0.drain(..) {
        let _: () = msg_send![&*v, setHidden: was];
    }
}

/// Must run on the main thread.
unsafe fn read(ns_window: *mut std::ffi::c_void) -> Option<State> {
    if ns_window.is_null() {
        return None;
    }
    let w = &*(ns_window as *const AnyObject);
    let mask: usize = msg_send![w, styleMask];
    let btn: *mut AnyObject = msg_send![w, standardWindowButton: 0usize];
    if mask & FULL_SCREEN == 0 {
        restore();
        return Some(WINDOWED);
    }
    let none = State { fullscreen: true, lights: false, menu: 0.0 };
    if btn.is_null() {
        return Some(none);
    }
    // in full screen the buttons live in a title bar window of their own, under the menu bar
    let bar: *mut AnyObject = msg_send![btn, window];
    if bar.is_null() || bar == ns_window as *mut AnyObject {
        return Some(none);
    }
    quiet(bar, btn);
    // the bar stays in place; showing and hiding it is its opacity
    let visible: bool = msg_send![bar, isVisible];
    let alpha: f64 = msg_send![bar, alphaValue];
    if !(visible && alpha > 0.5) {
        return Some(none);
    }
    // how much of the window the menu bar covers: nothing on a screen with a notch (the window starts below the
    // menu bar there), its height on a screen without one
    let screen: *mut AnyObject = msg_send![w, screen];
    let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
    let main_menu: *mut AnyObject = msg_send![app, mainMenu];
    let menu = if screen.is_null() || main_menu.is_null() {
        0.0
    } else {
        let height: f64 = msg_send![main_menu, menuBarHeight];
        let f: NSRect = msg_send![w, frame];
        let s: NSRect = msg_send![screen, frame];
        let menu_bottom = s.origin.y + s.size.height - height;
        (f.origin.y + f.size.height - menu_bottom).max(0.0).round()
    };
    Some(State { fullscreen: true, lights: true, menu })
}

pub fn watch(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut last: Option<State> = None;
        loop {
            std::thread::sleep(Duration::from_millis(80));
            let Some(win) = app.get_webview_window("main") else { continue };
            let (tx, rx) = std::sync::mpsc::channel();
            let w2 = win.clone();
            if app
                .run_on_main_thread(move || {
                    let _ = tx.send(w2.ns_window().ok().and_then(|p| unsafe { read(p) }));
                })
                .is_err()
            {
                return;
            }
            let Ok(Some(st)) = rx.recv() else { continue };
            if last != Some(st) {
                last = Some(st);
                let _ = win.emit("titlebar", st);
            }
        }
    });
}

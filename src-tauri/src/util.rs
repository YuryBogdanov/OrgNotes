// Small helpers of the commands (tech sprint 5.2: out of lib.rs): their error, a lock that survives a panic, a write
// that is whole or nothing, a call on the main thread.

use super::*;

/// A command's error. The page gets it as a string: a word it checks («conflict», «exists») or a message in words
/// (an I/O error's own text). Any error type converts into it by `?` (tech sprint 5.2).
#[derive(Debug, PartialEq)]
pub(crate) enum Error {
    /// The file on disk is not the text the edit was made over: another program changed it (`save_org_file`).
    Conflict,
    /// A file or a folder of that name is there already.
    Exists,
    /// Anything else, in words.
    Msg(String),
}
pub(crate) type Res<T> = Result<T, Error>;

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Conflict => f.write_str("conflict"),
            Error::Exists => f.write_str("exists"),
            Error::Msg(m) => f.write_str(m),
        }
    }
}
impl Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
// the errors the commands meet, by `?`
macro_rules! from_error {
    ($($t:ty),*) => {$(
        impl From<$t> for Error {
            fn from(e: $t) -> Self {
                Error::Msg(e.to_string())
            }
        }
    )*};
}
from_error!(std::io::Error, serde_json::Error, tauri::Error, trash::Error, tauri_plugin_global_shortcut::Error);
// plugin_sources.rs keeps its errors as strings: one of these goes into them as its words
impl From<Error> for String {
    fn from(e: Error) -> Self {
        e.to_string()
    }
}
impl From<String> for Error {
    fn from(m: String) -> Self {
        Error::Msg(m)
    }
}
impl From<&str> for Error {
    fn from(m: &str) -> Self {
        Error::Msg(m.to_string())
    }
}

/// A lock that a panic elsewhere (a poisoned mutex) does not take down with it: what it guards is plain data, still
/// good to read (tech sprint 5.1).
pub(crate) fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Write a file whole or not at all: `data` into `tmp` beside the target, synced to the disk, then renamed over it.
/// A crash or a full disk leaves the old file (tech sprint 5.1: one copy of what five commands did).
pub(crate) fn atomic_write(tmp: &Path, target: &Path, data: &[u8]) -> Res<()> {
    use std::io::Write;
    let write = || -> std::io::Result<()> {
        let mut f = fs::File::create(tmp)?;
        f.write_all(data)?;
        f.sync_all()
    };
    if let Err(e) = write() {
        let _ = fs::remove_file(tmp);
        return Err(e.into());
    }
    fs::rename(tmp, target).map_err(Error::from)
}

/// On the main thread, as AppKit wants it: at once when this is it (a sync command, a shortcut's handler), else
/// sent there and waited for.
pub(crate) fn on_main<R: Send + 'static>(app: &AppHandle, f: impl FnOnce() -> R + Send + 'static) -> Option<R> {
    #[cfg(target_os = "macos")]
    if objc2::MainThreadMarker::new().is_some() {
        return Some(f());
    }
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(f());
    })
    .ok()?;
    rx.recv().ok()
}

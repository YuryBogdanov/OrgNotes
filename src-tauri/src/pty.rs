// Processes in a pseudo-terminal for the plugins with the right «process» (ТЗ 55 §1, API 1.16): `pty_spawn` starts the
// user's shell as a login shell (the PATH of Terminal.app — an app from the Finder has none of its own), alone or
// running a command; its output goes to the page as `pty-data` (UTF-8, the bytes of a character cut by a read kept for
// the next one), its end as `pty-exit` (the code). `pty_write`, `pty_resize`, `pty_kill`; a plugin's processes end
// when it is turned off (`pty_kill_plugin`), all of them when the app quits.

use crate::{has_permission, lock, plugin_manifest, AppState, Res};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{AppHandle, Emitter, Manager, State};

struct Session {
    plugin: String,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    pid: Option<u32>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
}

#[derive(Default)]
pub(crate) struct Ptys {
    sessions: Mutex<HashMap<String, Session>>,
    next: AtomicU64,
}

#[derive(Clone, Serialize)]
struct Data {
    id: String,
    data: String,
}
#[derive(Clone, Serialize)]
struct Exit {
    id: String,
    code: Option<i32>,
}

/// The text of the bytes read, and the bytes of a character not finished yet (kept for the next read).
pub(crate) fn utf8_chunk(carry: &mut Vec<u8>, bytes: &[u8]) -> String {
    carry.extend_from_slice(bytes);
    let mut out = String::new();
    let mut rest: &[u8] = carry;
    loop {
        match std::str::from_utf8(rest) {
            Ok(s) => {
                out.push_str(s);
                rest = &[];
                break;
            }
            Err(e) => {
                let (good, bad) = rest.split_at(e.valid_up_to());
                out.push_str(std::str::from_utf8(good).unwrap_or_default());
                match e.error_len() {
                    // a character cut by the read: wait for its other bytes
                    None => {
                        rest = bad;
                        break;
                    }
                    // not UTF-8 at all: shown as the replacement character
                    Some(n) => {
                        out.push('\u{FFFD}');
                        rest = &bad[n..];
                    }
                }
            }
        }
    }
    *carry = rest.to_vec();
    out
}

/// «ru_RU.UTF-8» from the system's locale when the app was not given a LANG (from the Finder it is not).
fn system_lang() -> String {
    if let Ok(l) = std::env::var("LANG") {
        if !l.is_empty() {
            return l;
        }
    }
    std::process::Command::new("/usr/bin/defaults")
        .args(["read", "-g", "AppleLocale"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().split('@').next().unwrap_or("").to_string())
        .filter(|s| !s.is_empty())
        .map(|s| format!("{s}.UTF-8"))
        .unwrap_or_else(|| "en_US.UTF-8".into())
}

/// The shell: the plugin's choice, else $SHELL, else zsh.
fn shell_of(choice: Option<String>) -> String {
    choice.filter(|s| !s.trim().is_empty()).or_else(|| std::env::var("SHELL").ok()).filter(|s| !s.is_empty()).unwrap_or_else(|| "/bin/zsh".into())
}

/// A process in a pseudo-terminal for a plugin with the right «process»; its id. No `command` — the shell itself.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) fn pty_spawn(
    app: AppHandle,
    state: State<'_, AppState>,
    ptys: State<'_, Ptys>,
    plugin: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    shell: Option<String>,
    cols: u16,
    rows: u16,
) -> Res<String> {
    let m = plugin_manifest(&app, &plugin)?;
    if !has_permission(&m, "process") {
        return Err(format!("Плагин «{plugin}»: нужно право process").into());
    }
    let folder = lock(&state.dir).clone();
    let pair = native_pty_system()
        .openpty(PtySize { rows: rows.max(2), cols: cols.max(2), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let sh = shell_of(shell);
    let mut cmd = CommandBuilder::new(&sh);
    cmd.arg("-l");
    if let Some(c) = command.filter(|c| !c.trim().is_empty()) {
        // through the login shell, so the command is found in its PATH; the arguments as they are, not re-parsed
        cmd.arg("-c");
        cmd.arg("exec \"$0\" \"$@\"");
        cmd.arg(c);
        for a in args.unwrap_or_default() {
            cmd.arg(a);
        }
    }
    let dir = cwd.map(std::path::PathBuf::from).or_else(|| folder.clone()).or_else(|| std::env::var("HOME").ok().map(Into::into));
    if let Some(d) = &dir {
        cmd.cwd(d);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", system_lang());
    cmd.env("PANOPTICON", "1");
    if let Some(f) = &folder {
        cmd.env("PANOPTICON_FOLDER", f);
    }
    for (k, v) in env.unwrap_or_default() {
        cmd.env(k, v);
    }
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let id = format!("pty{}", ptys.next.fetch_add(1, Ordering::Relaxed) + 1);
    let pid = child.process_id();
    let child = Arc::new(Mutex::new(child));
    lock(&ptys.sessions).insert(id.clone(), Session { plugin, master: pair.master, writer, pid, child: child.clone() });

    let (app2, id2) = (app.clone(), id.clone());
    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        let mut carry = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = utf8_chunk(&mut carry, &buf[..n]);
                    if !data.is_empty() {
                        let _ = app2.emit("pty-data", Data { id: id2.clone(), data });
                    }
                }
            }
        }
        let code = lock(&child).wait().ok().map(|s| s.exit_code() as i32);
        if let Some(p) = app2.try_state::<Ptys>() {
            lock(&p.sessions).remove(&id2);
        }
        let _ = app2.emit("pty-exit", Exit { id: id2, code });
    });
    Ok(id)
}

#[tauri::command]
pub(crate) fn pty_write(ptys: State<'_, Ptys>, id: String, data: String) -> Res<()> {
    let mut s = lock(&ptys.sessions);
    let p = s.get_mut(&id).ok_or("нет такого процесса")?;
    p.writer.write_all(data.as_bytes())?;
    p.writer.flush()?;
    Ok(())
}

#[tauri::command]
pub(crate) fn pty_resize(ptys: State<'_, Ptys>, id: String, cols: u16, rows: u16) -> Res<()> {
    let s = lock(&ptys.sessions);
    let p = s.get(&id).ok_or("нет такого процесса")?;
    p.master.resize(PtySize { rows: rows.max(2), cols: cols.max(2), pixel_width: 0, pixel_height: 0 }).map_err(|e| e.to_string())?;
    Ok(())
}

fn signal_of(name: Option<&str>) -> i32 {
    match name {
        Some("KILL") => libc::SIGKILL,
        Some("INT") => libc::SIGINT,
        _ => libc::SIGTERM,
    }
}
fn kill_session(p: &Session, sig: i32) {
    match p.pid {
        // the whole group: the shell and what it runs
        Some(pid) => unsafe {
            libc::kill(-(pid as i32), sig);
            libc::kill(pid as i32, sig);
        },
        None => {
            let _ = lock(&p.child).kill();
        }
    }
}

#[tauri::command]
pub(crate) fn pty_kill(ptys: State<'_, Ptys>, id: String, signal: Option<String>) -> Res<()> {
    let s = lock(&ptys.sessions);
    if let Some(p) = s.get(&id) {
        kill_session(p, signal_of(signal.as_deref()));
    }
    Ok(())
}

/// A plugin turned off or failed: its processes end.
#[tauri::command]
pub(crate) fn pty_kill_plugin(ptys: State<'_, Ptys>, plugin: String) {
    for p in lock(&ptys.sessions).values().filter(|p| p.plugin == plugin) {
        kill_session(p, libc::SIGHUP);
    }
}

/// How many processes are alive (asked before quitting).
#[tauri::command]
pub(crate) fn pty_count(ptys: State<'_, Ptys>) -> usize {
    lock(&ptys.sessions).len()
}

/// The app quits: every process ends.
pub(crate) fn kill_all(app: &AppHandle) {
    if let Some(p) = app.try_state::<Ptys>() {
        for s in lock(&p.sessions).values() {
            kill_session(s, libc::SIGHUP);
        }
    }
}

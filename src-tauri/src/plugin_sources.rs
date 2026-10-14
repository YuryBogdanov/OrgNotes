// Plugins from the catalog and from git (ТЗ 37): the catalog's list (a public GitHub repository of entries), a
// plugin's release downloaded into its folder, a git repository cloned for its built files, `.source.json` beside
// the plugin (where it came from, for its updates), a plugin removed to the Trash.
//
// The network is the system's curl (as `net.fetch`), only to GitHub's hosts; git is the system's, with the keys and
// the helpers of this Mac, never asking (no terminal): an answer, or an error in words, within a minute.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};

use crate::{host_of, plugin_dir_ok, plugins_dir, BUILTIN_MANIFESTS};

/// The catalog: `plugins.json` and `stats.json` in its default branch.
pub const CATALOG_REPO: &str = "Panopticon-Org-Notes/plugins";
const GH_HOSTS: &[&str] = &["github.com", "api.github.com", "raw.githubusercontent.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"];
const FILE_LIMIT: u64 = 10 * 1024 * 1024;
const UA: &str = "User-Agent: Panopticon";

// ---- GitHub over curl ---------------------------------------------------------------------------------------------

/// «owner/name» of a GitHub repository.
fn repo_ok(r: &str) -> bool {
    let mut parts = r.split('/');
    let ok = |p: Option<&str>| p.is_some_and(|p| !p.is_empty() && !p.starts_with('.') && p.chars().all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c)));
    ok(parts.next()) && ok(parts.next()) && parts.next().is_none()
}
fn gh_host_ok(url: &str) -> Result<(), String> {
    let host = host_of(url).ok_or("адрес — https")?;
    if url.starts_with("https://") && GH_HOSTS.contains(&host.as_str()) {
        Ok(())
    } else {
        Err(format!("{host}: не GitHub"))
    }
}
/// A GET to GitHub: its status and body (10 MB at most).
fn gh_get(url: &str, accept: &str) -> Result<(u16, Vec<u8>), String> {
    gh_host_ok(url)?;
    let out = Command::new("/usr/bin/curl")
        .args(["-sS", "-L", "--max-redirs", "5", "--max-time", "30", "--max-filesize", &FILE_LIMIT.to_string(), "--proto", "=https", "-H", UA, "-H"])
        .arg(format!("Accept: {accept}"))
        .args(["-o", "-", "-w", "%{http_code}", "--", url])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(net_error(&String::from_utf8_lossy(&out.stderr)));
    }
    let body = out.stdout;
    if body.len() < 3 {
        return Err("пустой ответ".into());
    }
    let (data, code) = body.split_at(body.len() - 3);
    let code = std::str::from_utf8(code).ok().and_then(|c| c.parse().ok()).unwrap_or(0);
    Ok((code, data.to_vec()))
}
fn net_error(stderr: &str) -> String {
    let s = stderr.trim();
    if s.contains("Could not resolve host") || s.contains("Failed to connect") || s.contains("Couldn't connect") {
        "нет связи с GitHub".into()
    } else if s.contains("timed out") {
        "GitHub не ответил за 30 секунд".into()
    } else if s.contains("Maximum file size") {
        "файл больше 10 МБ".into()
    } else {
        s.trim_start_matches("curl: ").to_string()
    }
}
fn gh_text(url: &str) -> Result<String, String> {
    match gh_get(url, "*/*")? {
        (200, b) => String::from_utf8(b).map_err(|_| "ответ не текст".into()),
        (404, _) => Err("не найдено".into()),
        (403, _) | (429, _) => Err("GitHub ограничил число запросов — попробуйте через несколько минут".into()),
        (c, _) => Err(format!("GitHub ответил {c}")),
    }
}
fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct Catalog {
    plugins: String,
    stats: Option<String>,
    /// When it was read from GitHub (ms).
    fetched: u64,
    /// Read from the cache: why GitHub did not answer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    offline: Option<String>,
    repo: String,
}

/// The catalog's list and stats; the last ones kept (`plugins/.catalog.json`) when there is no network.
#[tauri::command]
pub async fn catalog_fetch(app: AppHandle) -> Result<Catalog, String> {
    let cache = plugins_dir(&app)?.join(".catalog.json");
    tauri::async_runtime::spawn_blocking(move || {
        let raw = |f: &str| format!("https://raw.githubusercontent.com/{CATALOG_REPO}/HEAD/{f}");
        let got = gh_text(&raw("plugins.json")).and_then(|p| {
            serde_json::from_str::<Vec<serde_json::Value>>(&p).map_err(|e| format!("plugins.json: {e}"))?;
            Ok(p)
        });
        match got {
            Ok(plugins) => {
                let stats = gh_text(&raw("stats.json")).ok();
                let c = Catalog { plugins, stats, fetched: now_ms(), offline: None, repo: CATALOG_REPO.into() };
                let _ = fs::write(&cache, serde_json::to_string(&c).unwrap_or_default());
                Ok(c)
            }
            Err(e) => {
                let old: Catalog = fs::read_to_string(&cache).ok().and_then(|t| serde_json::from_str(&t).ok()).ok_or(e.clone())?;
                Ok(Catalog { offline: Some(e), ..old })
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A file of a plugin's repository in its default branch: `manifest.json` (its last version, rights) or `README.md`.
#[tauri::command]
pub async fn catalog_raw(repo: String, file: String) -> Result<String, String> {
    if !repo_ok(&repo) || !["manifest.json", "README.md"].contains(&file.as_str()) {
        return Err("bad catalog file".into());
    }
    tauri::async_runtime::spawn_blocking(move || gh_text(&format!("https://raw.githubusercontent.com/{repo}/HEAD/{file}"))).await.map_err(|e| e.to_string())?
}

/// The releases of a plugin (the JSON of GitHub's API): «Версии» of its page.
#[tauri::command]
pub async fn catalog_releases(repo: String) -> Result<String, String> {
    if !repo_ok(&repo) {
        return Err("bad repo".into());
    }
    tauri::async_runtime::spawn_blocking(move || match gh_get(&format!("https://api.github.com/repos/{repo}/releases?per_page=30"), "application/vnd.github+json")? {
        (200, b) => String::from_utf8(b).map_err(|e| e.to_string()),
        (403, _) | (429, _) => Err("GitHub ограничил число запросов — попробуйте через несколько минут".into()),
        (c, _) => Err(format!("GitHub ответил {c}")),
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---- installing ---------------------------------------------------------------------------------------------------

fn cancelled() -> &'static Mutex<HashSet<String>> {
    static C: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashSet::new()))
}
fn take_cancel(id: &str) -> bool {
    cancelled().lock().map(|mut s| s.remove(id)).unwrap_or(false)
}
/// «Отменить» under a download: it stops, its folder goes.
#[tauri::command]
pub fn plugin_cancel(id: String) {
    if let Ok(mut s) = cancelled().lock() {
        s.insert(id);
    }
}

#[derive(serde::Serialize, Clone)]
struct Progress {
    id: String,
    done: u64,
    total: u64,
}

fn builtin(id: &str) -> bool {
    BUILTIN_MANIFESTS.iter().any(|m| serde_json::from_str::<serde_json::Value>(m).is_ok_and(|v| v["id"] == id))
}
/// A relative path of a plugin's file: no `..`, nothing absolute.
fn rel_ok(p: &str) -> bool {
    let ok_part = |s: &str| !s.is_empty() && s != "." && s != ".." && s.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c));
    !p.starts_with('/') && p.split('/').all(ok_part)
}
/// The files a plugin is: its manifest, its code, its styles, its themes.
fn files_of(m: &serde_json::Value) -> Vec<String> {
    let mut out = vec!["manifest.json".to_string(), m["main"].as_str().unwrap_or("main.js").to_string()];
    if let Some(s) = m["styles"].as_str() {
        out.push(s.into());
    }
    for t in m["contributes"]["themes"].as_array().into_iter().flatten().filter_map(|t| t.as_str()) {
        out.push(t.into());
    }
    out.retain(|f| rel_ok(f));
    out.dedup();
    out
}
/// The manifest of a folder about to be installed: readable, its id the one expected (when given), not a built-in.
fn check_manifest(dir: &Path, id: Option<&str>) -> Result<serde_json::Value, String> {
    let text = fs::read_to_string(dir.join("manifest.json")).map_err(|_| "нет manifest.json")?;
    let m: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("manifest.json: {e}"))?;
    let mid = m["id"].as_str().unwrap_or("");
    if !plugin_dir_ok(mid) {
        return Err(format!("id плагина «{mid}»: строчные латинские буквы, цифры и «-»"));
    }
    if id.is_some_and(|id| id != mid) {
        return Err(format!("в релизе плагин «{mid}», а не «{}»", id.unwrap_or("")));
    }
    if builtin(mid) {
        return Err(format!("«{mid}» — встроенный плагин"));
    }
    Ok(m)
}
/// The new folder in the plugin's place: the old one to the Trash (its data is not in it), `.source.json` beside.
fn put_in_place(app: &AppHandle, tmp: &Path, id: &str, source: serde_json::Value) -> Result<String, String> {
    fs::write(tmp.join(".source.json"), serde_json::to_string_pretty(&source).unwrap_or_default()).map_err(|e| e.to_string())?;
    let target = plugins_dir(app)?.join(id);
    if target.exists() {
        trash::delete(&target).or_else(|_| fs::remove_dir_all(&target)).map_err(|e| e.to_string())?;
    }
    fs::rename(tmp, &target).map_err(|e| e.to_string())?;
    fs::read_to_string(target.join("manifest.json")).map_err(|e| e.to_string())
}
/// A fresh temporary folder in the folder of plugins (the same disk: moved in place at once).
fn temp_dir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let d = plugins_dir(app)?.join(format!(".tmp-{name}"));
    if d.exists() {
        fs::remove_dir_all(&d).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// A file downloaded by curl while its size is told (`plugin-progress`); «Отменить» stops it.
fn download(app: &AppHandle, id: &str, url: &str, to: &Path, base: u64, total: u64) -> Result<u64, String> {
    gh_host_ok(url)?;
    if let Some(p) = to.parent() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    let mut child = Command::new("/usr/bin/curl")
        .args(["-sS", "-L", "--fail", "--max-redirs", "5", "--max-time", "120", "--max-filesize", &FILE_LIMIT.to_string(), "--proto", "=https", "-H", UA, "-o"])
        .arg(to)
        .args(["--", url])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let size = || fs::metadata(to).map(|m| m.len()).unwrap_or(0);
    loop {
        if take_cancel(id) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("отменено".into());
        }
        if let Some(st) = child.try_wait().map_err(|e| e.to_string())? {
            if !st.success() {
                let mut err = String::new();
                if let Some(mut e) = child.stderr.take() {
                    use std::io::Read;
                    let _ = e.read_to_string(&mut err);
                }
                return Err(net_error(&err));
            }
            let _ = app.emit("plugin-progress", Progress { id: id.into(), done: base + size(), total });
            return Ok(size());
        }
        let _ = app.emit("plugin-progress", Progress { id: id.into(), done: base + size(), total });
        std::thread::sleep(Duration::from_millis(120));
    }
}

/// From the catalog: the release `version` (tag «1.2.0» or «v1.2.0») of `repo` into `plugins/<id>`.
#[tauri::command]
pub async fn plugin_install_release(app: AppHandle, id: String, repo: String, version: String) -> Result<String, String> {
    if !plugin_dir_ok(&id) || !repo_ok(&repo) || version.is_empty() || !version.chars().all(|c| c.is_ascii_alphanumeric() || ".-+".contains(c)) {
        return Err("bad plugin".into());
    }
    if builtin(&id) {
        return Err(format!("«{id}» — встроенный плагин"));
    }
    take_cancel(&id);
    tauri::async_runtime::spawn_blocking(move || {
        let release = |tag: &str| gh_get(&format!("https://api.github.com/repos/{repo}/releases/tags/{tag}"), "application/vnd.github+json");
        let (code, body) = match release(&version)? {
            (404, _) => release(&format!("v{version}"))?,
            r => r,
        };
        match code {
            200 => {}
            404 => return Err(format!("нет релиза {version} в {repo}")),
            403 | 429 => return Err("GitHub ограничил число запросов — попробуйте через несколько минут".into()),
            c => return Err(format!("GitHub ответил {c}")),
        }
        let rel: serde_json::Value = serde_json::from_slice(&body).map_err(|e| e.to_string())?;
        let assets: Vec<(String, u64, String)> = rel["assets"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|a| Some((a["name"].as_str()?.to_string(), a["size"].as_u64().unwrap_or(0), a["browser_download_url"].as_str()?.to_string())))
            .collect();
        let find = |n: &str| assets.iter().find(|a| a.0 == n);
        let (Some(_), Some(_)) = (find("manifest.json"), find("main.js")) else {
            return Err(format!("в релизе {version} нет manifest.json и main.js"));
        };
        let tmp = temp_dir(&app, &id)?;
        let res = (|| {
            // the manifest first: which other files it needs (styles, themes) — the release's flat names of them
            let m_asset = find("manifest.json").unwrap();
            download(&app, &id, &m_asset.2, &tmp.join("manifest.json"), 0, m_asset.1)?;
            let m = check_manifest(&tmp, Some(&id))?;
            if m["version"].as_str().unwrap_or("") != version.trim_start_matches('v') {
                return Err(format!("версия манифеста {} — не {version}", m["version"]));
            }
            let want: Vec<(String, &(String, u64, String))> = files_of(&m)
                .into_iter()
                .filter(|f| f != "manifest.json")
                .filter_map(|f| find(f.rsplit('/').next().unwrap_or(&f)).map(|a| (f, a)))
                .collect();
            let total: u64 = m_asset.1 + want.iter().map(|w| w.1 .1).sum::<u64>();
            let mut done = m_asset.1;
            for (path, a) in &want {
                done += download(&app, &id, &a.2, &tmp.join(path), done, total)?;
            }
            if !tmp.join(m["main"].as_str().unwrap_or("main.js")).exists() {
                return Err("в релизе нет кода плагина".into());
            }
            put_in_place(&app, &tmp, &id, serde_json::json!({ "kind": "catalog", "repo": repo, "version": m["version"], "installed": now_ms() }))
        })();
        if res.is_err() {
            let _ = fs::remove_dir_all(&tmp);
        }
        res
    })
    .await
    .map_err(|e| e.to_string())?
}

/// «Удалить…»: the plugin's folder to the Trash.
#[tauri::command]
pub fn plugin_remove(app: AppHandle, id: String) -> Result<(), String> {
    if !plugin_dir_ok(&id) {
        return Err("bad plugin".into());
    }
    let dir = plugins_dir(&app)?.join(&id);
    if !dir.is_dir() {
        return Err(format!("нет плагина «{id}»"));
    }
    trash::delete(&dir).map_err(|e| e.to_string())
}

// ---- git ----------------------------------------------------------------------------------------------------------

/// The address of a repository git can clone: https, ssh («ssh://», «git@host:path»), a local «file://».
fn git_url_ok(url: &str) -> bool {
    let u = url.trim();
    !u.is_empty()
        && !u.starts_with('-')
        && !u.chars().any(|c| c.is_whitespace() || c.is_control())
        && (u.starts_with("https://") || u.starts_with("ssh://") || u.starts_with("file://") || u.starts_with("http://") || scp_like(u))
}
/// «user@host:path»: scp-like ssh.
fn scp_like(u: &str) -> bool {
    match u.split_once(':') {
        Some((who, path)) => who.contains('@') && !who.contains('/') && !path.is_empty() && !path.starts_with("//"),
        None => false,
    }
}
/// A ref of a repository: a tag or a branch name, nothing git would take for an option.
fn ref_ok(r: &str) -> bool {
    !r.is_empty() && !r.starts_with('-') && !r.contains("..") && r.chars().all(|c| c.is_ascii_alphanumeric() || "._-/+".contains(c))
}

fn git_bin() -> Result<&'static str, String> {
    for g in ["/opt/homebrew/bin/git", "/usr/local/bin/git"] {
        if Path::new(g).exists() {
            return Ok(g);
        }
    }
    // /usr/bin/git is a stub until the Command Line Tools are there: it would offer to install them
    let clt = Command::new("/usr/bin/xcode-select").arg("-p").stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok_and(|s| s.success());
    if clt && Path::new("/usr/bin/git").exists() {
        Ok("/usr/bin/git")
    } else {
        Err("Нужен git: установите Command Line Tools (xcode-select --install)".into())
    }
}
/// git that never asks: no terminal, ssh in batch mode; a minute at most.
fn git(args: &[&str]) -> Result<String, String> {
    let mut child: Child = Command::new(git_bin()?)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes -o ConnectTimeout=15")
        .env("GCM_INTERACTIVE", "never")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let start = Instant::now();
    loop {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            break;
        }
        if start.elapsed() > Duration::from_secs(60) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("git не ответил за минуту".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(git_error(&String::from_utf8_lossy(&out.stderr)))
    }
}
fn git_error(stderr: &str) -> String {
    let s = stderr.to_ascii_lowercase();
    if ["permission denied", "authentication failed", "could not read username", "could not read from remote", "access denied", "403", "401", "host key verification failed"].iter().any(|x| s.contains(x)) {
        "Нет доступа к репозиторию: проверьте ключ SSH или вход в git на этом Mac".into()
    } else if s.contains("not found") || s.contains("does not appear to be a git repository") || s.contains("does not exist") {
        // GitHub and GitLab answer «not found» for a private one too
        "Репозиторий не найден или нет доступа: проверьте ссылку, ключ SSH или вход в git на этом Mac".into()
    } else if s.contains("could not resolve host") || s.contains("connection timed out") || s.contains("operation timed out") {
        "Нет связи с сервером репозитория".into()
    } else {
        stderr.trim().lines().last().unwrap_or("ошибка git").trim_start_matches("fatal: ").to_string()
    }
}

#[derive(serde::Serialize, Default, Debug, PartialEq)]
pub struct Refs {
    /// The default branch (HEAD).
    head: Option<String>,
    /// Tags, the newest version first, with their commits.
    tags: Vec<(String, String)>,
    branches: Vec<(String, String)>,
}
/// `git ls-remote --symref`: the default branch, the branches, the tags (a peeled `^{}` gives the commit of an
/// annotated one).
fn parse_ls_remote(out: &str) -> Refs {
    let mut r = Refs::default();
    for line in out.lines() {
        let Some((a, b)) = line.split_once('\t') else { continue };
        if let Some(head) = a.strip_prefix("ref: refs/heads/") {
            if b == "HEAD" {
                r.head = Some(head.to_string());
            }
        } else if let Some(t) = b.strip_prefix("refs/tags/") {
            match t.strip_suffix("^{}") {
                Some(t) => match r.tags.iter_mut().find(|x| x.0 == t) {
                    Some(x) => x.1 = a.to_string(),
                    None => r.tags.push((t.to_string(), a.to_string())),
                },
                None if !r.tags.iter().any(|x| x.0 == t) => r.tags.push((t.to_string(), a.to_string())),
                None => {}
            }
        } else if let Some(h) = b.strip_prefix("refs/heads/") {
            r.branches.push((h.to_string(), a.to_string()));
        }
    }
    r.tags.retain(|t| version_of(&t.0).is_some());
    r.tags.sort_by(|a, b| version_of(&b.0).cmp(&version_of(&a.0)));
    r
}
/// «v1.2.3» / «1.2» → (1, 2, 3, release first): a version tag; none for other tags.
fn version_of(tag: &str) -> Option<(u64, u64, u64, bool)> {
    let t = tag.strip_prefix('v').unwrap_or(tag);
    let (core, pre) = match t.split_once('-') {
        Some((c, _)) => (c, true),
        None => (t, false),
    };
    let mut n = core.split('.').map(|p| p.parse::<u64>());
    let a = n.next()?.ok()?;
    let b = n.next().unwrap_or(Ok(0)).ok()?;
    let c = n.next().unwrap_or(Ok(0)).ok()?;
    if n.next().is_some() {
        return None;
    }
    Some((a, b, c, !pre))
}

/// The refs of a repository (its updates are checked by them).
#[tauri::command]
pub async fn git_refs(url: String) -> Result<Refs, String> {
    if !git_url_ok(&url) {
        return Err("Ссылка — HTTPS или SSH на git-репозиторий".into());
    }
    tauri::async_runtime::spawn_blocking(move || Ok(parse_ls_remote(&git(&["ls-remote", "--symref", "--", url.trim()])?))).await.map_err(|e| e.to_string())?
}

/// A shallow clone of one ref and where its built plugin is in it (the root or `dist/`).
fn clone_ref(app: &AppHandle, url: &str, r: &str, name: &str) -> Result<(PathBuf, PathBuf, String), String> {
    let tmp = temp_dir(app, name)?;
    let repo = tmp.join("repo");
    let to = repo.to_string_lossy().to_string();
    if let Err(e) = git(&["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--single-branch", "--branch", r, "--", url.trim(), &to]) {
        let _ = fs::remove_dir_all(&tmp);
        return Err(e);
    }
    let commit = git(&["-C", &to, "rev-parse", "HEAD"]).map(|c| c.trim().to_string()).unwrap_or_default();
    let dir = [repo.clone(), repo.join("dist")].into_iter().find(|d| d.join("manifest.json").is_file());
    match dir {
        Some(d) => Ok((tmp, d, commit)),
        None => {
            let _ = fs::remove_dir_all(&tmp);
            Err("В репозитории нет manifest.json (ни в корне, ни в dist/)".into())
        }
    }
}

#[derive(serde::Serialize)]
pub struct Probe {
    refs: Refs,
    /// The ref looked at: the newest version tag, else the default branch.
    r#ref: String,
    track: String,
    commit: String,
    manifest: String,
    /// `dist/` or the root.
    dir: String,
}

/// «Проверить»: the refs, and the plugin in `ref` (else the newest tag, else the default branch) — its manifest.
#[tauri::command]
pub async fn git_probe(app: AppHandle, url: String, r#ref: Option<String>) -> Result<Probe, String> {
    if !git_url_ok(&url) {
        return Err("Ссылка — HTTPS или SSH на git-репозиторий".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let refs = parse_ls_remote(&git(&["ls-remote", "--symref", "--", url.trim()])?);
        let (r, track) = match r#ref {
            Some(r) if ref_ok(&r) => {
                let t = if refs.tags.iter().any(|t| t.0 == r) { "tag" } else { "branch" };
                (r, t)
            }
            Some(_) => return Err("bad ref".into()),
            None => match (refs.tags.iter().find(|t| version_of(&t.0).is_some_and(|v| v.3)), &refs.head) {
                (Some(t), _) => (t.0.clone(), "tag"),
                (None, Some(h)) => (h.clone(), "branch"),
                (None, None) => return Err("В репозитории нет ни тегов, ни веток".into()),
            },
        };
        let (tmp, dir, commit) = clone_ref(&app, &url, &r, "probe")?;
        let res = (|| {
            let m = check_manifest(&dir, None)?;
            let main = m["main"].as_str().unwrap_or("main.js");
            if !rel_ok(main) || !dir.join(main).is_file() {
                return Err(format!("Нет {main} — в {} должны быть собранные файлы", if track == "tag" { "теге" } else { "ветке" }));
            }
            Ok(Probe { manifest: fs::read_to_string(dir.join("manifest.json")).map_err(|e| e.to_string())?, dir: if dir.ends_with("dist") { "dist".into() } else { String::new() }, refs, r#ref: r, track: track.into(), commit })
        })();
        let _ = fs::remove_dir_all(&tmp);
        res
    })
    .await
    .map_err(|e| e.to_string())?
}

/// By a link: the built files of `ref` (a tag or a branch) into `plugins/<id>`; `.source.json` keeps the link.
#[tauri::command]
pub async fn plugin_install_git(app: AppHandle, url: String, r#ref: String, track: String, check_updates: bool) -> Result<String, String> {
    if !git_url_ok(&url) || !ref_ok(&r#ref) || !["tag", "branch"].contains(&track.as_str()) {
        return Err("bad git source".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let (tmp, dir, commit) = clone_ref(&app, &url, &r#ref, "git")?;
        let res = (|| {
            let m = check_manifest(&dir, None)?;
            let id = m["id"].as_str().unwrap_or("").to_string();
            // the same id from the catalog (or another link) is another plugin: not replaced by this one
            let here = plugins_dir(&app)?.join(&id).join(".source.json");
            if let Some(src) = fs::read_to_string(&here).ok().and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()) {
                if src["kind"] == "catalog" {
                    return Err(format!("Плагин с id «{id}» уже установлен из каталога"));
                }
                if src["kind"] == "git" && src["url"] != url.trim() {
                    return Err(format!("Плагин с id «{id}» уже установлен из {}", src["url"].as_str().unwrap_or("другого репозитория")));
                }
            }
            let out = temp_dir(&app, &id)?;
            for f in files_of(&m) {
                let from = dir.join(&f);
                if !from.is_file() {
                    if f == "manifest.json" || f == m["main"].as_str().unwrap_or("main.js") {
                        return Err(format!("Нет {f} — в {} должны быть собранные файлы", if track == "tag" { "теге" } else { "ветке" }));
                    }
                    continue; // a theme or styles left out: the app says so when it reads the plugin
                }
                if fs::metadata(&from).map(|m| m.len()).unwrap_or(0) > FILE_LIMIT {
                    return Err(format!("{f} больше 10 МБ"));
                }
                if let Some(p) = out.join(&f).parent() {
                    fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
                fs::copy(&from, out.join(&f)).map_err(|e| e.to_string())?;
            }
            let src = serde_json::json!({ "kind": "git", "url": url.trim(), "track": track, "ref": r#ref, "commit": commit, "checkUpdates": check_updates, "installed": now_ms() });
            let r = put_in_place(&app, &out, &id, src);
            if r.is_err() {
                let _ = fs::remove_dir_all(&out);
            }
            r
        })();
        let _ = fs::remove_dir_all(&tmp);
        res
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repos_urls_refs() {
        assert!(repo_ok("YuryBogdanov/panopticon-week"));
        assert!(!repo_ok("a/b/c") && !repo_ok("../x") && !repo_ok("a/.git") && !repo_ok("a"));
        assert!(gh_host_ok("https://raw.githubusercontent.com/a/b/HEAD/x").is_ok());
        assert!(gh_host_ok("https://evil.com/x").is_err() && gh_host_ok("http://github.com/x").is_err());
        for u in ["https://git.company.local/team/okr.git", "git@github.com:YuryBogdanov/panopticon-week.git", "ssh://git@host:22/a/b.git", "file:///tmp/x"] {
            assert!(git_url_ok(u), "{u}");
        }
        for u in ["-uhttps://x", "https://a b", "/tmp/x", "github.com/a/b", ""] {
            assert!(!git_url_ok(u), "{u}");
        }
        assert!(ref_ok("v2.0.1") && ref_ok("release/2.0") && !ref_ok("--upload-pack=x") && !ref_ok("a..b"));
        assert!(rel_ok("themes/dark.json") && !rel_ok("../x") && !rel_ok("/etc/x"));
    }

    #[test]
    fn ls_remote_parsed_newest_tag_first() {
        let out = "ref: refs/heads/main\tHEAD\n1111\tHEAD\n1111\trefs/heads/main\n2222\trefs/heads/dev\n3333\trefs/tags/v1.9.0\n4444\trefs/tags/v2.0.1\n5555\trefs/tags/v2.0.1^{}\n6666\trefs/tags/v2.0.10-beta\n7777\trefs/tags/nightly\n8888\trefs/tags/2.0.2\n";
        let r = parse_ls_remote(out);
        assert_eq!(r.head.as_deref(), Some("main"));
        assert_eq!(r.branches, vec![("main".into(), "1111".into()), ("dev".into(), "2222".into())]);
        let names: Vec<&str> = r.tags.iter().map(|t| t.0.as_str()).collect();
        assert_eq!(names, vec!["v2.0.10-beta", "2.0.2", "v2.0.1", "v1.9.0"]);
        assert_eq!(r.tags.iter().find(|t| t.0 == "v2.0.1").unwrap().1, "5555"); // the commit of an annotated tag
        assert!(version_of("v2.0.10") > version_of("v2.0.10-beta"));
    }

    #[test]
    fn git_errors_in_words() {
        assert!(git_error("git@x: Permission denied (publickey).\nfatal: Could not read from remote repository.").starts_with("Нет доступа"));
        assert!(git_error("remote: Repository not found.\nfatal: repository 'https://x/y' not found").starts_with("Репозиторий не найден"));
        assert_eq!(git_error("fatal: something else"), "something else");
    }

    #[test]
    fn files_of_a_plugin() {
        let m: serde_json::Value = serde_json::json!({ "id": "x", "styles": "styles.css", "contributes": { "themes": ["themes/a.json", "../evil.json"] } });
        assert_eq!(files_of(&m), vec!["manifest.json", "main.js", "styles.css", "themes/a.json"]);
    }

    /// GitHub itself (`cargo test -- --ignored`): the catalog's list, a missing file, a plugin's refs over git.
    #[test]
    #[ignore]
    fn live() {
        let list = gh_text(&format!("https://raw.githubusercontent.com/{CATALOG_REPO}/HEAD/plugins.json")).unwrap();
        assert!(list.contains("\"week\""));
        assert_eq!(gh_text(&format!("https://raw.githubusercontent.com/{CATALOG_REPO}/HEAD/nothing.json")).unwrap_err(), "не найдено");
        let r = parse_ls_remote(&git(&["ls-remote", "--symref", "--", "https://github.com/YuryBogdanov/panopticon-week.git"]).unwrap());
        assert_eq!(r.head.as_deref(), Some("main"));
        assert!(git(&["ls-remote", "--", "https://github.com/YuryBogdanov/no-such-repo-xyz.git"]).unwrap_err().starts_with("Репозиторий не найден или нет доступа"));
    }
}

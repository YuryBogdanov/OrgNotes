// Plugins (ТЗ 26): the installed ones in their folder, their files, their permissions, their network access (tech
// sprint 5.2: out of lib.rs).

use super::*;

// ---- plugins (ТЗ 26 §4, roadmap 1.2): `plugins/<id>/` in the app's settings folder, next to `themes/` ------------

pub(crate) fn plugins_dir(app: &AppHandle) -> Res<PathBuf> {
    let dir = app.path().app_config_dir()?.join("plugins");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}
/// A plugin's folder name as a manifest's id: `[a-z0-9-]`, up to 64.
pub(crate) fn plugin_dir_ok(dir: &str) -> bool {
    !dir.is_empty() && dir.len() <= 64 && dir.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

#[derive(serde::Serialize)]
pub(crate) struct ListedPlugin {
    dir: String,
    /// The text of `manifest.json`; none when there is no readable one.
    manifest: Option<String>,
    /// The text of `.source.json`: where it came from (the catalog, a git link; ТЗ 37); none — put there by hand.
    source: Option<String>,
}

/// The folders of the installed plugins with their manifests.
#[tauri::command]
pub(crate) fn list_plugins(app: AppHandle) -> Vec<ListedPlugin> {
    let Ok(dir) = plugins_dir(&app) else { return vec![] };
    let Ok(rd) = fs::read_dir(dir) else { return vec![] };
    let mut out: Vec<ListedPlugin> = rd
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                return None;
            }
            Some(ListedPlugin { manifest: fs::read_to_string(e.path().join("manifest.json")).ok(), source: fs::read_to_string(e.path().join(".source.json")).ok(), dir: name })
        })
        .collect();
    out.sort_by(|a, b| a.dir.cmp(&b.dir));
    out
}

/// A file of a plugin (its `main.js`, `styles.css`): only inside its own folder.
#[tauri::command]
pub(crate) fn read_plugin_file(app: AppHandle, dir: String, file: String) -> Res<String> {
    if !plugin_dir_ok(&dir) {
        return Err("bad plugin folder".into());
    }
    let ok_part = |p: &str| !p.is_empty() && p != "." && p != ".." && p.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c));
    if file.starts_with('/') || !file.split('/').all(ok_part) {
        return Err("bad plugin file".into());
    }
    let base = plugins_dir(&app)?.join(&dir).canonicalize()?;
    let p = base.join(&file).canonicalize()?;
    if !p.starts_with(&base) {
        return Err("a plugin reads only its own folder".into());
    }
    fs::read_to_string(p).map_err(Error::from)
}

// ---- permissions (ТЗ 26 §6, roadmap 1.3): checked here by the manifest Rust reads itself, not by what the window says

/// The built-in plugins' manifests, as built into the app.
pub(crate) const BUILTIN_MANIFESTS: &[&str] = &[
    include_str!("../../src/plugins/calendar/manifest.json"),
    include_str!("../../src/plugins/hello/manifest.json"),
    include_str!("../../src/plugins/inbox/manifest.json"),
    include_str!("../../src/plugins/kanban/manifest.json"),
    include_str!("../../src/plugins/long-matters/manifest.json"),
    include_str!("../../src/plugins/quarter-goals/manifest.json"),
    include_str!("../../src/plugins/theme-pack/manifest.json"),
];

/// A plugin's manifest: a built-in one, else `plugins/<id>/manifest.json`.
pub(crate) fn plugin_manifest(app: &AppHandle, id: &str) -> Res<serde_json::Value> {
    for m in BUILTIN_MANIFESTS {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(m) {
            if v["id"] == id {
                return Ok(v);
            }
        }
    }
    if !plugin_dir_ok(id) {
        return Err("bad plugin id".into());
    }
    let text = fs::read_to_string(plugins_dir(app)?.join(id).join("manifest.json")).map_err(|_| format!("нет плагина «{id}»"))?;
    let v: serde_json::Value = serde_json::from_str(&text)?;
    if v["id"] != id {
        return Err("id не совпадает с папкой".into());
    }
    Ok(v)
}
pub(crate) fn has_permission(m: &serde_json::Value, p: &str) -> bool {
    m["permissions"].as_array().is_some_and(|a| a.iter().any(|x| x == p))
}
/// The host of an http(s) address: no user part, lower case, without the port; none when it is not one.
pub(crate) fn host_of(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"))?;
    let auth = rest.split(['/', '?', '#']).next()?;
    if auth.is_empty() || auth.contains('@') {
        return None;
    }
    let host = if auth.starts_with('[') { auth.split(']').next()?.to_string() + "]" } else { auth.split(':').next()?.to_string() };
    if host.is_empty() || !host.chars().all(|c| c.is_ascii_alphanumeric() || ".-[]:".contains(c)) {
        return None;
    }
    Some(host.to_ascii_lowercase())
}
/// The manifest's `net` lets it go there: the same host, or «*.company.ru» for its subdomains.
pub(crate) fn host_allowed(m: &serde_json::Value, host: &str) -> bool {
    m["net"].as_array().is_some_and(|a| {
        a.iter().filter_map(|x| x.as_str()).any(|h| {
            let h = h.to_ascii_lowercase();
            match h.strip_prefix("*.") {
                Some(base) => host.ends_with(&format!(".{base}")),
                None => host == h,
            }
        })
    })
}

#[derive(serde::Serialize)]
pub(crate) struct NetResponse {
    status: u16,
    headers: Vec<(String, String)>,
    text: String,
}
pub(crate) const NET_LIMIT: usize = 10 * 1024 * 1024;

/// `net.fetch` of a plugin: only with the right «net» and only to the hosts of its manifest. Made by the system's
/// curl (its TLS and proxies); 30 s, 10 MB.
#[tauri::command]
pub(crate) async fn net_fetch(app: AppHandle, plugin: String, url: String, method: Option<String>, headers: Option<Vec<(String, String)>>, body: Option<String>) -> Res<NetResponse> {
    let m = plugin_manifest(&app, &plugin)?;
    if !has_permission(&m, "net") {
        return Err(format!("Плагин «{plugin}»: нужно право net").into());
    }
    let host = host_of(&url).ok_or("адрес — http или https")?;
    if !host_allowed(&m, &host) {
        return Err(format!("Плагин «{plugin}»: хоста {host} нет в манифесте").into());
    }
    let method = method.unwrap_or_else(|| "GET".into()).to_ascii_uppercase();
    if !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].contains(&method.as_str()) {
        return Err("метод не поддерживается".into());
    }
    tauri::async_runtime::spawn_blocking(move || -> Res<NetResponse> {
        use std::io::Write;
        let mut cmd = std::process::Command::new("/usr/bin/curl");
        cmd.args(["-sS", "--max-time", "30", "--max-filesize", &NET_LIMIT.to_string(), "--proto", "=http,https", "-X", &method, "-D", "-", "-o", "-"]);
        for (k, v) in headers.unwrap_or_default() {
            if k.contains(['\r', '\n', ':']) || v.contains(['\r', '\n']) {
                return Err("заголовок с переводом строки".into());
            }
            cmd.args(["-H", &format!("{k}: {v}")]);
        }
        if body.is_some() {
            cmd.args(["--data-binary", "@-"]);
        }
        cmd.arg("--").arg(&url).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
        let mut child = cmd.spawn()?;
        if let Some(b) = body {
            child.stdin.take().ok_or("no stdin")?.write_all(b.as_bytes())?;
        } else {
            drop(child.stdin.take());
        }
        let out = child.wait_with_output()?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().into());
        }
        parse_curl(&out.stdout)
    })
    .await?
}
/// curl's `-D - -o -`: the header blocks (one per redirect or 100), then the body.
pub(crate) fn parse_curl(raw: &[u8]) -> Res<NetResponse> {
    let mut rest = raw;
    let mut status = 0u16;
    let mut headers = vec![];
    while rest.starts_with(b"HTTP/") {
        let end = rest.windows(4).position(|w| w == b"\r\n\r\n").ok_or("ответ без заголовков")?;
        let block = String::from_utf8_lossy(&rest[..end]).to_string();
        rest = &rest[end + 4..];
        let mut lines = block.split("\r\n");
        status = lines.next().and_then(|l| l.split_whitespace().nth(1)).and_then(|c| c.parse().ok()).unwrap_or(0);
        headers = lines.filter_map(|l| l.split_once(':')).map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string())).collect();
    }
    if rest.len() > NET_LIMIT {
        return Err("ответ больше 10 МБ".into());
    }
    Ok(NetResponse { status, headers, text: String::from_utf8_lossy(rest).to_string() })
}

/// «Открыть папку плагинов»: the folder in Finder.
#[tauri::command]
pub(crate) fn open_plugins_folder(app: AppHandle) -> Res<()> {
    let dir = plugins_dir(&app)?;
    std::process::Command::new("open").arg(dir).spawn().map(|_| ()).map_err(Error::from)
}


#[cfg(test)]
mod plugin_tests {
    use super::*;

    #[test]
    fn hosts_of_addresses() {
        assert_eq!(host_of("https://Jira.Company.ru/rest/api?x=1").as_deref(), Some("jira.company.ru"));
        assert_eq!(host_of("http://localhost:8080/").as_deref(), Some("localhost"));
        assert_eq!(host_of("https://user@evil.com/"), None);
        assert_eq!(host_of("file:///etc/passwd"), None);
        assert_eq!(host_of("ftp://a.ru"), None);
    }
    #[test]
    fn hosts_of_the_manifest() {
        let m: serde_json::Value = serde_json::json!({ "net": ["jira.company.ru", "*.corp.ru"] });
        assert!(host_allowed(&m, "jira.company.ru"));
        assert!(!host_allowed(&m, "evil-jira.company.ru"));
        assert!(host_allowed(&m, "wiki.corp.ru"));
        assert!(!host_allowed(&m, "corp.ru.evil.com"));
        assert!(!host_allowed(&serde_json::json!({}), "jira.company.ru"));
    }
    #[test]
    fn curl_answers() {
        let raw = b"HTTP/1.1 301 Moved\r\nLocation: /b\r\n\r\nHTTP/2 200\r\nContent-Type: application/json\r\n\r\n{\"ok\":true}";
        let r = parse_curl(raw).unwrap();
        assert_eq!(r.status, 200);
        assert_eq!(r.headers, vec![("content-type".to_string(), "application/json".to_string())]);
        assert_eq!(r.text, "{\"ok\":true}");
    }
    #[test]
    fn the_builtin_manifests_are_read() {
        let ids: Vec<String> = BUILTIN_MANIFESTS.iter().map(|m| serde_json::from_str::<serde_json::Value>(m).unwrap()["id"].as_str().unwrap().to_string()).collect();
        assert_eq!(ids, ["calendar", "hello", "inbox", "kanban", "long-matters", "quarter-goals", "theme-pack"]);
    }
}

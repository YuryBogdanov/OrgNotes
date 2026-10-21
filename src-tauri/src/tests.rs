// The tests of the notes folder and its files (tech sprint 5.2: out of lib.rs).

use super::exchange::*;
use super::*;

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("org-test-{}-{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn atomic_write_replaces_whole_and_leaves_no_tmp() {
    let d = tmp("atomic");
    let (t, x) = (d.join("a.org"), d.join(".a.org.tmp"));
    fs::write(&t, "old").unwrap();
    atomic_write(&x, &t, b"new").unwrap();
    assert_eq!(fs::read_to_string(&t).unwrap(), "new");
    assert!(!x.exists());
    // the tmp cannot be made (no such folder): the target stays as it was
    assert!(atomic_write(&d.join("no/x.tmp"), &t, b"lost").is_err());
    assert_eq!(fs::read_to_string(&t).unwrap(), "new");
}

#[test]
fn a_picked_path_is_written_once() {
    lock(&PICKED).push("/tmp/org-picked.json".into());
    assert!(take_picked("/tmp/org-other.json").is_err()); // never chosen
    assert!(take_picked("/tmp/org-picked.json").is_ok());
    assert!(take_picked("/tmp/org-picked.json").is_err()); // used already
    assert!(export_text("/tmp/org-not-picked.txt".into(), "x".into()).is_err());
    assert!(!Path::new("/tmp/org-not-picked.txt").exists());
}

#[test]
fn a_poisoned_lock_still_gives_its_data() {
    let m = std::sync::Arc::new(Mutex::new(5));
    let m2 = m.clone();
    let _ = std::thread::spawn(move || {
        let _g = m2.lock().unwrap();
        panic!("a panic while it is held");
    })
    .join();
    assert!(m.is_poisoned());
    assert_eq!(*lock(&m), 5);
}

#[test]
fn saves_when_disk_matches_base() {
    let d = tmp("ok");
    let f = d.join("a.org");
    fs::write(&f, "* TODO a\n").unwrap();
    save_checked(&d, f.to_str().unwrap(), "* DONE a\n", "* TODO a\n").unwrap();
    assert_eq!(fs::read_to_string(&f).unwrap(), "* DONE a\n");
}

#[test]
fn refuses_to_clobber_external_edit() {
    let d = tmp("conflict");
    let f = d.join("a.org");
    fs::write(&f, "* TODO a\nedited in emacs\n").unwrap();
    let r = save_checked(&d, f.to_str().unwrap(), "* DONE a\n", "* TODO a\n");
    assert_eq!(r, Err(Error::Conflict));
    assert_eq!(
        fs::read_to_string(&f).unwrap(),
        "* TODO a\nedited in emacs\n"
    );
}

#[test]
fn rejects_paths_outside_root_and_non_org() {
    let d = tmp("outside");
    let other = tmp("outside-other");
    let f = other.join("b.org");
    fs::write(&f, "x").unwrap();
    assert!(save_checked(&d, f.to_str().unwrap(), "y", "x").is_err());
    let g = d.join("c.txt");
    fs::write(&g, "x").unwrap();
    assert!(save_checked(&d, g.to_str().unwrap(), "y", "x").is_err());
}
#[test]
fn creates_files_and_folders() {
    let d = tmp("create");
    let f = create_in(&d, d.to_str().unwrap(), "План", false, None).unwrap();
    assert!(f.ends_with("План.org"));
    assert_eq!(fs::read_to_string(&f).unwrap(), "#+TITLE: План\n\n");
    let dir = create_in(&d, d.to_str().unwrap(), "Команда", true, None).unwrap();
    assert!(Path::new(&dir).is_dir());
    let nested = create_in(&d, &dir, "a.org", false, None).unwrap();
    assert!(nested.ends_with("Команда/a.org"));
    assert_eq!(
        create_in(&d, d.to_str().unwrap(), "План", false, None),
        Err(Error::Exists)
    );
}

#[test]
fn rejects_bad_names_and_outside_parents() {
    let d = tmp("names");
    let other = tmp("names-other");
    for bad in ["", "  ", "..", ".hidden", "a/b", "a\\b", "a:b"] {
        assert!(
            create_in(&d, d.to_str().unwrap(), bad, false, None).is_err(),
            "{bad:?}"
        );
    }
    assert!(create_in(&d, other.to_str().unwrap(), "x", false, None).is_err());
}

#[test]
fn renames_keeping_extension_and_refusing_overwrite() {
    let d = tmp("rename");
    let a = create_in(&d, d.to_str().unwrap(), "a", false, None).unwrap();
    let b = create_in(&d, d.to_str().unwrap(), "b", false, None).unwrap();
    let r = rename_in(&d, &a, "c").unwrap();
    assert!(r.ends_with("c.org") && Path::new(&r).exists() && !Path::new(&a).exists());
    assert_eq!(rename_in(&d, &r, "b"), Err(Error::Exists));
    assert!(Path::new(&b).exists());
    assert!(rename_in(&d, d.to_str().unwrap(), "x").is_err());
}

#[test]
fn moves_into_folders_but_not_into_itself() {
    let d = tmp("move");
    let root = d.to_str().unwrap();
    let team = create_in(&d, root, "Team", true, None).unwrap();
    let sub = create_in(&d, &team, "Sub", true, None).unwrap();
    let note = create_in(&d, root, "n", false, None).unwrap();
    let moved = move_in(&d, &note, &team).unwrap();
    assert!(moved.ends_with("Team/n.org") && Path::new(&moved).exists());
    assert!(move_in(&d, &team, &sub).is_err());
    // a name clash is refused, nothing is overwritten
    let again = create_in(&d, root, "n", false, None).unwrap();
    assert_eq!(move_in(&d, &again, &team), Err(Error::Exists));
    assert!(Path::new(&again).exists());
    // moving a folder carries its content
    let top = move_in(&d, &team, root).unwrap();
    assert_eq!(top, team);
}

#[test]
fn refuses_to_touch_paths_outside_the_root() {
    let d = tmp("outside-ops");
    let other = tmp("outside-ops-other");
    let f = other.join("x.org");
    fs::write(&f, "x").unwrap();
    assert!(rename_in(&d, f.to_str().unwrap(), "y").is_err());
    assert!(move_in(&d, f.to_str().unwrap(), d.to_str().unwrap()).is_err());
    assert!(trash_in(&d, f.to_str().unwrap()).is_err());
    assert!(f.exists());
}

#[test]
fn project_config_roundtrip_and_isolation() {
    let d = tmp("config");
    assert_eq!(read_config_in(&d), None);
    write_config_in(&d, "{\"version\":1}").unwrap();
    assert_eq!(read_config_in(&d).as_deref(), Some("{\"version\":1}"));
    write_config_in(&d, "{\"version\":2}").unwrap();
    assert_eq!(read_config_in(&d).as_deref(), Some("{\"version\":2}"));
    // the config folder is hidden, so it never shows up as notes or folders
    let mut files = Vec::new();
    collect(&d, &d, &mut files);
    assert!(files.is_empty());
    let mut dirs = Vec::new();
    dirs_in(&d, &d, &mut dirs);
    assert!(dirs.is_empty());
    assert!(!d.join(".orgnotes/config.json.tmp").exists());
}

#[test]
fn scans_a_folder_like_the_navigator_sees_it() {
    let d = std::env::temp_dir().join(format!("scan-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(d.join("Команда/Рост")).unwrap();
    fs::create_dir_all(d.join(".git/objects")).unwrap();
    for f in ["a.org", "Команда/b.org", "Команда/Рост/c.org", "readme.md", ".git/HEAD", ".#a.org", "#a.org#", "a.org~", ".DS_Store"] {
        fs::write(d.join(f), "x").unwrap();
    }
    let s = scan_in(&d, None).unwrap();
    assert_eq!((s.org, s.folders, s.other, s.capped, s.big), (3, 2, 1, false, false));
    let home = scan_in(&d, Some(&d.to_string_lossy())).unwrap();
    assert_eq!(home.shown, "~");
    assert!(home.big); // the home folder itself is too big a workspace
    let inside = scan_in(&d.join("Команда"), Some(&d.to_string_lossy())).unwrap();
    assert_eq!(inside.shown, "~/Команда");
    assert!(emacs_service(".#x.org") && emacs_service("#x.org#") && emacs_service("x.org~") && !emacs_service("x.org"));
    // a note: .org, or its archive as Emacs makes them (ТЗ 33)
    assert!(is_org(Path::new("a.org")) && is_org(Path::new("a.org_archive")) && !is_org(Path::new("a.md")) && !is_org(Path::new("a.org.tmp")));
    // a plugin's file type (ТЗ 39): listed, written, made with its own empty text
    assert!(!is_org(Path::new("b.canvas")));
    set_note_types(vec!["canvas".into(), "bad.ext".into(), "org".into()]);
    assert!(is_org(Path::new("b.canvas")) && is_org(Path::new("b.CANVAS")) && !is_org(Path::new("b.md")));
    assert_eq!(*lock(&NOTE_TYPES), vec!["canvas".to_string()]);
    assert_eq!(with_org("b.canvas".into()), "b.canvas");
    set_note_types(vec![]);
    // base64 of a plugin's export
    assert_eq!(from_base64("iVBORw0KGgo=").unwrap(), vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]);
    assert_eq!(from_base64("TWE=").unwrap(), b"Ma".to_vec());
    assert!(from_base64("a*b").is_err());
    assert_eq!((with_org("a".into()), with_org("a.org".into()), with_org("a.org_archive".into())), ("a.org".into(), "a.org".into(), "a.org_archive".into()));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn saves_a_new_file_and_asks_before_replacing() {
    let d = tmp("save-new");
    let root = d.to_str().unwrap();
    let p = save_new_in(&d, root, "Идеи для ретро", "* Идеи\n", false).unwrap();
    assert!(p.ends_with("Идеи для ретро.org"));
    assert_eq!(fs::read_to_string(&p).unwrap(), "* Идеи\n");
    assert_eq!(save_new_in(&d, root, "Идеи для ретро", "* другое\n", false), Err(Error::Exists));
    assert_eq!(fs::read_to_string(&p).unwrap(), "* Идеи\n");
    save_new_in(&d, root, "Идеи для ретро", "* другое\n", true).unwrap();
    assert_eq!(fs::read_to_string(&p).unwrap(), "* другое\n");
    // .org is added once, whatever else the name ends with
    let typed = save_new_in(&d, root, "Привет.org", "x", false).unwrap();
    assert!(typed.ends_with("/Привет.org"));
    let dotted = save_new_in(&d, root, "report.v2", "x", false).unwrap();
    assert!(dotted.ends_with("/report.v2.org"));
    // never outside the notes folder, never over a folder
    let other = tmp("save-new-other");
    assert!(save_new_in(&d, other.to_str().unwrap(), "x", "x", false).is_err());
    fs::create_dir(d.join("dir.org")).unwrap();
    assert!(save_new_in(&d, root, "dir", "x", true).is_err());
    assert!(!d.join(".Идеи для ретро.org.tmp").exists());
}

#[test]
fn lists_folders_including_empty_ones() {
    let d = tmp("dirs");
    let root = d.to_str().unwrap();
    let a = create_in(&d, root, "A", true, None).unwrap();
    create_in(&d, &a, "B", true, None).unwrap();
    fs::create_dir(d.join(".git")).unwrap();
    let mut out = Vec::new();
    dirs_in(&d, &d, &mut out);
    assert_eq!(out, vec!["A".to_string(), "A/B".to_string()]);
}

#[test]
fn errors_reach_the_page_as_the_words_it_checks() {
    assert_eq!(serde_json::to_string(&Error::Conflict).unwrap(), "\"conflict\"");
    assert_eq!(serde_json::to_string(&Error::Exists).unwrap(), "\"exists\"");
    let io: Error = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "нет доступа").into();
    assert_eq!(serde_json::to_string(&io).unwrap(), "\"нет доступа\"");
    assert_eq!(String::from(Error::from("no notes folder")), "no notes folder");
}

// ТЗ 55 §1: the terminal's output as UTF-8 — a character cut between two reads waits for its other bytes
#[test]
fn pty_output_keeps_a_cut_character_for_the_next_read() {
    let mut carry = Vec::new();
    let word = "ёж".as_bytes(); // 4 bytes: d1 91 d0 b6
    assert_eq!(crate::pty::utf8_chunk(&mut carry, &word[..3]), "ё");
    assert_eq!(carry, vec![0xd0]);
    assert_eq!(crate::pty::utf8_chunk(&mut carry, &word[3..]), "ж");
    assert!(carry.is_empty());
    // not UTF-8: the replacement character, the rest goes on
    assert_eq!(crate::pty::utf8_chunk(&mut carry, b"a\xffb"), "a\u{FFFD}b");
}

// ТЗ 59 §9.1: a plugin's images in the notes folder
#[test]
fn write_bytes_makes_folders_and_never_replaces() {
    let d = tmp("bytes");
    let p = d.join("Проекты/img/a.png");
    let got = write_bytes_in(&d, &p.to_string_lossy(), &[1, 2, 3]).unwrap();
    assert!(got.ends_with("Проекты/img/a.png"));
    assert_eq!(fs::read(&p).unwrap(), vec![1, 2, 3]);
    assert!(matches!(write_bytes_in(&d, &p.to_string_lossy(), &[4]), Err(Error::Exists)));
    assert_eq!(read_bytes_in(&d, &p.to_string_lossy()).unwrap(), vec![1, 2, 3]);
    assert!(!d.join("Проекты/img/.a.png.tmp").exists());
}

#[test]
fn write_bytes_stays_inside_the_folder() {
    let d = tmp("bytes-out");
    let out = std::env::temp_dir().join(format!("org-test-out-{}.png", std::process::id()));
    assert!(write_bytes_in(&d, &out.to_string_lossy(), &[1]).is_err());
    assert!(write_bytes_in(&d, &d.join("img/../../x.png").to_string_lossy(), &[1]).is_err());
    assert!(write_bytes_in(&d, &d.join(".hidden/x.png").to_string_lossy(), &[1]).is_err());
    assert!(read_bytes_in(&d, &out.to_string_lossy()).is_err());
}

// fix-59-1 §5: the agents' brief in `.orgnotes/agents/`
#[test]
fn agent_file_names_are_checked() {
    let d = tmp("agents");
    assert!(agent_file(&d, "presentation").unwrap().ends_with(".orgnotes/agents/presentation.md"));
    for bad in ["", "../x", "a/b", "Big", "a.md"] {
        assert!(agent_file(&d, bad).is_err(), "{bad}");
    }
}

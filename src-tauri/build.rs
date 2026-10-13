fn main() {
    // the mini window's native panel (ТЗ 31): a Swift package, linked into the app
    #[cfg(target_os = "macos")]
    swift_rs::SwiftLinker::new("13.0").with_package("MiniPanel", "./swift/MiniPanel/").link();
    tauri_build::build()
}

//! The menu bar is built in TypeScript (src/menu.ts); its shortcut strings are parsed by muda at run time.
//! A typo there would silently drop the whole native menu, so every string used in menu.ts is checked here.
use muda::accelerator::Accelerator;

#[test]
fn every_menu_accelerator_parses() {
    let used = [
        "Alt+CmdOrCtrl+ArrowLeft",
        "Alt+CmdOrCtrl+ArrowRight",
        "Alt+CmdOrCtrl+Backslash",
        "Alt+CmdOrCtrl+Digit0",
        "Alt+CmdOrCtrl+KeyC",
        "Alt+CmdOrCtrl+W",
        "Alt+Control+CmdOrCtrl+ArrowLeft",
        "Alt+Control+CmdOrCtrl+ArrowRight",
        "CmdOrCtrl+1",
        "CmdOrCtrl+2",
        "CmdOrCtrl+Backslash",
        "CmdOrCtrl+BracketLeft",
        "CmdOrCtrl+Comma",
        "CmdOrCtrl+Digit0",
        "CmdOrCtrl+KeyT",
        "CmdOrCtrl+N",
        "CmdOrCtrl+Q",
        "CmdOrCtrl+S",
        "CmdOrCtrl+W",
        "Control+CmdOrCtrl+ArrowLeft",
        "Control+CmdOrCtrl+ArrowRight",
        "Control+CmdOrCtrl+Digit1",
        "Control+CmdOrCtrl+Digit2",
        "Control+CmdOrCtrl+KeyJ",
        "Control+CmdOrCtrl+KeyW",
        "Shift+CmdOrCtrl+Backslash",
        "Shift+CmdOrCtrl+KeyJ",
        "Shift+CmdOrCtrl+KeyN",
        "Shift+CmdOrCtrl+KeyO",
        "Shift+CmdOrCtrl+KeyP",
        "Shift+CmdOrCtrl+KeyW",
        "Shift+Control+CmdOrCtrl+ArrowRight",
    ];
    for a in used {
        assert!(a.parse::<Accelerator>().is_ok(), "accelerator does not parse: {a}");
    }
}

//! The menu bar is built in TypeScript (src/menu.ts) from the registry of shortcuts (src/keys.ts); its strings are
//! parsed by muda at run time. A typo would silently drop the whole native menu, so every default is checked here,
//! and every key a recorded shortcut may have, with all the modifiers. src/keys.test.ts keeps both lists in step
//! with the registry.
use muda::accelerator::Accelerator;

#[test]
fn every_default_accelerator_parses() {
    let defaults = [
        "Alt+CmdOrCtrl+ArrowLeft",
        "Alt+CmdOrCtrl+ArrowRight",
        "Alt+CmdOrCtrl+Backslash",
        "Alt+CmdOrCtrl+Digit0",
        "Alt+CmdOrCtrl+KeyC",
        "Alt+CmdOrCtrl+KeyG",
        "Alt+CmdOrCtrl+KeyW",
        "Alt+Shift+CmdOrCtrl+KeyG",
        "CmdOrCtrl+Backslash",
        "CmdOrCtrl+BracketLeft",
        "CmdOrCtrl+Comma",
        "CmdOrCtrl+Digit0",
        "CmdOrCtrl+Digit1",
        "CmdOrCtrl+Digit2",
        "CmdOrCtrl+KeyE",
        "CmdOrCtrl+KeyF",
        "CmdOrCtrl+KeyG",
        "CmdOrCtrl+KeyN",
        "CmdOrCtrl+KeyS",
        "CmdOrCtrl+KeyT",
        "CmdOrCtrl+KeyW",
        "CmdOrCtrl+Q",
        "Control+Alt+CmdOrCtrl+ArrowLeft",
        "Control+Alt+CmdOrCtrl+ArrowRight",
        "Control+CmdOrCtrl+ArrowLeft",
        "Control+CmdOrCtrl+ArrowRight",
        "Control+CmdOrCtrl+Digit1",
        "Control+CmdOrCtrl+Digit2",
        "Control+CmdOrCtrl+Digit3",
        "Control+CmdOrCtrl+Digit4",
        "Control+CmdOrCtrl+Digit6",
        "Control+CmdOrCtrl+KeyJ",
        "Control+CmdOrCtrl+KeyW",
        "Control+Shift+CmdOrCtrl+ArrowRight",
        "Shift+CmdOrCtrl+Backslash",
        "Shift+CmdOrCtrl+KeyF",
        "Shift+CmdOrCtrl+KeyG",
        "Shift+CmdOrCtrl+KeyI",
        "Shift+CmdOrCtrl+KeyJ",
        "Shift+CmdOrCtrl+KeyN",
        "Shift+CmdOrCtrl+KeyO",
        "Shift+CmdOrCtrl+KeyP",
        "Shift+CmdOrCtrl+KeyR",
        "Shift+CmdOrCtrl+KeyW",
    ];
    for a in defaults {
        assert!(a.parse::<Accelerator>().is_ok(), "accelerator does not parse: {a}");
    }
}

#[test]
fn every_recordable_key_parses_with_every_modifier() {
    let codes = [
        "KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyI", "KeyJ", "KeyK", "KeyL", "KeyM",
        "KeyN", "KeyO", "KeyP", "KeyQ", "KeyR", "KeyS", "KeyT", "KeyU", "KeyV", "KeyW", "KeyX", "KeyY", "KeyZ",
        "Digit0", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
        "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Tab", "Space", "Backspace", "Delete", "Escape",
        "Home", "End", "PageUp", "PageDown", "Comma", "Period", "Slash", "Backslash", "BracketLeft", "BracketRight",
        "Semicolon", "Quote", "Minus", "Equal", "Backquote",
    ];
    let mods = ["", "CmdOrCtrl+", "Shift+CmdOrCtrl+", "Alt+CmdOrCtrl+", "Control+CmdOrCtrl+", "Control+Alt+Shift+CmdOrCtrl+", "Control+", "Alt+"];
    for c in codes {
        for m in mods {
            let a = format!("{m}{c}");
            assert!(a.parse::<Accelerator>().is_ok(), "accelerator does not parse: {a}");
        }
    }
}

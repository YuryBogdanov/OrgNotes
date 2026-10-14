// The text of the clipboard for the page (ТЗ 35: «Вставить как текст», the editor's menu): WebKit asks the user
// before it gives the clipboard to a page, the app reads it itself. Rust frees the copy with free().

import AppKit

@_cdecl("clip_text")
public func clipText() -> UnsafeMutablePointer<CChar>? {
    guard let s = NSPasteboard.general.string(forType: .string) else { return nil }
    return strdup(s)
}

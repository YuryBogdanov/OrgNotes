// The mini window (ТЗ 31): the Tauri window «mini» becomes a non-activating floating panel, as Spotlight's — over
// other programs, full-screen ones too, on every desktop; a click or typing in it neither activates the app nor
// leaves a full-screen program. While the pointer is away and nothing was typed lately it fades to the opacity set.
// Rust calls the functions below (C names, on the main thread).

import AppKit

/// The panel: a key window without the app becoming active.
final class MiniPanelWindow: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

/// The pointer over the panel, followed natively (the webview's events are unreliable while it is not in focus).
final class Hover: NSView {
    var onChange: ((Bool) -> Void)?
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self, userInfo: nil))
    }
    override func mouseEntered(with event: NSEvent) { onChange?(true) }
    override func mouseExited(with event: NSEvent) { onChange?(false) }
    override func hitTest(_ point: NSPoint) -> NSView? { nil } // clicks go to the webview under it
}

final class Mini {
    static let shared = Mini()
    weak var panel: NSPanel?
    var hover: Hover?
    var hovered = false
    var typedAt = Date.distantPast
    var pinned = false
    /// The settings (ТЗ 31 §3, §6).
    var opacity = 0.3
    var linger = 3.0
    var smooth = true
    /// The program in front before the panel took the keys: ⎋ gives them back.
    var previous: NSRunningApplication?
    var timer: Timer?

    /// The opacity now: full while hovered, typed in lately or something of it is open; else the one set (not under
    /// 60% with «Reduce transparency»).
    func target() -> CGFloat {
        if hovered || pinned || Date().timeIntervalSince(typedAt) < linger { return 1 }
        let floor = NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency ? 0.6 : 0.1
        return CGFloat(max(floor, min(0.9, opacity)))
    }
    func apply() {
        guard let p = panel, p.isVisible else { return }
        let to = target()
        if abs(p.alphaValue - to) < 0.001 { return }
        if smooth {
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = to > p.alphaValue ? 0.12 : 0.4
                p.animator().alphaValue = to
            }
        } else {
            p.alphaValue = to
        }
        // after the typing pause the panel fades by itself
        timer?.invalidate()
        if to == 1 && !hovered && !pinned {
            let left = linger - Date().timeIntervalSince(typedAt)
            if left > 0 { timer = Timer.scheduledTimer(withTimeInterval: left + 0.05, repeats: false) { _ in Mini.shared.apply() } }
        }
    }
}

@_cdecl("mini_setup")
public func miniSetup(_ ptr: UnsafeMutableRawPointer, _ fullscreen: Bool, _ hideFromCapture: Bool) {
    let w = Unmanaged<NSWindow>.fromOpaque(ptr).takeUnretainedValue()
    object_setClass(w, MiniPanelWindow.self)
    guard let p = w as? NSPanel else { return }
    p.styleMask.insert(.nonactivatingPanel)
    p.isFloatingPanel = true
    p.level = .floating
    p.hidesOnDeactivate = false
    p.becomesKeyOnlyIfNeeded = false
    p.hasShadow = true
    p.isMovableByWindowBackground = false
    Mini.shared.panel = p
    miniOptions(Mini.shared.opacity, Mini.shared.linger, Mini.shared.smooth, fullscreen, hideFromCapture)
    if let content = p.contentView, Mini.shared.hover == nil {
        let h = Hover(frame: content.bounds)
        h.autoresizingMask = [.width, .height]
        h.onChange = { on in
            Mini.shared.hovered = on
            Mini.shared.apply()
        }
        content.addSubview(h, positioned: .above, relativeTo: nil)
        Mini.shared.hover = h
    }
}

@_cdecl("mini_options")
public func miniOptions(_ opacity: Double, _ linger: Double, _ smooth: Bool, _ fullscreen: Bool, _ hideFromCapture: Bool) {
    let m = Mini.shared
    m.opacity = opacity
    m.linger = linger
    m.smooth = smooth
    guard let p = m.panel else { return }
    // over full-screen programs and on every desktop, or floating on the usual desktops only
    p.collectionBehavior = fullscreen ? [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle] : [.moveToActiveSpace, .ignoresCycle]
    p.sharingType = hideFromCapture ? .none : .readOnly
    m.apply()
}

/// Show it; `focus`: the keys go to it (the program in front is remembered for ⎋).
@_cdecl("mini_show")
public func miniShow(_ focus: Bool) {
    let m = Mini.shared
    guard let p = m.panel else { return }
    let front = NSWorkspace.shared.frontmostApplication
    if front?.processIdentifier != ProcessInfo.processInfo.processIdentifier { m.previous = front }
    if !p.isVisible { p.alphaValue = 1 }
    if focus {
        m.typedAt = Date() // full while it is being written in
        p.makeKeyAndOrderFront(nil)
    } else {
        p.orderFrontRegardless()
    }
    m.apply()
}

@_cdecl("mini_hide")
public func miniHide() {
    Mini.shared.panel?.orderOut(nil)
}

@_cdecl("mini_is_key")
public func miniIsKey() -> Bool {
    Mini.shared.panel?.isKeyWindow ?? false
}

@_cdecl("mini_is_visible")
public func miniIsVisible() -> Bool {
    Mini.shared.panel?.isVisible ?? false
}

/// A key typed in it: full for the pause set.
@_cdecl("mini_typed")
public func miniTyped() {
    Mini.shared.typedAt = Date()
    Mini.shared.apply()
}

/// Something of it open (the palette, the search, a menu): full until it closes.
@_cdecl("mini_pin")
public func miniPin(_ on: Bool) {
    Mini.shared.pinned = on
    Mini.shared.apply()
}

/// ⎋ with nothing to close: the keys go back to the program in front before; the panel stays and fades.
@_cdecl("mini_return_focus")
public func miniReturnFocus() {
    let m = Mini.shared
    m.panel?.resignKey()
    m.previous?.activate()
    m.typedAt = .distantPast
    m.apply()
}

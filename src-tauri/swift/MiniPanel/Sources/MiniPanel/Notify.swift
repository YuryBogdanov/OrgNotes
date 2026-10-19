// «Напоминать завершить день» (ТЗ 32 §5): a notification of macOS; a click on it brings the app forward with the sheet
// «Завершить день» (Rust is told through the callback it gave). Rust calls the functions below (C names).

import Foundation
import UserNotifications

final class Notify: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Notify()
    var onClick: (@convention(c) () -> Void)?
    /// A plugin's notification clicked (ТЗ 55 §4): its tag.
    var onTag: (@convention(c) (UnsafePointer<CChar>) -> Void)?
    var ready = false

    // shown while the app is in front too
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        done([.banner, .sound])
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler done: @escaping () -> Void) {
        let id = response.notification.request.identifier
        if id.hasPrefix("end-day") { onClick?() }
        else if id.hasPrefix("tag:"), let cb = onTag {
            // «tag:<tag>|<time>»
            let tag = String(id.dropFirst(4).split(separator: "|", maxSplits: 1).first ?? "")
            tag.withCString { cb($0) }
        }
        done()
    }
}

/// Notifications need an app bundle: `tauri dev` runs a bare binary, where UNUserNotificationCenter throws.
@_cdecl("notify_available")
public func notifyAvailable() -> Bool {
    Bundle.main.bundleIdentifier != nil && Bundle.main.bundleURL.pathExtension == "app"
}

/// The delegate and the permission (asked once; later calls change nothing). Nothing without a bundle.
@_cdecl("notify_setup")
public func notifySetup(_ onClick: @convention(c) () -> Void) {
    guard notifyAvailable() else { return }
    let n = Notify.shared
    n.onClick = onClick
    if n.ready { return }
    n.ready = true
    let center = UNUserNotificationCenter.current()
    center.delegate = n
    center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
}

/// «Завершить день? Запишите заметку на завтра» now; false — it cannot be shown (no bundle: the window says it).
@_cdecl("notify_end_day")
public func notifyEndDay() -> Bool {
    guard notifyAvailable(), Notify.shared.ready else { return false }
    let content = UNMutableNotificationContent()
    content.title = "Завершить день?"
    content.body = "Запишите заметку на завтра"
    content.sound = .default
    let id = "end-day-\(Int(Date().timeIntervalSince1970))"
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    return true
}

/// Who hears the clicks of the plugins' notifications (ТЗ 55 §4).
@_cdecl("notify_on_tag")
public func notifyOnTag(_ cb: @convention(c) (UnsafePointer<CChar>) -> Void) {
    Notify.shared.onTag = cb
}

/// A notification with a title and a text, its click told by its tag (a plugin's: «agent ждёт ответа»); false — not
/// shown (no bundle, the permission not asked yet).
@_cdecl("notify_text")
public func notifyText(_ title: UnsafePointer<CChar>, _ body: UnsafePointer<CChar>, _ tag: UnsafePointer<CChar>) -> Bool {
    guard notifyAvailable(), Notify.shared.ready else { return false }
    let content = UNMutableNotificationContent()
    content.title = String(cString: title)
    content.body = String(cString: body)
    content.sound = .default
    let id = "tag:\(String(cString: tag))|\(Int(Date().timeIntervalSince1970 * 1000))"
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    return true
}

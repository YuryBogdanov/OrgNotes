// A plugin's PDF (ТЗ 59 §9.3, `ui.exportPdf`): the main webview printed into a file — the page's print style shows
// only the plugin's pages, each one a sheet of `w × h` pt. Vector, its text selectable. The print runs modal for the
// window and ends later: Rust asks `pdf_state` for the job (0 printing, 1 written, 2 failed).

import AppKit
import WebKit

final class PdfJob: NSObject {
    static var states: [UInt32: Int32] = [:]
    static var running: [UInt32: PdfJob] = [:]
    static var next: UInt32 = 1
    let id: UInt32
    init(_ id: UInt32) { self.id = id }
    @objc func done(_ op: NSPrintOperation, success: Bool, contextInfo: UnsafeMutableRawPointer?) {
        PdfJob.states[id] = success ? 1 : 2
        PdfJob.running[id] = nil
    }
}

@_cdecl("pdf_print")
public func pdfPrint(_ webview: UnsafeMutableRawPointer, _ window: UnsafeMutableRawPointer, _ path: UnsafePointer<CChar>, _ w: Double, _ h: Double) -> UInt32 {
    let view = Unmanaged<WKWebView>.fromOpaque(webview).takeUnretainedValue()
    let win = Unmanaged<NSWindow>.fromOpaque(window).takeUnretainedValue()
    let info = NSPrintInfo()
    info.paperSize = NSSize(width: w, height: h)
    info.topMargin = 0
    info.bottomMargin = 0
    info.leftMargin = 0
    info.rightMargin = 0
    info.horizontalPagination = .fit
    info.verticalPagination = .automatic
    info.isHorizontallyCentered = false
    info.isVerticallyCentered = false
    info.orientation = w > h ? .landscape : .portrait
    info.jobDisposition = .save
    info.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = URL(fileURLWithPath: String(cString: path))
    let op = view.printOperation(with: info)
    op.showsPrintPanel = false
    op.showsProgressPanel = false
    // WKWebView's print view has no size of its own until it is given one
    op.view?.frame = view.bounds
    let id = PdfJob.next
    PdfJob.next += 1
    PdfJob.states[id] = 0
    let job = PdfJob(id)
    PdfJob.running[id] = job
    op.runModal(for: win, delegate: job, didRun: #selector(PdfJob.done(_:success:contextInfo:)), contextInfo: nil)
    return id
}

@_cdecl("pdf_state")
public func pdfState(_ id: UInt32) -> Int32 {
    PdfJob.states[id] ?? 2
}

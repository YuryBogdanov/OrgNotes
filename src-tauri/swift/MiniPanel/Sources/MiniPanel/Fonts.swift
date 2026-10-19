// The font families of this Mac for a theme's fonts (ТЗ 57 §6): each with whether it covers Cyrillic, as JSON
// `[{"name":"Avenir","cyr":true},…]`, sorted as macOS sorts them. Rust frees the copy with free().

import AppKit

@_cdecl("font_families_json")
public func fontFamiliesJson() -> UnsafeMutablePointer<CChar>? {
    let fm = NSFontManager.shared
    let cyr = CharacterSet(charactersIn: "АБВЖЯабвжя")
    var out: [[String: Any]] = []
    for family in fm.availableFontFamilies where !family.hasPrefix(".") {
        // the family's first face by its PostScript name: a family's name is not always a font's
        let ps = fm.availableMembers(ofFontFamily: family)?.first?.first as? String
        let font = ps.flatMap { NSFont(name: $0, size: 12) } ?? NSFont(name: family, size: 12)
        let covers = font.map { cyr.isSubset(of: $0.coveredCharacterSet) } ?? false
        out.append(["name": family, "cyr": covers])
    }
    guard let data = try? JSONSerialization.data(withJSONObject: out), let s = String(data: data, encoding: .utf8) else { return nil }
    return strdup(s)
}

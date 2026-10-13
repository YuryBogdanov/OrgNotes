// swift-tools-version:5.9
// The mini window's native panel (ТЗ 31): built by build.rs (swift-rs) into a static library the app links.
import PackageDescription

let package = Package(
    name: "MiniPanel",
    platforms: [.macOS(.v13)],
    products: [.library(name: "MiniPanel", type: .static, targets: ["MiniPanel"])],
    targets: [.target(name: "MiniPanel", path: "Sources/MiniPanel")]
)

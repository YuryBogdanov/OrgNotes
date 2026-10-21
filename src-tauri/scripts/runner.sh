#!/bin/bash
# The cargo runner of the Tauri CLI (build.runner in tauri.conf.json).
# `tauri dev` runs the bare binary, which macOS shows as "org-prototype" in the Dock and as a blank sheet in
# Stage Manager: it is not inside an app bundle. Here `run` builds as usual and then starts the binary from
# target/<profile>/Panopticon-dev.app, a minimal bundle with the app's name and icon. Anything else (`build`
# for `tauri build`) goes to cargo unchanged.
set -e
if [ "$1" != run ]; then exec cargo "$@"; fi
shift
build=()
app=()
while [ $# -gt 0 ]; do
  if [ "$1" = -- ]; then shift; app=("$@"); break; fi
  build+=("$1")
  shift
done
cargo build "${build[@]}"
here="$(cd "$(dirname "$0")/.." && pwd)"
profile=debug
for a in "${build[@]}"; do [ "$a" = --release ] && profile=release; done
target="${CARGO_TARGET_DIR:-$here/target}"
bin="$target/$profile/org-prototype"
bundle="$target/$profile/Panopticon-dev.app/Contents"
mkdir -p "$bundle/MacOS" "$bundle/Resources"
cp "$here/icons/icon.icns" "$bundle/Resources/icon.icns"
cat > "$bundle/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Panopticon</string>
  <key>CFBundleDisplayName</key><string>Panopticon</string>
  <key>CFBundleExecutable</key><string>Panopticon</string>
  <key>CFBundleIdentifier</key><string>dev.local.panopticon</string>
  <key>CFBundleIconFile</key><string>icon.icns</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
# a fresh file each time: copied over the old one it keeps that file's inode, and macOS, which caches a binary's code
# signature by its file, kills the new one at once (exit 137, no word) — `tauri dev` then shows nothing (a hard link
# would keep the old inode too, when cargo replaces the binary)
rm -f "$bundle/MacOS/Panopticon"
cp "$bin" "$bundle/MacOS/Panopticon"
exec "$bundle/MacOS/Panopticon" "${app[@]}"

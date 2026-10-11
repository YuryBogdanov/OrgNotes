#!/bin/bash
# Builds Panopticon.app (Apple Silicon, ad-hoc signed: no Developer ID) and packs it for a GitHub release:
#   dist-release/Panopticon-<version>-macos-arm64.zip
# Usage: scripts/release-mac.sh
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p "require('./src-tauri/tauri.conf.json').version")
npx tauri build --bundles app
app=src-tauri/target/release/bundle/macos/Panopticon.app
codesign --verify --deep --strict "$app" # the whole bundle is sealed, or macOS calls the download damaged
mkdir -p dist-release
zip="dist-release/Panopticon-$version-macos-arm64.zip"
rm -f "$zip"
ditto -c -k --keepParent "$app" "$zip" # ditto keeps the bundle's symlinks, attributes and signature
shasum -a 256 "$zip"
echo "$zip"

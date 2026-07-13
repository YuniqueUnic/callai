#!/usr/bin/env bash
# Generate / refresh package manager manifests from a GitHub Release.
# Usage:
#   ./packaging/scripts/generate_from_release.sh v0.2.1
#   ./packaging/scripts/generate_from_release.sh            # uses latest
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
tag="${1:-}"
if [[ -z "$tag" ]]; then
  tag="$(gh release view -R YuniqueUnic/callai --json tagName --jq .tagName)"
fi
ver="${tag#v}"
repo="YuniqueUnic/callai"
base="https://github.com/${repo}/releases/download/${tag}"
tmp="$(mktemp -d)"
export CALLAI_TMP="$tmp"
export CALLAI_VER="$ver"
trap 'rm -rf "$tmp"' EXIT

echo "==> Fetching assets for ${tag}"
gh release download "$tag" -R "$repo" -D "$tmp" \
  -p "callai_${ver}_aarch64.dmg" \
  -p "callai_${ver}_x64.dmg" \
  -p "callai_${ver}_x64-setup.exe" \
  -p "callai_${ver}_x64_en-US.msi" \
  -p "callai-cli-aarch64-apple-darwin" \
  -p "callai-cli-x86_64-apple-darwin" \
  -p "callai-cli-x86_64-pc-windows-msvc.exe" \
  -p "callai-cli-x86_64-unknown-linux-gnu"

sha() { shasum -a 256 "$1" | awk '{print toupper($1)}'; }
sha_lower() { shasum -a 256 "$1" | awk '{print $1}'; }

dmg_arm="$(sha_lower "$tmp/callai_${ver}_aarch64.dmg")"
dmg_x64="$(sha_lower "$tmp/callai_${ver}_x64.dmg")"
cli_arm="$(sha_lower "$tmp/callai-cli-aarch64-apple-darwin")"
cli_x64_mac="$(sha_lower "$tmp/callai-cli-x86_64-apple-darwin")"
cli_linux="$(sha_lower "$tmp/callai-cli-x86_64-unknown-linux-gnu")"
cli_win="$(sha_lower "$tmp/callai-cli-x86_64-pc-windows-msvc.exe")"
setup_win="$(sha_lower "$tmp/callai_${ver}_x64-setup.exe")"
msi_win="$(sha "$tmp/callai_${ver}_x64_en-US.msi")"
cli_win_up="$(sha "$tmp/callai-cli-x86_64-pc-windows-msvc.exe")"

# MSI ProductCode
product_code="$(python3 "$root/packaging/scripts/msi_product_code.py" "$tmp/callai_${ver}_x64_en-US.msi")"
echo "==> Writing Homebrew Cask/Formula"
mkdir -p "$root/packaging/homebrew/Casks" "$root/packaging/homebrew/Formula"
cat > "$root/packaging/homebrew/Casks/callai-app.rb" <<RB
cask "callai-app" do
  arch arm: "aarch64", intel: "x64"

  version "${ver}"
  sha256 arm:   "${dmg_arm}",
         intel: "${dmg_x64}"

  url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai_#{version}_#{arch}.dmg",
      verified: "github.com/YuniqueUnic/callai/"
  name "callai"
  desc "Cozy AI window-warming alarm (desktop)"
  homepage "https://github.com/YuniqueUnic/callai"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :sonoma

  app "callai.app"

  caveats <<~EOS
    callai desktop builds are not Apple-notarized yet.
    If Gatekeeper blocks the app:

      xattr -dr com.apple.quarantine /Applications/callai.app
      # or: xattr -cr /Applications/callai.app
  EOS

  zap trash: [
    "~/Library/Application Support/com.yunxuan.callai",
    "~/Library/Caches/com.yunxuan.callai",
    "~/Library/Preferences/com.yunxuan.callai.plist",
    "~/Library/WebKit/com.yunxuan.callai",
    "~/.config/callai",
    "~/.local/share/callai",
  ]
end
RB

cat > "$root/packaging/homebrew/Formula/callai.rb" <<RB
class Callai < Formula
  desc "Cozy AI window-warming alarm (CLI / daemon)"
  homepage "https://github.com/YuniqueUnic/callai"
  version "${ver}"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-aarch64-apple-darwin"
      sha256 "${cli_arm}"
    end
    on_intel do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-x86_64-apple-darwin"
      sha256 "${cli_x64_mac}"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-x86_64-unknown-linux-gnu"
      sha256 "${cli_linux}"
    end
  end

  def install
    bin.install Dir["callai-cli-*"].first => "callai"
  end

  test do
    assert_match "callai", shell_output("#{bin}/callai --help")
  end
end
RB

echo "==> Writing Scoop manifests"
mkdir -p "$root/packaging/scoop/bucket"
cat > "$root/packaging/scoop/bucket/callai.json" <<JSON
{
  "version": "${ver}",
  "description": "Cozy AI window-warming alarm (desktop GUI)",
  "homepage": "https://github.com/YuniqueUnic/callai",
  "license": "MIT",
  "architecture": {
    "64bit": {
      "url": "https://github.com/YuniqueUnic/callai/releases/download/v${ver}/callai_${ver}_x64-setup.exe#/callai-setup.exe",
      "hash": "${setup_win}"
    }
  },
  "installer": {
    "script": [
      "Start-Process -FilePath \"\$dir\\\\callai-setup.exe\" -ArgumentList '/S' -Wait"
    ]
  },
  "checkver": { "github": "https://github.com/YuniqueUnic/callai" },
  "autoupdate": {
    "architecture": {
      "64bit": {
        "url": "https://github.com/YuniqueUnic/callai/releases/download/v\$version/callai_\$version_x64-setup.exe#/callai-setup.exe"
      }
    }
  },
  "notes": [
    "Desktop installer is not EV code-signed. SmartScreen may warn.",
    "CLI-only: scoop install callai-cli"
  ]
}
JSON

cat > "$root/packaging/scoop/bucket/callai-cli.json" <<JSON
{
  "version": "${ver}",
  "description": "Cozy AI window-warming alarm (CLI / daemon)",
  "homepage": "https://github.com/YuniqueUnic/callai",
  "license": "MIT",
  "architecture": {
    "64bit": {
      "url": "https://github.com/YuniqueUnic/callai/releases/download/v${ver}/callai-cli-x86_64-pc-windows-msvc.exe#/callai.exe",
      "hash": "${cli_win}"
    }
  },
  "bin": "callai.exe",
  "checkver": { "github": "https://github.com/YuniqueUnic/callai" },
  "autoupdate": {
    "architecture": {
      "64bit": {
        "url": "https://github.com/YuniqueUnic/callai/releases/download/v\$version/callai-cli-x86_64-pc-windows-msvc.exe#/callai.exe"
      }
    }
  }
}
JSON

echo "==> Writing Winget manifests"
pub=YuniqueUnic
for kind in Callai Callai.CLI; do
  d="$root/packaging/winget/manifests/y/${pub}/${kind}/${ver}"
  mkdir -p "$d"
done

# GUI winget
gdir="$root/packaging/winget/manifests/y/${pub}/Callai/${ver}"
cat > "$gdir/${pub}.Callai.yaml" <<YAML
PackageIdentifier: ${pub}.Callai
PackageVersion: ${ver}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
YAML
cat > "$gdir/${pub}.Callai.installer.yaml" <<YAML
PackageIdentifier: ${pub}.Callai
PackageVersion: ${ver}
InstallerLocale: en-US
InstallerType: wix
Scope: user
InstallModes:
  - interactive
  - silent
  - silentWithProgress
UpgradeBehavior: install
Installers:
  - Architecture: x64
    InstallerUrl: https://github.com/YuniqueUnic/callai/releases/download/v${ver}/callai_${ver}_x64_en-US.msi
    InstallerSha256: ${msi_win}
    ProductCode: '${product_code}'
ManifestType: installer
ManifestVersion: 1.6.0
YAML
cat > "$gdir/${pub}.Callai.locale.en-US.yaml" <<YAML
PackageIdentifier: ${pub}.Callai
PackageVersion: ${ver}
PackageLocale: en-US
Publisher: YuniqueUnic
PublisherUrl: https://github.com/YuniqueUnic
PublisherSupportUrl: https://github.com/YuniqueUnic/callai/issues
Author: unic
PackageName: callai
PackageUrl: https://github.com/YuniqueUnic/callai
License: MIT
LicenseUrl: https://github.com/YuniqueUnic/callai/blob/main/LICENSE
ShortDescription: Cozy AI window-warming alarm (desktop)
Description: callai schedules lightweight tasks to keep AI rolling usage windows warm. Tauri desktop + CLI.
Moniker: callai
Tags:
  - ai
  - alarm
  - tauri
  - scheduler
ReleaseNotesUrl: https://github.com/YuniqueUnic/callai/releases/tag/v${ver}
ManifestType: defaultLocale
ManifestVersion: 1.6.0
YAML

# CLI winget portable
cdir="$root/packaging/winget/manifests/y/${pub}/Callai.CLI/${ver}"
cat > "$cdir/${pub}.Callai.CLI.yaml" <<YAML
PackageIdentifier: ${pub}.Callai.CLI
PackageVersion: ${ver}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
YAML
cat > "$cdir/${pub}.Callai.CLI.installer.yaml" <<YAML
PackageIdentifier: ${pub}.Callai.CLI
PackageVersion: ${ver}
InstallerLocale: en-US
InstallerType: portable
Commands:
  - callai
UpgradeBehavior: install
Installers:
  - Architecture: x64
    InstallerUrl: https://github.com/YuniqueUnic/callai/releases/download/v${ver}/callai-cli-x86_64-pc-windows-msvc.exe
    InstallerSha256: ${cli_win_up}
ManifestType: installer
ManifestVersion: 1.6.0
YAML
cat > "$cdir/${pub}.Callai.CLI.locale.en-US.yaml" <<YAML
PackageIdentifier: ${pub}.Callai.CLI
PackageVersion: ${ver}
PackageLocale: en-US
Publisher: YuniqueUnic
PublisherUrl: https://github.com/YuniqueUnic
PublisherSupportUrl: https://github.com/YuniqueUnic/callai/issues
Author: unic
PackageName: callai CLI
PackageUrl: https://github.com/YuniqueUnic/callai
License: MIT
LicenseUrl: https://github.com/YuniqueUnic/callai/blob/main/LICENSE
ShortDescription: Cozy AI window-warming alarm (CLI / daemon)
Description: Headless callai CLI. Commands include list, run, daemon, run-once, validate, app.
Moniker: callai-cli
Tags:
  - ai
  - cli
  - daemon
ReleaseNotesUrl: https://github.com/YuniqueUnic/callai/releases/tag/v${ver}
ManifestType: defaultLocale
ManifestVersion: 1.6.0
YAML

echo "==> Done for ${tag}"
echo "Homebrew tap (local): brew install --cask ./packaging/homebrew/Casks/callai-app.rb"
echo "                 or: brew install ./packaging/homebrew/Formula/callai.rb"

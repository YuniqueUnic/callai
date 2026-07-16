cask "callai-app" do
  arch arm: "aarch64", intel: "x64"

  version "0.3.0"
  sha256 arm:   "d04c3350e1dbf678fb9a753f838ed194b56fc3f287a01943ea6682b17ac69ee9",
         intel: "268e536ca31b8f544a0dceaf9f230499c5c935d3c5eaa757ded8fd2d34ff325f"

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

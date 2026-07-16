cask "callai-app" do
  arch arm: "aarch64", intel: "x64"

  version "0.3.1"
  sha256 arm:   "84de741c88c00204b2578e29dec67a5a96489a96897e8021f6391e534f0f0b65",
         intel: "a1e6898c64c3b209e3003cfaf1057e891afb05bce926bae84ab7573380e0d73d"

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

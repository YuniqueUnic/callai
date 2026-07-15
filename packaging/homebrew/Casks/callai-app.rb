cask "callai-app" do
  arch arm: "aarch64", intel: "x64"

  version "0.2.8"
  sha256 arm:   "9efdc67a33e19029fcc22202335e46da16b890e4be55e877bbe8ec2a4f482edb",
         intel: "76dc9eaebbcbf3e1c50b2564303184bbf0105c3bab380d1fc7cef9f68db7c0e3"

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

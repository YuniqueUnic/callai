cask "callai-app" do
  arch arm: "aarch64", intel: "x64"

  version "0.2.1"
  sha256 arm:   "16a331fde9f13cbfa08adabd17b76eb9547463f2a1b137b6d5d2925e2918f310",
         intel: "468037baf487fda87d4e0cbe8f98eaccee4e728461a8af5c288141cbc09e5bd0"

  url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai_#{version}_#{arch}.dmg",
      verified: "github.com/YuniqueUnic/callai/"
  name "callai"
  desc "Cozy AI window-warming alarm (desktop)"
  homepage "https://github.com/YuniqueUnic/callai"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :sonoma"

  app "callai.app"

  # Unsigned builds: users may need:
  #   xattr -cr /Applications/callai.app
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

cask "callai-app" do
  arch arm: "aarch64", intel: "x64"

  version "0.2.6"
  sha256 arm:   "5031dc62cdf4b531913161754c1f8f2a0d24b04056f7070029fe85da67c5443c",
         intel: "e6676b0f22803d3f63bb709e77a0c69858b2b15f45f1bfd2371f60dfa1d81cdc"

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

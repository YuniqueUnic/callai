class Callai < Formula
  desc "Cozy AI window-warming alarm (CLI / daemon)"
  homepage "https://github.com/YuniqueUnic/callai"
  version "0.3.1"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-aarch64-apple-darwin"
      sha256 "df8e804cc17839bb2696c25ba98f88a018dc0ff9c9894e896b1380f3746db7a9"
    end
    on_intel do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-x86_64-apple-darwin"
      sha256 "b27e0733c84bf0204a7f58a79edff55d57299875256897f78f9da575afb3f1ec"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-x86_64-unknown-linux-gnu"
      sha256 "1b6eac148e5143cc00e777e618434c45181110f9c0233d849601a450983848aa"
    end
  end

  def install
    bin.install Dir["callai-cli-*"].first => "callai"
  end

  test do
    assert_match "callai", shell_output("#{bin}/callai --help")
  end
end

class Callai < Formula
  desc "Cozy AI window-warming alarm (CLI / daemon)"
  homepage "https://github.com/YuniqueUnic/callai"
  version "0.2.7"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-aarch64-apple-darwin"
      sha256 "e8bf195ac955d3ebf59081543ce5e89d7588cec50ebbccd7f3c43ecae86dc2ff"
    end
    on_intel do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-x86_64-apple-darwin"
      sha256 "b5e080e59574ac4ff7790cbccec21564ff486ee7ba0f43fb3b0b4e09a95eb03d"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-x86_64-unknown-linux-gnu"
      sha256 "bb04377a480ea96adfdccfd5f5363e4abcfaac807d8693d7afebdecdb0c4ead0"
    end
  end

  def install
    bin.install Dir["callai-cli-*"].first => "callai"
  end

  test do
    assert_match "callai", shell_output("#{bin}/callai --help")
  end
end

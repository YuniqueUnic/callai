class Callai < Formula
  desc "Cozy AI window-warming alarm (CLI / daemon)"
  homepage "https://github.com/YuniqueUnic/callai"
  version "0.2.1"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-aarch64-apple-darwin"
      sha256 "109e97e3c214ab01af7aa0d1a1cb53f539ff903c2e67ed55a2ad92ae2c8cb51b"
    end
    on_intel do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-x86_64-apple-darwin"
      sha256 "683e46f53334d44ceba96958eb035d837f4a4da99b9bf20ab5cc206beca630d7"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-x86_64-unknown-linux-gnu"
      sha256 "0cd3786bf64f503d7890ff1ffe70ea9b4486d26bf4b3e7f5c32fa73112ba59f3"
    end
  end

  def install
    bin.install Dir["callai-cli-*"].first => "callai"
  end

  test do
    assert_match "callai", shell_output("#{bin}/callai --help")
  end
end

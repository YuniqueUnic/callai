class Callai < Formula
  desc "Cozy AI window-warming alarm (CLI / daemon)"
  homepage "https://github.com/YuniqueUnic/callai"
  version "0.2.4"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-aarch64-apple-darwin"
      sha256 "bda551af0e2f1bb2c606b13bea816294b690b947c89625c4fe34a6774f2c974e"
    end
    on_intel do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-x86_64-apple-darwin"
      sha256 "c4b0929c7c525dd8ff6dd3d7fb97e46cc1b5bac36ebf8ab0436419a7ac662061"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/YuniqueUnic/callai/releases/download/v#{version}/callai-cli-x86_64-unknown-linux-gnu"
      sha256 "f5efd06eba7ee33fe05dcb0ad38feb1455d906fa579c8f5b386d238f040c39eb"
    end
  end

  def install
    bin.install Dir["callai-cli-*"].first => "callai"
  end

  test do
    assert_match "callai", shell_output("#{bin}/callai --help")
  end
end

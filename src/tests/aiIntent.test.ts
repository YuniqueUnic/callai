import { describe, expect, it } from "vitest";
import {
  guessIntent,
  isFreeformProseResponse,
  resolveSendIntent,
} from "../ai/generate";

describe("resolveSendIntent", () => {
  it("honors explicit chat even when text looks like alarm", () => {
    expect(resolveSendIntent("chat")).toBe("chat");
    expect(resolveSendIntent("chat", undefined)).toBe("chat");
  });

  it("honors explicit alarm and plugin", () => {
    expect(resolveSendIntent("alarm")).toBe("alarm");
    expect(resolveSendIntent("plugin")).toBe("plugin");
  });

  it("retry override wins over selected mode", () => {
    expect(resolveSendIntent("chat", "alarm")).toBe("alarm");
    expect(resolveSendIntent("alarm", "chat")).toBe("chat");
  });
});

describe("guessIntent", () => {
  it("detects remind keywords (soft guess only)", () => {
    expect(guessIntent("每天提醒我浇花")).toBe("alarm");
    expect(guessIntent("写一个番茄插件")).toBe("plugin");
    expect(guessIntent("callai 能做什么")).toBe("chat");
  });
});

describe("isFreeformProseResponse", () => {
  it("detects pure markdown chat answers", () => {
    const raw = `哇，好问题！

### 喝水提醒
- 每隔 1 小时

想做哪个？`;
    expect(isFreeformProseResponse(raw)).toBe(true);
  });

  it("rejects leading JSON drafts", () => {
    expect(isFreeformProseResponse(`{"name":"x","enabled":true}`)).toBe(false);
    expect(isFreeformProseResponse("```json\n{\n  \"name\": \"a\"\n}\n```")).toBe(
      false,
    );
  });
});

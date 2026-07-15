import { describe, expect, it } from "vitest";
import {
  fromStored,
  messageText,
  selectable,
  toStored,
  type ChatMsg,
} from "../ai/chatHistory";
import type { AiChatMessage } from "../domain/types";

describe("chatHistory mapping", () => {
  it("round-trips user and error with raw", () => {
    const err: ChatMsg = {
      id: "e1",
      role: "assistant",
      kind: "error",
      content: "parse fail",
      createdAt: "2026-07-15T00:00:00.000Z",
      retryText: "每天 16:50",
      retryIntent: "alarm",
      raw: "{broken",
    };
    const stored = toStored(err)!;
    expect(stored.kind).toBe("error");
    const back = fromStored(stored)!;
    expect(back.role).toBe("assistant");
    if (back.role === "assistant" && back.kind === "error") {
      expect(back.retryText).toBe("每天 16:50");
      expect(back.retryIntent).toBe("alarm");
      expect(back.raw).toBe("{broken");
    }
  });

  it("skips generating for storage", () => {
    const g: ChatMsg = {
      id: "g",
      role: "assistant",
      kind: "generating",
      content: "…",
      createdAt: "2026-07-15T00:00:00.000Z",
    };
    expect(toStored(g)).toBeNull();
    expect(selectable(g)).toBe(false);
  });

  it("messageText includes draft json", () => {
    const m: ChatMsg = {
      id: "a",
      role: "assistant",
      kind: "alarm_draft",
      content: "ready",
      createdAt: "2026-07-15T00:00:00.000Z",
      draft: {
        name: "x",
        enabled: true,
        schedule: { mode: "daily", times: ["16:50"] },
        binary: "__callai_alarm__",
        args: ["hi"],
        env_vars: [],
        retry: { interval: "1m", max_attempts: 1 },
        timeout_secs: 20,
      },
    };
    expect(messageText(m)).toContain("16:50");
  });

  it("fromStored recovers broken draft as error", () => {
    const row: AiChatMessage = {
      id: "bad",
      role: "assistant",
      kind: "alarm_draft",
      content: "oops",
      payload_json: "not-json",
      created_at: "2026-07-15T00:00:00.000Z",
      applied: false,
    };
    const m = fromStored(row)!;
    expect(m.role).toBe("assistant");
    if (m.role === "assistant") expect(m.kind).toBe("error");
  });
});

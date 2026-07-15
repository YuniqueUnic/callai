import { describe, expect, it } from "vitest";

/**
 * Mirrors src/ai/generate.ts browserSafeFetch behavior for unit test isolation.
 */
function stripUserAgentHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers ?? undefined);
  for (const key of ["user-agent", "User-Agent"]) {
    headers.delete(key);
  }
  return headers;
}

describe("browserSafeFetch headers", () => {
  it("removes User-Agent so CORS preflight stays simple", () => {
    const h = stripUserAgentHeaders({
      headers: {
        Authorization: "Bearer x",
        "User-Agent": "ai-sdk/x",
        "user-agent": "also",
        "Content-Type": "application/json",
      },
    });
    expect(h.get("Authorization")).toBe("Bearer x");
    expect(h.get("Content-Type")).toBe("application/json");
    expect(h.get("User-Agent")).toBeNull();
    expect(h.get("user-agent")).toBeNull();
  });
});

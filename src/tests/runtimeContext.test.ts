import { describe, expect, it } from "vitest";
import {
  formatRuntimeContextBlock,
  type AiRuntimeContextDto,
} from "../ai/runtimeContext";

const sample: AiRuntimeContextDto = {
  app_name: "callai",
  app_version: "0.2.7",
  os_family: "macos",
  os_name: "Mac OS",
  os_version: "15.0",
  arch: "aarch64",
  locale: "zh-CN",
  theme: "system",
  timezone_setting: "system",
  timezone_resolved: "Asia/Shanghai",
  sound_enabled: true,
  notify_on_failure: false,
  launch_minimized: false,
  auto_backup_on_start: true,
  log_retention_days: 30,
  ai_provider: "openai",
  ai_model: "gpt-5.6-terra",
  ai_base_host: "api.openai.com",
  mcp_enabled: false,
  mcp_listen: "127.0.0.1:3927",
  now_local: "2026-07-15T12:00:00+08:00",
  now_utc: "2026-07-15T04:00:00Z",
  shell_hint: "zsh",
  path_sep: "/",
  config_dir: "/cfg",
  data_dir: "/data",
  notes: ["Never echo secrets."],
};

describe("formatRuntimeContextBlock", () => {
  it("includes key environment fields and no secret keys", () => {
    const block = formatRuntimeContextBlock(sample);
    expect(block).toContain("<callai_runtime_context>");
    expect(block).toContain("os: macos");
    expect(block).toContain("timezone.resolved: Asia/Shanghai");
    expect(block).toContain("ai.model: gpt-5.6-terra");
    expect(block).not.toContain("api_key");
    expect(block).not.toContain("auth_token");
  });
});

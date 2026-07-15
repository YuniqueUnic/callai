import { describe, expect, it } from "vitest";
import {
  isLikelyTruncatedPluginOutput,
  parsePluginDraftFromModelText,
} from "../ai/parsePluginOutput";
import { AiParseError } from "../ai/parseShared";

const MANIFEST = {
  id: "todo-board",
  name: "TODO小岛",
  version: "0.1.0",
  description: "每日 TODO",
  permissions: ["storage"],
  ui: "ui.html",
};

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"/><title>TODO</title></head>
<body><div id="root">todo</div></body>
</html>`;

describe("parsePluginDraftFromModelText", () => {
  it("parses dual-part JSON + html fence", () => {
    const raw = `{"manifest":${JSON.stringify(MANIFEST)}}

\`\`\`html
${HTML}
\`\`\``;
    const draft = parsePluginDraftFromModelText(raw);
    expect(draft.manifest.id).toBe("todo-board");
    expect(draft.ui_html).toContain("<!DOCTYPE html>");
    expect(draft.ui_html).toContain("id=\"root\"");
  });

  it("parses dual-part with prose thinking before JSON", () => {
    const raw = `先规划一下布局，再输出。

{
  "manifest": ${JSON.stringify(MANIFEST)}
}

ui.html
\`\`\`html
${HTML}
\`\`\``;
    const draft = parsePluginDraftFromModelText(raw);
    expect(draft.manifest.name).toBe("TODO小岛");
    expect(draft.ui_html).toContain("</html>");
  });

  it("accepts legacy JSON with ui_html embedded", () => {
    const raw = JSON.stringify({
      manifest: MANIFEST,
      ui_html: HTML,
    });
    const draft = parsePluginDraftFromModelText(raw);
    expect(draft.ui_html).toContain("todo");
  });

  it("extracts raw html document after manifest", () => {
    const raw = `${JSON.stringify({ manifest: MANIFEST })}

${HTML}`;
    const draft = parsePluginDraftFromModelText(raw);
    expect(draft.ui_html.toLowerCase()).toContain("</html>");
  });

  it("throws AiParseError when html missing", () => {
    const raw = JSON.stringify({ manifest: MANIFEST });
    expect(() => parsePluginDraftFromModelText(raw)).toThrow(AiParseError);
  });
});

describe("isLikelyTruncatedPluginOutput", () => {
  it("detects unclosed html fence", () => {
    expect(
      isLikelyTruncatedPluginOutput(
        `{"manifest":${JSON.stringify(MANIFEST)}}\n\n\`\`\`html\n<html>`,
      ),
    ).toBe(true);
  });

  it("detects missing closing html tag", () => {
    expect(
      isLikelyTruncatedPluginOutput(
        `{"manifest":{"id":"a","name":"a","version":"0.1.0","description":"","permissions":[],"ui":"ui.html"}}\n\n<!DOCTYPE html><html><body>hi`,
      ),
    ).toBe(true);
  });

  it("accepts complete dual-part", () => {
    const raw = `{"manifest":${JSON.stringify(MANIFEST)}}\n\n\`\`\`html\n${HTML}\n\`\`\``;
    expect(isLikelyTruncatedPluginOutput(raw)).toBe(false);
  });
});

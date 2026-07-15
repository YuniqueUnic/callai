import type {
  AiChatKind,
  AiChatMessage,
  AlarmDraft,
  PluginDraft,
} from "../domain/types";
import type { AiIntent } from "./generate";

export type StreamPhase = "connecting" | "waiting" | "streaming" | "done";

export type ChatMsg =
  | {
      id: string;
      role: "user";
      content: string;
      createdAt: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "text";
      content: string;
      createdAt: string;
      thinking?: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "generating";
      content: string;
      createdAt: string;
      streamText?: string;
      thinking?: string;
      progress?: {
        phase: StreamPhase;
        chars: number;
        elapsedMs: number;
      };
    }
  | {
      id: string;
      role: "assistant";
      kind: "error";
      content: string;
      createdAt: string;
      retryText: string;
      retryIntent: AiIntent;
      raw?: string;
      thinking?: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "alarm_draft";
      content: string;
      createdAt: string;
      draft: AlarmDraft;
      applied?: boolean;
      thinking?: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "plugin_draft";
      content: string;
      createdAt: string;
      draft: PluginDraft;
      applied?: boolean;
      thinking?: string;
    };

export function nowIso(): string {
  return new Date().toISOString();
}

export function selectable(m: ChatMsg): boolean {
  return !(m.role === "assistant" && m.kind === "generating");
}

export function messageText(m: ChatMsg): string {
  if (m.role === "user") return m.content;
  const think =
    m.role === "assistant" && m.thinking
      ? `--- thinking ---\n${m.thinking}\n\n`
      : "";
  if (m.kind === "alarm_draft") {
    return `${think}${m.content}\n${JSON.stringify(m.draft, null, 2)}`;
  }
  if (m.kind === "plugin_draft") {
    return `${think}${m.content}\n${JSON.stringify(m.draft, null, 2)}`;
  }
  if (m.kind === "error") {
    const raw = m.raw ? `\n\n--- raw ---\n${m.raw}` : "";
    return `${think}${m.content}${raw}`;
  }
  if (m.kind === "generating") return m.streamText || m.content;
  // text
  return `${think}${m.content}`;
}

export function toStored(m: ChatMsg): AiChatMessage | null {
  if (m.role === "assistant" && m.kind === "generating") return null;
  if (m.role === "user") {
    return {
      id: m.id,
      role: "user",
      kind: "text",
      content: m.content,
      payload_json: "",
      created_at: m.createdAt,
      applied: false,
    };
  }
  if (m.kind === "text") {
    return {
      id: m.id,
      role: "assistant",
      kind: "text",
      content: m.content,
      payload_json: m.thinking
        ? JSON.stringify({ thinking: m.thinking })
        : "",
      created_at: m.createdAt,
      applied: false,
    };
  }
  if (m.kind === "error") {
    return {
      id: m.id,
      role: "assistant",
      kind: "error",
      content: m.content,
      payload_json: JSON.stringify({
        retryText: m.retryText,
        retryIntent: m.retryIntent,
        raw: m.raw ?? "",
        thinking: m.thinking ?? "",
      }),
      created_at: m.createdAt,
      applied: false,
    };
  }
  if (m.kind === "alarm_draft") {
    return {
      id: m.id,
      role: "assistant",
      kind: "alarm_draft",
      content: m.content,
      payload_json: JSON.stringify({
        draft: m.draft,
        thinking: m.thinking ?? "",
      }),
      created_at: m.createdAt,
      applied: Boolean(m.applied),
    };
  }
  return {
    id: m.id,
    role: "assistant",
    kind: "plugin_draft",
    content: m.content,
    payload_json: JSON.stringify({
      draft: m.draft,
      thinking: m.thinking ?? "",
    }),
    created_at: m.createdAt,
    applied: Boolean(m.applied),
  };
}

function parseDraftPayload<T>(
  payload_json: string,
): { draft: T; thinking: string } {
  const parsed = JSON.parse(payload_json) as T | { draft: T; thinking?: string };
  if (parsed && typeof parsed === "object" && "draft" in (parsed as object)) {
    const wrap = parsed as { draft: T; thinking?: string };
    return { draft: wrap.draft, thinking: String(wrap.thinking ?? "") };
  }
  return { draft: parsed as T, thinking: "" };
}

export function fromStored(row: AiChatMessage): ChatMsg | null {
  const createdAt = row.created_at || nowIso();
  if (row.role === "user") {
    return { id: row.id, role: "user", content: row.content, createdAt };
  }
  const kind = (row.kind || "text") as AiChatKind;
  if (kind === "text") {
    let thinking = "";
    try {
      const p = JSON.parse(row.payload_json || "{}") as { thinking?: string };
      thinking = p.thinking ?? "";
    } catch {
      /* empty */
    }
    return {
      id: row.id,
      role: "assistant",
      kind: "text",
      content: row.content,
      createdAt,
      thinking: thinking || undefined,
    };
  }
  if (kind === "error") {
    let retryText = "";
    let retryIntent: AiIntent = "chat";
    let raw = row.payload_json || "";
    let thinking = "";
    try {
      const p = JSON.parse(row.payload_json || "{}") as {
        retryText?: string;
        retryIntent?: AiIntent;
        raw?: string;
        thinking?: string;
      };
      retryText = p.retryText ?? "";
      retryIntent = p.retryIntent ?? "chat";
      raw = p.raw ?? row.payload_json ?? "";
      thinking = p.thinking ?? "";
    } catch {
      /* raw */
    }
    return {
      id: row.id,
      role: "assistant",
      kind: "error",
      content: row.content,
      createdAt,
      retryText,
      retryIntent,
      raw,
      thinking: thinking || undefined,
    };
  }
  if (kind === "alarm_draft") {
    try {
      const { draft, thinking } = parseDraftPayload<AlarmDraft>(
        row.payload_json,
      );
      return {
        id: row.id,
        role: "assistant",
        kind: "alarm_draft",
        content: row.content,
        createdAt,
        draft,
        applied: row.applied,
        thinking: thinking || undefined,
      };
    } catch {
      return {
        id: row.id,
        role: "assistant",
        kind: "error",
        content: row.content,
        createdAt,
        retryText: "",
        retryIntent: "alarm",
        raw: row.payload_json,
      };
    }
  }
  if (kind === "plugin_draft") {
    try {
      const { draft, thinking } = parseDraftPayload<PluginDraft>(
        row.payload_json,
      );
      return {
        id: row.id,
        role: "assistant",
        kind: "plugin_draft",
        content: row.content,
        createdAt,
        draft,
        applied: row.applied,
        thinking: thinking || undefined,
      };
    } catch {
      return {
        id: row.id,
        role: "assistant",
        kind: "error",
        content: row.content,
        createdAt,
        retryText: "",
        retryIntent: "plugin",
        raw: row.payload_json,
      };
    }
  }
  return null;
}

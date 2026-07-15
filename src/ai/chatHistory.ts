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
    }
  | {
      id: string;
      role: "assistant";
      kind: "generating";
      content: string;
      createdAt: string;
      streamText?: string;
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
    }
  | {
      id: string;
      role: "assistant";
      kind: "alarm_draft";
      content: string;
      createdAt: string;
      draft: AlarmDraft;
      applied?: boolean;
    }
  | {
      id: string;
      role: "assistant";
      kind: "plugin_draft";
      content: string;
      createdAt: string;
      draft: PluginDraft;
      applied?: boolean;
    };

export function nowIso(): string {
  return new Date().toISOString();
}

export function selectable(m: ChatMsg): boolean {
  return !(m.role === "assistant" && m.kind === "generating");
}

export function messageText(m: ChatMsg): string {
  if (m.role === "user") return m.content;
  if (m.kind === "alarm_draft") {
    return `${m.content}\n${JSON.stringify(m.draft, null, 2)}`;
  }
  if (m.kind === "plugin_draft") {
    return `${m.content}\n${JSON.stringify(m.draft, null, 2)}`;
  }
  if (m.kind === "error") {
    return m.raw ? `${m.content}\n\n--- raw ---\n${m.raw}` : m.content;
  }
  if (m.kind === "generating") return m.streamText || m.content;
  return m.content;
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
      payload_json: "",
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
      payload_json: JSON.stringify(m.draft),
      created_at: m.createdAt,
      applied: Boolean(m.applied),
    };
  }
  return {
    id: m.id,
    role: "assistant",
    kind: "plugin_draft",
    content: m.content,
    payload_json: JSON.stringify(m.draft),
    created_at: m.createdAt,
    applied: Boolean(m.applied),
  };
}

export function fromStored(row: AiChatMessage): ChatMsg | null {
  const createdAt = row.created_at || nowIso();
  if (row.role === "user") {
    return { id: row.id, role: "user", content: row.content, createdAt };
  }
  const kind = (row.kind || "text") as AiChatKind;
  if (kind === "text") {
    return {
      id: row.id,
      role: "assistant",
      kind: "text",
      content: row.content,
      createdAt,
    };
  }
  if (kind === "error") {
    let retryText = "";
    let retryIntent: AiIntent = "chat";
    let raw = row.payload_json || "";
    try {
      const p = JSON.parse(row.payload_json || "{}") as {
        retryText?: string;
        retryIntent?: AiIntent;
        raw?: string;
      };
      retryText = p.retryText ?? "";
      retryIntent = p.retryIntent ?? "chat";
      raw = p.raw ?? row.payload_json ?? "";
    } catch {
      /* raw payload */
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
    };
  }
  if (kind === "alarm_draft") {
    try {
      const draft = JSON.parse(row.payload_json) as AlarmDraft;
      return {
        id: row.id,
        role: "assistant",
        kind: "alarm_draft",
        content: row.content,
        createdAt,
        draft,
        applied: row.applied,
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
      const draft = JSON.parse(row.payload_json) as PluginDraft;
      return {
        id: row.id,
        role: "assistant",
        kind: "plugin_draft",
        content: row.content,
        createdAt,
        draft,
        applied: row.applied,
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

/**
 * Streaming-friendly Markdown for AI bubbles.
 * Uses Streamdown (Vercel) — handles incomplete fences/lists mid-stream.
 * @see https://www.npmjs.com/package/streamdown
 */
import { memo } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";

interface Props {
  /** Markdown / plain text from the model. */
  children: string;
  className?: string;
  /** When true, optimizes for live token stream (default). */
  streaming?: boolean;
}

function AiMarkdownImpl({ children, className, streaming = true }: Props) {
  const text = children ?? "";
  if (!text) return null;
  return (
    <div
      className={["ai-md", streaming ? "ai-md-streaming" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <Streamdown mode={streaming ? "streaming" : "static"}>{text}</Streamdown>
    </div>
  );
}

export const AiMarkdown = memo(AiMarkdownImpl);

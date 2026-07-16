/**
 * Streaming-friendly Markdown for AI bubbles.
 * Uses Streamdown (Vercel) — handles incomplete fences/lists mid-stream.
 * @see https://www.npmjs.com/package/streamdown
 *
 * Streamdown's default table wraps in `data-streamdown="table-wrapper"` with
 * control toolbars / double borders. Without Tailwind that chrome collapses
 * into a tall empty band above tables. Override table primitives for density.
 */
import { memo, type ComponentPropsWithoutRef, type ElementType } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";

interface Props {
  children: string;
  className?: string;
  streaming?: boolean;
}

const STREAMDOWN_CONTROLS = false as const;

type SdExtra = { node?: unknown; className?: string };

function stripSdProps<T extends SdExtra>(props: T) {
  const { node: _node, ...rest } = props;
  return rest;
}

function MdTable(props: ComponentPropsWithoutRef<"table"> & SdExtra) {
  const { children, className, ...rest } = stripSdProps(props);
  return (
    <div className="ai-md-table-scroll">
      <table
        className={["ai-md-table", className].filter(Boolean).join(" ")}
        data-streamdown="table"
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}

function MdThead(props: ComponentPropsWithoutRef<"thead"> & SdExtra) {
  const { className, ...rest } = stripSdProps(props);
  return (
    <thead
      className={["ai-md-thead", className].filter(Boolean).join(" ")}
      data-streamdown="table-header"
      {...rest}
    />
  );
}

function MdTbody(props: ComponentPropsWithoutRef<"tbody"> & SdExtra) {
  const { className, ...rest } = stripSdProps(props);
  return (
    <tbody
      className={["ai-md-tbody", className].filter(Boolean).join(" ")}
      data-streamdown="table-body"
      {...rest}
    />
  );
}

function MdTr(props: ComponentPropsWithoutRef<"tr"> & SdExtra) {
  const { className, ...rest } = stripSdProps(props);
  return (
    <tr
      className={["ai-md-tr", className].filter(Boolean).join(" ")}
      data-streamdown="table-row"
      {...rest}
    />
  );
}

function MdTh(props: ComponentPropsWithoutRef<"th"> & SdExtra) {
  const { className, ...rest } = stripSdProps(props);
  return (
    <th
      className={["ai-md-th", className].filter(Boolean).join(" ")}
      data-streamdown="table-header-cell"
      {...rest}
    />
  );
}

function MdTd(props: ComponentPropsWithoutRef<"td"> & SdExtra) {
  const { className, ...rest } = stripSdProps(props);
  return (
    <td
      className={["ai-md-td", className].filter(Boolean).join(" ")}
      data-streamdown="table-cell"
      {...rest}
    />
  );
}

function mdHeading(Tag: ElementType, extra = "") {
  return function Heading(props: ComponentPropsWithoutRef<"h1"> & SdExtra) {
    const { className, ...rest } = stripSdProps(props);
    return (
      <Tag
        className={["ai-md-h", extra, className].filter(Boolean).join(" ")}
        {...rest}
      />
    );
  };
}

const MD_COMPONENTS = {
  table: MdTable,
  thead: MdThead,
  tbody: MdTbody,
  tr: MdTr,
  th: MdTh,
  td: MdTd,
  h1: mdHeading("h1", "ai-md-h1"),
  h2: mdHeading("h2", "ai-md-h2"),
  h3: mdHeading("h3", "ai-md-h3"),
  h4: mdHeading("h4", "ai-md-h4"),
  h5: mdHeading("h5", "ai-md-h5"),
  h6: mdHeading("h6", "ai-md-h6"),
};

function AiMarkdownImpl({ children, className, streaming = true }: Props) {
  const text = children ?? "";
  if (!text) return null;
  return (
    <div
      className={["ai-md", streaming ? "ai-md-streaming" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <Streamdown
        mode={streaming ? "streaming" : "static"}
        controls={STREAMDOWN_CONTROLS}
        lineNumbers={false}
        components={MD_COMPONENTS}
        className="ai-md-streamdown"
      >
        {text}
      </Streamdown>
    </div>
  );
}

export const AiMarkdown = memo(AiMarkdownImpl);

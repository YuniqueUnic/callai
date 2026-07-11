import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

type ToastKind = "success" | "info" | "warning" | "error";

export type ToastInput = {
  message: string;
  description?: string;
  duration?: number;
  key?: string;
  btn?: ReactNode;
};

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  description?: string;
  duration: number;
  btn?: ReactNode;
  leaving?: boolean;
};

let items: ToastItem[] = [];
let rootEl: HTMLDivElement | null = null;
let root: Root | null = null;
let seq = 0;

function ensureRoot() {
  if (typeof document === "undefined") return;
  if (rootEl && root) return;
  rootEl = document.createElement("div");
  rootEl.setAttribute("data-callai-toast-root", "1");
  rootEl.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483000",
    "pointer-events:none",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "padding:20px 12px 0",
    "gap:10px",
    "box-sizing:border-box",
  ].join(";");
  document.body.appendChild(rootEl);
  root = createRoot(rootEl);
  paint();
}

function paint() {
  if (!root) return;
  root.render(
    createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          width: "100%",
          maxWidth: 420,
          pointerEvents: "none",
        },
      },
      ...items.map((item) =>
        createElement(
          "div",
          {
            key: item.id,
            role: "status",
            "aria-live": "polite",
            className: `callai-toast callai-toast-${item.kind}${item.leaving ? " is-leaving" : ""}`,
            style: { pointerEvents: "auto" },
          },
          createElement("div", { className: "callai-toast-icon", "aria-hidden": true }, iconFor(item.kind)),
          createElement(
            "div",
            { className: "callai-toast-body" },
            createElement("div", { className: "callai-toast-title" }, item.message),
            item.description
              ? createElement("div", { className: "callai-toast-desc" }, item.description)
              : null,
          ),
          item.btn
            ? createElement("div", { className: "callai-toast-btn" }, item.btn)
            : null,
          createElement(
            "button",
            {
              type: "button",
              className: "callai-toast-close",
              "aria-label": "close",
              onClick: () => dismiss(item.id),
            },
            "×",
          ),
        ),
      ),
    ),
  );
}

function iconFor(kind: ToastKind): string {
  switch (kind) {
    case "success":
      return "✓";
    case "warning":
      return "!";
    case "error":
      return "×";
    default:
      return "i";
  }
}

function dismiss(id: string) {
  const idx = items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  items = items.map((x) => (x.id === id ? { ...x, leaving: true } : x));
  paint();
  window.setTimeout(() => {
    items = items.filter((x) => x.id !== id);
    paint();
  }, 220);
}

function show(kind: ToastKind, input: string | ToastInput) {
  ensureRoot();
  const cfg = typeof input === "string" ? { message: input } : input;
  const duration = cfg.duration ?? (kind === "error" ? 5.5 : 3.4);
  const id = cfg.key ?? `callai-toast-${Date.now()}-${++seq}`;

  // update existing key
  const existing = items.findIndex((x) => x.id === id);
  const next: ToastItem = {
    id,
    kind,
    message: cfg.message,
    description: cfg.description,
    duration,
    btn: cfg.btn,
  };
  if (existing >= 0) {
    items = items.slice();
    items[existing] = next;
  } else {
    items = [...items, next];
  }
  paint();

  if (duration > 0) {
    window.setTimeout(() => dismiss(id), duration * 1000);
  }
}

export const toast = {
  success: (input: string | ToastInput) => show("success", input),
  info: (input: string | ToastInput) => show("info", input),
  warning: (input: string | ToastInput) => show("warning", input),
  error: (input: string | ToastInput) => show("error", input),
  destroy: (key?: string) => {
    if (key) dismiss(key);
    else {
      items = [];
      paint();
    }
  },
};

/** Warm toast root on app boot so first save is instant/visible. */
export function warmToast() {
  ensureRoot();
}

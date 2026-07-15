import React from "react";
import ReactDOM from "react-dom/client";
import "animal-island-ui/style";
import "./i18n";
import "./theme/global.css";
import "./theme/ai-chat.css";
import App from "./App";
import { isTauri } from "./infra/tauriApi";

if (isTauri()) {
  document.documentElement.classList.add("tauri");
  document.body.classList.add("tauri");
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

const rootEl = document.getElementById("root") as HTMLElement;
// Drawer pushBackground mutates body children; keep #root out of that path.
rootEl.setAttribute("data-animal-drawer-ignore", "1");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

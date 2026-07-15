import React from "react";
import ReactDOM from "react-dom/client";
import "animal-island-ui/style";
import "./i18n";
import "./theme/global.css";
import "./theme/plugins.css";
import { PluginWindowApp } from "./pages/PluginWindowApp";
import { isTauri } from "./infra/tauriApi";

if (isTauri()) {
  document.documentElement.classList.add("tauri");
  document.body.classList.add("tauri");
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

const rootEl = document.getElementById("root") as HTMLElement;
rootEl.setAttribute("data-animal-drawer-ignore", "1");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <PluginWindowApp />
  </React.StrictMode>,
);

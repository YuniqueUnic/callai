import React from "react";
import ReactDOM from "react-dom/client";
import "animal-island-ui/style";
import "./i18n";
import "./theme/global.css";
import App from "./App";
import { isTauri } from "./infra/tauriApi";

if (isTauri()) {
  document.documentElement.classList.add("tauri");
  document.body.classList.add("tauri");
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

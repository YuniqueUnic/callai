import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./tauriApi";

export const NAVIGATE_EVENT = "callai://navigate";
export type NavigateTarget = "new-alarm" | "home" | "logs" | "settings";

export async function onNavigate(
  handler: (target: NavigateTarget) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => undefined;
  }
  return listen<string>(NAVIGATE_EVENT, (event) => {
    const payload = event.payload;
    if (
      payload === "new-alarm" ||
      payload === "home" ||
      payload === "logs" ||
      payload === "settings"
    ) {
      handler(payload);
    }
  });
}

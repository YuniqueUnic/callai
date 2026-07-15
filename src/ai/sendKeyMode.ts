/** Enter-to-send vs Mod+Enter-to-send (Mod = ⌘ on macOS, Ctrl elsewhere). */

export type SendKeyMode = "enter" | "mod_enter";

const STORAGE_KEY = "callai.ai.sendKey.v1";

export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const p = navigator.platform || "";
  const ua = navigator.userAgent || "";
  return /Mac|iPhone|iPad|iPod/i.test(p) || /Mac OS X/i.test(ua);
}

export function modKeyLabel(): string {
  return isApplePlatform() ? "⌘" : "Ctrl";
}

export function loadSendKeyMode(): SendKeyMode {
  if (typeof localStorage === "undefined") return "enter";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "mod_enter" || v === "enter") return v;
  } catch {
    /* */
  }
  return "enter";
}

export function saveSendKeyMode(mode: SendKeyMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* */
  }
}

export function isModEnter(
  e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">,
): boolean {
  if (e.key !== "Enter") return false;
  // On Apple: prefer metaKey; allow ctrlKey too for external keyboards.
  // On others: ctrlKey.
  if (isApplePlatform()) return e.metaKey || e.ctrlKey;
  return e.ctrlKey;
}

export function isPrimarySendKey(
  e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey">,
  mode: SendKeyMode,
): boolean {
  if (e.key !== "Enter") return false;
  if (mode === "enter") {
    return !e.shiftKey && !e.metaKey && !e.ctrlKey;
  }
  return isModEnter(e);
}

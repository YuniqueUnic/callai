import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "./tauriApi";

/** Open a native file picker for selecting an executable/binary. */
export async function pickBinaryFile(): Promise<string | null> {
  if (!isTauri()) {
    // Browser mock: pretend the user picked a local echo binary.
    return "/bin/echo";
  }
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Select binary",
  });
  if (selected == null) return null;
  if (Array.isArray(selected)) return selected[0] ?? null;
  return selected;
}

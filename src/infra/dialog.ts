import { open, save } from "@tauri-apps/plugin-dialog";
import { isTauri } from "./tauriApi";

/** Open a native file picker for selecting an executable/binary. */
export async function pickBinaryFile(): Promise<string | null> {
  if (!isTauri()) {
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

/** Pick a callai plugin zip package. */
export async function pickPluginZipFile(): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Install plugin package",
    filters: [{ name: "callai plugin", extensions: ["zip"] }],
  });
  if (selected == null) return null;
  if (Array.isArray(selected)) return selected[0] ?? null;
  return selected;
}

/** Choose where to save an exported plugin zip. */
export async function savePluginZipFile(
  defaultName: string,
): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await save({
    title: "Export plugin package",
    defaultPath: defaultName.endsWith(".zip") ? defaultName : `${defaultName}.zip`,
    filters: [{ name: "callai plugin", extensions: ["zip"] }],
  });
  return selected ?? null;
}

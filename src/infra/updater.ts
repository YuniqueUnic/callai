import { isTauri } from "./tauriApi";

export type UpdateCheckResult =
  | { status: "unsupported" }
  | { status: "upToDate" }
  | {
      status: "available";
      version: string;
      body?: string | null;
      date?: string | null;
      install: () => Promise<void>;
    }
  | { status: "error"; message: string };

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (!isTauri()) return { status: "unsupported" };
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return { status: "upToDate" };
    return {
      status: "available",
      version: update.version,
      body: update.body,
      date: update.date,
      install: async () => {
        await update.downloadAndInstall();
      },
    };
  } catch (err) {
    return {
      status: "error",
      message: String((err as { message?: string })?.message ?? err),
    };
  }
}

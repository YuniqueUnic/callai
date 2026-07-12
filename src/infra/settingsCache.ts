import type { AppSettings } from "../domain/types";
import { client } from "./client";

/**
 * Settings + light secondary caches so tab switches never re-block on IPC.
 * Settings page mounts once (keep-alive); this still helps first entry & reloads.
 */

let settingsCache: AppSettings | null = null;
let settingsInflight: Promise<AppSettings> | null = null;

let versionCache: string | null = null;
let versionInflight: Promise<string> | null = null;

let backupsCache: string[] | null = null;
let backupsInflight: Promise<string[]> | null = null;

let autostartCache: boolean | null = null;
let autostartInflight: Promise<boolean> | null = null;

export function peekSettings(): AppSettings | null {
  return settingsCache;
}

export async function getSettingsCached(): Promise<AppSettings> {
  if (settingsCache) return settingsCache;
  if (settingsInflight) return settingsInflight;
  settingsInflight = client
    .getSettings()
    .then((s) => {
      settingsCache = s;
      return s;
    })
    .finally(() => {
      settingsInflight = null;
    });
  return settingsInflight;
}

export function setSettingsCache(s: AppSettings): void {
  settingsCache = s;
}

export function peekAppVersion(): string | null {
  return versionCache;
}

export async function getAppVersionCached(): Promise<string> {
  if (versionCache != null) return versionCache;
  if (versionInflight) return versionInflight;
  versionInflight = client
    .getAppVersion()
    .then((v) => {
      versionCache = v;
      return v;
    })
    .catch(() => {
      versionCache = "";
      return "";
    })
    .finally(() => {
      versionInflight = null;
    });
  return versionInflight;
}

export function peekBackups(): string[] | null {
  return backupsCache;
}

export async function listBackupsCached(force = false): Promise<string[]> {
  if (!force && backupsCache) return backupsCache;
  if (!force && backupsInflight) return backupsInflight;
  backupsInflight = client
    .listBackups()
    .then((b) => {
      backupsCache = b;
      return b;
    })
    .catch(() => {
      backupsCache = backupsCache ?? [];
      return backupsCache!;
    })
    .finally(() => {
      backupsInflight = null;
    });
  return backupsInflight;
}

export function invalidateBackupsCache(): void {
  backupsCache = null;
}

export function peekAutostart(): boolean | null {
  return autostartCache;
}

export async function getAutostartCached(force = false): Promise<boolean> {
  if (!force && autostartCache != null) return autostartCache;
  if (!force && autostartInflight) return autostartInflight;
  autostartInflight = client
    .getAutostartEnabled()
    .then((v) => {
      autostartCache = v;
      return v;
    })
    .catch(() => {
      autostartCache = false;
      return false;
    })
    .finally(() => {
      autostartInflight = null;
    });
  return autostartInflight;
}

export function setAutostartCache(v: boolean): void {
  autostartCache = v;
}

/** Prefetch non-critical settings side data after app start. */
export function warmSettingsSecondary(): void {
  void getAppVersionCached();
  void listBackupsCached();
  void getAutostartCached();
}

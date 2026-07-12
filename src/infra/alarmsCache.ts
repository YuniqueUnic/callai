import type { Alarm } from "../domain/types";
import { client } from "./client";

/**
 * Alarm list + next-trigger cache.
 * Home was remounted on every edit→back, then did listAlarms + N×nextTrigger
 * (N+1 IPC). Keep a shared cache so re-entry is instant and refreshes are silent.
 */

let alarmsCache: Alarm[] | null = null;
let alarmsInflight: Promise<Alarm[]> | null = null;
let nextMapCache: Record<string, string> = {};
let nextInflight: Promise<Record<string, string>> | null = null;

export function peekAlarms(): Alarm[] | null {
  return alarmsCache;
}

export function peekNextMap(): Record<string, string> {
  return nextMapCache;
}

export async function listAlarmsCached(force = false): Promise<Alarm[]> {
  if (!force && alarmsCache) return alarmsCache;
  if (!force && alarmsInflight) return alarmsInflight;
  alarmsInflight = client
    .listAlarms()
    .then((list) => {
      alarmsCache = list;
      return list;
    })
    .finally(() => {
      alarmsInflight = null;
    });
  return alarmsInflight;
}

export async function loadNextMap(
  list: Alarm[],
  force = false,
): Promise<Record<string, string>> {
  if (!force && list.length > 0) {
    const missing = list.some((a) => nextMapCache[a.id] === undefined);
    if (!missing) return nextMapCache;
  }
  if (!force && nextInflight) return nextInflight;

  nextInflight = (async () => {
    // Cap concurrent IPC: batch in chunks of 8 to avoid hammering main thread.
    const entries: Array<readonly [string, string]> = [];
    const chunk = 8;
    for (let i = 0; i < list.length; i += chunk) {
      const slice = list.slice(i, i + chunk);
      const part = await Promise.all(
        slice.map(async (a) => {
          try {
            const n = await client.nextTrigger(a.id);
            return [a.id, n ?? ""] as const;
          } catch {
            return [a.id, ""] as const;
          }
        }),
      );
      entries.push(...part);
    }
    nextMapCache = { ...nextMapCache, ...Object.fromEntries(entries) };
    // Drop ids no longer present
    const ids = new Set(list.map((a) => a.id));
    for (const k of Object.keys(nextMapCache)) {
      if (!ids.has(k)) delete nextMapCache[k];
    }
    return nextMapCache;
  })().finally(() => {
    nextInflight = null;
  });

  return nextInflight;
}

export async function refreshAlarmsBundle(force = false): Promise<{
  alarms: Alarm[];
  nextMap: Record<string, string>;
}> {
  const alarms = await listAlarmsCached(force);
  const nextMap = await loadNextMap(alarms, force);
  return { alarms, nextMap };
}

export function setAlarmsCache(list: Alarm[]): void {
  alarmsCache = list;
}

export function patchAlarmInCache(alarm: Alarm): void {
  if (!alarmsCache) {
    alarmsCache = [alarm];
    return;
  }
  const i = alarmsCache.findIndex((a) => a.id === alarm.id);
  if (i >= 0) {
    const next = alarmsCache.slice();
    next[i] = alarm;
    alarmsCache = next;
  } else {
    alarmsCache = [alarm, ...alarmsCache];
  }
}

export function removeAlarmFromCache(id: string): void {
  if (!alarmsCache) return;
  alarmsCache = alarmsCache.filter((a) => a.id !== id);
  delete nextMapCache[id];
}

export function invalidateAlarmsCache(): void {
  alarmsCache = null;
  nextMapCache = {};
}

export function warmAlarmsCache(): void {
  void refreshAlarmsBundle(false);
}

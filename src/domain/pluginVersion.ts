/**
 * Semver-ish compare matching Rust `version_cmp`.
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function versionCmp(a: string, b: string): number {
  const parts = (s: string) =>
    s
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map((p) => Number.parseInt(p, 10))
      .filter((n) => Number.isFinite(n));
  const pa = parts(a);
  const pb = parts(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** package can update installed when package.version > installed.version */
export function isNewerVersion(packageVer: string, installedVer: string): boolean {
  return versionCmp(packageVer, installedVer) > 0;
}

export function isOlderVersion(packageVer: string, installedVer: string): boolean {
  return versionCmp(packageVer, installedVer) < 0;
}

export type MarketUpdateInfo = {
  version: string;
  zip_url: string;
  name: string;
};

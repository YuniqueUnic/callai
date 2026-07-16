import { useCallback, useState } from "react";
import type { PluginSummary } from "../../domain/types";
import { client } from "../../infra/client";
import { pickPluginZipFile, savePluginZipFile } from "../../infra/dialog";
import { isTauri } from "../../infra/tauriApi";
import type { ZipConflictMode } from "./types";

type ToastFn = (opts: { message: string }) => void;

export function usePluginZip(opts: {
  onChanged: () => Promise<void>;
  t: (key: string, opt?: Record<string, unknown>) => string;
  toastSuccess: ToastFn;
  toastError: ToastFn;
  playConfirm: () => void;
}) {
  const { onChanged, t, toastSuccess, toastError, playConfirm } = opts;
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportTarget, setExportTarget] = useState<PluginSummary | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingBytes, setPendingBytes] = useState<Uint8Array | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [conflictId, setConflictId] = useState<string | undefined>();

  const finishImport = useCallback(
    async (summary: PluginSummary | null | undefined) => {
      if (!summary) {
        toastSuccess({
          message: t("plugins:importSkipped", {
            defaultValue: "已跳过（插件已存在）",
          }),
        });
        return;
      }
      playConfirm();
      toastSuccess({
        message: t("plugins:imported", {
          defaultValue: "已安装 {{name}}",
          name: summary.name,
        }),
      });
      await onChanged();
      window.dispatchEvent(
        new CustomEvent("callai:plugins-changed", {
          detail: { id: summary.id, open: false },
        }),
      );
    },
    [onChanged, playConfirm, t, toastSuccess],
  );

  const importWithMode = useCallback(
    async (mode: ZipConflictMode) => {
      setImporting(true);
      setConflictOpen(false);
      try {
        let summary: PluginSummary | null | undefined;
        if (pendingPath) {
          summary = await client.importPluginZipPath(pendingPath, mode);
        } else if (pendingBytes) {
          summary = await client.importPluginZipBytes(pendingBytes, mode);
        }
        setPendingBytes(null);
        setPendingPath(null);
        await finishImport(summary);
      } catch (e) {
        toastError({
          message: String((e as { message?: string })?.message ?? e),
        });
      } finally {
        setImporting(false);
      }
    },
    [finishImport, pendingBytes, pendingPath, toastError],
  );

  const beginImportBytes = useCallback(
    async (bytes: Uint8Array) => {
      setImporting(true);
      try {
        let id: string | undefined;
        if (typeof client.peekPluginZipId === "function") {
          try {
            id = await client.peekPluginZipId(bytes);
          } catch {
            /* parse will fail later */
          }
        }
        if (id && typeof client.getPlugin === "function") {
          try {
            await client.getPlugin(id);
            // exists → ask conflict
            setConflictId(id);
            setPendingBytes(bytes);
            setPendingPath(null);
            setConflictOpen(true);
            return;
          } catch {
            /* not found */
          }
        }
        const summary = await client.importPluginZipBytes(bytes, "rename");
        await finishImport(summary);
      } catch (e) {
        toastError({
          message: String((e as { message?: string })?.message ?? e),
        });
      } finally {
        setImporting(false);
      }
    },
    [finishImport, toastError],
  );

  // path import
  const beginImportPathSimple = useCallback(
    async (path: string) => {
      setImporting(true);
      try {
        const summary = await client.importPluginZipPath(path, "fail");
        await finishImport(summary);
      } catch (e) {
        const msg = String((e as { message?: string })?.message ?? e);
        if (msg.toLowerCase().includes("already exists")) {
          const m = msg.match(/plugin already exists:\s*([a-z0-9-]+)/i);
          setConflictId(m?.[1]);
          setPendingPath(path);
          setPendingBytes(null);
          setConflictOpen(true);
        } else {
          // first-time install: rename mode same as install
          try {
            const summary = await client.importPluginZipPath(path, "rename");
            await finishImport(summary);
          } catch (e2) {
            toastError({
              message: String((e2 as { message?: string })?.message ?? e2),
            });
          }
        }
      } finally {
        setImporting(false);
      }
    },
    [finishImport, toastError],
  );

  const pickAndImport = useCallback(async () => {
    try {
      if (isTauri()) {
        const path = await pickPluginZipFile();
        if (!path) return;
        await beginImportPathSimple(path);
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".zip,application/zip";
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        void f.arrayBuffer().then((buf) => beginImportBytes(new Uint8Array(buf)));
      };
      input.click();
    } catch (e) {
      toastError({
        message: String((e as { message?: string })?.message ?? e),
      });
    }
  }, [beginImportBytes, beginImportPathSimple, toastError]);

  const doExport = useCallback(
    async (includeData: boolean) => {
      if (!exportTarget) return;
      setExporting(true);
      try {
        const defaultName = `${exportTarget.id}${includeData ? "-with-data" : ""}.zip`;
        if (isTauri() && typeof client.exportPluginZipPath === "function") {
          const path = await savePluginZipFile(defaultName);
          if (!path) return;
          await client.exportPluginZipPath(exportTarget.id, includeData, path);
        } else {
          toastError({
            message: t("plugins:exportDesktopOnly", {
              defaultValue: "导出需要桌面版",
            }),
          });
          return;
        }
        setExportTarget(null);
        playConfirm();
        toastSuccess({
          message: t("plugins:exported", {
            defaultValue: includeData ? "已导出（含数据）" : "已导出（裸包）",
          }),
        });
      } catch (e) {
        toastError({
          message: String((e as { message?: string })?.message ?? e),
        });
      } finally {
        setExporting(false);
      }
    },
    [exportTarget, playConfirm, t, toastError, toastSuccess],
  );

  return {
    importing,
    exporting,
    exportTarget,
    setExportTarget,
    conflictOpen,
    conflictId,
    pickAndImport,
    beginImportBytes,
    importWithMode,
    cancelConflict: () => {
      setConflictOpen(false);
      setPendingBytes(null);
      setPendingPath(null);
    },
    doExport,
  };
}

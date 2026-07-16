import { useCallback, useState } from "react";
import type { PluginSummary } from "../../domain/types";
import { client } from "../../infra/client";
import { pickPluginZipFile, savePluginZipFile } from "../../infra/dialog";
import { isTauri } from "../../infra/tauriApi";
import type { ImportProgress, ZipConflictMode } from "./types";
import type { ConflictChoice } from "./PluginImportConflictModal";

type ToastFn = (opts: { message: string }) => void;

const IDLE: ImportProgress = { phase: "idle" };

export type ConflictMeta = {
  pluginId: string;
  packageVersion?: string;
  installedVersion?: string;
  packageName?: string;
  includesData?: boolean;
};

export function usePluginZip(opts: {
  onChanged: () => Promise<void>;
  t: (key: string, opt?: Record<string, unknown>) => string;
  toastSuccess: ToastFn;
  toastError: ToastFn;
  playConfirm: () => void;
  playWarn?: () => void;
  /** Resolve installed version for id (for conflict UI). */
  getInstalledVersion?: (id: string) => string | undefined;
}) {
  const {
    onChanged,
    t,
    toastSuccess,
    toastError,
    playConfirm,
    playWarn,
    getInstalledVersion,
  } = opts;
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportTarget, setExportTarget] = useState<PluginSummary | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingBytes, setPendingBytes] = useState<Uint8Array | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [conflictId, setConflictId] = useState<string | undefined>();
  const [conflictMeta, setConflictMeta] = useState<ConflictMeta | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress>(IDLE);

  const resetProgress = useCallback(() => setImportProgress(IDLE), []);

  const finishImport = useCallback(
    async (summary: PluginSummary | null | undefined, fileName?: string) => {
      if (!summary) {
        setImportProgress({
          phase: "success",
          fileName,
          message: t("plugins:importSkipped", {
            defaultValue: "已跳过（这个插件已在）",
          }),
        });
        toastSuccess({
          message: t("plugins:importSkipped", {
            defaultValue: "已跳过（这个插件已在）",
          }),
        });
        return;
      }
      playConfirm();
      setImportProgress({
        phase: "success",
        fileName,
        pluginId: summary.id,
        pluginName: summary.name,
        message: t("plugins:importSuccessBody", {
          defaultValue: "已装好 {{name}}",
          name: summary.name,
        }),
      });
      toastSuccess({
        message: t("plugins:imported", {
          defaultValue: "已装好 {{name}}",
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

  const failImport = useCallback(
    (err: unknown, fileName?: string) => {
      playWarn?.();
      const message = String((err as { message?: string })?.message ?? err);
      setImportProgress({
        phase: "error",
        fileName,
        message:
          message ||
          t("plugins:importFailBody", { defaultValue: "出了点小状况" }),
      });
      toastError({ message });
    },
    [playWarn, t, toastError],
  );

  const openConflict = useCallback(
    (meta: ConflictMeta, bytes: Uint8Array | null, path: string | null) => {
      setConflictId(meta.pluginId);
      setConflictMeta(meta);
      setPendingBytes(bytes);
      setPendingPath(path);
      setImportProgress({
        phase: "conflict",
        fileName: path?.split(/[/\\]/).pop(),
        pluginId: meta.pluginId,
        pluginName: meta.packageName,
      });
      setConflictOpen(true);
    },
    [],
  );

  const importWithChoice = useCallback(
    async (choice: ConflictChoice) => {
      setImporting(true);
      setConflictOpen(false);
      const fileName = importProgress.fileName;
      setImportProgress((p) => ({
        ...p,
        phase: "installing",
        message: t("plugins:importInstalling", { defaultValue: "正在安装…" }),
      }));
      try {
        let summary: PluginSummary | null | undefined;
        if (pendingPath) {
          summary = await client.importPluginZipPath(
            pendingPath,
            choice.mode,
            choice.force_downgrade,
            choice.replace_data,
          );
        } else if (pendingBytes) {
          summary = await client.importPluginZipBytes(
            pendingBytes,
            choice.mode,
            choice.force_downgrade,
            choice.replace_data,
          );
        }
        setPendingBytes(null);
        setPendingPath(null);
        setConflictMeta(null);
        await finishImport(summary, fileName);
      } catch (e) {
        failImport(e, fileName);
      } finally {
        setImporting(false);
      }
    },
    [
      failImport,
      finishImport,
      importProgress.fileName,
      pendingBytes,
      pendingPath,
      t,
    ],
  );

  /** Back-compat for simple mode string. */
  const importWithMode = useCallback(
    async (mode: ZipConflictMode) => {
      await importWithChoice({
        mode,
        force_downgrade: false,
        replace_data: false,
      });
    },
    [importWithChoice],
  );

  const beginImportBytes = useCallback(
    async (bytes: Uint8Array, fileName?: string) => {
      setImporting(true);
      setImportProgress({
        phase: "parsing",
        fileName: fileName || "plugin.zip",
        message: t("plugins:importParsing", {
          defaultValue: "正在解析插件包…",
        }),
      });
      try {
        let peek: {
          id: string;
          name: string;
          version: string;
          includes_data: boolean;
        } | null = null;
        if (typeof client.peekPluginZip === "function") {
          try {
            peek = await client.peekPluginZip(bytes);
          } catch {
            /* fall through */
          }
        } else if (typeof client.peekPluginZipId === "function") {
          try {
            const id = await client.peekPluginZipId(bytes);
            peek = {
              id,
              name: id,
              version: "0.0.0",
              includes_data: false,
            };
          } catch {
            /* fall through */
          }
        }
        if (peek && typeof client.getPlugin === "function") {
          try {
            const existing = await client.getPlugin(peek.id);
            openConflict(
              {
                pluginId: peek.id,
                packageVersion: peek.version,
                installedVersion: existing.version,
                packageName: peek.name,
                includesData: peek.includes_data,
              },
              bytes,
              null,
            );
            setImporting(false);
            return;
          } catch {
            /* not installed */
          }
        }
        setImportProgress({
          phase: "installing",
          fileName: fileName || "plugin.zip",
          message: t("plugins:importInstalling", {
            defaultValue: "正在安装…",
          }),
        });
        const summary = await client.importPluginZipBytes(
          bytes,
          "rename",
          false,
          false,
        );
        await finishImport(summary, fileName);
      } catch (e) {
        failImport(e, fileName);
      } finally {
        setImporting(false);
      }
    },
    [failImport, finishImport, openConflict, t],
  );

  const beginImportPathSimple = useCallback(
    async (path: string) => {
      const fileName = path.split(/[/\\]/).pop() || path;
      setImporting(true);
      setImportProgress({
        phase: "parsing",
        fileName,
        message: t("plugins:importParsing", {
          defaultValue: "正在解析插件包…",
        }),
      });
      try {
        setImportProgress({
          phase: "installing",
          fileName,
          message: t("plugins:importInstalling", {
            defaultValue: "正在安装…",
          }),
        });
        const summary = await client.importPluginZipPath(
          path,
          "fail",
          false,
          false,
        );
        await finishImport(summary, fileName);
      } catch (e) {
        const msg = String((e as { message?: string })?.message ?? e);
        if (msg.toLowerCase().includes("already exists")) {
          const m = msg.match(/plugin already exists:\s*([a-z0-9-]+)/i);
          const id = m?.[1] || "";
          openConflict(
            {
              pluginId: id,
              installedVersion: getInstalledVersion?.(id),
              includesData: false,
            },
            null,
            path,
          );
        } else {
          try {
            const summary = await client.importPluginZipPath(
              path,
              "rename",
              false,
              false,
            );
            await finishImport(summary, fileName);
          } catch (e2) {
            failImport(e2, fileName);
          }
        }
      } finally {
        setImporting(false);
      }
    },
    [failImport, finishImport, getInstalledVersion, openConflict, t],
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
        setImportProgress({
          phase: "reading",
          fileName: f.name,
          message: t("plugins:importReading", {
            defaultValue: "正在读取文件…",
          }),
        });
        void f
          .arrayBuffer()
          .then((buf) => beginImportBytes(new Uint8Array(buf), f.name));
      };
      input.click();
    } catch (e) {
      failImport(e);
    }
  }, [beginImportBytes, beginImportPathSimple, failImport, t]);

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
          playWarn?.();
          toastError({
            message: t("plugins:exportDesktopOnly", {
              defaultValue: "导出需要在桌面应用里进行",
            }),
          });
          return;
        }
        setExportTarget(null);
        playConfirm();
        toastSuccess({
          message: t("plugins:exported", { defaultValue: "导出完成" }),
        });
      } catch (e) {
        playWarn?.();
        toastError({
          message: String((e as { message?: string })?.message ?? e),
        });
      } finally {
        setExporting(false);
      }
    },
    [exportTarget, playConfirm, playWarn, t, toastError, toastSuccess],
  );

  return {
    importing,
    exporting,
    exportTarget,
    setExportTarget,
    conflictOpen,
    conflictId,
    conflictMeta,
    importProgress,
    resetProgress,
    pickAndImport,
    beginImportBytes,
    beginImportPathSimple,
    importWithMode,
    importWithChoice,
    cancelConflict: () => {
      setConflictOpen(false);
      setPendingBytes(null);
      setPendingPath(null);
      setConflictMeta(null);
      resetProgress();
    },
    doExport,
  };
}

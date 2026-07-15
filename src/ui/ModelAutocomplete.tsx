import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Input } from "animal-island-ui";
import type { AiProvider } from "../domain/types";
import {
  fetchAiModels,
  filterModels,
  modelHintsForProvider,
  readModelsCache,
  seedModelsList,
} from "../infra/aiModelsCache";
import { playSound, playTick } from "./sounds";
import { IconButton } from "./IconButton";
import { IconRefresh } from "./icons";

interface Props {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  value: string;
  placeholder?: string;
  onChange: (model: string) => void;
}

function hasLiveCache(provider: string, baseUrl: string): boolean {
  const c = readModelsCache(provider, baseUrl);
  return !!(c && c.models.length > 0);
}

export function ModelAutocomplete({
  provider,
  baseUrl,
  apiKey,
  value,
  placeholder,
  onChange,
}: Props) {
  const { t } = useTranslation(["settings", "common"]);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>(() =>
    seedModelsList(provider, baseUrl),
  );
  const [fromSeed, setFromSeed] = useState(
    () => !hasLiveCache(provider, baseUrl),
  );
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  const filtered = useMemo(
    () => filterModels(models, value, 48),
    [models, value],
  );

  // Reload cache / seeds when provider / baseUrl changes.
  useEffect(() => {
    setModels(seedModelsList(provider, baseUrl));
    setFromSeed(!hasLiveCache(provider, baseUrl));
    setHint(null);
  }, [provider, baseUrl]);

  // Soft auto-fetch once when configured and no live cache.
  useEffect(() => {
    if (!baseUrl.trim() || !apiKey.trim()) return;
    if (hasLiveCache(provider, baseUrl)) return;
    let cancelled = false;
    void (async () => {
      try {
        setBusy(true);
        const res = await fetchAiModels({
          provider,
          base_url: baseUrl,
          api_key: apiKey,
          force: false,
        });
        if (!cancelled) {
          setModels(res.models);
          setFromSeed(false);
          setHint(
            res.fromCache
              ? t("settings:aiModelsCached")
              : t("settings:aiModelsFetched", { count: res.models.length }),
          );
        }
      } catch {
        if (!cancelled) {
          setModels(modelHintsForProvider(provider));
          setFromSeed(true);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider, baseUrl, apiKey, t]);

  useEffect(() => {
    if (!open || !inputWrapRef.current) return;
    const rect = inputWrapRef.current.getBoundingClientRect();
    const width = Math.max(rect.width, 220);
    let top = rect.bottom + 6;
    const maxH = 220;
    if (top + maxH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - maxH - 6);
    }
    setPos({
      top,
      left: Math.min(rect.left, window.innerWidth - width - 8),
      width,
    });
  }, [open, filtered.length, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      const node = e.target as Node;
      if (wrapRef.current?.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [open]);

  async function refresh(force: boolean) {
    if (!baseUrl.trim() || !apiKey.trim()) {
      setModels(modelHintsForProvider(provider));
      setFromSeed(true);
      setOpen(true);
      setHint(t("settings:aiModelsNeedConfig"));
      playSound("warn");
      return;
    }
    setBusy(true);
    setHint(null);
    try {
      const res = await fetchAiModels({
        provider,
        base_url: baseUrl,
        api_key: apiKey,
        force,
      });
      setModels(res.models);
      setFromSeed(false);
      setOpen(true);
      setHint(
        res.fromCache
          ? t("settings:aiModelsCached")
          : t("settings:aiModelsFetched", { count: res.models.length }),
      );
      playSound("confirm");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setModels(modelHintsForProvider(provider));
      setFromSeed(true);
      setOpen(true);
      setHint(
        msg === "AI_NOT_CONFIGURED"
          ? t("settings:aiModelsNeedConfig")
          : t("settings:aiModelsFail", { msg }),
      );
      playSound("warn");
    } finally {
      setBusy(false);
    }
  }

  const dropdown =
    open && filtered.length > 0 && typeof document !== "undefined"
      ? createPortal(
          <div
            id={listId}
            role="listbox"
            className="model-ac-dropdown"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 20060,
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {filtered.map((m) => (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={m === value}
                className={`model-ac-option ${m === value ? "active" : ""}`}
                onClick={() => {
                  onChange(m);
                  playTick();
                  setOpen(false);
                }}
              >
                {m}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="model-ac" ref={wrapRef}>
      <div className="panel-head model-ac-head">
        <label className="label" htmlFor="ai-model-input">
          {t("settings:aiModel")}
        </label>
        <IconButton
          label={t("settings:aiModelsRefresh")}
          icon={<IconRefresh size={16} />}
          loading={busy}
          sfx="soft"
          onClick={() => void refresh(true)}
        />
      </div>
      <div className="model-ac-input-wrap" ref={inputWrapRef}>
        <Input
          id="ai-model-input"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          onFocus={() => {
            if (models.length === 0) {
              setModels(modelHintsForProvider(provider));
              setFromSeed(true);
            }
            setOpen(true);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            if (models.length === 0) {
              setModels(modelHintsForProvider(provider));
              setFromSeed(true);
            }
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown" && filtered.length > 0) {
              e.preventDefault();
              setOpen(true);
              onChange(filtered[0]);
              playTick();
            }
            if (e.key === "Enter" && open && filtered.length === 1) {
              e.preventDefault();
              onChange(filtered[0]);
              setOpen(false);
              playTick();
            }
          }}
        />
      </div>
      {hint ? <p className="meta model-ac-hint">{hint}</p> : null}
      {models.length > 0 ? (
        <p className="meta model-ac-meta">
          {fromSeed
            ? t("settings:aiModelsSeeded", { count: models.length })
            : t("settings:aiModelsCount", { count: models.length })}
        </p>
      ) : null}
      {dropdown}
    </div>
  );
}

import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
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

function ModelAutocompleteImpl({
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [open, setOpen] = useState(false);
  // Local text so selection paints immediately even if parent re-render is delayed.
  const [text, setText] = useState(value);
  const [models, setModels] = useState<string[]>(() =>
    seedModelsList(provider, baseUrl),
  );
  const [fromSeed, setFromSeed] = useState(
    () => !hasLiveCache(provider, baseUrl),
  );
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });
  const [activeIdx, setActiveIdx] = useState(0);

  // Sync from parent when it changes externally (provider defaults, load).
  useEffect(() => {
    setText(value);
  }, [value]);

  const filtered = useMemo(
    () => filterModels(models, text, 48),
    [models, text],
  );

  useEffect(() => {
    setActiveIdx(0);
  }, [text, models]);

  // Reload cache / seeds when provider / baseUrl changes.
  useEffect(() => {
    setModels(seedModelsList(provider, baseUrl));
    setFromSeed(!hasLiveCache(provider, baseUrl));
    setHint(null);
  }, [provider, baseUrl]);

  // Soft auto-fetch only when provider/baseUrl changes — never on each apiKey keystroke.
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;
  useEffect(() => {
    if (!baseUrl.trim()) return;
    if (hasLiveCache(provider, baseUrl)) return;
    if (!apiKeyRef.current.trim()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const liveKey = apiKeyRef.current.trim();
        if (!liveKey || cancelled) return;
        try {
          setBusy(true);
          const res = await fetchAiModels({
            provider,
            base_url: baseUrl,
            api_key: liveKey,
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
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [provider, baseUrl, t]);

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
  }, [open, filtered.length, text]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      const node = e.target as Node;
      // Dropdown is portaled to body — must not treat it as "outside".
      if (wrapRef.current?.contains(node)) return;
      if (dropdownRef.current?.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [open]);

  function commit(model: string) {
    setText(model);
    onChangeRef.current(model);
    setOpen(false);
    playTick();
  }

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
            ref={dropdownRef}
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
            // Keep focus on the input; select on pointerdown so portal
            // outside-click handlers cannot cancel the choice.
            onMouseDown={(e) => e.preventDefault()}
          >
            {filtered.map((m, i) => (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={m === text || i === activeIdx}
                className={`model-ac-option ${
                  m === text || i === activeIdx ? "active" : ""
                }`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  commit(m);
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
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
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
            const v = e.target.value;
            setText(v);
            onChangeRef.current(v);
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
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (filtered.length === 0) return;
              setOpen(true);
              setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              if (filtered.length === 0) return;
              setOpen(true);
              setActiveIdx((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === "Enter" && open && filtered.length > 0) {
              e.preventDefault();
              const pick = filtered[Math.min(activeIdx, filtered.length - 1)];
              if (pick) commit(pick);
            }
            if (e.key === "Tab" && open && filtered.length > 0) {
              const pick = filtered[Math.min(activeIdx, filtered.length - 1)];
              if (pick && pick !== text) {
                // Accept highlighted suggestion on tab if user wants fill.
                commit(pick);
              }
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

export const ModelAutocomplete = memo(ModelAutocompleteImpl);

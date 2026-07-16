import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
  /** Dense HUD mode (AI composer): hide section chrome / meta. */
  compact?: boolean;
  disabled?: boolean;
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
  compact = false,
  disabled = false,
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
  const [pos, setPos] = useState({ top: -9999, left: 0, width: 280 });
  const [placed, setPlaced] = useState(false);
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

  // Local list only when provider / baseUrl changes (cache or seed).
  // Never auto-fetch network models — user must click refresh.
  useEffect(() => {
    setModels(seedModelsList(provider, baseUrl));
    setFromSeed(!hasLiveCache(provider, baseUrl));
    setHint(null);
    setBusy(false);
  }, [provider, baseUrl]);

  /** Anchor popup to the input. Uses real dropdown height when mounted so
   *  long fallback lists (custom model like grok-4.5 → full seed) stay glued. */
  const placeDropdown = () => {
    const el = inputWrapRef.current ?? wrapRef.current;
    const maxH = 220;
    const gap = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!el) {
      setPos({
        top: Math.max(8, vh - maxH - 24),
        left: Math.max(8, vw - 280 - 8),
        width: Math.min(280, vw - 16),
      });
      return;
    }

    // Prefer the native <input> rect (animal Input wraps it in a span).
    const inputEl = el.querySelector("input");
    const rect = (inputEl ?? el).getBoundingClientRect();
    // Invalid measure → keep previous pos rather than jumping to (0,0).
    if (rect.width < 2 && rect.height < 2) return;

    const width = Math.min(
      Math.max(rect.width, 180),
      Math.max(160, vw - 16),
    );

    // Prefer measured popup height (after content paints); estimate otherwise.
    const dd = dropdownRef.current;
    let ddH = maxH;
    if (dd) {
      const raw = dd.offsetHeight || dd.getBoundingClientRect().height;
      if (raw > 8) ddH = Math.min(maxH, raw);
    } else {
      // ~36px per option + padding; cap at maxH
      const n = Math.max(1, Math.min(48, (filtered.length || models.length || 8)));
      ddH = Math.min(maxH, n * 36 + 16);
    }

    const spaceBelow = vh - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    // Open upward when the field sits in the bottom HUD / little room below.
    const openUp = spaceBelow < ddH + 12 && spaceAbove >= spaceBelow;

    let top = openUp ? rect.top - ddH - gap : rect.bottom + gap;
    // Clamp into the viewport without teleporting to the opposite edge.
    const minTop = 8;
    const maxTop = Math.max(minTop, vh - Math.min(ddH, 120) - 8);
    if (top < minTop) top = minTop;
    if (top > maxTop) top = maxTop;

    // Right-align to the field (composer model is on the right).
    let left = rect.right - width;
    if (left < 8) left = 8;
    if (left + width > vw - 8) left = Math.max(8, vw - width - 8);

    setPos({ top, left, width });
    setPlaced(true);
  };

  useLayoutEffect(() => {
    if (!open) {
      setPlaced(false);
      return;
    }
    placeDropdown();
    // After portal paints, remeasure real dropdown height and re-anchor.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      placeDropdown();
      raf2 = requestAnimationFrame(() => placeDropdown());
    });
    const onReposition = () => placeDropdown();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onReposition);
    vv?.addEventListener("scroll", onReposition);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      vv?.removeEventListener("resize", onReposition);
      vv?.removeEventListener("scroll", onReposition);
    };
    // optionList depends on filtered/models; text changes filter results & height.
  }, [open, filtered.length, text, models.length]);

  useEffect(() => {
    if (!open) return;
    // Defer outside-dismiss so the focusing click does not immediately close.
    let ready = false;
    const arm = window.setTimeout(() => {
      ready = true;
    }, 180);
    const onDoc = (e: Event) => {
      if (!ready) return;
      const node = e.target as Node;
      if (wrapRef.current?.contains(node)) return;
      if (dropdownRef.current?.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener("pointerdown", onDoc, true);
    };
  }, [open]);

  function commit(model: string) {
    setText(model);
    onChangeRef.current(model);
    setOpen(false);
    playTick();
  }

  function optionList(): string[] {
    if (filtered.length > 0) return filtered;
    return models;
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    const list = optionList();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (list.length === 0) return;
      setOpen(true);
      setActiveIdx((i) => Math.min(list.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (list.length === 0) return;
      setOpen(true);
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter" && open) {
      if (list.length === 0) return;
      e.preventDefault();
      const pick = list[Math.min(activeIdx, list.length - 1)];
      if (pick) commit(pick);
      return;
    }
    if (e.key === "Tab" && open && list.length > 0) {
      const pick = list[Math.min(activeIdx, list.length - 1)];
      if (pick && pick !== text) commit(pick);
    }
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

  // When query matches nothing (e.g. custom grok-*), still show full list.
  // Keep the typed value as the first row so a full custom id stays selectable.
  const options = (() => {
    const base =
      filtered.length > 0
        ? filtered
        : models.length > 0
          ? models.slice(0, 48)
          : modelHintsForProvider(provider).slice(0, 48);
    const q = text.trim();
    if (!q) return base;
    const has = base.some((m) => m.toLowerCase() === q.toLowerCase());
    return has ? base : [q, ...base];
  })();

  const dropdown =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={dropdownRef}
            id={listId}
            role="listbox"
            className="model-ac-dropdown model-ac-dropdown-portal"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: 220,
              zIndex: 40000,
              // Avoid a one-frame flash at (0,0) / stale coords before measure.
              opacity: placed ? 1 : 0,
              pointerEvents: placed ? "auto" : "none",
            }}
            // Keep focus on the input; select on pointerdown so portal
            // outside-click handlers cannot cancel the choice.
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.length === 0 ? (
              <div className="model-ac-empty" role="presentation">
                {t("settings:aiModelsNeedConfig")}
              </div>
            ) : (
              options.map((m, i) => (
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
              ))
            )}
          </div>,
          document.body,
        )
      : null;

  const inputId = compact ? `${listId}-compact` : "ai-model-input";

  return (
    <div
      className={`model-ac${compact ? " is-compact" : ""}`}
      ref={wrapRef}
      onPointerDown={() => {
        if (disabled) return;
        setModels((cur) =>
          cur.length > 0 ? cur : modelHintsForProvider(provider),
        );
        setOpen(true);
      }}
    >
      {compact ? (
        <div className="model-ac-compact-row">
          <div className="model-ac-input-wrap" ref={inputWrapRef}>
            <Input
              id={inputId}
              value={text}
              placeholder={placeholder ?? t("settings:aiModel")}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              aria-label={t("settings:aiModel")}
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listId}
              onFocus={() => {
                if (disabled) return;
                // Always ensure a list so popup is never empty-gated.
                setModels((cur) =>
                  cur.length > 0 ? cur : modelHintsForProvider(provider),
                );
                if (models.length === 0) setFromSeed(true);
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
              onKeyDown={onInputKeyDown}
            />
          </div>
          <IconButton
            label={t("settings:aiModelsRefresh")}
            icon={<IconRefresh size={14} />}
            loading={busy}
            disabled={disabled}
            sfx="soft"
            onClick={() => void refresh(true)}
          />
        </div>
      ) : (
        <>
          <div className="panel-head model-ac-head">
            <label className="label" htmlFor={inputId}>
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
              id={inputId}
              value={text}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listId}
              onFocus={() => {
                setModels((cur) =>
                  cur.length > 0 ? cur : modelHintsForProvider(provider),
                );
                if (models.length === 0) setFromSeed(true);
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
              onKeyDown={onInputKeyDown}
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
        </>
      )}
      {dropdown}
    </div>
  );
}

export const ModelAutocomplete = memo(ModelAutocompleteImpl);

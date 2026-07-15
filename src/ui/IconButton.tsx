import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";
import { Button } from "animal-island-ui";
import { playSound, type SoundKind, unlockAudio } from "./sounds";

type Variant = "default" | "primary" | "danger" | "ghost";
type Placement = "top" | "bottom" | "left" | "right";

interface Props {
  label: string;
  icon: ReactNode;
  variant?: Variant;
  size?: "small" | "middle";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  tooltipPlacement?: Placement;
  /** Cozy SFX on press (default: none; primary often "confirm"). */
  sfx?: SoundKind | false;
  onClick?: () => void;
}

/**
 * Icon button with a portaled tooltip so bubbles are never clipped
 * by overflow/stacking contexts from cards below.
 */
export function IconButton({
  label,
  icon,
  variant = "default",
  size = "small",
  loading,
  disabled,
  className,
  tooltipPlacement = "bottom",
  sfx,
  onClick,
}: Props) {
  const type = variant === "primary" ? "primary" : "default";
  const danger = variant === "danger";
  const ghost = variant === "ghost";
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const hideTimer = useRef<number | null>(null);

  const measure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    let top = r.bottom + gap;
    let left = r.left + r.width / 2;
    if (tooltipPlacement === "top") {
      top = r.top - gap;
    } else if (tooltipPlacement === "left") {
      top = r.top + r.height / 2;
      left = r.left - gap;
    } else if (tooltipPlacement === "right") {
      top = r.top + r.height / 2;
      left = r.right + gap;
    }
    setCoords({ top, left });
  }, [tooltipPlacement]);

  const show = useCallback(() => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    measure();
    setOpen(true);
  }, [measure]);

  const hide = useCallback(() => {
    hideTimer.current = window.setTimeout(() => setOpen(false), 80);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => measure();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, measure]);

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const transform =
    tooltipPlacement === "top"
      ? "translate(-50%, -100%)"
      : tooltipPlacement === "left"
        ? "translate(-100%, -50%)"
        : tooltipPlacement === "right"
          ? "translate(0, -50%)"
          : "translate(-50%, 0)";

  const tip =
    open && coords && typeof document !== "undefined"
      ? createPortal(
          <div
            id={tipId}
            role="tooltip"
            className={`callai-tooltip callai-tooltip-${tooltipPlacement}`}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform,
              zIndex: 30100,
            }}
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {label}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={wrapRef}
        className={classNames("icon-btn-wrap", className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <Button
          type={type}
          danger={danger}
          ghost={ghost}
          size={size}
          loading={loading}
          disabled={disabled}
          icon={icon}
          aria-label={label}
          aria-describedby={open ? tipId : undefined}
          className="icon-btn"
          onClick={() => {
            if (sfx) {
              void unlockAudio();
              playSound(sfx);
            }
            onClick?.();
          }}
        />
      </span>
      {tip}
    </>
  );
}

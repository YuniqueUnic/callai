import classNames from "classnames";
import { elementSrc, type ElementId } from "../assets/elements";

export type ElementMotion = "none" | "sway" | "hop" | "breathe" | "wiggle";

interface Props {
  id: ElementId;
  alt?: string;
  size?: number | string;
  className?: string;
  /** Soft island motion — disabled under prefers-reduced-motion */
  motion?: ElementMotion;
}

export function ElementImage({
  id,
  alt = "",
  size = 96,
  className,
  motion = "none",
}: Props) {
  const dim = typeof size === "number" ? `${size}px` : size;
  return (
    <img
      src={elementSrc(id)}
      alt={alt}
      className={classNames(
        "callai-element",
        motion !== "none" && `callai-motion callai-motion-${motion}`,
        className,
      )}
      style={{ width: dim, height: "auto", display: "block", userSelect: "none" }}
      draggable={false}
    />
  );
}

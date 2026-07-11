import classNames from "classnames";
import { elementSrc, type ElementId } from "../assets/elements";

interface Props {
  id: ElementId;
  alt?: string;
  size?: number | string;
  className?: string;
}

export function ElementImage({ id, alt = "", size = 96, className }: Props) {
  const dim = typeof size === "number" ? `${size}px` : size;
  return (
    <img
      src={elementSrc(id)}
      alt={alt}
      className={classNames("callai-element", className)}
      style={{ width: dim, height: "auto", display: "block", userSelect: "none" }}
      draggable={false}
    />
  );
}

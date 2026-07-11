import type { ReactNode } from "react";
import classNames from "classnames";
import { Button, Tooltip } from "animal-island-ui";

type Variant = "default" | "primary" | "danger" | "ghost";

interface Props {
  label: string;
  icon: ReactNode;
  variant?: Variant;
  size?: "small" | "middle";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  onClick?: () => void;
}

export function IconButton({
  label,
  icon,
  variant = "default",
  size = "small",
  loading,
  disabled,
  className,
  tooltipPlacement = "top",
  onClick,
}: Props) {
  const type = variant === "primary" ? "primary" : "default";
  const danger = variant === "danger";
  const ghost = variant === "ghost";

  return (
    <Tooltip title={label} placement={tooltipPlacement} variant="island">
      <span className={classNames("icon-btn-wrap", className)}>
        <Button
          type={type}
          danger={danger}
          ghost={ghost}
          size={size}
          loading={loading}
          disabled={disabled}
          icon={icon}
          aria-label={label}
          title={label}
          className="icon-btn"
          onClick={onClick}
        />
      </span>
    </Tooltip>
  );
}

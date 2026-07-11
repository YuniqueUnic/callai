import type { SVGProps } from "react";

type IconSvgProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...rest }: IconSvgProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true as const,
    ...rest,
  };
}

export function IconPause(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconPlay(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 5.5v13l11-6.5L8 5.5z" fill="currentColor" />
    </svg>
  );
}

export function IconEdit(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M4 20h4.2L19 9.2a1.5 1.5 0 0 0 0-2.1L16.9 5a1.5 1.5 0 0 0-2.1 0L4 15.8V20z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconLogs(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconTrash(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M5 7h14M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M8 7l.7 12a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4L17 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconBolt(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 2L5 13.5h6L11 22l8-11.5h-6L13 2z" fill="currentColor" />
    </svg>
  );
}

export function IconBack(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M14.5 5.5 8 12l6.5 6.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSave(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M5 5.5A1.5 1.5 0 0 1 6.5 4H15l4 4v10.5A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-13z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 4v5h6V4M9 20v-6h6v6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function IconFolder(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M4 8.5A1.5 1.5 0 0 1 5.5 7H9l2 2h7.5A1.5 1.5 0 0 1 20 10.5v7A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSearch(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconPlus(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconRestore(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M7 8.5A6.5 6.5 0 1 1 5.8 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M7 4.5v4.2H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconAlarm(props: IconSvgProps) {
  const { size = 22, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...rest}>
      <circle cx="12" cy="13" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M12 10v3.5l2 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 5l2.5 2.2M19 5l-2.5 2.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconSettings(props: IconSvgProps) {
  const { size = 22, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...rest}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 3v2.2M12 18.8V21M4.9 6.5l1.6 1.5M17.5 16l1.6 1.5M3 12h2.2M18.8 12H21M4.9 17.5l1.6-1.5M17.5 8l1.6-1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

export function IconStop(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
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

export function IconCopy(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M6 15V6.5A1.5 1.5 0 0 1 7.5 5H15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconVolume(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 10v4h3.5L12 18V6L7.5 10H4z" fill="currentColor" />
      <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17.5 7.5a6 6 0 0 1 0 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}


export function IconEye(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function IconEyeOff(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M3 4.5 20.5 20M10.2 10.4a2.5 2.5 0 0 0 3.4 3.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6.2 7.1C4 8.7 2.6 11 2.6 12s3.5 6 9.4 6c1.7 0 3.2-.4 4.5-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.4 6.3C10.2 6.1 11.1 6 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.1 3.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconRefresh(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M20 6v5h-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 18v-5h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 9A7 7 0 0 1 18.5 8M17.5 15A7 7 0 0 1 5.5 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconSend(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M4 11.5 20 4l-5.5 16-2.8-6.2L4 11.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function IconOpen(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M14 5h5v5M19 5l-8 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconChat(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H11l-4 3.2V16H7.5A2.5 2.5 0 0 1 5 13.5v-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 9.5h6M9 12.5h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconClear(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M5 7h14M8.5 7l.6 11.2A1.5 1.5 0 0 0 10.6 19.5h2.8a1.5 1.5 0 0 0 1.5-1.3L15.5 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v5M14 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9.5 7V5.8A1.3 1.3 0 0 1 10.8 4.5h2.4A1.3 1.3 0 0 1 14.5 5.8V7" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconSparkles(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M12 3.5 13.2 8.5 18 9.5 13.2 10.5 12 15.5 10.8 10.5 6 9.5 10.8 8.5 12 3.5z"
        fill="currentColor"
      />
      <path
        d="M18.5 13.5 19 15.5 21 16 19 16.5 18.5 18.5 18 16.5 16 16 18 15.5 18.5 13.5z"
        fill="currentColor"
      />
      <path
        d="M6 14.5 6.4 16 8 16.4 6.4 16.8 6 18.3 5.6 16.8 4 16.4 5.6 16 6 14.5z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconChevronDown(props: IconSvgProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconClose(props: IconSvgProps) {
  const { size = 18, className } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}


import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconChat = (p: P) => (
  <Base {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H9l-5 4V5.5Z" />
  </Base>
);

export const IconGrid = (p: P) => (
  <Base {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Base>
);

export const IconSliders = (p: P) => (
  <Base {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Base>
);

export const IconCamera = (p: P) => (
  <Base {...p}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
    <circle cx="12" cy="13" r="3.25" />
  </Base>
);

export const IconArrowUp = (p: P) => (
  <Base {...p} strokeWidth={2}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Base>
);

export const IconPlus = (p: P) => (
  <Base {...p} strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconBack = (p: P) => (
  <Base {...p} strokeWidth={2}>
    <path d="M15 5l-7 7 7 7" />
  </Base>
);

export const IconChevron = (p: P) => (
  <Base size={16} className="chev" {...p} strokeWidth={2}>
    <path d="M9 5l7 7-7 7" />
  </Base>
);

export const IconX = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
);

export const IconCheck = (p: P) => (
  <Base size={14} {...p} strokeWidth={2.25}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Base>
);

export const IconAlert = (p: P) => (
  <Base size={14} {...p} strokeWidth={2.25}>
    <path d="M12 7v6M12 17h.01" />
  </Base>
);

export const IconQuestion = (p: P) => (
  <Base size={14} {...p} strokeWidth={2.25}>
    <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01" />
  </Base>
);

export const IconDumbbell = (p: P) => (
  <Base {...p}>
    <path d="M7 8v8M17 8v8M4.5 10v4M19.5 10v4M7 12h10" />
  </Base>
);

export const IconShare = (p: P) => (
  <Base {...p}>
    <path d="M12 15V4M8 8l4-4 4 4M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
  </Base>
);

export const IconMic = (p: P) => (
  <Base {...p}>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
  </Base>
);

export const IconStop = (p: P) => (
  <Base {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
  </Base>
);

export const IconArchive = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="4.5" rx="1" />
    <path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" />
  </Base>
);

export const IconEye = (p: P) => (
  <Base {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Base>
);

export const IconRefresh = (p: P) => (
  <Base {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />
  </Base>
);

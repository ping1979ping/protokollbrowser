// Inline-SVG-Icons fuer die PING-Protokoll-App (keine externen Assets).
// Alle Icons erben currentColor und akzeptieren size/className.
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, strokeWidth = 2, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSync = (p: IconProps) => base({ ...p, children: (<><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3" /><path d="M21 3v5h-5M3 21v-5h5" /></>) });
export const IconSearch = (p: IconProps) => base({ ...p, children: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>) });
export const IconPlus = (p: IconProps) => base({ ...p, children: (<><path d="M12 5v14M5 12h14" /></>) });
export const IconChevronLeft = (p: IconProps) => base({ ...p, children: <path d="m15 18-6-6 6-6" /> });
export const IconChevronRight = (p: IconProps) => base({ ...p, children: <path d="m9 18 6-6-6-6" /> });
export const IconChevronDown = (p: IconProps) => base({ ...p, children: <path d="m6 9 6 6 6-6" /> });
export const IconArrowLeft = (p: IconProps) => base({ ...p, children: (<><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>) });
export const IconCheck = (p: IconProps) => base({ ...p, children: <path d="M20 6 9 17l-5-5" /> });
export const IconX = (p: IconProps) => base({ ...p, children: <path d="M18 6 6 18M6 6l12 12" /> });
export const IconKebab = (p: IconProps) => base({ ...p, strokeWidth: 2.4, children: (<><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>) });
export const IconDrag = (p: IconProps) => base({ ...p, strokeWidth: 2.2, children: (<><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></>) });
export const IconCalendar = (p: IconProps) => base({ ...p, children: (<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>) });
export const IconCamera = (p: IconProps) => base({ ...p, children: (<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" /><circle cx="12" cy="13" r="3.2" /></>) });
export const IconMapPin = (p: IconProps) => base({ ...p, children: (<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>) });
export const IconLock = (p: IconProps) => base({ ...p, children: (<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>) });
export const IconTrash = (p: IconProps) => base({ ...p, children: (<><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></>) });
export const IconUser = (p: IconProps) => base({ ...p, children: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>) });
export const IconFilter = (p: IconProps) => base({ ...p, children: <path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" /> });
export const IconList = (p: IconProps) => base({ ...p, children: (<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>) });
export const IconCards = (p: IconProps) => base({ ...p, children: (<><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /></>) });
export const IconTiles = (p: IconProps) => base({ ...p, children: (<><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>) });
export const IconRotate = (p: IconProps) => base({ ...p, children: (<><path d="M2 12a10 10 0 0 1 17-7l3 3M22 12a10 10 0 0 1-17 7l-3-3" /><path d="M22 5v3h-3M2 19v-3h3" /></>) });
export const IconClock = (p: IconProps) => base({ ...p, children: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) });
export const IconBook = (p: IconProps) => base({ ...p, children: (<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" /><path d="M4 19a2 2 0 0 0 2 2h13" /></>) });
export const IconSettings = (p: IconProps) => base({ ...p, children: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>) });
export const IconFolder = (p: IconProps) => base({ ...p, children: <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z" /> });

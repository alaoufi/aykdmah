// Lightweight inline SVG icons, stroke-based, modern
export function Icon({ d, size = 22, stroke = 2, className = '', children, viewBox = '0 0 24 24' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export const IconSearch = (p) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
export const IconPin    = (p) => <Icon {...p}><path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13Z" /><circle cx="12" cy="9" r="2.5" /></Icon>;
export const IconPlus   = (p) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const IconMenu   = (p) => <Icon {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Icon>;
export const IconBolt   = (p) => <Icon {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></Icon>;
export const IconClock  = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
export const IconChat   = (p) => <Icon {...p}><path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" /></Icon>;
export const IconUser   = (p) => <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>;
export const IconHome   = (p) => <Icon {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /></Icon>;
export const IconGrid   = (p) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Icon>;
export const IconStar   = (p) => <Icon {...p}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" /></Icon>;
export const IconShield = (p) => <Icon {...p}><path d="M12 3 4 6v6c0 4.5 3.4 8.4 8 9 4.6-.6 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></Icon>;
export const IconChev   = (p) => <Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>;
export const IconChevL  = (p) => <Icon {...p}><path d="m15 6-6 6 6 6" /></Icon>;
export const IconArrow  = (p) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const IconBell   = (p) => <Icon {...p}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></Icon>;
export const IconClose  = (p) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>;

// Category icons
export const CatTools  = (p) => <Icon {...p}><path d="M14.7 6.3a4 4 0 0 1 5 5l-2.4-.6-1.3 1.3.6 2.4a4 4 0 0 1-5-5l-7.3 7.3a2 2 0 1 0 2.8 2.8l7.3-7.3" /></Icon>;
export const CatClean  = (p) => <Icon {...p}><path d="M7 22h10l1-10H6l1 10Z" /><path d="M9 12V6a3 3 0 1 1 6 0v6" /></Icon>;
export const CatTruck  = (p) => <Icon {...p}><path d="M3 7h11v9H3z" /><path d="M14 10h5l2 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></Icon>;
export const CatBolt2  = (p) => <Icon {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></Icon>;
export const CatPipe   = (p) => <Icon {...p}><path d="M4 6h6v4a3 3 0 0 0 3 3h3v6" /><path d="M14 3v4M18 3v4" /></Icon>;
export const CatAC     = (p) => <Icon {...p}><rect x="3" y="5" width="18" height="8" rx="2" /><path d="M7 17v2M12 17v3M17 17v2" /></Icon>;
export const CatPaint  = (p) => <Icon {...p}><path d="M4 7h13v4H4z" /><path d="M17 9h3v4h-7v3a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-3" /></Icon>;
export const CatGarden = (p) => <Icon {...p}><path d="M12 21V11" /><path d="M12 11C8 11 6 8 6 5c4 0 6 3 6 6Z" /><path d="M12 11c4 0 6-3 6-6-4 0-6 3-6 6Z" /></Icon>;
export const CatBook   = (p) => <Icon {...p}><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Z" /><path d="M4 19a2 2 0 0 1 2-2h12" /></Icon>;
export const CatCar    = (p) => <Icon {...p}><path d="M5 13l2-5h10l2 5" /><rect x="3" y="13" width="18" height="5" rx="1" /><circle cx="7" cy="18" r="1.5" /><circle cx="17" cy="18" r="1.5" /></Icon>;
export const CatLaptop = (p) => <Icon {...p}><rect x="3" y="5" width="18" height="11" rx="2" /><path d="M2 20h20" /></Icon>;
export const CatParty  = (p) => <Icon {...p}><path d="m4 20 5-14 9 9-14 5Z" /><path d="M14 4l2 2M18 8l2 2M16 2v2" /></Icon>;

// Map slug → component (matches database category slugs)
export const CATEGORY_ICONS = {
  'home-maintenance': { Comp: CatTools,  tint: '#0ea5e9', bg: '#e0f2fe' },
  'cleaning':         { Comp: CatClean,  tint: '#10b981', bg: '#d1fae5' },
  'moving':           { Comp: CatTruck,  tint: '#f59e0b', bg: '#fef3c7' },
  'electrical':       { Comp: CatBolt2,  tint: '#eab308', bg: '#fef9c3' },
  'plumbing':         { Comp: CatPipe,   tint: '#06b6d4', bg: '#cffafe' },
  'ac-cooling':       { Comp: CatAC,     tint: '#3b82f6', bg: '#dbeafe' },
  'paint-decor':      { Comp: CatPaint,  tint: '#ef4444', bg: '#fee2e2' },
  'gardens':          { Comp: CatGarden, tint: '#22c55e', bg: '#dcfce7' },
  'education':        { Comp: CatBook,   tint: '#8b5cf6', bg: '#ede9fe' },
  'cars':             { Comp: CatCar,    tint: '#0f172a', bg: '#e2e8f0' },
  'tech':             { Comp: CatLaptop, tint: '#6366f1', bg: '#e0e7ff' },
  'events':           { Comp: CatParty,  tint: '#ec4899', bg: '#fce7f3' },
};

export function getCategoryIcon(slug) {
  return Object.prototype.hasOwnProperty.call(CATEGORY_ICONS, slug)
    ? CATEGORY_ICONS[slug] : { Comp: CatTools, tint: '#0ea5e9', bg: '#e0f2fe' };
}

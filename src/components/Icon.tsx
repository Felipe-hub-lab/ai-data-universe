/** Minimal 16px stroke icon set, drawn for this project. */
const PATHS: Record<string, string> = {
  search: 'M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM11 11l3.5 3.5',
  star: 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6 4.2 13.6l.7-4.3-3.1-3 4.3-.6L8 1.8Z',
  history: 'M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.6h2.6M8 5v3.2l2 1.3',
  reset: 'M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.4h2.4',
  play: 'M5 3.2v9.6L12.5 8 5 3.2Z',
  pause: 'M5 3v10M11 3v10',
  download: 'M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11',
  close: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
  menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  chevron: 'M4 6l4 4 4-4',
  target: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 8h.01',
  spark: 'M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4M3.4 3.4l2 2M10.6 10.6l2 2M3.4 12.6l2-2M10.6 5.4l2-2',
  layers: 'M8 2 1.5 5.5 8 9l6.5-3.5L8 2ZM1.5 8.5 8 12l6.5-3.5M1.5 11 8 14.5l6.5-3.5',
  filter: 'M2 3h12l-4.5 5.5V13l-3 1.5V8.5L2 3Z',
  info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 7.2V11M8 5h.01',
  flag: 'M3.5 14.5v-12M3.5 2.5h8l-1.8 3 1.8 3h-8',
  route: 'M3.5 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12.5 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 12h4.5a2 2 0 0 0 0-4h-3a2 2 0 0 1 0-4H11',
  step: 'M11.5 3.5v9M3.5 3.2v9.6L10 8 3.5 3.2Z',
  back: 'M4.5 3.5v9M12.5 3.2v9.6L6 8l6.5-4.8Z',
  send: 'M2 8h11M9 4l4 4-4 4',
  table: 'M2 3h12v10H2zM2 6.5h12M2 10h12M6 3v10',
};

export function Icon({ name, size = 16, filled = false, title }: { name: keyof typeof PATHS | string; size?: number; filled?: boolean; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

/** Project symbol: a core, an orbit tilted like the galaxy plane, and one satellite. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <radialGradient id="adu-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F4F7FB" />
          <stop offset="45%" stopColor="#00E5FF" />
          <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="6.5" fill="url(#adu-core)" />
      <ellipse cx="16" cy="16" rx="14" ry="5.6" fill="none" stroke="#356BFF" strokeWidth="1.3" transform="rotate(-24 16 16)" />
      <ellipse cx="16" cy="16" rx="14" ry="5.6" fill="none" stroke="#9B5CFF" strokeWidth="1" strokeOpacity=".7" transform="rotate(36 16 16)" />
      <circle cx="28.2" cy="10.4" r="1.9" fill="#F4F7FB" />
    </svg>
  );
}

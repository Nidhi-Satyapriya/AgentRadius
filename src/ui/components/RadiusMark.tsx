/** MCPRadius mark: a point with expanding reach arcs. Decorative; the wordmark carries the name. */
export function RadiusMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="radius-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="radius-mark-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#radius-mark-fill)" />
      <circle cx="11" cy="21" r="2.6" fill="#fff" />
      <path
        d="M11 14.5a6.5 6.5 0 0 1 6.5 6.5"
        stroke="#fff"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M11 8.5a12.5 12.5 0 0 1 12.5 12.5"
        stroke="#fff"
        strokeOpacity="0.6"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

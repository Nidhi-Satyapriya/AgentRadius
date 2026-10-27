import type { RoutePath } from "../routing.ts";

export type IconName = RoutePath | "pulse";

/** Simple 16px outline icons for navigation. Decorative: every link also has a text label. */
const PATHS: Readonly<Record<IconName, string>> = {
  overview: "M2.5 2.5h4.5v4.5h-4.5z M9 2.5h4.5v4.5H9z M2.5 9h4.5v4.5h-4.5z M9 9h4.5v4.5H9z",
  integrations: "M6 2.5v3 M10 2.5v3 M4 5.5h8v2.5a4 4 0 0 1-8 0z M8 12v1.5",
  graph:
    "M4 4m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M12 4m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M8 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M5.5 4h5 M4.8 5.3l2.4 5.4 M11.2 5.3l-2.4 5.4",
  "blast-radius":
    "M8 8m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M8 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M8 8m-6.5 0a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0",
  remediation: "M3 8.5l3 3 7-7",
  pulse: "M1.5 8h3l2-5 3 10 2-5h3",
  settings:
    "M8 8m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2 M3.4 3.4l1.4 1.4 M11.2 11.2l1.4 1.4 M3.4 12.6l1.4-1.4 M11.2 4.8l1.4-1.4",
};

export function NavIcon({ name }: { name: IconName }) {
  return (
    <svg className="nav-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

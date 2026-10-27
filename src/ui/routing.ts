import { useCallback, useEffect, useState } from "react";

export const PRIMARY_ROUTES = [
  { path: "overview", label: "Overview" },
  { path: "integrations", label: "Integrations" },
  { path: "graph", label: "Permission Graph" },
  { path: "blast-radius", label: "Blast Radius" },
  { path: "remediation", label: "Remediation" },
] as const;

export const SECONDARY_ROUTES = [{ path: "settings", label: "Settings" }] as const;

export const ROUTES = [...PRIMARY_ROUTES, ...SECONDARY_ROUTES] as const;

export type RoutePath = (typeof ROUTES)[number]["path"];

export interface Route {
  readonly path: RoutePath;
  readonly params: URLSearchParams;
}

/** Earlier locations that moved, so saved links keep working. */
const MOVED: Readonly<Record<string, { path: RoutePath; params?: Record<string, string> }>> = {
  findings: { path: "remediation" },
  permissions: { path: "graph", params: { view: "permissions" } },
  activity: { path: "overview" },
};

export function parseHash(hash: string): Route {
  const [rawPath = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  const moved = MOVED[rawPath];
  if (moved) {
    for (const [k, v] of Object.entries(moved.params ?? {})) params.set(k, v);
    return { path: moved.path, params };
  }
  const known = ROUTES.find((r) => r.path === rawPath);
  return { path: known?.path ?? "overview", params };
}

export function href(path: RoutePath, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString();
  return `#/${path}${query ? `?${query}` : ""}`;
}

export function useRoute(): [Route, (path: RoutePath, params?: Record<string, string>) => void] {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((path: RoutePath, params: Record<string, string> = {}) => {
    window.location.hash = href(path, params);
  }, []);
  return [route, navigate];
}

import { useEffect, useState } from "react";
import type { WorkspaceResponse } from "../api/contracts.ts";
import { api } from "./api.ts";
import { DataSourceBanner } from "./components/DataSourceBanner.tsx";
import { AccountMenu } from "./components/AccountMenu.tsx";
import { NavIcon } from "./components/NavIcon.tsx";
import { RadiusMark } from "./components/RadiusMark.tsx";
import { SourceStatus } from "./components/SourceControls.tsx";
import { ErrorState, Loading } from "./components/States.tsx";
import { BlastRadiusPage } from "./pages/BlastRadiusPage.tsx";
import { GraphPage } from "./pages/GraphPage.tsx";
import { IntegrationsPage } from "./pages/IntegrationsPage.tsx";
import { OverviewPage } from "./pages/OverviewPage.tsx";
import { RemediationPage } from "./pages/RemediationPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import {
  href,
  PRIMARY_ROUTES,
  SECONDARY_ROUTES,
  useRoute,
  type Route,
  type RoutePath,
} from "./routing.ts";
import { AuthProvider } from "./auth.tsx";
import { useAsyncTask } from "./useAsync.ts";
import { WorkspaceProvider } from "./workspace.tsx";

function Page({ route }: { route: Route }) {
  const p = route.params;
  switch (route.path) {
    case "overview":
      return <OverviewPage signInFailed={p.get("signin") === "failed"} />;
    case "integrations":
      return <IntegrationsPage selectedId={p.get("source")} />;
    case "graph":
      return (
        <GraphPage
          key={p.toString()}
          focusId={p.get("focus")}
          justScanned={p.get("scanned") === "1"}
          pathEdgeIds={p.get("path")?.split(",").filter(Boolean) ?? []}
          view={p.get("view")}
          sourceId={p.get("source")}
        />
      );
    case "blast-radius": {
      const start = p.get("start");
      return <BlastRadiusPage key={start ?? ""} startId={start} />;
    }
    case "remediation":
      return <RemediationPage focusId={p.get("finding")} />;
    case "settings":
      return <SettingsPage />;
  }
}

const focusOnMount = (el: HTMLElement | null) => el?.focus({ preventScroll: true });

function NavList({
  routes,
  current,
  icons = true,
}: {
  routes: readonly { path: RoutePath; label: string }[];
  current: RoutePath;
  icons?: boolean;
}) {
  return (
    <ul className="nav-list">
      {routes.map((r) => (
        <li key={r.path}>
          <a href={href(r.path)} aria-current={current === r.path ? "page" : undefined}>
            {icons && <NavIcon name={r.path} />}
            {r.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Shell({
  data,
  route,
  onWorkspaceChange,
}: {
  data: WorkspaceResponse;
  route: Route;
  onWorkspaceChange?: (next: WorkspaceResponse) => void;
}) {
  return (
    <AuthProvider>
      <WorkspaceProvider data={data} {...(onWorkspaceChange ? { replace: onWorkspaceChange } : {})}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div className="app">
          <header className="topbar">
            <a className="brand" href={href("overview")}>
              <RadiusMark size={26} />
              <h1>
                MCP<span>Radius</span>
              </h1>
            </a>
            <nav aria-label="Primary" className="topnav">
              <NavList routes={PRIMARY_ROUTES} current={route.path} />
            </nav>
            <div className="topbar-end">
              <nav aria-label="Secondary" className="nav-secondary">
                <NavList routes={SECONDARY_ROUTES} current={route.path} icons={false} />
              </nav>
              <SourceStatus />
              <AccountMenu />
            </div>
          </header>
          <DataSourceBanner data={data} />
          {/* Remounting per route moves focus to the new page for keyboard and screen-reader users. */}
          <main id="main" key={route.path} ref={focusOnMount} tabIndex={-1}>
            <Page route={route} />
          </main>
        </div>
      </WorkspaceProvider>
    </AuthProvider>
  );
}

export function App() {
  const [route] = useRoute();
  const workspace = useAsyncTask(api.workspace);
  const [replacement, setReplacement] = useState<WorkspaceResponse | null>(null);
  const { run } = workspace;
  useEffect(() => run(), [run]);

  switch (workspace.state.status) {
    case "idle":
    case "loading":
      return <Loading what="workspace" />;
    case "error":
      return <ErrorState message={workspace.state.message} onRetry={run} />;
    case "success": {
      const data = replacement ?? workspace.state.data;
      // Remount on source change so page-level selections never point at entities that vanished.
      return (
        <Shell
          key={data.meta.snapshotId}
          data={data}
          route={route}
          onWorkspaceChange={setReplacement}
        />
      );
    }
  }
}

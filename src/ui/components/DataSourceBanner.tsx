import type { WorkspaceResponse } from "../../api/contracts.ts";

/** Fixture data is always labeled. Live data is labeled in the top bar. */
export function DataSourceBanner({ data }: { data: WorkspaceResponse }) {
  if (data.meta.dataOrigin !== "fixture") return null;
  return (
    <div className="banner" role="status">
      <strong>DEMO FIXTURE</strong> {data.meta.fixtureNotice}
    </div>
  );
}

import { useEffect } from "react";
import type { WorkspaceResponse } from "../../api/contracts.ts";
import { api } from "../api.ts";
import { useAsyncTask } from "../useAsync.ts";
import { useWorkspace } from "../workspace.tsx";

const SCAN_DISCLOSURE =
  "Reads the MCP config files of Cursor, VS Code, Claude Desktop, Claude Code, and Windsurf. Values are discarded while reading. Nothing is started, changed, saved, or sent.";

/** Display-only relative time; analysis never reads the wall clock. */
export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} days ago` : new Date(iso).toLocaleDateString();
}

/** Runs a workspace-changing request and swaps the result in. Inert without `replace`. */
export function useWorkspaceChange<A extends unknown[]>(
  change: (...args: A) => Promise<WorkspaceResponse>,
) {
  const { replace } = useWorkspace();
  const { state, run } = useAsyncTask(change);
  useEffect(() => {
    if (state.status === "success") replace?.(state.data);
  }, [state, replace]);
  return {
    available: replace !== undefined,
    busy: state.status === "loading",
    succeeded: state.status === "success",
    error: state.status === "error" ? state.message : null,
    run,
  };
}

const switchSource = (action: "scan" | "demo") =>
  action === "scan" ? api.scanThisMac() : api.useDemo();

/** Where the data on screen came from, and the one control to change it. */
export function SourceStatus() {
  const { data } = useWorkspace();
  const source = useWorkspaceChange(switchSource);
  const live = data.meta.dataOrigin !== "fixture";

  return (
    <div className="source-status">
      <p className={`source-label ${live ? "is-live" : "is-demo"}`}>
        <span className="status-dot" aria-hidden="true" />
        <strong>{live ? "LIVE · THIS MAC" : "Demo data"}</strong>
      </p>
      <p className="source-sub">
        {live ? `Synced ${timeAgo(data.meta.collectedAt)}` : "Reads local MCP config files only."}
      </p>
      {source.available && (
        <div className="source-actions">
          <button
            type="button"
            className={live ? "btn-secondary" : "btn-primary"}
            onClick={() => source.run("scan")}
            disabled={source.busy}
            title={SCAN_DISCLOSURE}
          >
            {source.busy ? "Scanning…" : live ? "Sync now" : "Scan this Mac"}
          </button>
          {live && (
            <button
              type="button"
              className="btn-link"
              onClick={() => source.run("demo")}
              disabled={source.busy}
            >
              Use demo data
            </button>
          )}
        </div>
      )}
      {source.error !== null && (
        <p className="inline-error" role="alert">
          {source.error}
        </p>
      )}
    </div>
  );
}

/** Re-reads this Mac's sources. Used where a single source is being inspected. */
export function SyncButton() {
  const source = useWorkspaceChange(api.scanThisMac);
  if (!source.available) return null;
  return (
    <>
      <button
        type="button"
        className="btn-primary"
        onClick={() => source.run()}
        disabled={source.busy}
        title={SCAN_DISCLOSURE}
      >
        {source.busy ? "Syncing…" : "Sync"}
      </button>
      {source.error !== null && (
        <span className="inline-error" role="alert">
          {source.error}
        </span>
      )}
    </>
  );
}

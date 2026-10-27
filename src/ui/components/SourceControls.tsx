import { useEffect } from "react";
import type { WorkspaceResponse } from "../../api/contracts.ts";
import { api } from "../api.ts";
import { href } from "../routing.ts";
import { useAsyncTask } from "../useAsync.ts";
import { useWorkspace } from "../workspace.tsx";

export const SCAN_DISCLOSURE =
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

/**
 * Runs a workspace-changing request and swaps the result in. Inert without `replace`.
 * `onSuccess` runs before the swap, because the swap remounts the page. Pass a stable function.
 */
export function useWorkspaceChange<A extends unknown[]>(
  change: (...args: A) => Promise<WorkspaceResponse>,
  onSuccess?: () => void,
) {
  const { replace } = useWorkspace();
  const { state, run } = useAsyncTask(change);
  useEffect(() => {
    if (state.status !== "success") return;
    onSuccess?.();
    replace?.(state.data);
  }, [state, replace, onSuccess]);
  return {
    available: replace !== undefined,
    busy: state.status === "loading",
    succeeded: state.status === "success",
    error: state.status === "error" ? state.message : null,
    run,
  };
}

const openGraph = () => {
  window.location.hash = href("graph", { scanned: "1" });
};

/** Scans this computer, then opens the Permission Graph. */
export function ScanButton({ className = "btn-primary" }: { className?: string }) {
  const { data } = useWorkspace();
  const scan = useWorkspaceChange(api.scanThisMac, openGraph);
  if (!scan.available) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => scan.run()}
        disabled={scan.busy}
        title={SCAN_DISCLOSURE}
      >
        {scan.busy ? "Scanning…" : data.scannedAt ? "Scan again" : "Scan this computer"}
      </button>
      {scan.error !== null && (
        <span className="inline-error" role="alert">
          {scan.error}
        </span>
      )}
    </>
  );
}

/** Where the data on screen came from. */
export function SourceStatus() {
  const { data } = useWorkspace();
  const live = data.scannedAt !== null;
  return (
    <span
      className={`source-pill ${live ? "is-live" : "is-idle"}`}
      title={live ? SCAN_DISCLOSURE : "This computer hasn't been scanned yet."}
    >
      <span className="status-dot" aria-hidden="true" />
      {live ? (
        <>
          <strong>LIVE · THIS COMPUTER</strong>
          <span className="muted">{timeAgo(data.scannedAt!)}</span>
        </>
      ) : (
        <span>Not scanned yet</span>
      )}
    </span>
  );
}

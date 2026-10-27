import { Empty } from "../components/States.tsx";
import { useWorkspace, type WorkspaceModel } from "../workspace.tsx";

type Entry = WorkspaceModel["data"]["activity"][number];

const ACTION_LABELS: Record<Entry["action"], string> = {
  scan: "Synced this Mac",
  add_agent: "Added an agent",
  remove_agent: "Removed an agent",
};

export function ActivityPage() {
  const { data } = useWorkspace();
  return (
    <div className="page">
      <header className="page-header">
        <h2>Activity log</h2>
        <p className="muted">
          What was done in AgentRadius during this session. Kept in memory and cleared when it
          stops.
        </p>
      </header>
      {data.activity.length === 0 ? (
        <Empty>Nothing yet. Syncing or adding an agent is recorded here.</Empty>
      ) : (
        <div className="card card-flush table-scroll">
          <table className="table">
            <caption className="sr-only">Activity log</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">Action</th>
                <th scope="col">Target</th>
                <th scope="col">Outcome</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.activity.map((a) => (
                <tr key={a.id}>
                  <td>
                    <time dateTime={a.at}>{new Date(a.at).toLocaleString()}</time>
                  </td>
                  <td>{a.actor}</td>
                  <td>{ACTION_LABELS[a.action]}</td>
                  <td>{a.target}</td>
                  <td>
                    <span
                      className={`status-pill ${a.outcome === "succeeded" ? "tone-ok" : "tone-bad"}`}
                    >
                      <span className="status-dot" aria-hidden="true" />
                      {a.outcome === "succeeded" ? "Succeeded" : "Failed"}
                    </span>
                  </td>
                  <td>
                    {a.summary}
                    {a.findingsResolved !== undefined &&
                      ` ${a.findingsResolved} resolved, ${a.findingsNew ?? 0} new since the last sync.`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

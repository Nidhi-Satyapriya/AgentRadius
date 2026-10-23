import { useMemo, useState } from "react";
import { AssertionBadge, ConfidenceBadge } from "../components/Badges.tsx";
import { Empty } from "../components/States.tsx";
import { href } from "../routing.ts";
import { useWorkspace } from "../workspace.tsx";

type GroupBy = "holder" | "resource" | "action";

/** Direct grants (one hop), grouped. Shown as a view of the Permission Graph page. */
export function PermissionsView() {
  const ws = useWorkspace();
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("holder");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = ws.data.permissions.filter(
      (r) =>
        q === "" ||
        [
          r.holderId,
          r.resourceId,
          r.permissionId ?? "",
          ws.label(r.holderId),
          ws.label(r.resourceId),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
    );
    const key = (r: (typeof rows)[number]) =>
      groupBy === "holder" ? r.holderId : groupBy === "resource" ? r.resourceId : r.action;
    const map = new Map<string, typeof rows>();
    for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
    return [...map.entries()].sort(([a], [b]) => ws.label(a).localeCompare(ws.label(b)));
  }, [ws, query, groupBy]);

  return (
    <>
      <div className="filters">
        <label className="search">
          <span className="sr-only">Filter permissions</span>
          <input
            type="search"
            placeholder="Filter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Group by{" "}
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            <option value="holder">holder</option>
            <option value="resource">resource</option>
            <option value="action">action</option>
          </select>
        </label>
      </div>
      {groups.length === 0 && <Empty>No permissions match.</Empty>}
      {groups.map(([group, rows]) => (
        <section className="card" key={group}>
          <h3>{groupBy === "action" ? group : ws.label(group)}</h3>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Holder</th>
                  <th scope="col">Action</th>
                  <th scope="col">Resource</th>
                  <th scope="col">Via permission</th>
                  <th scope="col">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.holderId}|${r.resourceId}|${r.action}|${r.permissionId ?? ""}`}>
                    <td>
                      <a href={href("graph", { focus: r.holderId })}>{ws.label(r.holderId)}</a>
                    </td>
                    <td>{r.action}</td>
                    <td>{ws.label(r.resourceId)}</td>
                    <td>
                      {r.permissionId ? (
                        ws.label(r.permissionId)
                      ) : (
                        <span className="muted">direct</span>
                      )}
                    </td>
                    <td>
                      <AssertionBadge value={r.assertion} />{" "}
                      <ConfidenceBadge value={r.confidence} />
                      {r.scopes.length > 0 && <div className="muted">{r.scopes.join(", ")}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}

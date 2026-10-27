import { plural } from "../labels.ts";
import { href } from "../routing.ts";
import { useWorkspace } from "../workspace.tsx";
import { SeverityBadge } from "./Badges.tsx";

/** Bottom-of-page hand-off to Remediation, starting with the most severe finding. */
export function RemediateCta() {
  const { findings } = useWorkspace().data;
  const urgent = findings.filter((f) => f.severity === "critical" || f.severity === "high");
  const top = urgent[0] ?? findings[0];
  return (
    <a className="remediate-cta" href={href("remediation", top ? { finding: top.id } : {})}>
      <span>
        <strong>
          {findings.length === 0
            ? "No findings to remediate"
            : `Remediate ${plural(findings.length, "finding")}`}
        </strong>
        <span className="muted">
          {top ? (
            <>
              <SeverityBadge value={top.severity} /> Start with: {top.title}
            </>
          ) : (
            "This covers only the sources you added or scanned."
          )}
        </span>
      </span>
      <span className="cta-arrow" aria-hidden="true">
        →
      </span>
    </a>
  );
}

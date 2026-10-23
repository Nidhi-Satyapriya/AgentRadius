import { useEffect, useId, useState, type FormEvent } from "react";
import {
  ACCESS_LABELS,
  AGENT_PRESETS,
  AGENT_RUNTIMES,
  CATALOG_APPS,
  DECLARED_ACCESS,
  RUNTIME_LABELS,
  type AgentRuntime,
  type DeclaredAccess,
} from "../../domain/core.ts";
import { api } from "../api.ts";
import { useWorkspaceChange } from "./SourceControls.tsx";

/** Lets the user describe an agent that discovery cannot see. Nothing is contacted or verified. */
export function DeclareAgentForm({ onClose }: { onClose: () => void }) {
  const ids = useId();
  const [presetId, setPresetId] = useState("");
  const [name, setName] = useState("");
  const [runtime, setRuntime] = useState<AgentRuntime>("in_app");
  const [appIds, setAppIds] = useState<ReadonlySet<string>>(new Set());
  const [access, setAccess] = useState<DeclaredAccess>("unknown");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = useWorkspaceChange(api.declareAgent);

  useEffect(() => {
    if (submit.succeeded) onClose();
  }, [submit.succeeded, onClose]);

  const choosePreset = (id: string) => {
    setPresetId(id);
    const preset = AGENT_PRESETS.find((p) => p.id === id);
    setName(preset?.label ?? "");
    setRuntime(preset?.runtime ?? "unknown");
    setAppIds(new Set(preset?.appIds ?? []));
  };

  const toggleApp = (id: string) => {
    const next = new Set(appIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAppIds(next);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() === "") return setProblem("Enter a name.");
    if (appIds.size === 0) return setProblem("Choose at least one app.");
    setProblem(null);
    submit.run({
      name: name.trim(),
      runtime,
      appIds: CATALOG_APPS.map((a) => a.id).filter((id) => appIds.has(id)),
      access,
    });
  };

  const error = problem ?? submit.error;

  return (
    <form className="card form" onSubmit={onSubmit} aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>Add an agent</h3>
      <div className="form-row">
        <label className="field">
          <span>Agent</span>
          <select value={presetId} onChange={(e) => choosePreset(e.target.value)}>
            <option value="">Custom agent</option>
            {AGENT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Support triage bot"
            required
          />
        </label>
        <label className="field">
          <span>Runs in</span>
          <select value={runtime} onChange={(e) => setRuntime(e.target.value as AgentRuntime)}>
            {AGENT_RUNTIMES.map((r) => (
              <option key={r} value={r}>
                {RUNTIME_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Access</span>
          <select value={access} onChange={(e) => setAccess(e.target.value as DeclaredAccess)}>
            {DECLARED_ACCESS.map((a) => (
              <option key={a} value={a}>
                {ACCESS_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="app-picker">
        <legend>Apps it can reach</legend>
        {CATALOG_APPS.map((a) => (
          <label key={a.id} className="check">
            <input type="checkbox" checked={appIds.has(a.id)} onChange={() => toggleApp(a.id)} />
            {a.label}
          </label>
        ))}
      </fieldset>
      <p className="muted form-note">Kept in memory until AgentRadius stops. Not verified.</p>
      {error !== null && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={submit.busy}>
          {submit.busy ? "Adding…" : "Add agent"}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

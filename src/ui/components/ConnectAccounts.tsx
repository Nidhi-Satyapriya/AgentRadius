import { useCallback, useId, useState, type FormEvent } from "react";
import { PROVIDERS, type ProviderId, type ProviderInfo } from "../../domain/core.ts";
import { api } from "../api.ts";
import { monogram } from "../integrations.ts";
import { plural } from "../labels.ts";
import { href } from "../routing.ts";
import { useWorkspace } from "../workspace.tsx";
import { timeAgo, useWorkspaceChange } from "./SourceControls.tsx";

export const CONNECT_ANCHOR = "connect-accounts";

/** Read-only account connections. Status comes from a read that actually succeeded. */
export function ConnectAccounts() {
  const { data, replace } = useWorkspace();
  const [open, setOpen] = useState<ProviderId | null>(null);
  const close = useCallback(() => setOpen(null), []);

  return (
    <section className="card connect-card" id={CONNECT_ANCHOR} aria-labelledby="connect-title">
      <div className="card-head">
        <h3 id="connect-title">Supported accounts</h3>
      </div>
      <p className="muted">
        Configure GitHub or Notion with a read-only token. MCPRadius reads once and drops the token;
        it is never saved or shown.
      </p>
      <ul className="connect-list">
        {PROVIDERS.map((p) => {
          const conn = data.connections.find((c) => c.provider === p.id);
          return (
            <li key={p.id} className={`connect-item ${conn ? "is-connected" : ""}`}>
              <div className="connect-row">
                <span className="app-icon" aria-hidden="true">
                  {monogram(p.label)}
                </span>
                <div className="connect-text">
                  <strong>{p.label}</strong>
                  <span className="muted">
                    {conn
                      ? `Read ${plural(conn.items, p.items[0], p.items[1])} as ${conn.accountLabel}, ${timeAgo(conn.readAt)}${conn.truncated ? " (first part only)" : ""}`
                      : `Lists the ${p.items[1]} you can reach`}
                  </span>
                </div>
                {replace && open !== p.id && (
                  <div className="connect-actions">
                    <button
                      type="button"
                      className={conn ? "btn-secondary" : "btn-primary"}
                      onClick={() => setOpen(p.id)}
                    >
                      {conn ? "Read again" : "Connect"}
                    </button>
                    {conn && <DisconnectButton provider={p} />}
                  </div>
                )}
              </div>
              {conn && <p className="small muted">{p.limits}</p>}
              {open === p.id && <ConnectForm provider={p} onDone={close} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ConnectForm({ provider, onDone }: { provider: ProviderInfo; onDone: () => void }) {
  const ids = useId();
  const [token, setToken] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const connect = useWorkspaceChange(api.connect, onDone);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = token.trim();
    // Cleared right away so the value doesn't linger in the page.
    setToken("");
    if (!provider.tokenPattern.test(value))
      return setProblem(`That isn't a ${provider.tokenName}. ${provider.tokenHint}.`);
    setProblem(null);
    connect.run({ provider: provider.id, token: value });
  };
  const error = problem ?? connect.error;
  const errorId = `${ids}-error`;

  return (
    <form className="connect-form" onSubmit={onSubmit} aria-label={`Connect ${provider.label}`}>
      <ol className="connect-steps">
        {provider.setupSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <a href={provider.setupUrl} target="_blank" rel="noopener noreferrer">
        Open {provider.label} in a new tab
      </a>
      <label className="field" htmlFor={`${ids}-token`}>
        <span>Paste the {provider.tokenName}</span>
        <input
          id={`${ids}-token`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={provider.tokenHint}
          aria-describedby={error !== null ? errorId : undefined}
          required
        />
      </label>
      {error !== null && (
        <p id={errorId} className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={connect.busy}>
          {connect.busy ? "Reading…" : "Read my access"}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
      <p className="small muted">
        Sent only to {provider.label}, over this computer&apos;s own connection. Read-only requests;
        nothing in {provider.label} changes.
      </p>
    </form>
  );
}

function DisconnectButton({ provider }: { provider: ProviderInfo }) {
  const disconnect = useWorkspaceChange(api.disconnect);
  return (
    <>
      <button
        type="button"
        className="btn-danger-ghost"
        onClick={() => disconnect.run(provider.id)}
        disabled={disconnect.busy}
      >
        Remove
      </button>
      {disconnect.error !== null && (
        <span className="inline-error" role="alert">
          {disconnect.error}
        </span>
      )}
    </>
  );
}

/** Points an added agent at the matching connection, or says plainly that none exists yet. */
export function ConnectPrompt({ appIds }: { appIds: readonly string[] }) {
  const { data } = useWorkspace();
  const providers = PROVIDERS.filter((p) => appIds.includes(p.appId));
  const unsupported = appIds.length - providers.length;
  return (
    <div className="connect-prompt">
      {providers.map((p) => {
        const conn = data.connections.find((c) => c.provider === p.id);
        return conn ? (
          <p key={p.id}>
            <strong>{p.label}:</strong> using the {plural(conn.items, p.items[0], p.items[1])} read
            from {conn.accountLabel}.
          </p>
        ) : (
          <p key={p.id}>
            <strong>{p.label}:</strong> assumed to reach everything you can.{" "}
            <a href={`${href("integrations")}`} onClick={scrollToConnect}>
              Connect {p.label}
            </a>{" "}
            to list the real {p.items[1]}.
          </p>
        );
      })}
      {unsupported > 0 && (
        <p className="muted">
          {providers.length > 0 ? "The other apps" : "These apps"} can&apos;t be connected yet, so
          their access stays assumed.
        </p>
      )}
    </div>
  );
}

function scrollToConnect() {
  requestAnimationFrame(() =>
    document.getElementById(CONNECT_ANCHOR)?.scrollIntoView({ behavior: "smooth" }),
  );
}

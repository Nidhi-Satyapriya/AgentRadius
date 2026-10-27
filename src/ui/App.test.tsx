// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ANALYSIS_SETTINGS } from "../analysis/index.ts";
import { createDemoWorkspaceService, createWorkspaceSession } from "../application/workspace.ts";
import { SENTINEL } from "../../tests/helpers/graphBuilder.ts";
import { scanForSecrets } from "../redaction/index.ts";
import { Shell } from "./App.tsx";
import { href, parseHash, PRIMARY_ROUTES, ROUTES, type Route, type RoutePath } from "./routing.ts";

const service = createDemoWorkspaceService();
const data = service.view(DEFAULT_ANALYSIS_SETTINGS);
const empty = createWorkspaceSession(async () => ({}))
  .current()
  .view(DEFAULT_ANALYSIS_SETTINGS);
const SIGN_IN_OFF = {
  provider: "google",
  configured: false,
  redirectUri: "http://127.0.0.1:4317/api/v1/auth/google/callback",
  user: null,
};

function renderAt(path: RoutePath, params: Record<string, string> = {}) {
  const route: Route = { path, params: new URLSearchParams(params) };
  return render(<Shell data={data} route={route} />);
}

/** Routes UI fetches to the in-process service so tests exercise real analysis output. */
function stubApi() {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const settings = body.settings ?? DEFAULT_ANALYSIS_SETTINGS;
    const payload = url.endsWith("/auth")
      ? SIGN_IN_OFF
      : url.endsWith("/blast-radius")
        ? service.blastRadius(body.startId, settings)
        : service.simulate(body.startId, body.changes, settings);
    return { ok: true, status: 200, json: async () => payload };
  });
}

beforeEach(stubApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dashboard shell", () => {
  it("always shows the fixture banner and every primary page", () => {
    renderAt("overview");
    expect(screen.getByText("DEMO FIXTURE")).toBeTruthy();
    expect(screen.getByText(/Synthetic demo data/)).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(PRIMARY_ROUTES.map((r) => r.label));
    const secondary = screen.getByRole("navigation", { name: "Secondary" });
    expect(
      within(secondary)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["Settings"]);
  });

  it("keeps old links working by sending them where their content moved", () => {
    const findings = parseHash("#/findings?finding=x");
    expect([findings.path, findings.params.get("finding")]).toEqual(["remediation", "x"]);
    const permissions = parseHash("#/permissions");
    expect([permissions.path, permissions.params.get("view")]).toEqual(["graph", "permissions"]);
  });

  it("states plainly that nothing is monitored or blocked", () => {
    renderAt("overview");
    expect(screen.getByText(/nothing is changed, monitored, or blocked/)).toBeTruthy();
  });

  it("explains an empty result instead of implying safety, and labels live sources", () => {
    const live = {
      ...data,
      findings: [],
      meta: { ...data.meta, dataOrigin: "local_discovery" as const, snapshotId: "local:x" },
      scannedAt: data.meta.collectedAt,
    };
    const route = (path: RoutePath): Route => ({ path, params: new URLSearchParams() });
    const { unmount } = render(<Shell data={live} route={route("overview")} />);
    expect(screen.getByText(/No findings\. This covers only the sources/)).toBeTruthy();
    expect(screen.getByText("LIVE · THIS COMPUTER")).toBeTruthy();
    unmount();
    render(<Shell data={live} route={route("integrations")} />);
    expect(screen.getByText(/Nothing here changes anything/)).toBeTruthy();
  });

  it("renders no secret-shaped text on any page", () => {
    for (const r of ROUTES) {
      const { container, unmount } = renderAt(r.path);
      expect(scanForSecrets(container.textContent ?? "")).toEqual([]);
      unmount();
    }
  });
});

describe("integrations page", () => {
  it("adds an undetectable agent from a preset", async () => {
    const session = createWorkspaceSession(async () => ({}));
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.endsWith("/auth")) return { ok: true, status: 200, json: async () => SIGN_IN_OFF };
      session.declareAgent(JSON.parse(String(init?.body)));
      return {
        ok: true,
        status: 200,
        json: async () => session.current().view(DEFAULT_ANALYSIS_SETTINGS),
      };
    });
    const onChange = vi.fn();
    render(
      <Shell
        data={data}
        route={{ path: "integrations", params: new URLSearchParams() }}
        onWorkspaceChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Notion AI" }));
    const form = screen.getByRole("form", { name: "Add Notion AI" });
    expect(within(form).getByLabelText("Notion")).toHaveProperty("checked", true);
    fireEvent.click(within(form).getByRole("button", { name: "Add agent" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = onChange.mock.calls[0]![0] as typeof data;
    expect(next.declaredAgents.map((a) => a.name)).toEqual(["Notion AI"]);
  });

  it("connects an account with a pasted token and shows status only after a real read", async () => {
    const tokenSeen: string[] = [];
    const session = createWorkspaceSession(
      async () => ({}),
      undefined,
      undefined,
      async (provider, token) => {
        tokenSeen.push(token);
        return {
          provider,
          accountId: "42",
          accountLabel: "@dev",
          readAt: data.meta.collectedAt,
          items: [{ id: "7", label: "acme/payments", actions: ["read", "write"] }],
          truncated: false,
          evidence: { assertion: "observed", confidence: "high" },
          evidenceRef: "test",
        };
      },
    );
    const posted: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.endsWith("/auth")) return { ok: true, status: 200, json: async () => SIGN_IN_OFF };
      posted.push(url);
      const body = JSON.parse(String(init?.body)) as { provider: "github"; token: string };
      await session.connect(body.provider, body.token);
      return {
        ok: true,
        status: 200,
        json: async () => session.current().view(DEFAULT_ANALYSIS_SETTINGS),
      };
    });
    const onChange = vi.fn();
    render(
      <Shell
        data={empty}
        route={{ path: "integrations", params: new URLSearchParams() }}
        onWorkspaceChange={onChange}
      />,
    );
    const card = screen.getByRole("region", { name: "Connect accounts (read-only)" });
    expect(within(card).queryByText(/Read \d/)).toBeNull();
    fireEvent.click(within(card).getAllByRole("button", { name: "Connect" })[0]!);
    const form = screen.getByRole("form", { name: "Connect GitHub" });
    const input = within(form).getByLabelText(/Paste the fine-grained/) as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.change(input, { target: { value: SENTINEL.githubToken() } });
    fireEvent.click(within(form).getByRole("button", { name: "Read my access" }));
    expect(within(form).getByRole("alert").textContent).toMatch(/isn't a fine-grained/);
    expect(posted).toEqual([]);
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: SENTINEL.githubFineGrainedToken() } });
    fireEvent.click(within(form).getByRole("button", { name: "Read my access" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(tokenSeen).toEqual([SENTINEL.githubFineGrainedToken()]);
    const next = onChange.mock.calls[0]![0] as typeof data;
    expect(next.connections.map((c) => c.items)).toEqual([1]);
    expect(JSON.stringify(next)).not.toContain(SENTINEL.githubFineGrainedToken());
  });

  it("lists only what was added or scanned, with no placeholder accounts", () => {
    renderAt("integrations");
    const table = screen.getByRole("table");
    expect(within(table).queryByText(/connected/i)).toBeNull();
    expect(within(table).queryByText("Google Workspace")).toBeNull();
  });

  it("narrows the list by search", () => {
    renderAt("integrations");
    const before = within(screen.getByRole("table")).getAllByRole("row").length;
    fireEvent.change(screen.getByRole("searchbox", { name: "Search integrations" }), {
      target: { value: data.connectorRuns[0]!.label },
    });
    expect(within(screen.getByRole("table")).getAllByRole("row").length).toBeLessThan(before);
  });
});

describe("remediation page", () => {
  it("shows the selected finding with evidence and a dry-run preview, not a fix button", () => {
    const finding = data.findings[0]!;
    renderAt("remediation", { finding: finding.id });
    const detail = screen.getByRole("article", { name: finding.title });
    expect(within(detail).getByText("Recommended action")).toBeTruthy();
    expect(
      within(detail).getByRole("link", { name: "Preview the reduction" }).getAttribute("href"),
    ).toMatch(/^#\/blast-radius\?start=/);
    expect(screen.getByText(/can.t change app or provider settings/)).toBeTruthy();
  });
});

describe("highlighted paths", () => {
  it("highlights a finding's evidence path in the graph", () => {
    const finding = data.findings.find((f) => f.pathEdgeIds.length > 0)!;
    renderAt("graph", { path: finding.pathEdgeIds.join(",") });
    expect(screen.getByText(/Highlighting the evidence path/)).toBeTruthy();
  });
});

describe("permission graph page", () => {
  it("renders entities as keyboard-focusable controls and hides trust boundaries by default", () => {
    renderAt("graph");
    const graph = screen.getByRole("group", { name: "Permission graph" });
    const cursor = within(graph).getByRole("button", { name: /^AI agent Cursor agent/ });
    expect(cursor.getAttribute("tabindex")).toBe("0");
    expect(within(graph).queryByRole("button", { name: /^Trust boundary/ })).toBeNull();
  });

  it("shows provenance and a blast radius link when a node is selected by keyboard", () => {
    renderAt("graph");
    const graph = screen.getByRole("group", { name: "Permission graph" });
    fireEvent.keyDown(
      within(graph).getByRole("button", { name: /^MCP server GitHub MCP server/ }),
      {
        key: "Enter",
      },
    );
    const panel = screen.getByRole("complementary", { name: "Details" });
    expect(within(panel).getByText("Provenance")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "See blast radius" }).getAttribute("href")).toBe(
      "#/blast-radius?start=mcp%3Agithub",
    );
  });

  it("explains edge evidence, including unresolved conditions", () => {
    renderAt("graph");
    fireEvent.click(screen.getByRole("tab", { name: "Relationships" }));
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getAllByRole("button", { name: "can assume role" })[0]!);
    const panel = screen.getByRole("complementary", { name: "Details" });
    expect(within(panel).getByText("Conditions")).toBeTruthy();
    expect(within(panel).getAllByText("unresolved").length).toBeGreaterThan(0);
    expect(within(panel).getByText(/Inference rule/)).toBeTruthy();
  });

  it("filters by evidence type", () => {
    renderAt("graph");
    fireEvent.click(screen.getByRole("tab", { name: "Relationships" }));
    const before = within(screen.getByRole("table")).getAllByRole("row").length;
    fireEvent.click(screen.getByRole("checkbox", { name: /observed/ }));
    const after = within(screen.getByRole("table")).getAllByRole("row").length;
    expect(after).toBeLessThan(before);
  });
});

describe("blast radius page", () => {
  it("states the assumption and lists affected resources with evidence", async () => {
    renderAt("blast-radius", { start: "agent:cursor" });
    expect(await screen.findByText(/not confirmed exploitability/)).toBeTruthy();
    expect(screen.getByText("Resources at risk")).toBeTruthy();
    const boxes = ["Can delete, run, or administer", "Can change", "Can read"].map((name) =>
      screen.getByRole("region", { name }),
    );
    const card = boxes
      .flatMap((b) => within(b).queryAllByText("example-org/payments-service"))
      .find((el) => el.tagName === "STRONG");
    expect(card).toBeTruthy();
    expect(screen.getAllByRole("list", { name: "How it gets there" }).length).toBeGreaterThan(0);
  });

  it("starts with the riskiest agent and ranks agents instead of a matrix", async () => {
    renderAt("blast-radius");
    const ranked = screen.getByRole("heading", { name: "Riskiest agents first" });
    expect(ranked).toBeTruthy();
    const pressed = screen.getAllByRole("button", { pressed: true });
    expect(pressed).toHaveLength(1);
    expect(await screen.findByText(/were compromised, it could reach/)).toBeTruthy();
    expect(screen.queryByText("Compare agents")).toBeNull();
  });

  it("explains why nothing shows instead of a blank page", async () => {
    const lonely = data.nodes.find(
      (n) =>
        ["Agent", "MCPServer", "Application", "Tool"].includes(n.type) &&
        service.blastRadius(n.id, DEFAULT_ANALYSIS_SETTINGS).impacts.length === 0,
    )!;
    renderAt("blast-radius", { start: lonely.id });
    const why = await screen.findByRole("region", { name: "Why nothing shows" });
    expect(within(why).getByText(/not what each server or account allows/)).toBeTruthy();
  });

  it("simulates a mitigation without claiming anything changed", async () => {
    renderAt("blast-radius", { start: "agent:cursor" });
    const simulate = await screen.findAllByRole("button", { name: "Preview" });
    fireEvent.click(simulate[0]!);
    const result = await screen.findByRole("region", { name: "Simulation result" });
    await waitFor(() => expect(within(result).getByText(/Nothing was changed/)).toBeTruthy());
    expect(within(result).getByText("Impacts removed")).toBeTruthy();
  });

  it("simulates a new grant and labels it hypothetical", async () => {
    renderAt("blast-radius", { start: "agent:claude-desktop" });
    const form = await screen.findByRole("form", { name: "Simulate a grant" });
    fireEvent.change(within(form).getByLabelText("Target"), { target: { value: "mcp:aws" } });
    fireEvent.click(within(form).getByRole("button", { name: "Simulate grant" }));
    const result = await screen.findByRole("region", { name: "Simulation result" });
    await waitFor(() =>
      expect(within(result).getByText(/Added a hypothetical relationship/)).toBeTruthy(),
    );
  });
});

describe("starting empty", () => {
  const at = (path: RoutePath, d = empty, onChange?: (n: typeof data) => void) =>
    render(
      <Shell
        data={d}
        route={{ path, params: new URLSearchParams() }}
        {...(onChange ? { onWorkspaceChange: onChange } : {})}
      />,
    );

  it("introduces AgentRadius and points to setup without showing any sample data", () => {
    at("overview");
    expect(screen.queryByText("DEMO FIXTURE")).toBeNull();
    expect(screen.getByRole("heading", { name: /See everything your AI agents/ })).toBeTruthy();
    const cta = screen.getByRole("link", { name: /Integrate your AgentRadius setup/ });
    expect(cta.getAttribute("href")).toBe(href("integrations"));
    expect(screen.queryByText("Your workspace")).toBeNull();
    expect(screen.getByText("Not scanned yet")).toBeTruthy();
  });

  it("shows empty integrations and an empty map with next steps", () => {
    const { unmount } = at("integrations");
    expect(screen.getByText(/Nothing added yet/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    unmount();
    at("graph");
    expect(screen.getByText("Nothing to map yet")).toBeTruthy();
  });

  it("opens the Permission Graph after a scan", async () => {
    vi.stubGlobal("fetch", async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.endsWith("/auth") ? SIGN_IN_OFF : data),
    }));
    window.location.hash = "#/integrations";
    const onChange = vi.fn();
    at("integrations", empty, onChange);
    fireEvent.click(screen.getByRole("button", { name: "Scan this computer" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(window.location.hash).toBe(href("graph", { scanned: "1" }));
  });

  it("offers optional Google sign-in and explains setup when it isn't configured", async () => {
    at("settings");
    expect((await screen.findAllByRole("link", { name: /Sign in with Google/ })).length).toBe(1);
    expect(screen.getByText(/AGENTRADIUS_GOOGLE_CLIENT_ID/)).toBeTruthy();
    expect(screen.getByText(SIGN_IN_OFF.redirectUri)).toBeTruthy();
    expect(screen.getByText(/requests no\s+access to Gmail/)).toBeTruthy();
  });
});

describe("map to blast radius to remediation", () => {
  it("shows an agent's blast radius under the graph and hands off to remediation", () => {
    renderAt("graph");
    const panel = screen.getByRole("region", { name: "Blast radius" });
    expect(within(panel).getByText(/were compromised, it could reach/)).toBeTruthy();
    expect(within(panel).getByText(/not confirmed exploitation/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Remediate \d+ findings?/ })).toBeTruthy();
    expect(screen.getByRole("list", { name: "How to read this map" })).toBeTruthy();
  });
});

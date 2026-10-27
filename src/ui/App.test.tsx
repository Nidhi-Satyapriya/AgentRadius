// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ANALYSIS_SETTINGS } from "../analysis/index.ts";
import { createDemoWorkspaceService, createWorkspaceSession } from "../application/workspace.ts";
import { scanForSecrets } from "../redaction/index.ts";
import { Shell } from "./App.tsx";
import { parseHash, PRIMARY_ROUTES, ROUTES, type Route, type RoutePath } from "./routing.ts";

const service = createDemoWorkspaceService();
const data = service.view(DEFAULT_ANALYSIS_SETTINGS);

function renderAt(path: RoutePath, params: Record<string, string> = {}) {
  const route: Route = { path, params: new URLSearchParams(params) };
  return render(<Shell data={data} route={route} />);
}

/** Routes UI fetches to the in-process service so tests exercise real analysis output. */
function stubApi() {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const settings = body.settings ?? DEFAULT_ANALYSIS_SETTINGS;
    const payload = url.endsWith("/blast-radius")
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
    ).toEqual(["Activity log", "Settings"]);
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
    };
    const route = (path: RoutePath): Route => ({ path, params: new URLSearchParams() });
    const { unmount } = render(<Shell data={live} route={route("overview")} />);
    expect(screen.getByText(/No findings\. This covers only the sources/)).toBeTruthy();
    expect(screen.getByText("LIVE · THIS MAC")).toBeTruthy();
    unmount();
    render(<Shell data={live} route={route("integrations")} />);
    expect(screen.getByText(/Local sources read files on this Mac only/)).toBeTruthy();
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
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
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
    fireEvent.click(screen.getByRole("button", { name: "Add agent" }));
    const form = screen.getByRole("form", { name: "Add an agent" });
    fireEvent.change(within(form).getByLabelText("Agent"), { target: { value: "notion-ai" } });
    expect(within(form).getByLabelText("Notion")).toHaveProperty("checked", true);
    fireEvent.click(within(form).getByRole("button", { name: "Add agent" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = onChange.mock.calls[0]![0] as typeof data;
    expect(next.declaredAgents.map((a) => a.name)).toEqual(["Notion AI"]);
  });

  it("never shows an account as connected when sign-in isn't built", () => {
    renderAt("integrations", { source: "account:github" });
    const table = screen.getByRole("table");
    expect(within(table).queryByText(/connected/i)).toBeNull();
    const panel = screen.getByRole("complementary", { name: "GitHub details" });
    expect(within(panel).getByText("Not available")).toBeTruthy();
    expect(within(panel).getByText(/sign-in isn.t built yet/)).toBeTruthy();
  });

  it("narrows the list by search", () => {
    renderAt("integrations");
    const before = within(screen.getByRole("table")).getAllByRole("row").length;
    fireEvent.change(screen.getByRole("searchbox", { name: "Search integrations" }), {
      target: { value: "slack" },
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

describe("activity and highlighted paths", () => {
  it("shows an honest empty activity log", () => {
    renderAt("activity");
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
  });

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
    expect(screen.getByText("example-org/payments-service")).toBeTruthy();
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

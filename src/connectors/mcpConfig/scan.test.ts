import { chmodSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { SENTINEL } from "../../../tests/helpers/graphBuilder.ts";
import {
  analyzeBlastRadius,
  analyzeFindings,
  DEFAULT_ANALYSIS_SETTINGS,
} from "../../analysis/index.ts";
import { ingestSnapshot } from "../../graph/index.ts";
import { scanForSecrets } from "../../redaction/index.ts";
import { scanThisMac } from "../index.ts";
import { MAX_CONFIG_BYTES } from "../fileAccess.ts";
import { MCP_CLIENTS, mcpClientsFor } from "./clients.ts";
import { scanMcpClients } from "./scan.ts";

const NOW = new Date("2026-10-21T00:00:00Z");

function home(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "agentradius home "));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const CURSOR = ".cursor/mcp.json";
const VSCODE = "Library/Application Support/Code/User/mcp.json";

describe("what known MCP servers can do", () => {
  it("infers read, write, and command access without starting anything", async () => {
    const dir = home({
      [CURSOR]: JSON.stringify({
        mcpServers: {
          files: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "~/Projects", "/tmp/shared"],
          },
          commander: { command: "npx", args: ["-y", "@wonderwhy-er/desktop-commander"] },
          github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
        },
      }),
    });
    const ingested = ingestSnapshot(
      await scanThisMac({ homeDir: dir, now: NOW, platform: "darwin" }),
    );
    expect(ingested.ok).toBe(true);
    if (!ingested.ok) return;
    const report = analyzeBlastRadius(
      ingested.graph,
      "agent:cursor",
      DEFAULT_ANALYSIS_SETTINGS,
      NOW.toISOString(),
    );
    const reach = Object.fromEntries(
      report.impacts.map((i) => [i.resourceId, i.actions.map((a) => a.action).sort()]),
    );
    expect(reach).toEqual({
      "res:local.files.projects": ["read", "write"],
      "res:local.files.tmp-shared": ["read", "write"],
      "res:local.shell": ["execute", "read", "write"],
      "res:saas.github": ["read", "write"],
    });
    const inferred = [...ingested.graph.edges.values()].filter(
      (e) => e.inferenceRule === "known-mcp-capabilities",
    );
    expect(inferred.length).toBeGreaterThan(0);
    expect(inferred.every((e) => e.assertion === "inferred")).toBe(true);
    expect(ingested.graph.nodes.get("res:local.files.projects")?.label).toBe("Files in ~/Projects");
  });
});

describe("local MCP configuration scan", () => {
  it("builds a valid, secret-free snapshot from real config shapes", async () => {
    const token = SENTINEL.githubToken();
    const dir = home({
      [CURSOR]: JSON.stringify({
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
          },
          atlassian: { url: "https://mcp.atlassian.com/v1/sse" },
        },
      }),
      [VSCODE]: `{
        // VS Code allows comments
        "servers": {
          "gh": {
            "type": "http",
            "url": "https://api.githubcopilot.com/mcp/",
            "headers": { "Authorization": "Bearer \${input:gh}" },
          },
        },
      }`,
    });

    const snapshot = await scanThisMac({ homeDir: dir, now: NOW, platform: "darwin" });
    const text = JSON.stringify(snapshot);
    expect(text).not.toContain(token);
    expect(text).not.toContain(dir);
    expect(scanForSecrets(snapshot)).toEqual([]);

    const ingested = ingestSnapshot(snapshot);
    expect(ingested.ok).toBe(true);
    if (!ingested.ok) return;
    const graph = ingested.graph;
    expect(graph.meta.dataOrigin).toBe("local_discovery");
    expect(
      graph.nodes.get("cred:cursor.github.env.github_personal_access_token")?.attributes,
    ).toEqual({
      credentialStorage: "plaintext_config",
      valueCollected: false,
    });
    expect(
      graph.nodes.get("cred:vscode.gh.header.authorization")?.attributes["credentialStorage"],
    ).toBe("prompted_input");
    expect(graph.edges.get("edge:mcp:cursor.atlassian>reaches>res:saas.atlassian")?.assertion).toBe(
      "declared",
    );
    expect(graph.edges.get("edge:mcp:cursor.github>reaches>res:saas.github")).toMatchObject({
      assertion: "inferred",
      inferenceRule: "known-mcp-package",
    });

    const findings = analyzeFindings(graph, DEFAULT_ANALYSIS_SETTINGS, NOW.toISOString());
    const plaintext = findings.filter((f) => f.ruleId === "plaintext-credential-in-config");
    expect(plaintext.map((f) => f.affectedEntityIds[0])).toEqual([
      "cred:cursor.github.env.github_personal_access_token",
    ]);
    expect(findings.some((f) => f.ruleId === "cross-boundary-reach")).toBe(true);
    expect(findings.some((f) => f.ruleId === "unpinned-registry-mcp-server")).toBe(true);
  });

  it("reads the newest cached version of each Cursor plugin and labels its scope", async () => {
    const dir = home({
      ".cursor/plugins/cache/market/acme/old/mcp.json": JSON.stringify({
        mcpServers: { stale: { url: "https://old.example/mcp" } },
      }),
      ".cursor/plugins/cache/market/acme/new/.mcp.json": JSON.stringify({
        mcpServers: {
          atlassian: { type: "streamable-http", url: "https://mcp.atlassian.com/v2/mcp" },
        },
      }),
    });
    const old = join(dir, ".cursor/plugins/cache/market/acme/old");
    utimesSync(old, new Date("2020-01-01"), new Date("2020-01-01"));
    const [cursor] = await scanMcpClients({ homeDir: dir, now: NOW, platform: "darwin" }, [
      MCP_CLIENTS.find((c) => c.id === "cursor")!,
    ]);
    const servers = cursor!.nodes.filter((n) => n.type === "MCPServer");
    expect(servers.map((n) => [n.id, n.attributes["scope"], n.attributes["transport"]])).toEqual([
      ["mcp:cursor.atlassian", "plugin market/acme", "http"],
    ]);
    expect(cursor!.run.blindSpots.some((b) => /currently enabled/.test(b))).toBe(true);
  });

  it("reports missing configs as found-nothing, not as failures", async () => {
    const results = await scanMcpClients({ homeDir: home({}), now: NOW, platform: "darwin" });
    for (const r of results) {
      expect(r.run.status).toBe("completed");
      expect(r.run.coverage).toMatch(/No .* MCP configuration was found/);
      expect(r.nodes).toEqual([]);
    }
  });

  it("reports malformed, oversized, and non-file configs without echoing their content", async () => {
    const leak = SENTINEL.githubToken();
    const dir = home({
      [CURSOR]: `{ "mcpServers": { "x": "${leak}" `,
      ".codeium/windsurf/mcp_config.json": "x".repeat(MAX_CONFIG_BYTES + 1),
    });
    mkdirSync(join(dir, "Library/Application Support/Claude/claude_desktop_config.json"), {
      recursive: true,
    });
    const results = await scanMcpClients({ homeDir: dir, now: NOW, platform: "darwin" });
    const byId = new Map(results.map((r) => [r.run.connectorId, r.run]));
    expect(byId.get("local.mcp-config.cursor")).toMatchObject({
      status: "failed",
      errors: [{ code: "parse_error" }],
    });
    expect(byId.get("local.mcp-config.windsurf")?.errors[0]?.code).toBe("too_large");
    expect(byId.get("local.mcp-config.claude-desktop")?.errors[0]?.code).toBe("not_a_file");
    expect(JSON.stringify(results)).not.toContain(leak);
  });

  it.skipIf(process.getuid?.() === 0)(
    "reports permission denial as requiring permission",
    async () => {
      const dir = home({ [CURSOR]: "{}" });
      chmodSync(join(dir, CURSOR), 0o000);
      try {
        const results = await scanMcpClients({ homeDir: dir, now: NOW, platform: "darwin" });
        expect(
          results.find((r) => r.run.connectorId === "local.mcp-config.cursor")?.run,
        ).toMatchObject({
          status: "requires_permission",
          errors: [{ code: "permission_denied" }],
        });
      } finally {
        chmodSync(join(dir, CURSOR), 0o600);
      }
    },
  );

  it("models disabled servers as not traversable and is deterministic", async () => {
    const dir = home({
      [CURSOR]: JSON.stringify({
        mcpServers: { off: { command: "npx", args: ["x@1.0.0"], disabled: true } },
      }),
    });
    const a = await scanThisMac({ homeDir: dir, now: NOW, platform: "darwin" });
    const b = await scanThisMac({ homeDir: dir, now: NOW, platform: "darwin" });
    const strip = (s: typeof a) => ({ ...s, connectorRuns: [] });
    expect(strip(a)).toEqual(strip(b));
    expect(a.edges.find((e) => e.to === "mcp:cursor.off")?.conditions[0]?.state).toBe(
      "does_not_hold",
    );
  });
});

describe("Windows and Linux locations", () => {
  const server = JSON.stringify({
    mcpServers: { github: { url: "https://api.githubcopilot.com/mcp/" } },
  });

  it("reads Windows profile locations", async () => {
    const dir = home({
      "AppData/Roaming/Claude/claude_desktop_config.json": server,
      "AppData/Roaming/Code/User/mcp.json": JSON.stringify({
        servers: { gh: { type: "http", url: "https://api.githubcopilot.com/mcp/" } },
      }),
      "AppData/Local/Programs/cursor/Cursor.exe": "",
    });
    const results = await scanMcpClients({ homeDir: dir, now: NOW, platform: "win32" });
    const byId = new Map(results.map((r) => [r.run.connectorId, r]));
    expect(
      byId.get("local.mcp-config.claude-desktop")!.nodes.some((n) => n.type === "MCPServer"),
    ).toBe(true);
    expect(byId.get("local.mcp-config.vscode")!.run.coverage).toMatch(/AppData.Roaming.Code/);
    expect(byId.get("local.mcp-config.claude-desktop")!.run.requiredPrivileges[0]).toMatch(
      /Windows user/,
    );
  });

  it("reads Linux locations and skips clients with no Linux config", async () => {
    const dir = home({ ".config/Code/User/mcp.json": JSON.stringify({ servers: {} }) });
    const results = await scanMcpClients({ homeDir: dir, now: NOW, platform: "linux" });
    expect(results.map((r) => r.run.connectorId)).not.toContain("local.mcp-config.claude-desktop");
    expect(mcpClientsFor("linux").find((c) => c.id === "vscode")!.locations[0]!.relativePath).toBe(
      ".config/Code/User/mcp.json",
    );
  });
});

describe("Codex", () => {
  it("reads only the mcp_servers tables of config.toml and discards every value", async () => {
    const leak = SENTINEL.githubToken();
    const dir = home({
      ".codex/config.toml": [
        'model = "gpt-5"',
        "",
        "[mcp_servers.github]",
        'command = "npx"',
        'args = ["-y", "@modelcontextprotocol/server-github"]',
        "",
        "[mcp_servers.github.env]",
        `GITHUB_PERSONAL_ACCESS_TOKEN = "${leak}"`,
        "",
        '[mcp_servers."docs-search"]',
        'url = "https://mcp.example.invalid/mcp"',
        'bearer_token_env_var = "DOCS_TOKEN"',
        "",
        "[profiles.work]",
        'model = "other"',
      ].join("\n"),
      ".codex/auth.json": `{"token":"${leak}"}`,
    });
    const [codex] = await scanMcpClients({ homeDir: dir, now: NOW, platform: "darwin" }, [
      MCP_CLIENTS.find((c) => c.id === "codex")!,
    ]);
    expect(codex!.run.status).toBe("completed");
    expect(codex!.nodes.filter((n) => n.type === "MCPServer").map((n) => n.id)).toEqual([
      "mcp:codex.docs-search",
      "mcp:codex.github",
    ]);
    expect(codex!.edges.some((e) => e.to === "res:saas.github")).toBe(true);
    expect(codex!.run.requiredPrivileges[0]).not.toContain("auth.json");
    expect(JSON.stringify(codex)).not.toContain(leak);
  });

  it("reports malformed TOML without quoting it", async () => {
    const leak = SENTINEL.githubToken();
    const dir = home({ ".codex/config.toml": `[mcp_servers.x]\ncommand = "${leak}` });
    const [codex] = await scanMcpClients({ homeDir: dir, now: NOW, platform: "darwin" }, [
      MCP_CLIENTS.find((c) => c.id === "codex")!,
    ]);
    expect(codex!.run.errors).toEqual([
      { code: "parse_error", message: "~/.codex/config.toml is not valid TOML." },
    ]);
    expect(JSON.stringify(codex)).not.toContain(leak);
  });
});

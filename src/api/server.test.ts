import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENTINEL } from "../../tests/helpers/graphBuilder.ts";
import { createWorkspaceSession } from "../application/workspace.ts";
import { scanThisMac } from "../connectors/index.ts";
import { scanForSecrets } from "../redaction/index.ts";
import type { BlastRadiusResponse, WorkspaceResponse } from "./contracts.ts";
import { createApiServer } from "./server.ts";

const staticDir = mkdtempSync(join(tmpdir(), "agentradius-ui-"));
writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>AgentRadius</title>");

const fakeHome = mkdtempSync(join(tmpdir(), "agentradius-home-"));
mkdirSync(join(fakeHome, ".cursor"));
writeFileSync(
  join(fakeHome, ".cursor/mcp.json"),
  JSON.stringify({
    mcpServers: {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: SENTINEL.githubToken() },
      },
    },
  }),
);
let scanner: () => Promise<unknown> = () => scanThisMac({ homeDir: fakeHome, now: new Date() });
const server = createApiServer(
  createWorkspaceSession(() => scanner()),
  { staticDir },
);
let port = 0;

beforeAll(async () => {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function call(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: { host: `127.0.0.1:${port}`, ...options.headers },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

const postJson = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  call("POST", path, {
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });

describe("API", () => {
  it("reports read-only mode with no active enforcement", async () => {
    const res = await call("GET", "/api/v1/health");
    expect(JSON.parse(res.body)).toEqual({
      status: "ok",
      mode: "read_only",
      enforcementActive: false,
    });
  });

  it("labels fixture data and contains no secret-shaped values", async () => {
    const res = await call("GET", "/api/v1/workspace");
    const body = JSON.parse(res.body) as WorkspaceResponse;
    expect(body.meta.dataOrigin).toBe("fixture");
    expect(body.meta.fixtureNotice).toBeTruthy();
    expect(scanForSecrets(body)).toEqual([]);
  });

  it("sets security headers and disables caching on API responses", async () => {
    const res = await call("GET", "/api/v1/health");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("computes a blast radius for a valid request", async () => {
    const res = await postJson("/api/v1/blast-radius", { startId: "agent:cursor" });
    expect(res.status).toBe(200);
    expect((JSON.parse(res.body) as BlastRadiusResponse).startId).toBe("agent:cursor");
  });

  it("rejects malformed and unknown inputs with structured errors", async () => {
    expect((await postJson("/api/v1/blast-radius", { startId: "no spaces allowed" })).status).toBe(
      400,
    );
    expect((await postJson("/api/v1/blast-radius", { startId: "agent:a", extra: 1 })).status).toBe(
      400,
    );
    expect((await postJson("/api/v1/blast-radius", { startId: "agent:missing" })).status).toBe(404);
    expect(
      (
        await call("POST", "/api/v1/blast-radius", {
          headers: { "content-type": "application/json" },
          body: "{",
        })
      ).status,
    ).toBe(400);
  });

  it("rejects requests with a foreign Host header (DNS rebinding)", async () => {
    const res = await call("GET", "/api/v1/workspace", {
      headers: { host: `evil.example:${port}` },
    });
    expect(res.status).toBe(421);
  });

  it("rejects cross-origin and cross-site POSTs (CSRF)", async () => {
    expect(
      (
        await postJson(
          "/api/v1/blast-radius",
          { startId: "agent:cursor" },
          { origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await postJson(
          "/api/v1/blast-radius",
          { startId: "agent:cursor" },
          { "sec-fetch-site": "cross-site" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await postJson(
          "/api/v1/blast-radius",
          { startId: "agent:cursor" },
          { origin: `http://127.0.0.1:${port}` },
        )
      ).status,
    ).toBe(200);
  });

  it("rejects non-JSON content types and oversized bodies", async () => {
    const form = await call("POST", "/api/v1/blast-radius", {
      headers: { "content-type": "text/plain" },
      body: "x",
    });
    expect(form.status).toBe(415);
    const big = await postJson("/api/v1/blast-radius", {
      startId: "agent:cursor",
      pad: "x".repeat(100_000),
    });
    expect(big.status).toBe(413);
  });

  it("validates simulation requests and returns an explicit non-mutation notice", async () => {
    const res = await postJson("/api/v1/simulations", {
      startId: "agent:cursor",
      changes: [{ kind: "add_enforced_deny", nodeId: "mcp:github" }],
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).notice).toMatch(/Nothing was changed/);
    expect(
      (await postJson("/api/v1/simulations", { startId: "agent:cursor", changes: [] })).status,
    ).toBe(400);
  });

  it("serves the UI shell but never files outside the static root", async () => {
    expect((await call("GET", "/graph")).status).toBe(200);
    expect((await call("GET", "/..%2f..%2fetc%2fpasswd")).status).toBe(404);
    expect((await call("GET", "/%2e%2e/%2e%2e/package.json")).status).toBe(404);
    expect((await call("GET", "/missing.js")).status).toBe(404);
  });

  it("scans on request, labels the data live, and never returns the secret value", async () => {
    const res = await postJson("/api/v1/scans", {});
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as WorkspaceResponse;
    expect(body.meta.dataOrigin).toBe("local_discovery");
    expect(body.nodes.some((n) => n.id === "mcp:cursor.github")).toBe(true);
    expect(res.body).not.toContain(SENTINEL.githubToken());
    expect(scanForSecrets(body)).toEqual([]);
    expect(body.findings.some((f) => f.ruleId === "plaintext-credential-in-config")).toBe(true);

    const current = JSON.parse((await call("GET", "/api/v1/workspace")).body) as WorkspaceResponse;
    expect(current.meta.snapshotId).toBe(body.meta.snapshotId);
  });

  it("discards a scan that fails validation and keeps the previous workspace", async () => {
    const before = JSON.parse((await call("GET", "/api/v1/workspace")).body) as WorkspaceResponse;
    scanner = async () => ({ leaked: SENTINEL.awsKeyId() });
    const res = await postJson("/api/v1/scans", {});
    expect(res.status).toBe(422);
    expect(res.body).not.toContain(SENTINEL.awsKeyId());
    const after = JSON.parse((await call("GET", "/api/v1/workspace")).body) as WorkspaceResponse;
    expect(after.meta.snapshotId).toBe(before.meta.snapshotId);
  });

  it("switches back to demo data and protects source switches against CSRF", async () => {
    expect((await postJson("/api/v1/scans", {}, { origin: "https://evil.example" })).status).toBe(
      403,
    );
    expect(
      (
        await call("POST", "/api/v1/demo", {
          headers: { "content-type": "text/plain" },
          body: "{}",
        })
      ).status,
    ).toBe(415);
    const res = await postJson("/api/v1/demo", {});
    expect((JSON.parse(res.body) as WorkspaceResponse).meta.dataOrigin).toBe("fixture");
  });

  it("does not expose internals in error responses", async () => {
    const res = await call("GET", "/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body).not.toMatch(/at \w+ \(|node_modules|\.ts:/);
  });
});

describe("declared agents", () => {
  const notion = { name: "Notion AI", runtime: "in_app", appIds: ["notion"], access: "read_write" };

  it("adds an agent the user describes and analyzes it like any other", async () => {
    const res = await postJson("/api/v1/agents", notion);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as WorkspaceResponse;
    expect(body.declaredAgents.map((a) => a.id)).toEqual(["agent:declared.notion-ai"]);
    const cell = body.reach.cells.find((c) => c.agentId === "agent:declared.notion-ai");
    expect(cell).toMatchObject({ resourceId: "res:app.notion", assertion: "declared" });
    expect(cell?.actions).toEqual(["read", "write"]);
    expect(scanForSecrets(body)).toEqual([]);
  });

  it("rejects duplicates, unknown apps, unsafe names, and secret-shaped names", async () => {
    expect((await postJson("/api/v1/agents", notion)).status).toBe(409);
    expect((await postJson("/api/v1/agents", { ...notion, appIds: ["myspace"] })).status).toBe(400);
    expect((await postJson("/api/v1/agents", { ...notion, name: "<script>" })).status).toBe(400);
    const secret = await postJson("/api/v1/agents", { ...notion, name: SENTINEL.awsKeyId() });
    expect(secret.status).toBe(422);
    expect(secret.body).not.toContain(SENTINEL.awsKeyId());
  });

  it("requires same-origin requests and removes agents on request", async () => {
    const cross = await postJson("/api/v1/agents", notion, { "sec-fetch-site": "cross-site" });
    expect(cross.status).toBe(403);
    const res = await postJson("/api/v1/agents/remove", { id: "agent:declared.notion-ai" });
    expect((JSON.parse(res.body) as WorkspaceResponse).declaredAgents).toEqual([]);
    expect(
      (await postJson("/api/v1/agents/remove", { id: "agent:declared.notion-ai" })).status,
    ).toBe(404);
  });

  it("records accepted changes in the activity log, newest first, and never rejected input", async () => {
    const res = await postJson("/api/v1/agents/remove", { id: "agent:declared.missing" });
    expect(res.status).toBe(404);
    const body = JSON.parse((await postJson("/api/v1/agents", { ...notion, name: "Rovo" })).body);
    const activity = (body as WorkspaceResponse).activity;
    expect(activity.slice(0, 3).map((a) => [a.action, a.target, a.outcome])).toEqual([
      ["add_agent", "Rovo", "succeeded"],
      ["remove_agent", "Notion AI", "succeeded"],
      ["add_agent", "Notion AI", "succeeded"],
    ]);
    expect(JSON.stringify(activity)).not.toContain(SENTINEL.awsKeyId());
    expect(JSON.stringify(activity)).not.toContain("<script>");
  });
});

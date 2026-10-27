import { describe, expect, it } from "vitest";
import { SENTINEL } from "../../../tests/helpers/graphBuilder.ts";
import { DEFAULT_ANALYSIS_SETTINGS } from "../../analysis/index.ts";
import { createWorkspaceSession } from "../../application/workspace.ts";
import { ProviderError, type FetchLike } from "./http.ts";
import { createProviderReader } from "./index.ts";

const NOW = new Date("2026-10-27T12:00:00Z");

interface Call {
  url: string;
  init: RequestInit;
}

/** Answers by URL; records every request so tests can check hosts, headers, and redirects. */
function fakeFetch(routes: Record<string, () => unknown>, calls: Call[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    const body = init.body ? (JSON.parse(String(init.body)) as { start_cursor?: string }) : {};
    const key = Object.keys(routes).find(
      (k) =>
        url.startsWith(k.split("#")[0]!) && (k.split("#")[1] ?? "") === (body.start_cursor ?? ""),
    );
    if (key === undefined) return new Response("{}", { status: 404 });
    const answer = routes[key]!();
    if (answer instanceof Response) return answer;
    return new Response(JSON.stringify(answer), { status: 200 });
  };
}

const repo = (id: number, full_name: string, permissions: object, priv = true) => ({
  id,
  full_name,
  private: priv,
  permissions,
});

const page = (id: string, title: string) => ({
  object: "page",
  id,
  properties: { Name: { type: "title", title: [{ plain_text: title }] } },
});

describe("GitHub connection", () => {
  it("lists repositories with your role in each, using only fixed read-only endpoints", async () => {
    const calls: Call[] = [];
    const token = SENTINEL.githubFineGrainedToken();
    const read = createProviderReader(
      fakeFetch(
        {
          "https://api.github.com/user/repos": () => [
            repo(3, "acme/infra", { admin: true, push: true, pull: true }),
            repo(1, "acme/web", { push: true, pull: true }, false),
            repo(2, "acme/docs", { pull: true }),
          ],
          "https://api.github.com/user": () => ({ id: 42, login: "dev" }),
        },
        calls,
      ),
      () => NOW,
    );
    const inv = await read("github", token);

    expect(inv.accountLabel).toBe("@dev");
    expect(inv.items.map((i) => [i.label, i.actions])).toEqual([
      ["acme/web", ["read", "write"]],
      ["acme/docs", ["read"]],
      ["acme/infra", ["read", "write", "admin"]],
    ]);
    expect(inv.evidence).toEqual({ assertion: "observed", confidence: "high" });
    for (const call of calls) {
      expect(new URL(call.url).host).toBe("api.github.com");
      expect(call.init.method ?? "GET").toBe("GET");
      expect(call.init.redirect).toBe("error");
      expect(call.url).not.toContain(token);
    }
    expect(JSON.stringify(inv)).not.toContain(token);
  });

  it("hides names that look like credentials", async () => {
    const read = createProviderReader(
      fakeFetch({
        "https://api.github.com/user/repos": () => [
          repo(1, `acme/${SENTINEL.githubToken()}`, { pull: true }),
        ],
        "https://api.github.com/user": () => ({ id: 1, login: "dev" }),
      }),
      () => NOW,
    );
    const inv = await read("github", SENTINEL.githubFineGrainedToken());
    expect(inv.items[0]!.label).toBe("Repository (name hidden)");
  });

  it("reports rejected tokens, unreachable hosts, and odd responses without detail", async () => {
    const token = SENTINEL.githubFineGrainedToken();
    const codeOf = (f: FetchLike) =>
      createProviderReader(f, () => NOW)("github", token).catch(
        (e: unknown) => (e as ProviderError).code,
      );
    expect(await codeOf(async () => new Response("{}", { status: 401 }))).toBe("token_rejected");
    expect(
      await codeOf(async () => {
        throw new TypeError("network");
      }),
    ).toBe("provider_unreachable");
    expect(await codeOf(async () => new Response('{"id":"x"}', { status: 200 }))).toBe(
      "unexpected_response",
    );
  });
});

describe("Notion connection", () => {
  it("lists shared pages across result pages and marks the access as inferred", async () => {
    const read = createProviderReader(
      fakeFetch({
        "https://api.notion.com/v1/users/me": () => ({
          id: "bot-1",
          bot: { workspace_name: "Acme" },
        }),
        "https://api.notion.com/v1/search": () => ({
          results: [page("aaaaaaaa-0000-0000-0000-000000000001", "Roadmap")],
          has_more: true,
          next_cursor: "c2",
        }),
        "https://api.notion.com/v1/search#c2": () => ({
          results: [{ object: "database", id: "b".repeat(32), title: [{ plain_text: "CRM" }] }],
          has_more: false,
          next_cursor: null,
        }),
      }),
      () => NOW,
    );
    const inv = await read("notion", SENTINEL.notionToken());
    expect(inv.accountLabel).toBe("Acme");
    expect(inv.items.map((i) => i.label)).toEqual(["Roadmap", "CRM"]);
    expect(inv.evidence.assertion).toBe("inferred");
  });
});

describe("connected accounts in the workspace", () => {
  const githubFetch = fakeFetch({
    "https://api.github.com/user/repos": () => [
      repo(7, "acme/payments", { admin: true, push: true, pull: true }),
    ],
    "https://api.github.com/user": () => ({ id: 42, login: "dev" }),
  });

  it("turns an assumed 'everything you can access' into concrete repositories", async () => {
    const session = createWorkspaceSession(
      async () => ({}),
      () => NOW,
      undefined,
      createProviderReader(githubFetch, () => NOW),
    );
    session.declareAgent({
      name: "GitHub Copilot",
      runtime: "in_app",
      appIds: ["github"],
      access: "as_you",
    });
    const token = SENTINEL.githubFineGrainedToken();
    await session.connect("github", token);

    const view = session.current().view(DEFAULT_ANALYSIS_SETTINGS);
    expect(view.connections).toEqual([
      {
        provider: "github",
        accountLabel: "@dev",
        readAt: NOW.toISOString(),
        items: 1,
        truncated: false,
      },
    ]);
    expect(JSON.stringify(view)).not.toContain(token);

    const report = session
      .current()
      .blastRadius("agent:declared.github-copilot", DEFAULT_ANALYSIS_SETTINGS);
    const payments = report.impacts.find((i) => i.resourceId === "res:github.7");
    expect(payments?.actions.map((a) => a.action).sort()).toEqual(["admin", "read", "write"]);

    session.disconnect("github");
    expect(session.current().view(DEFAULT_ANALYSIS_SETTINGS).connections).toEqual([]);
    expect(
      session
        .current()
        .view(DEFAULT_ANALYSIS_SETTINGS)
        .nodes.some((n) => n.id === "res:github.7"),
    ).toBe(false);
  });

  it("keeps the previous workspace when the provider rejects the token", async () => {
    const session = createWorkspaceSession(
      async () => ({}),
      () => NOW,
      undefined,
      createProviderReader(
        async () => new Response("{}", { status: 401 }),
        () => NOW,
      ),
    );
    const before = session.current().view(DEFAULT_ANALYSIS_SETTINGS);
    await expect(session.connect("github", SENTINEL.githubFineGrainedToken())).rejects.toThrow(
      ProviderError,
    );
    expect(session.current().view(DEFAULT_ANALYSIS_SETTINGS)).toEqual(before);
  });
});

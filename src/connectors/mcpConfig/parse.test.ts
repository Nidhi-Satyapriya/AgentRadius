import { describe, expect, it } from "vitest";
import { SENTINEL } from "../../../tests/helpers/graphBuilder.ts";
import { matchService } from "./knownServices.ts";
import { classifyValue, detectPackage, extractServers, redactArgs } from "./parse.ts";

const HOME = "/Users/someone";

describe("classifyValue", () => {
  it("records where a value comes from, never the value", () => {
    expect(classifyValue("GITHUB_TOKEN", SENTINEL.githubToken())).toEqual({
      key: "GITHUB_TOKEN",
      storage: "plaintext_config",
      secretBearing: true,
    });
    expect(classifyValue("API_KEY", "op://Private/Item/credential").storage).toBe(
      "secret_manager_reference",
    );
    expect(classifyValue("TOKEN", "${input:gh_token}").storage).toBe("prompted_input");
    expect(classifyValue("Authorization", "Bearer ${input:tok}").storage).toBe("prompted_input");
    expect(classifyValue("TOKEN", "${env:GH_TOKEN}").storage).toBe("environment_reference");
    expect(classifyValue("TOKEN", "$GH_TOKEN").storage).toBe("environment_reference");
    expect(classifyValue("GOOGLE_APPLICATION_CREDENTIALS", "~/keys/sa.json").storage).toBe(
      "file_reference",
    );
    expect(classifyValue("LOG_LEVEL", "debug").secretBearing).toBe(false);
  });

  it("treats secret-shaped values as secrets even under innocent key names", () => {
    expect(classifyValue("CONFIG", SENTINEL.awsKeyId()).secretBearing).toBe(true);
  });
});

describe("redactArgs", () => {
  it("redacts secret flags, assignments, secret shapes, and URL credentials", () => {
    const out = redactArgs(
      [
        "--token",
        "abc",
        "--api-key=xyz",
        SENTINEL.githubToken(),
        SENTINEL.urlWithPassword(),
        "https://host.example/path?key=secret",
        `${HOME}/projects`,
        "--verbose",
      ],
      HOME,
    );
    expect(out).toEqual([
      "--token",
      "[REDACTED]",
      "--api-key=[REDACTED]",
      "[REDACTED:github-token]",
      "postgres://db.invalid/x",
      "https://host.example/path",
      "~/projects",
      "--verbose",
    ]);
  });

  it("bounds the number of arguments", () => {
    const out = redactArgs(
      Array.from({ length: 60 }, (_, i) => `a${i}`),
      HOME,
    );
    expect(out).toHaveLength(51);
    expect(out.at(-1)).toBe("… 10 more");
  });
});

describe("detectPackage", () => {
  it("detects registry packages and whether their version is pinned", () => {
    expect(detectPackage("npx", ["-y", "@scope/server@1.2.3"])).toEqual({
      source: "npm",
      name: "@scope/server",
      pinned: true,
    });
    expect(detectPackage("npx", ["-y", "server-x@latest"])).toMatchObject({ pinned: false });
    expect(detectPackage("npx", ["server-x"])).toMatchObject({ pinned: false });
    expect(detectPackage("uvx", ["tool-x==0.4.1"])).toMatchObject({ source: "pypi", pinned: true });
    expect(detectPackage("uvx", ["--from", "tool-x", "tool"])).toMatchObject({ pinned: false });
    expect(
      detectPackage("docker", ["run", "-i", "--rm", "-e", "TOKEN", "ghcr.io/org/server:1.0"]),
    ).toEqual({ source: "docker", name: "ghcr.io/org/server", pinned: false });
    expect(
      detectPackage("docker", ["run", "ghcr.io/org/server@sha256:" + "a".repeat(64)]),
    ).toMatchObject({ pinned: true });
    expect(detectPackage("/usr/local/bin/my-server", [])).toEqual({ source: "local" });
    expect(detectPackage("node", ["server.js"])).toEqual({ source: "local" });
  });
});

describe("extractServers", () => {
  it("reads the documented keys of every supported format and nothing else", () => {
    const claudeCode = {
      primaryApiKey: "must-not-be-read",
      mcpServers: { a: { command: "npx", args: ["pkg-a"] } },
      projects: {
        [`${HOME}/code/app`]: { mcpServers: { b: { url: "https://mcp.linear.app/sse" } } },
      },
    };
    const servers = extractServers(claudeCode, "claudeCode", HOME);
    expect(servers.map((s) => [s.name, s.scope, s.transport])).toEqual([
      ["a", "user", "stdio"],
      ["b", "project ~/code/app", "sse"],
    ]);
    expect(JSON.stringify(servers)).not.toContain("must-not-be-read");

    const vscode = extractServers(
      { mcp: { servers: { x: { type: "http", url: "https://api.githubcopilot.com/mcp/" } } } },
      "vscodeSettings",
      HOME,
    );
    expect(vscode[0]).toMatchObject({ transport: "http", remoteHost: "api.githubcopilot.com" });
  });

  it("captures env and docker -e keys without values and flags disabled servers", () => {
    const [server] = extractServers(
      {
        servers: {
          gh: {
            command: "docker",
            args: ["run", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${input:token}" },
            disabled: true,
          },
        },
      },
      "servers",
      HOME,
    );
    expect(server!.env).toEqual([
      { key: "GITHUB_PERSONAL_ACCESS_TOKEN", storage: "prompted_input", secretBearing: true },
    ]);
    expect(server!.disabled).toBe(true);
  });

  it("tolerates unexpected structures", () => {
    expect(extractServers(null, "mcpServers", HOME)).toEqual([]);
    expect(extractServers({ mcpServers: [1, 2] }, "mcpServers", HOME)).toEqual([]);
    expect(extractServers({ mcpServers: { a: "nope", b: {} } }, "mcpServers", HOME)).toHaveLength(
      1,
    );
  });
});

describe("matchService", () => {
  it("prefers host evidence over package names over server names", () => {
    expect(matchService({ remoteHost: "mcp.atlassian.com", serverName: "x" })).toMatchObject({
      service: { id: "atlassian" },
      kind: "host",
    });
    expect(
      matchService({ packageName: "@modelcontextprotocol/server-github", serverName: "x" }),
    ).toMatchObject({ service: { id: "github" }, kind: "package" });
    expect(matchService({ serverName: "my-jira" })).toMatchObject({ kind: "name" });
    expect(matchService({ serverName: "something-else" })).toBeUndefined();
    expect(matchService({ remoteHost: "evilgithub.com", serverName: "x" })).toBeUndefined();
  });
});

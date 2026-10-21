import type { CredentialStorage } from "../../domain/index.ts";
import { isSecretBearingKey, matchSecretPatterns, redactText } from "../../redaction/index.ts";
import type { ConfigFormat } from "./clients.ts";

export type Transport = "stdio" | "http" | "sse" | "unknown";
export type PackageSource = "npm" | "pypi" | "docker" | "local" | "remote";

export interface NamedKey {
  readonly key: string;
  /** Where the value comes from. The value itself is discarded during parsing. */
  readonly storage: CredentialStorage | "empty";
  /** True when the key name or the value's shape indicates a credential. */
  readonly secretBearing: boolean;
}

export interface ServerDeclaration {
  readonly name: string;
  /** JSON pointer to the server entry inside its file. */
  readonly pointer: string;
  /** e.g. "user" or "project ~/code/app" (Claude Code local scope). */
  readonly scope: string;
  readonly transport: Transport;
  readonly command?: string;
  readonly args: readonly string[];
  /** Scheme, host, and path of a remote server. Query strings and user info are dropped. */
  readonly remoteUrl?: string;
  readonly remoteHost?: string;
  readonly env: readonly NamedKey[];
  readonly headers: readonly NamedKey[];
  readonly packageSource?: PackageSource;
  readonly packageName?: string;
  /** `undefined` when pinning cannot be determined. */
  readonly versionPinned?: boolean;
  readonly disabled: boolean;
}

const MAX_SERVERS = 200;
const MAX_ARGS = 50;
const MAX_ARG_LENGTH = 200;

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Extracts server entries from a parsed config. Unrelated keys in the file are never read. */
export function extractServers(
  parsed: unknown,
  format: ConfigFormat,
  homeDir: string,
  scopeOverride?: string,
): ServerDeclaration[] {
  if (!isObject(parsed)) return [];
  const groups: { entries: unknown; pointer: string; scope: string }[] = [];
  switch (format) {
    case "mcpServers":
      groups.push({ entries: parsed["mcpServers"], pointer: "/mcpServers", scope: "user" });
      break;
    case "servers":
      groups.push({ entries: parsed["servers"], pointer: "/servers", scope: "user" });
      break;
    case "vscodeSettings": {
      const mcp = parsed["mcp"];
      if (isObject(mcp))
        groups.push({ entries: mcp["servers"], pointer: "/mcp/servers", scope: "user" });
      break;
    }
    case "claudeCode": {
      groups.push({ entries: parsed["mcpServers"], pointer: "/mcpServers", scope: "user" });
      const projects = parsed["projects"];
      if (isObject(projects)) {
        for (const [path, project] of Object.entries(projects).sort(([a], [b]) =>
          a < b ? -1 : 1,
        )) {
          if (!isObject(project)) continue;
          groups.push({
            entries: project["mcpServers"],
            pointer: `/projects/${escapePointer(path)}/mcpServers`,
            scope: `project ${tildify(path, homeDir)}`,
          });
        }
      }
      break;
    }
  }

  const servers: ServerDeclaration[] = [];
  for (const group of groups) {
    if (!isObject(group.entries)) continue;
    for (const [name, raw] of Object.entries(group.entries).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (servers.length >= MAX_SERVERS) return servers;
      if (!isObject(raw)) continue;
      servers.push(
        normalizeServer(
          name,
          raw,
          `${group.pointer}/${escapePointer(name)}`,
          scopeOverride ?? group.scope,
          homeDir,
        ),
      );
    }
  }
  return servers;
}

function normalizeServer(
  name: string,
  raw: Json,
  pointer: string,
  scope: string,
  homeDir: string,
): ServerDeclaration {
  const rawUrl = typeof raw["url"] === "string" ? raw["url"] : undefined;
  const remote = rawUrl === undefined ? undefined : sanitizeUrl(rawUrl);
  const command =
    typeof raw["command"] === "string" ? cleanText(raw["command"], homeDir) : undefined;
  const rawArgs = Array.isArray(raw["args"])
    ? raw["args"].filter((a): a is string => typeof a === "string")
    : [];
  const args = redactArgs(rawArgs, homeDir);
  const env = namedKeys(raw["env"]);
  const headers = namedKeys(raw["headers"]);
  const dockerEnv = dockerEnvKeys(rawArgs);
  const pkg =
    remote !== undefined
      ? { source: "remote" as const }
      : command === undefined
        ? undefined
        : detectPackage(command, rawArgs);

  return {
    name: cleanText(name, homeDir),
    pointer,
    scope,
    transport: transportOf(raw, rawUrl),
    ...(command !== undefined ? { command } : {}),
    args,
    ...(remote !== undefined ? { remoteUrl: remote.url, remoteHost: remote.host } : {}),
    env: [...env, ...dockerEnv.filter((d) => !env.some((e) => e.key === d.key))],
    headers,
    ...(pkg !== undefined ? { packageSource: pkg.source } : {}),
    ...(pkg?.name !== undefined ? { packageName: cleanText(pkg.name, homeDir) } : {}),
    ...(pkg?.pinned !== undefined ? { versionPinned: pkg.pinned } : {}),
    disabled: raw["disabled"] === true || raw["enabled"] === false,
  };
}

function transportOf(raw: Json, url: string | undefined): Transport {
  const declared = raw["type"] ?? raw["transport"];
  if (declared === "stdio") return "stdio";
  if (declared === "sse") return "sse";
  if (declared === "http" || declared === "streamable-http" || declared === "streamableHttp")
    return "http";
  if (url !== undefined) return /\/sse\/?$/.test(url) ? "sse" : "http";
  return typeof raw["command"] === "string" ? "stdio" : "unknown";
}

/** Classifies where a configured value comes from without retaining the value. */
export function classifyValue(key: string, value: unknown): NamedKey {
  const keyIsSecret = isSecretBearingKey(key);
  if (typeof value !== "string") return { key, storage: "unknown", secretBearing: keyIsSecret };
  const v = value.trim();
  const shapeIsSecret = matchSecretPatterns(v).length > 0;
  const secretBearing = keyIsSecret || shapeIsSecret;
  if (v === "") return { key, storage: "empty", secretBearing };
  if (v.startsWith("op://")) return { key, storage: "secret_manager_reference", secretBearing };
  if (/\$\{input:[^}]+\}/.test(v)) return { key, storage: "prompted_input", secretBearing };
  if (/\$\{(env:)?[A-Za-z_][A-Za-z0-9_]*\}|^\$[A-Za-z_][A-Za-z0-9_]*$/.test(v))
    return { key, storage: "environment_reference", secretBearing };
  if (!shapeIsSecret && /^(~|\/)[^\s]*\.(json|pem|key|p12|pfx)$/i.test(v))
    return { key, storage: "file_reference", secretBearing };
  return { key, storage: "plaintext_config", secretBearing };
}

function namedKeys(value: unknown): NamedKey[] {
  if (!isObject(value)) return [];
  return Object.entries(value)
    .filter(([key]) => matchSecretPatterns(key).length === 0)
    .map(([key, v]) => classifyValue(key, v))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** `docker run -e KEY=VALUE` and `-e KEY` (pass-through) become env keys. */
function dockerEnvKeys(args: readonly string[]): NamedKey[] {
  const keys: NamedKey[] = [];
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] !== "-e" && args[i] !== "--env") continue;
    const spec = args[i + 1]!;
    const eq = spec.indexOf("=");
    const key = eq === -1 ? spec : spec.slice(0, eq);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    keys.push(
      eq === -1
        ? { key, storage: "environment_reference", secretBearing: isSecretBearingKey(key) }
        : classifyValue(key, spec.slice(eq + 1)),
    );
  }
  return keys;
}

const SECRET_FLAG = /^--?([A-Za-z0-9_-]+)$/;

/** Removes secret values from arguments while keeping their structure readable. */
export function redactArgs(args: readonly string[], homeDir: string): string[] {
  const out: string[] = [];
  let redactNext = false;
  for (const arg of args.slice(0, MAX_ARGS)) {
    if (redactNext) {
      out.push("[REDACTED]");
      redactNext = false;
      continue;
    }
    const assignment = /^(--?[A-Za-z0-9_-]+|[A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(arg);
    if (assignment !== null) {
      const [, key, value] = assignment;
      const bareKey = key!.replace(/^-+/, "");
      out.push(
        isSecretBearingKey(bareKey) || matchSecretPatterns(value!).length > 0
          ? `${key}=[REDACTED]`
          : cleanText(arg, homeDir),
      );
      continue;
    }
    const flag = SECRET_FLAG.exec(arg);
    if (flag !== null && isSecretBearingKey(flag[1]!)) {
      out.push(arg);
      redactNext = true;
      continue;
    }
    out.push(
      cleanText(
        /^[a-z][a-z0-9+.-]*:\/\//i.test(arg) ? (sanitizeUrl(arg)?.url ?? "[URL]") : arg,
        homeDir,
      ),
    );
  }
  if (args.length > MAX_ARGS) out.push(`… ${args.length - MAX_ARGS} more`);
  return out;
}

function sanitizeUrl(raw: string): { url: string; host: string } | undefined {
  try {
    const url = new URL(raw);
    return { url: `${url.protocol}//${url.host}${url.pathname}`, host: url.hostname.toLowerCase() };
  } catch {
    return undefined;
  }
}

/** Redacts secret shapes, shortens the home directory to `~`, and bounds length. */
function cleanText(text: string, homeDir: string): string {
  const redacted = redactText(tildify(text, homeDir));
  return redacted.length > MAX_ARG_LENGTH ? `${redacted.slice(0, MAX_ARG_LENGTH)}…` : redacted;
}

export function tildify(path: string, homeDir: string): string {
  return homeDir !== "" && path.startsWith(homeDir) ? `~${path.slice(homeDir.length)}` : path;
}

function escapePointer(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

const NPM_RUNNERS = new Set(["npx", "bunx", "pnpx"]);
const PY_RUNNERS = new Set(["uvx", "pipx"]);
const CONTAINER_RUNNERS = new Set(["docker", "podman"]);
const SCRIPT_RUNNERS = new Set(["node", "python", "python3", "bun", "deno", "uv"]);
const DOCKER_VALUE_FLAGS = new Set([
  "-e",
  "--env",
  "--env-file",
  "-v",
  "--volume",
  "--mount",
  "--name",
  "-p",
  "--publish",
  "--network",
  "-w",
  "--workdir",
  "-u",
  "--user",
  "--entrypoint",
  "--platform",
  "-l",
  "--label",
  "--add-host",
  "-m",
  "--memory",
  "--cpus",
]);

interface PackageInfo {
  readonly source: PackageSource;
  readonly name?: string;
  readonly pinned?: boolean;
}

export function detectPackage(command: string, args: readonly string[]): PackageInfo | undefined {
  const runner = command.split("/").pop() ?? command;
  if (NPM_RUNNERS.has(runner)) {
    const spec = firstPositional(args, new Set(["-p", "--package"]));
    return spec === undefined ? { source: "npm" } : { source: "npm", ...npmSpec(spec) };
  }
  if (PY_RUNNERS.has(runner)) {
    const from = args.indexOf("--from");
    const spec =
      from !== -1
        ? args[from + 1]
        : firstPositional(
            args.filter((a) => a !== "run"),
            new Set(),
          );
    return spec === undefined ? { source: "pypi" } : { source: "pypi", ...pySpec(spec) };
  }
  if (CONTAINER_RUNNERS.has(runner)) {
    const run = args.indexOf("run");
    const image = run === -1 ? undefined : firstPositional(args.slice(run + 1), DOCKER_VALUE_FLAGS);
    return image === undefined
      ? { source: "docker" }
      : {
          source: "docker",
          name: image.split("@")[0]!.replace(/:[^/:]+$/, ""),
          pinned: image.includes("@sha256:"),
        };
  }
  if (command.startsWith("/") || command.startsWith("~") || command.startsWith("."))
    return { source: "local" };
  if (SCRIPT_RUNNERS.has(runner)) return { source: "local" };
  return undefined;
}

function firstPositional(
  args: readonly string[],
  valueFlags: ReadonlySet<string>,
): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (valueFlags.has(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith("-")) return arg;
  }
  return undefined;
}

const EXACT_VERSION = /^v?\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/;

function npmSpec(spec: string): { name: string; pinned: boolean } {
  const at = spec.lastIndexOf("@");
  if (at <= 0) return { name: spec, pinned: false };
  return { name: spec.slice(0, at), pinned: EXACT_VERSION.test(spec.slice(at + 1)) };
}

function pySpec(spec: string): { name: string; pinned: boolean } {
  const exact = /^([A-Za-z0-9_.\-[\]]+)==(.+)$/.exec(spec);
  if (exact !== null) return { name: exact[1]!, pinned: EXACT_VERSION.test(exact[2]!) };
  const at = spec.lastIndexOf("@");
  if (at > 0) return { name: spec.slice(0, at), pinned: EXACT_VERSION.test(spec.slice(at + 1)) };
  return { name: spec.split(/[<>=~!]/)[0]!, pinned: false };
}

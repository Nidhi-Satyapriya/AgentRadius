import type { Action } from "../../domain/index.ts";

/**
 * What well-known MCP servers can typically do, from their published tool lists. Used to infer
 * access without starting a server. Real reach also depends on the token or account behind it,
 * so every edge built from this catalog is `inferred`, never `observed`.
 */
export const SERVICE_ACTIONS: Readonly<Record<string, readonly Action[]>> = {
  github: ["read", "write"],
  gitlab: ["read", "write"],
  atlassian: ["read", "write"],
  slack: ["read", "write"],
  notion: ["read", "write"],
  linear: ["read", "write"],
  sentry: ["read"],
  stripe: ["read", "write"],
  "google-workspace": ["read", "write"],
  aws: ["read", "write"],
  azure: ["read", "write"],
  cloudflare: ["read", "write"],
  vercel: ["read", "write"],
  supabase: ["read", "write"],
  figma: ["read"],
  datadog: ["read"],
  kubernetes: ["read", "write"],
  postgres: ["read"],
  mongodb: ["read", "write"],
  web: ["read"],
};

/** Servers whose reach is on this computer rather than in a SaaS account. */
export interface LocalCapability {
  readonly id: string;
  readonly label: string;
  readonly packages: readonly RegExp[];
  readonly names: readonly RegExp[];
  readonly actions: readonly Action[];
  readonly description: string;
  /** The server is limited to folders listed in its arguments. */
  readonly scopedToFolderArgs?: boolean;
}

export const LOCAL_CAPABILITIES: readonly LocalCapability[] = [
  {
    id: "files",
    label: "Files",
    packages: [/server-filesystem/i, /filesystem-mcp/i, /mcp-filesystem/i],
    names: [/^(file ?system|files?)$/i],
    actions: ["read", "write"],
    description:
      "Filesystem servers can read, create, edit, and move files inside the folders they are given.",
    scopedToFolderArgs: true,
  },
  {
    id: "shell",
    label: "Commands run as you",
    packages: [
      /desktop-commander/i,
      /mcp-server-commands/i,
      /server-shell/i,
      /mcp-shell/i,
      /iterm/i,
    ],
    names: [/shell|terminal|command/i],
    actions: ["execute", "read", "write"],
    description:
      "Shell servers run commands with your user account, so they can reach anything you can on this computer.",
  },
  {
    id: "git",
    label: "Local git repositories",
    packages: [/mcp-server-git\b/i, /git-mcp-server/i],
    names: [/^git$/i],
    actions: ["read", "write"],
    description:
      "Git servers can read history and create commits or branches in local repositories.",
  },
  {
    id: "sqlite",
    label: "Local SQLite databases",
    packages: [/sqlite/i],
    names: [/sqlite/i],
    actions: ["read", "write"],
    description: "SQLite servers can query and change the database file they are given.",
  },
];

export function matchLocalCapability(input: {
  readonly packageName?: string;
  readonly serverName: string;
}): { capability: LocalCapability; kind: "package" | "name" } | undefined {
  const { packageName, serverName } = input;
  if (packageName !== undefined) {
    const capability = LOCAL_CAPABILITIES.find((c) => c.packages.some((r) => r.test(packageName)));
    if (capability !== undefined) return { capability, kind: "package" };
  }
  const capability = LOCAL_CAPABILITIES.find((c) => c.names.some((r) => r.test(serverName)));
  return capability === undefined ? undefined : { capability, kind: "name" };
}

/** Arguments that look like folders. They are recorded as text and never opened or followed. */
export function folderArgs(args: readonly string[], packageName: string | undefined): string[] {
  return args.filter(
    (a) =>
      !a.startsWith("-") &&
      a !== packageName &&
      !a.includes("@") &&
      /^(~|\/|\.{1,2}\/|[A-Za-z]:[\\/])/.test(a),
  );
}

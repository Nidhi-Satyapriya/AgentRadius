/**
 * Known MCP client configuration locations, per operating system, relative to the user's home
 * directory. Only these exact files are read. Project-level configs inside repositories are not
 * scanned. Windows paths assume the default profile layout (`%APPDATA%` = `~/AppData/Roaming`).
 */
export type Platform = "darwin" | "win32" | "linux";

export const PLATFORM_LABELS: Readonly<Record<Platform, string>> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};

export function currentPlatform(): Platform {
  const p = process.platform;
  return p === "win32" || p === "linux" ? p : "darwin";
}

export type ConfigFormat =
  /** `{ "mcpServers": { name: server } }` (Cursor, Claude Desktop, Windsurf). */
  | "mcpServers"
  /** `{ "servers": { name: server } }` (VS Code mcp.json). */
  | "servers"
  /** VS Code settings.json: `{ "mcp": { "servers": { … } } }`. Only that key is read. */
  | "vscodeSettings"
  /** ~/.claude.json: top-level `mcpServers` plus `projects[path].mcpServers`. Only those keys are read. */
  | "claudeCode"
  /** ~/.codex/config.toml: only the `[mcp_servers.<name>]` tables are read. */
  | "codexToml";

export interface ConfigLocation {
  readonly relativePath: string;
  readonly format: ConfigFormat;
  /** Overrides the scope label of every server in the file, e.g. "plugin cursor-public/atlassian". */
  readonly scope?: string;
}

/** Per-platform values; a missing platform means the client is not available there. */
type PerPlatform<T> = Partial<Readonly<Record<Platform, T>>>;

interface ClientSpec {
  readonly id: string;
  readonly label: string;
  /** Command-line tool with no app to check for. */
  readonly cli?: true;
  /** App path checked for existence only. Absolute on macOS, home-relative elsewhere. */
  readonly app?: PerPlatform<string>;
  readonly locations: PerPlatform<readonly ConfigLocation[]>;
  readonly pluginCacheRoot?: string;
}

export interface McpClient {
  /** Lowercase slug used in entity IDs. */
  readonly id: string;
  readonly label: string;
  readonly cli: boolean;
  /** `undefined` when there is nothing to check (CLI tools, or no known install path). */
  readonly appPath?: { readonly path: string; readonly homeRelative: boolean };
  readonly locations: readonly ConfigLocation[];
  /**
   * Plugin cache laid out as `<root>/<marketplace>/<plugin>/<version>/{.mcp.json,mcp.json}`.
   * Only the newest version directory of each plugin is read.
   */
  readonly pluginCacheRoot?: string;
}

const same = <T>(value: T): PerPlatform<T> => ({ darwin: value, win32: value, linux: value });
const mcp = (relativePath: string): ConfigLocation => ({ relativePath, format: "mcpServers" });
const vscode = (userDir: string): readonly ConfigLocation[] => [
  { relativePath: `${userDir}/mcp.json`, format: "servers" },
  { relativePath: `${userDir}/settings.json`, format: "vscodeSettings" },
];

const SPECS: readonly ClientSpec[] = [
  {
    id: "cursor",
    label: "Cursor",
    app: {
      darwin: "/Applications/Cursor.app",
      win32: "AppData/Local/Programs/cursor/Cursor.exe",
    },
    locations: same([mcp(".cursor/mcp.json")]),
    pluginCacheRoot: ".cursor/plugins/cache",
  },
  {
    id: "vscode",
    label: "VS Code",
    app: {
      darwin: "/Applications/Visual Studio Code.app",
      win32: "AppData/Local/Programs/Microsoft VS Code/Code.exe",
    },
    locations: {
      darwin: vscode("Library/Application Support/Code/User"),
      win32: vscode("AppData/Roaming/Code/User"),
      linux: vscode(".config/Code/User"),
    },
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    app: { darwin: "/Applications/Claude.app", win32: "AppData/Local/AnthropicClaude/claude.exe" },
    locations: {
      darwin: [mcp("Library/Application Support/Claude/claude_desktop_config.json")],
      win32: [mcp("AppData/Roaming/Claude/claude_desktop_config.json")],
    },
  },
  {
    id: "claude-code",
    label: "Claude Code",
    cli: true,
    locations: same([{ relativePath: ".claude.json", format: "claudeCode" }]),
  },
  {
    id: "windsurf",
    label: "Windsurf",
    app: {
      darwin: "/Applications/Windsurf.app",
      win32: "AppData/Local/Programs/Windsurf/Windsurf.exe",
    },
    locations: same([mcp(".codeium/windsurf/mcp_config.json")]),
  },
  {
    id: "codex",
    label: "Codex",
    cli: true,
    locations: same([{ relativePath: ".codex/config.toml", format: "codexToml" }]),
  },
];

/** The clients and files to read on `platform`. Clients with no known location are left out. */
export function mcpClientsFor(platform: Platform): McpClient[] {
  return SPECS.flatMap((spec) => {
    const locations = spec.locations[platform];
    if (locations === undefined) return [];
    const app = spec.app?.[platform];
    return [
      {
        id: spec.id,
        label: spec.label,
        cli: spec.cli === true,
        ...(app !== undefined
          ? { appPath: { path: app, homeRelative: platform !== "darwin" } }
          : {}),
        locations,
        ...(spec.pluginCacheRoot !== undefined ? { pluginCacheRoot: spec.pluginCacheRoot } : {}),
      },
    ];
  });
}

/** macOS clients, kept for callers and tests that predate multi-platform support. */
export const MCP_CLIENTS: readonly McpClient[] = mcpClientsFor("darwin");

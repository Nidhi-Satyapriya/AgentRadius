/**
 * Known MCP client configuration locations on macOS, relative to the user's home directory.
 * Only these exact files are read. Project-level configs inside repositories are not scanned.
 */
export type ConfigFormat =
  /** `{ "mcpServers": { name: server } }` (Cursor, Claude Desktop, Windsurf). */
  | "mcpServers"
  /** `{ "servers": { name: server } }` (VS Code mcp.json). */
  | "servers"
  /** VS Code settings.json: `{ "mcp": { "servers": { … } } }`. Only that key is read. */
  | "vscodeSettings"
  /** ~/.claude.json: top-level `mcpServers` plus `projects[path].mcpServers`. Only those keys are read. */
  | "claudeCode";

export interface ConfigLocation {
  readonly relativePath: string;
  readonly format: ConfigFormat;
  /** Overrides the scope label of every server in the file, e.g. "plugin cursor-public/atlassian". */
  readonly scope?: string;
}

export interface McpClient {
  /** Lowercase slug used in entity IDs. */
  readonly id: string;
  readonly label: string;
  /** Absolute app bundle path checked for existence only; `undefined` for CLI-only clients. */
  readonly appBundle?: string;
  readonly locations: readonly ConfigLocation[];
  /**
   * Plugin cache laid out as `<root>/<marketplace>/<plugin>/<version>/{.mcp.json,mcp.json}`.
   * Only the newest version directory of each plugin is read.
   */
  readonly pluginCacheRoot?: string;
}

export const MCP_CLIENTS: readonly McpClient[] = [
  {
    id: "cursor",
    label: "Cursor",
    appBundle: "/Applications/Cursor.app",
    locations: [{ relativePath: ".cursor/mcp.json", format: "mcpServers" }],
    pluginCacheRoot: ".cursor/plugins/cache",
  },
  {
    id: "vscode",
    label: "VS Code",
    appBundle: "/Applications/Visual Studio Code.app",
    locations: [
      { relativePath: "Library/Application Support/Code/User/mcp.json", format: "servers" },
      {
        relativePath: "Library/Application Support/Code/User/settings.json",
        format: "vscodeSettings",
      },
    ],
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    appBundle: "/Applications/Claude.app",
    locations: [
      {
        relativePath: "Library/Application Support/Claude/claude_desktop_config.json",
        format: "mcpServers",
      },
    ],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    locations: [{ relativePath: ".claude.json", format: "claudeCode" }],
  },
  {
    id: "windsurf",
    label: "Windsurf",
    appBundle: "/Applications/Windsurf.app",
    locations: [{ relativePath: ".codeium/windsurf/mcp_config.json", format: "mcpServers" }],
  },
];

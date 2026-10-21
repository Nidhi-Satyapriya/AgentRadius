import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathExists } from "../fileAccess.ts";
import type { ConfigLocation } from "./clients.ts";

const MAX_ENTRIES = 200;
const PLUGIN_MCP_FILES = [".mcp.json", "mcp.json"];
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Finds the MCP config of the newest cached version of each plugin. Lists directory names only;
 * skips names that are not plain path segments so nothing outside the cache root is reached.
 */
export async function discoverPluginLocations(
  homeDir: string,
  cacheRoot: string,
): Promise<ConfigLocation[]> {
  const locations: ConfigLocation[] = [];
  for (const marketplace of await subdirectories(join(homeDir, cacheRoot))) {
    for (const plugin of await subdirectories(join(homeDir, cacheRoot, marketplace))) {
      const pluginDir = join(cacheRoot, marketplace, plugin);
      const version = await newestSubdirectory(join(homeDir, pluginDir));
      if (version === undefined) continue;
      for (const file of PLUGIN_MCP_FILES) {
        const relativePath = join(pluginDir, version, file);
        if (!(await pathExists(join(homeDir, relativePath)))) continue;
        locations.push({
          relativePath,
          format: "mcpServers",
          scope: `plugin ${marketplace}/${plugin}`,
        });
        break;
      }
      if (locations.length >= MAX_ENTRIES) return locations;
    }
  }
  return locations;
}

async function subdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && SAFE_SEGMENT.test(e.name))
      .map((e) => e.name)
      .sort()
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

async function newestSubdirectory(dir: string): Promise<string | undefined> {
  let newest: { name: string; mtime: number } | undefined;
  for (const name of await subdirectories(dir)) {
    const mtime = (await stat(join(dir, name))).mtimeMs;
    if (newest === undefined || mtime > newest.mtime) newest = { name, mtime };
  }
  return newest?.name;
}

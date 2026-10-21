import { open, stat } from "node:fs/promises";

export const MAX_CONFIG_BYTES = 1024 * 1024;

export type ConfigReadResult =
  | { readonly kind: "ok"; readonly text: string; readonly modifiedAt: string }
  | { readonly kind: "missing" }
  | { readonly kind: "denied" }
  | { readonly kind: "not_a_file" }
  | { readonly kind: "too_large"; readonly bytes: number }
  | { readonly kind: "error"; readonly code: string };

/**
 * Reads a small configuration file without following it anywhere surprising: regular files only
 * (symlinks are resolved by the OS, devices and directories are refused), bounded size, read-only
 * file handle. Error results carry no file content.
 */
export async function readConfigFile(
  path: string,
  maxBytes = MAX_CONFIG_BYTES,
): Promise<ConfigReadResult> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return { kind: "not_a_file" };
    if (info.size > maxBytes) return { kind: "too_large", bytes: info.size };
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(Math.min(info.size, maxBytes) + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > maxBytes) return { kind: "too_large", bytes: bytesRead };
      return {
        kind: "ok",
        text: buffer.subarray(0, bytesRead).toString("utf8"),
        modifiedAt: info.mtime.toISOString(),
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "unknown";
    if (code === "ENOENT" || code === "ENOTDIR") return { kind: "missing" };
    if (code === "EACCES" || code === "EPERM") return { kind: "denied" };
    return { kind: "error", code };
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

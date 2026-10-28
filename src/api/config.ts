/** Loopback only. Binding to other interfaces is deliberately not configurable in the MVP. */
export const API_HOST = "127.0.0.1";
export const API_PORT = parsePort(
  process.env["MCPRADIUS_PORT"] ?? process.env["AGENTRADIUS_PORT"],
  4317,
);
export const UI_DEV_PORT = 5173;
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_SNAPSHOT_BYTES = 25 * 1024 * 1024;

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("MCPRADIUS_PORT must be an integer between 1024 and 65535");
  }
  return port;
}

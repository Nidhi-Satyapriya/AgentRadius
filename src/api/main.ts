import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createLocalWorkspaceSession } from "../application/workspace.ts";
import { API_HOST, API_PORT, UI_DEV_PORT } from "./config.ts";
import { createGoogleAuth, googleAuthConfigFromEnv } from "./googleAuth.ts";
import { createApiServer } from "./server.ts";

const staticDir = resolve(import.meta.dirname, "../../dist/ui");
const server = createApiServer(createLocalWorkspaceSession(homedir()), {
  ...(existsSync(staticDir) ? { staticDir } : {}),
  extraAllowedOrigins: [`http://127.0.0.1:${UI_DEV_PORT}`, `http://localhost:${UI_DEV_PORT}`],
  auth: createGoogleAuth(googleAuthConfigFromEnv(process.env, API_PORT)),
});

server.listen(API_PORT, API_HOST, () => {
  console.warn(
    `AgentRadius (read-only) listening on http://${API_HOST}:${API_PORT}. Nothing is shown until you add an agent or scan this Mac.`,
  );
});

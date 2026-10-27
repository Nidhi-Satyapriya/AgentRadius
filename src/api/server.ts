import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, resolve, sep } from "node:path";
import type { ZodType } from "zod";
import { DEFAULT_ANALYSIS_SETTINGS } from "../analysis/index.ts";
import { WorkspaceError, type WorkspaceSession } from "../application/workspace.ts";
import { MAX_REQUEST_BYTES } from "./config.ts";
import { API_PREFIX, type AuthResponse, type HealthResponse } from "./contracts.ts";
import {
  createGoogleAuth,
  readCookie,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  type GoogleAuth,
} from "./googleAuth.ts";
import { applySecurityHeaders, HttpError, readJsonBody, sendError, sendJson } from "./http.ts";
import {
  BlastRadiusRequestSchema,
  DeclareAgentRequestSchema,
  EmptyRequestSchema,
  RemoveAgentRequestSchema,
  SimulationRequestSchema,
} from "./requestSchemas.ts";

export interface ApiServerOptions {
  /** Built UI directory to serve, if any. */
  readonly staticDir?: string;
  /** Extra origins allowed to POST (e.g. the Vite dev server). */
  readonly extraAllowedOrigins?: readonly string[];
  /** Optional Google sign-in. Without it, sign-in is reported as not configured. */
  readonly auth?: GoogleAuth;
}

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

export function createApiServer(session: WorkspaceSession, options: ApiServerOptions = {}): Server {
  const auth = options.auth ?? createGoogleAuth(null);
  const server = createServer((req, res) => {
    applySecurityHeaders(res);
    handle(server, session, auth, options, req, res).catch((error: unknown) => {
      if (error instanceof HttpError) return sendError(res, error);
      // Never leak internals: log a generic marker server-side, return a generic error.
      console.error(
        "agentradius: unhandled request error",
        error instanceof Error ? error.name : "unknown",
      );
      sendError(res, new HttpError(500, "internal_error", "Internal error"));
    });
  });
  return server;
}

async function handle(
  server: Server,
  session: WorkspaceSession,
  auth: GoogleAuth,
  options: ApiServerOptions,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const service = session.current();
  const port = (server.address() as AddressInfo | null)?.port;
  assertLoopbackHost(req, port);
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (!url.pathname.startsWith(`${API_PREFIX}/`)) {
    if (req.method !== "GET" && req.method !== "HEAD")
      throw new HttpError(405, "method_not_allowed", "Method not allowed");
    return serveStatic(options.staticDir, url.pathname, res);
  }

  const route = `${req.method ?? ""} ${url.pathname.slice(API_PREFIX.length)}`;
  switch (route) {
    case "GET /health": {
      const body: HealthResponse = { status: "ok", mode: "read_only", enforcementActive: false };
      return sendJson(res, 200, body);
    }
    case "GET /workspace":
      return sendJson(res, 200, service.view(DEFAULT_ANALYSIS_SETTINGS));
    case "POST /scans": {
      assertSameOrigin(req, port, options);
      parse(EmptyRequestSchema, await readJsonBody(req, MAX_REQUEST_BYTES));
      try {
        await session.scan();
      } catch (error) {
        if (error instanceof WorkspaceError && error.code === "invalid_snapshot") {
          // Issue paths and codes only; messages could echo collected text.
          throw new HttpError(
            422,
            "scan_rejected",
            "The scan produced data that failed validation, so it was discarded. The previous workspace is still shown.",
            error.issues.map((i) => ({ path: i.path, message: i.code })),
          );
        }
        throw error;
      }
      return sendJson(res, 200, session.current().view(DEFAULT_ANALYSIS_SETTINGS));
    }
    case "GET /auth": {
      return sendJson(
        res,
        200,
        authBody(auth, port, auth.user(readCookie(req.headers.cookie, SESSION_COOKIE))),
      );
    }
    case "GET /auth/google/start": {
      if (!auth.configured)
        throw new HttpError(503, "sign_in_not_configured", "Google sign-in is not set up");
      const returnTo = url.searchParams.get("return") ?? ownOrigin(port);
      if (!allowedOrigins(port, options).includes(returnTo))
        throw new HttpError(400, "invalid_return", "Invalid return address");
      return redirect(res, auth.begin(returnTo));
    }
    case "GET /auth/google/callback": {
      const result = await auth.complete(url.searchParams);
      if ("error" in result)
        return redirect(res, `${result.returnTo ?? ownOrigin(port)}/#/overview?signin=failed`);
      res.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE}=${result.sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_S}`,
      );
      return redirect(res, `${result.returnTo}/#/integrations`);
    }
    case "POST /auth/logout": {
      assertSameOrigin(req, port, options);
      parse(EmptyRequestSchema, await readJsonBody(req, MAX_REQUEST_BYTES));
      auth.signOut(readCookie(req.headers.cookie, SESSION_COOKIE));
      res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
      return sendJson(res, 200, authBody(auth, port, null));
    }
    case "POST /agents": {
      assertSameOrigin(req, port, options);
      const body = parse(DeclareAgentRequestSchema, await readJsonBody(req, MAX_REQUEST_BYTES));
      changeDeclarations(() => session.declareAgent(body));
      return sendJson(res, 200, session.current().view(DEFAULT_ANALYSIS_SETTINGS));
    }
    case "POST /agents/remove": {
      assertSameOrigin(req, port, options);
      const body = parse(RemoveAgentRequestSchema, await readJsonBody(req, MAX_REQUEST_BYTES));
      changeDeclarations(() => session.removeAgent(body.id));
      return sendJson(res, 200, session.current().view(DEFAULT_ANALYSIS_SETTINGS));
    }
    case "POST /blast-radius": {
      assertSameOrigin(req, port, options);
      const body = parse(BlastRadiusRequestSchema, await readJsonBody(req, MAX_REQUEST_BYTES));
      return withWorkspaceErrors(res, () =>
        service.blastRadius(body.startId, body.settings ?? DEFAULT_ANALYSIS_SETTINGS),
      );
    }
    case "POST /simulations": {
      assertSameOrigin(req, port, options);
      const body = parse(SimulationRequestSchema, await readJsonBody(req, MAX_REQUEST_BYTES));
      return withWorkspaceErrors(res, () =>
        service.simulate(body.startId, body.changes, body.settings ?? DEFAULT_ANALYSIS_SETTINGS),
      );
    }
    default:
      throw new HttpError(404, "not_found", "Not found");
  }
}

/** DNS-rebinding defense: only answer requests addressed to a loopback host on our port. */
function assertLoopbackHost(req: IncomingMessage, port: number | undefined): void {
  const host = req.headers.host ?? "";
  const allowed = LOOPBACK_HOSTS.map((h) => `${h}:${port}`);
  if (!allowed.includes(host))
    throw new HttpError(421, "misdirected_request", "Unexpected Host header");
}

/** CSRF defense for state-changing-shaped requests: browsers must be same-origin. */
function assertSameOrigin(
  req: IncomingMessage,
  port: number | undefined,
  options: ApiServerOptions,
): void {
  const site = req.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin" && site !== "none") {
    throw new HttpError(403, "cross_site_request", "Cross-site requests are not allowed");
  }
  const origin = req.headers.origin;
  if (origin === undefined) return;
  if (!allowedOrigins(port, options).includes(origin))
    throw new HttpError(403, "cross_origin_request", "Origin not allowed");
}

function allowedOrigins(port: number | undefined, options: ApiServerOptions): string[] {
  return [
    ...LOOPBACK_HOSTS.map((h) => `http://${h}:${port}`),
    ...(options.extraAllowedOrigins ?? []),
  ];
}

const ownOrigin = (port: number | undefined) => `http://127.0.0.1:${port}`;

function authBody(
  auth: GoogleAuth,
  port: number | undefined,
  user: AuthResponse["user"],
): AuthResponse {
  return {
    provider: "google",
    configured: auth.configured,
    redirectUri: `${ownOrigin(port)}${API_PREFIX}/auth/google/callback`,
    user,
  };
}

function redirect(res: ServerResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

function parse<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  throw new HttpError(
    400,
    "invalid_request",
    "Request failed validation",
    result.error.issues.map((i) => ({ path: `/${i.path.join("/")}`, message: i.message })),
  );
}

function changeDeclarations(change: () => void): void {
  try {
    change();
  } catch (error) {
    if (!(error instanceof WorkspaceError)) throw error;
    switch (error.code) {
      case "duplicate":
        throw new HttpError(409, "duplicate_agent", error.message);
      case "limit":
        throw new HttpError(422, "agent_limit", error.message);
      case "not_found":
        throw new HttpError(404, "unknown_entity", "Unknown entity");
      case "invalid_snapshot":
        throw new HttpError(
          422,
          "declaration_rejected",
          "This agent could not be added because its details failed validation.",
          error.issues.map((i) => ({ path: i.path, message: i.code })),
        );
    }
  }
}

function withWorkspaceErrors(res: ServerResponse, run: () => unknown): void {
  try {
    sendJson(res, 200, run());
  } catch (error) {
    if (error instanceof WorkspaceError && error.code === "not_found") {
      throw new HttpError(404, "unknown_entity", "Unknown entity");
    }
    throw error;
  }
}

function serveStatic(staticDir: string | undefined, pathname: string, res: ServerResponse): void {
  if (staticDir === undefined)
    throw new HttpError(404, "not_found", "UI is not built. Run `npm run build` or `npm run dev`.");
  const root = resolve(staticDir);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, "invalid_path", "Invalid path");
  }
  if (decoded.includes("\0")) throw new HttpError(400, "invalid_path", "Invalid path");
  const candidate = resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(root + sep))
    throw new HttpError(404, "not_found", "Not found");

  const isFile = existsSync(candidate) && statSync(candidate).isFile();
  // Client-side routes (no extension) fall back to the SPA shell; missing assets are 404s.
  const file = isFile ? candidate : extname(decoded) === "" ? resolve(root, "index.html") : null;
  if (file === null || !existsSync(file)) throw new HttpError(404, "not_found", "Not found");

  res.statusCode = 200;
  res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(res);
}

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiErrorBody } from "./contracts.ts";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: ApiErrorBody["error"]["issues"];
  constructor(
    status: number,
    code: string,
    message: string,
    issues?: ApiErrorBody["error"]["issues"],
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export function applySecurityHeaders(res: ServerResponse): void {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(payload);
}

export function sendError(res: ServerResponse, error: HttpError): void {
  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.issues ? { issues: error.issues } : {}),
    },
  };
  sendJson(res, error.status, body);
}

/** Reads a bounded JSON body. Rejects non-JSON content types and oversized payloads. */
export async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const type = req.headers["content-type"] ?? "";
  if (!/^application\/json(\s*;|$)/i.test(type)) {
    throw new HttpError(415, "unsupported_media_type", "Content-Type must be application/json");
  }
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > maxBytes) throw new HttpError(413, "payload_too_large", "Request body too large");

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new HttpError(413, "payload_too_large", "Request body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_json", "Request body is not valid JSON");
  }
}

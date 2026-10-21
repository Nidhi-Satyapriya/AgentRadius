import { SECRET_PATTERNS, matchSecretPatterns } from "./secretPatterns.ts";

export interface SecretFinding {
  /** JSON-pointer-like location of the offending value. The value itself is never returned. */
  readonly path: string;
  readonly patternIds: readonly string[];
}

const MAX_SCAN_DEPTH = 64;

/** Walks an arbitrary JSON value and reports locations of secret-shaped strings (keys included). */
export function scanForSecrets(value: unknown): SecretFinding[] {
  const findings: SecretFinding[] = [];
  walk(value, "", 0, findings);
  return findings;
}

function walk(value: unknown, path: string, depth: number, out: SecretFinding[]): void {
  if (depth > MAX_SCAN_DEPTH) {
    out.push({ path, patternIds: ["max-depth-exceeded"] });
    return;
  }
  if (typeof value === "string") {
    const ids = matchSecretPatterns(value);
    if (ids.length > 0) out.push({ path: path || "/", patternIds: ids });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}/${index}`, depth + 1, out));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const keyIds = matchSecretPatterns(key);
      if (keyIds.length > 0) out.push({ path: `${path}/<key>`, patternIds: keyIds });
      walk(child, `${path}/${escapePointer(key)}`, depth + 1, out);
    }
  }
}

function escapePointer(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** Replaces every secret-shaped substring with a typed placeholder. */
export function redactText(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    const global = new RegExp(pattern.regex.source, `${pattern.regex.flags.replace("g", "")}g`);
    result = result.replace(global, `[REDACTED:${pattern.id}]`);
  }
  return result;
}

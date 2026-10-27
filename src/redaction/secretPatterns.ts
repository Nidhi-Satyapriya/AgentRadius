/**
 * Single authoritative list of secret-value shapes. Used to reject secret material at ingestion
 * and (later) to redact connector output and audit events. Detection is pattern-based and
 * therefore best-effort: absence of a match is not proof that a string is safe.
 */
export interface SecretPattern {
  readonly id: string;
  readonly description: string;
  readonly regex: RegExp;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    id: "aws-access-key-id",
    description: "AWS access key ID",
    regex: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/,
  },
  {
    id: "github-token",
    description: "GitHub token",
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/,
  },
  { id: "slack-token", description: "Slack token", regex: /\bxox[abeprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    id: "stripe-key",
    description: "Stripe API key",
    regex: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  },
  { id: "google-api-key", description: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    id: "google-oauth-client-secret",
    description: "Google OAuth client secret",
    regex: /\bGOCSPX-[A-Za-z0-9_-]{20,}/,
  },
  {
    id: "google-oauth-access-token",
    description: "Google OAuth access token",
    regex: /\bya29\.[A-Za-z0-9_-]{20,}/,
  },
  {
    id: "notion-token",
    description: "Notion integration token",
    regex: /\b(?:ntn_[A-Za-z0-9]{40,}|secret_[A-Za-z0-9]{43})\b/,
  },
  {
    id: "llm-provider-key",
    description: "LLM provider API key",
    regex: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/,
  },
  {
    id: "jwt",
    description: "JSON Web Token",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    id: "private-key-block",
    description: "PEM private key block",
    regex: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/,
  },
  {
    id: "url-embedded-credentials",
    description: "URL with embedded credentials",
    regex: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i,
  },
];

/**
 * Configuration keys whose values must be treated as secrets regardless of their shape.
 * Discovery connectors record only the key name (a credential reference), never the value.
 */
const SECRET_BEARING_KEY =
  /(secret|token|passw(or)?d|passwd|api[_-]?key|access[_-]?key|private[_-]?key|authorization|cookie|credential|session|bearer)/i;

export function isSecretBearingKey(name: string): boolean {
  return SECRET_BEARING_KEY.test(name);
}

export function matchSecretPatterns(value: string): string[] {
  return SECRET_PATTERNS.filter((pattern) => pattern.regex.test(value)).map((p) => p.id);
}

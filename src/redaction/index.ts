export { SECRET_PATTERNS, isSecretBearingKey, matchSecretPatterns } from "./secretPatterns.ts";
export type { SecretPattern } from "./secretPatterns.ts";
export { redactText, scanForSecrets } from "./scan.ts";
export type { SecretFinding } from "./scan.ts";

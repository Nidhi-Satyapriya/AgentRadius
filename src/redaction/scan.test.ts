import { describe, expect, it } from "vitest";
import { SENTINEL } from "../../tests/helpers/graphBuilder.ts";
import { isSecretBearingKey, redactText, scanForSecrets } from "./index.ts";

describe("scanForSecrets", () => {
  it("reports the location and pattern of secret-shaped values without returning them", () => {
    const token = SENTINEL.githubToken();
    const findings = scanForSecrets({ servers: [{ env: { GITHUB_TOKEN: token } }] });
    expect(findings).toEqual([
      { path: "/servers/0/env/GITHUB_TOKEN", patternIds: ["github-token"] },
    ]);
    expect(JSON.stringify(findings)).not.toContain(token);
  });

  it("detects secrets used as object keys", () => {
    expect(scanForSecrets({ [SENTINEL.awsKeyId()]: true })[0]?.patternIds).toContain(
      "aws-access-key-id",
    );
  });

  it("detects private key blocks and URLs with embedded passwords", () => {
    const ids = scanForSecrets([SENTINEL.privateKeyHeader(), SENTINEL.urlWithPassword()]).flatMap(
      (f) => f.patternIds,
    );
    expect(ids).toEqual(expect.arrayContaining(["private-key-block", "url-embedded-credentials"]));
  });

  it("detects Google OAuth client secrets and access tokens", () => {
    const ids = scanForSecrets([
      SENTINEL.googleClientSecret(),
      SENTINEL.googleAccessToken(),
    ]).flatMap((f) => f.patternIds);
    expect(ids).toEqual(["google-oauth-client-secret", "google-oauth-access-token"]);
  });

  it("does not flag credential references such as secret-manager URIs or env var names", () => {
    expect(
      scanForSecrets({
        ref: "op://Private/GitHub-PAT/credential",
        env: "GITHUB_PERSONAL_ACCESS_TOKEN",
        scope: "https://www.googleapis.com/auth/drive.readonly",
      }),
    ).toEqual([]);
  });

  it("fails closed on excessively deep input", () => {
    let deep: unknown = "x";
    for (let i = 0; i < 100; i++) deep = [deep];
    expect(scanForSecrets(deep).some((f) => f.patternIds.includes("max-depth-exceeded"))).toBe(
      true,
    );
  });
});

describe("redactText", () => {
  it("replaces every occurrence with a typed placeholder", () => {
    const token = SENTINEL.githubToken();
    const redacted = redactText(`a=${token} b=${token}`);
    expect(redacted).toBe("a=[REDACTED:github-token] b=[REDACTED:github-token]");
  });
});

describe("isSecretBearingKey", () => {
  it.each(["API_KEY", "github_token", "Authorization", "DB_PASSWORD", "client-secret"])(
    "treats %s as secret-bearing",
    (key) => expect(isSecretBearingKey(key)).toBe(true),
  );
  it.each(["PATH", "HOME", "LOG_LEVEL", "REGION"])("does not treat %s as secret-bearing", (key) =>
    expect(isSecretBearingKey(key)).toBe(false),
  );
});

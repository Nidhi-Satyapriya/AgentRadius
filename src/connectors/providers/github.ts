import { z } from "zod";
import type { Action } from "../../domain/index.ts";
import { ProviderError, requestJson, safeLabel, type FetchLike } from "./http.ts";
import { MAX_PAGES, PAGE_SIZE, type ProviderInventory } from "./inventory.ts";

const API = "https://api.github.com";

const UserSchema = z.object({ id: z.number().int(), login: z.string().max(100) });
const ReposSchema = z.array(
  z.object({
    id: z.number().int(),
    full_name: z.string().max(300),
    private: z.boolean().optional(),
    permissions: z
      .object({
        admin: z.boolean().optional(),
        maintain: z.boolean().optional(),
        push: z.boolean().optional(),
      })
      .optional(),
  }),
);

/** Your role in a repository, as GitHub reports it, mapped to actions. */
function actionsFor(p: z.infer<typeof ReposSchema>[number]["permissions"]): Action[] {
  if (p?.admin) return ["read", "write", "admin"];
  if (p?.maintain || p?.push) return ["read", "write"];
  return ["read"];
}

/**
 * Lists the repositories a fine-grained token can see and your permission on each. Two read-only
 * endpoints, fixed host, no redirects. The token is only placed in the Authorization header.
 */
export async function readGitHub(
  token: string,
  fetchFn: FetchLike,
  now: Date,
): Promise<ProviderInventory> {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "AgentRadius",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const get = async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
    const parsed = schema.safeParse(await requestJson(fetchFn, `${API}${path}`, { headers }));
    if (!parsed.success) throw new ProviderError("unexpected_response");
    return parsed.data;
  };

  const user = await get("/user", UserSchema);
  const repos: z.infer<typeof ReposSchema> = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await get(
      `/user/repos?per_page=${PAGE_SIZE}&page=${page}&sort=full_name`,
      ReposSchema,
    );
    repos.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    if (page === MAX_PAGES) truncated = true;
  }

  return {
    provider: "github",
    accountId: String(user.id),
    accountLabel: safeLabel(`@${user.login}`, "GitHub account"),
    readAt: now.toISOString(),
    items: repos
      .map((r) => ({
        id: String(r.id),
        label: safeLabel(r.full_name, "Repository"),
        actions: actionsFor(r.permissions),
        ...(r.private !== undefined ? { isPrivate: r.private } : {}),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    truncated,
    evidence: { assertion: "observed", confidence: "high" },
    evidenceRef: "GitHub API: GET /user/repos (your permission on each repository)",
  };
}

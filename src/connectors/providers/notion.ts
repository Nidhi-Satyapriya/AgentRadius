import { z } from "zod";
import { ProviderError, requestJson, safeLabel, type FetchLike } from "./http.ts";
import { MAX_PAGES, PAGE_SIZE, type ProviderInventory } from "./inventory.ts";

const API = "https://api.notion.com/v1";
export const NOTION_SHARED_RULE = "notion-shared-with-integration";

const RichTextSchema = z.array(z.object({ plain_text: z.string().max(2000) })).max(200);
const BotSchema = z.object({
  id: z.string().max(100),
  bot: z.object({ workspace_name: z.string().max(200).nullish() }).optional(),
});
const SearchSchema = z.object({
  results: z.array(
    z.object({
      object: z.enum(["page", "database"]),
      id: z.string().regex(/^[0-9a-f-]{32,36}$/i),
      title: RichTextSchema.optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  has_more: z.boolean(),
  next_cursor: z.string().max(200).nullable(),
});
const TitlePropertySchema = z.object({ type: z.literal("title"), title: RichTextSchema });

type Result = z.infer<typeof SearchSchema>["results"][number];

function titleOf(r: Result): string {
  if (r.object === "database") return (r.title ?? []).map((t) => t.plain_text).join("");
  for (const prop of Object.values(r.properties ?? {})) {
    const title = TitlePropertySchema.safeParse(prop);
    if (title.success) return title.data.title.map((t) => t.plain_text).join("");
  }
  return "";
}

/**
 * Lists the pages and databases shared with an internal integration. Uses the read-only
 * `users/me` and `search` endpoints on a fixed host, with no redirects.
 */
export async function readNotion(
  token: string,
  fetchFn: FetchLike,
  now: Date,
): Promise<ProviderInventory> {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  };
  const call = async <T>(path: string, schema: z.ZodType<T>, body?: object): Promise<T> => {
    const parsed = schema.safeParse(
      await requestJson(fetchFn, `${API}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );
    if (!parsed.success) throw new ProviderError("unexpected_response");
    return parsed.data;
  };

  const me = await call("/users/me", BotSchema);
  const results: Result[] = [];
  let cursor: string | null = null;
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch: z.infer<typeof SearchSchema> = await call("/search", SearchSchema, {
      page_size: PAGE_SIZE,
      ...(cursor !== null ? { start_cursor: cursor } : {}),
    });
    results.push(...batch.results);
    if (!batch.has_more || batch.next_cursor === null) break;
    cursor = batch.next_cursor;
    if (page === MAX_PAGES) truncated = true;
  }

  const workspace = me.bot?.workspace_name ?? "";
  return {
    provider: "notion",
    accountId: me.id,
    accountLabel: safeLabel(workspace, "Notion workspace"),
    readAt: now.toISOString(),
    items: results
      .map((r) => ({
        id: r.id.replaceAll("-", "").toLowerCase(),
        label: safeLabel(
          titleOf(r),
          r.object === "database" ? "Untitled database" : "Untitled page",
        ),
        actions: ["read", "write"] as const,
      }))
      .filter((item, i, all) => all.findIndex((x) => x.id === item.id) === i)
      .sort((a, b) => a.id.localeCompare(b.id)),
    truncated,
    evidence: { assertion: "inferred", confidence: "medium", inferenceRule: NOTION_SHARED_RULE },
    evidenceRef: "Notion API: POST /v1/search (pages shared with your integration)",
  };
}

import { z } from "zod";
import { AnalysisSettingsSchema, GraphChangeSchema } from "../analysis/index.ts";
import { AGENT_RUNTIMES, CATALOG_APPS, DECLARED_ACCESS, EntityIdSchema } from "../domain/index.ts";

const MAX_CHANGES = 50;

export const BlastRadiusRequestSchema = z.strictObject({
  startId: EntityIdSchema,
  settings: AnalysisSettingsSchema.optional(),
});

/** Scans take no parameters: the set of files read is fixed by the connectors. */
export const EmptyRequestSchema = z.strictObject({});

const APP_IDS = CATALOG_APPS.map((a) => a.id) as [string, ...string[]];

/** Names are display text only: letters, digits, spaces, and light punctuation. */
export const DeclareAgentRequestSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} .,'&()+/-]*$/u, "Use letters, numbers, and spaces"),
  runtime: z.enum(AGENT_RUNTIMES),
  appIds: z
    .array(z.enum(APP_IDS))
    .min(1)
    .max(APP_IDS.length)
    .refine((ids) => new Set(ids).size === ids.length, "Each app may be listed once"),
  access: z.enum(DECLARED_ACCESS),
});

export const RemoveAgentRequestSchema = z.strictObject({ id: EntityIdSchema });

export const SimulationRequestSchema = z.strictObject({
  startId: EntityIdSchema,
  changes: z.array(GraphChangeSchema).min(1).max(MAX_CHANGES),
  settings: AnalysisSettingsSchema.optional(),
});

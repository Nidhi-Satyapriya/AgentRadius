import { z } from "zod";
import {
  ACTIONS,
  ASSERTIONS,
  COLLECTION_METHODS,
  CONDITION_STATES,
  CONFIDENCES,
  CONNECTOR_STATUSES,
  DATA_ORIGINS,
  EDGE_TYPES,
  LIFECYCLES,
  NODE_TYPES,
} from "./vocabulary.ts";

export const SCHEMA_VERSION = "2.0";

const MAX_LABEL = 200;
const MAX_TEXT = 2000;
const MAX_LIST = 200;

/** `<namespace>:<local-id>`, e.g. `mcp:github` or `res:repo/payments`. No whitespace. */
export const EntityIdSchema = z
  .string()
  .min(3)
  .max(300)
  .regex(
    /^[a-z][a-z0-9_-]*:\S+$/,
    "IDs must look like `<namespace>:<local-id>` with no whitespace",
  );

const TimestampSchema = z.iso.datetime({ offset: true });

const AttributeValueSchema = z.union([
  z.string().max(MAX_TEXT),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(MAX_LABEL)).max(MAX_LIST),
]);

/** Free-form, display-only metadata. Analysis rules only read documented attribute keys. */
export const AttributesSchema = z.record(z.string().min(1).max(64), AttributeValueSchema);

export const ProvenanceSchema = z.strictObject({
  connectorId: z.string().min(1).max(100),
  /** Pointer to the evidence (file path + JSON pointer, API endpoint, fixture anchor). Never the evidence itself. */
  evidenceRef: z.string().min(1).max(500),
  observedAt: TimestampSchema,
  collectionMethod: z.enum(COLLECTION_METHODS),
});

export const ConditionSchema = z.strictObject({
  description: z.string().min(1).max(MAX_TEXT),
  state: z.enum(CONDITION_STATES),
});

export const NodeSchema = z.strictObject({
  id: EntityIdSchema,
  type: z.enum(NODE_TYPES),
  label: z.string().min(1).max(MAX_LABEL),
  description: z.string().max(MAX_TEXT).optional(),
  trustBoundaryId: EntityIdSchema.optional(),
  attributes: AttributesSchema.default({}),
  provenance: z.array(ProvenanceSchema).min(1).max(MAX_LIST),
});

export const EdgeSchema = z
  .strictObject({
    id: EntityIdSchema,
    type: z.enum(EDGE_TYPES),
    from: EntityIdSchema,
    to: EntityIdSchema,
    assertion: z.enum(ASSERTIONS),
    confidence: z.enum(CONFIDENCES),
    lifecycle: z.enum(LIFECYCLES).default("active"),
    /** Required when assertion is `inferred`: the named rule that produced the edge. */
    inferenceRule: z.string().min(1).max(100).optional(),
    /** Access the actor must already hold on `from` before this edge can be traversed. */
    requiresAction: z.enum(ACTIONS).optional(),
    /** Provider-native scope strings, e.g. OAuth scopes. Informational; not proof of effective access. */
    scopes: z.array(z.string().max(MAX_LABEL)).max(MAX_LIST).optional(),
    conditions: z.array(ConditionSchema).max(MAX_LIST).default([]),
    attributes: AttributesSchema.default({}),
    provenance: z.array(ProvenanceSchema).min(1).max(MAX_LIST),
  })
  .superRefine((edge, ctx) => {
    if (edge.assertion === "inferred" && edge.inferenceRule === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["inferenceRule"],
        message: "Inferred edges must name the inference rule that produced them",
      });
    }
    if (edge.from === edge.to) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "Self-referencing edges are not allowed",
      });
    }
  });

export const ConnectorRunSchema = z.strictObject({
  connectorId: z.string().min(1).max(100),
  label: z.string().min(1).max(MAX_LABEL),
  version: z.string().min(1).max(50),
  status: z.enum(CONNECTOR_STATUSES),
  readOnly: z.boolean(),
  startedAt: TimestampSchema.optional(),
  finishedAt: TimestampSchema.optional(),
  dataCategories: z.array(z.string().max(MAX_LABEL)).max(MAX_LIST),
  requiredPrivileges: z.array(z.string().max(MAX_LABEL)).max(MAX_LIST),
  coverage: z.string().max(MAX_TEXT),
  blindSpots: z.array(z.string().max(MAX_TEXT)).max(MAX_LIST),
  errors: z
    .array(z.strictObject({ code: z.string().max(100), message: z.string().max(MAX_TEXT) }))
    .max(MAX_LIST)
    .default([]),
});

export const SnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    snapshotId: z.string().min(1).max(200),
    collectedAt: TimestampSchema,
    dataOrigin: z.enum(DATA_ORIGINS),
    /** Mandatory, user-visible notice when dataOrigin is `fixture`. */
    fixtureNotice: z.string().min(1).max(MAX_TEXT).optional(),
    environmentLabel: z.string().min(1).max(MAX_LABEL),
    nodes: z.array(NodeSchema).max(50_000),
    edges: z.array(EdgeSchema).max(200_000),
    connectorRuns: z.array(ConnectorRunSchema).max(MAX_LIST).default([]),
  })
  .superRefine((snapshot, ctx) => {
    if (snapshot.dataOrigin === "fixture" && snapshot.fixtureNotice === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["fixtureNotice"],
        message: "Fixture snapshots must carry a fixtureNotice so the UI can label them",
      });
    }
  });

export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type GraphNode = z.infer<typeof NodeSchema>;
export type GraphEdge = z.infer<typeof EdgeSchema>;
export type ConnectorRun = z.infer<typeof ConnectorRunSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Attributes = z.infer<typeof AttributesSchema>;

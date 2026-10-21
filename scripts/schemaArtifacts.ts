import { z } from "zod";
import { FindingSchema, SnapshotSchema } from "../src/domain/index.ts";

/** JSON Schema files derived from the Zod schemas, which remain the single source of truth. */
export function schemaArtifacts(): Record<string, string> {
  const entries = {
    "snapshot.schema.json": SnapshotSchema,
    "finding.schema.json": FindingSchema,
  };
  return Object.fromEntries(
    Object.entries(entries).map(([file, schema]) => [
      file,
      `${JSON.stringify(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }), null, 2)}\n`,
    ]),
  );
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { schemaArtifacts } from "../scripts/schemaArtifacts.ts";

describe("committed JSON Schemas", () => {
  for (const [file, expected] of Object.entries(schemaArtifacts())) {
    it(`${file} matches the Zod source of truth (run \`npm run schemas\` if this fails)`, () => {
      const committed = readFileSync(resolve(import.meta.dirname, "../schemas", file), "utf8");
      expect(committed).toBe(expected);
    });
  }
});

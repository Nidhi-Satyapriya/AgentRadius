import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { schemaArtifacts } from "./schemaArtifacts.ts";

const outDir = resolve(import.meta.dirname, "../schemas");
mkdirSync(outDir, { recursive: true });
for (const [file, content] of Object.entries(schemaArtifacts())) {
  writeFileSync(join(outDir, file), content);
  console.warn(`wrote schemas/${file}`);
}

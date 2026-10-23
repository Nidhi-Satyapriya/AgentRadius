import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Allowed dependencies between top-level modules under src/. Inner layers (domain, redaction)
 * depend on nothing; analysis never depends on connectors, storage, API, or UI; the UI talks to
 * the backend only through `api/contracts.ts`.
 */
const ALLOWED: Record<string, readonly string[]> = {
  domain: [],
  redaction: [],
  graph: ["domain", "redaction"],
  analysis: ["domain", "graph"],
  fixtures: ["domain"],
  connectors: ["domain", "redaction"],
  storage: ["domain", "graph"],
  application: ["domain", "graph", "analysis", "storage", "fixtures", "redaction", "connectors"],
  api: ["domain", "analysis", "application", "redaction"],
  ui: ["domain", "api/contracts.ts", "api/config.ts"],
};

const SRC = resolve(import.meta.dirname, "../src");
const IMPORT = /(?:import|export)\s*(?:[^'";]*?\sfrom\s*)?\(?\s*["'](\.[^"']+)["']/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

function moduleOf(path: string): string {
  return relative(SRC, path).split(sep)[0] ?? "";
}

describe("module boundaries", () => {
  const violations: string[] = [];
  let crossModuleImports = 0;
  for (const file of sourceFiles(SRC)) {
    const from = moduleOf(file);
    const allowed = ALLOWED[from];
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const target = resolve(dirname(file), match[1]!);
      if (!target.startsWith(SRC)) continue;
      const to = moduleOf(target);
      if (to === from) continue;
      crossModuleImports++;
      const targetPath = relative(SRC, target).split(sep).join("/");
      const ok = allowed?.some((a) => a === to || a === targetPath);
      if (!ok) violations.push(`${relative(SRC, file)} → ${targetPath}`);
    }
  }

  it("every module is declared", () => {
    const modules = new Set(sourceFiles(SRC).map(moduleOf));
    expect([...modules].filter((m) => !(m in ALLOWED))).toEqual([]);
  });

  it("imports follow the allowed dependency direction", () => {
    expect(crossModuleImports).toBeGreaterThan(10);
    expect(violations).toEqual([]);
  });

  it("the browser bundle takes runtime domain values only from the validation-free core", () => {
    const VALUE_IMPORT = /^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm;
    const offenders = sourceFiles(join(SRC, "ui")).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(VALUE_IMPORT)]
        .map((m) =>
          relative(SRC, resolve(dirname(file), m[1]!))
            .split(sep)
            .join("/"),
        )
        .filter((target) => target.startsWith("domain/") && target !== "domain/core.ts")
        .map((target) => `${relative(SRC, file)} → ${target}`),
    );
    expect(offenders).toEqual([]);
  });
});

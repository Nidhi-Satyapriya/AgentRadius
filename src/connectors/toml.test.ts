import { describe, expect, it } from "vitest";
import { parseToml } from "./toml.ts";

const plain = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

describe("TOML reader", () => {
  it("reads tables, dotted and quoted keys, strings, arrays, and inline tables", () => {
    const doc = parseToml(
      [
        "# comment",
        'title = "a \\"b\\" \\u00e9" # trailing',
        "n = 1_000",
        "on = true",
        "when = 2026-10-27T10:00:00Z",
        "[a.b]",
        "x = 'C:\\path'",
        "list = [",
        '  "one", # c',
        "  'two',",
        "]",
        'inline = { k = "v", n.m = 2 }',
        '[a."quoted key"]',
        'ml = """',
        "line1",
        'line2"""',
        "[[arr]]",
        "i = 1",
        "[[arr]]",
        "i = 2",
      ].join("\n"),
    );
    expect(plain(doc)).toEqual({
      title: 'a "b" é',
      n: 1000,
      on: true,
      when: "2026-10-27T10:00:00Z",
      a: {
        b: { x: "C:\\path", list: ["one", "two"], inline: { k: "v", n: { m: 2 } } },
        "quoted key": { ml: "line1\nline2" },
      },
      arr: [{ i: 1 }, { i: 2 }],
    });
  });

  it("rejects malformed input and duplicate keys", () => {
    for (const bad of ['a = "open', "a = 1\na = 2", "[a\nb = 1", "a = [1, 2", "= 1", "a = 1 b"])
      expect(() => parseToml(bad)).toThrow(SyntaxError);
  });

  it("cannot pollute object prototypes", () => {
    const doc = parseToml('[__proto__]\npolluted = "yes"');
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(Object.keys(doc)).toEqual(["__proto__"]);
  });
});

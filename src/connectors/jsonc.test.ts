import { describe, expect, it } from "vitest";
import { parseJsonc } from "./jsonc.ts";

describe("parseJsonc", () => {
  it("accepts comments and trailing commas outside strings", () => {
    const text = `{
      // line comment
      "a": [1, 2,], /* block */
      "b": { "c": "x", },
    }`;
    expect(parseJsonc(text)).toEqual({ a: [1, 2], b: { c: "x" } });
  });

  it("leaves comment-like and comma-like text inside strings intact", () => {
    expect(parseJsonc(`{"url": "https://x.example/a,}", "q": "say \\"//hi\\""}`)).toEqual({
      url: "https://x.example/a,}",
      q: 'say "//hi"',
    });
  });

  it("strips a byte-order mark and still rejects invalid JSON", () => {
    expect(parseJsonc('\uFEFF{"a":1}')).toEqual({ a: 1 });
    expect(() => parseJsonc("{a:1}")).toThrow();
  });
});

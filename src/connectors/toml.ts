/**
 * A small TOML reader for config files (Codex's `config.toml`). Supports tables, arrays of
 * tables, dotted keys, all four string forms, arrays, inline tables, booleans, and numbers.
 * Dates and other scalars are kept as raw text. Throws on malformed input; callers must never
 * surface the error message, because it can quote file content.
 */
export function parseToml(text: string): Record<string, unknown> {
  return new TomlReader(text.replace(/^\uFEFF/, "")).document();
}

type Table = Record<string, unknown>;

const newTable = (): Table => Object.create(null) as Table;
const isTable = (v: unknown): v is Table =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const BARE_KEY = /[A-Za-z0-9_-]/;
const SCALAR = /[0-9A-Za-z+\-_.:]/;
const ESCAPES: Readonly<Record<string, string>> = {
  b: "\b",
  t: "\t",
  n: "\n",
  f: "\f",
  r: "\r",
  '"': '"',
  "\\": "\\",
};

class TomlReader {
  private i = 0;
  private readonly s: string;
  constructor(text: string) {
    this.s = text;
  }

  document(): Table {
    const root = newTable();
    let table = root;
    for (;;) {
      this.skipBlank(true);
      if (this.i >= this.s.length) return root;
      if (this.s.startsWith("[[", this.i)) {
        this.i += 2;
        const keys = this.key();
        this.expect("]]");
        table = arrayTable(root, keys);
      } else if (this.s[this.i] === "[") {
        this.i++;
        const keys = this.key();
        this.expect("]");
        table = walk(root, keys);
      } else {
        const keys = this.key();
        this.expect("=");
        this.skipBlank(false);
        assign(table, keys, this.value());
      }
      this.endOfLine();
    }
  }

  private fail(): never {
    throw new SyntaxError("Invalid TOML");
  }

  private expect(token: string): void {
    this.skipBlank(false);
    if (!this.s.startsWith(token, this.i)) this.fail();
    this.i += token.length;
  }

  /** Skips spaces and comments, and newlines too when `newlines` is set. */
  private skipBlank(newlines: boolean): void {
    while (this.i < this.s.length) {
      const ch = this.s[this.i]!;
      if (ch === " " || ch === "\t" || (newlines && (ch === "\n" || ch === "\r"))) this.i++;
      else if (ch === "#") while (this.i < this.s.length && this.s[this.i] !== "\n") this.i++;
      else return;
    }
  }

  private endOfLine(): void {
    this.skipBlank(false);
    if (this.i >= this.s.length) return;
    if (this.s[this.i] === "\r") this.i++;
    if (this.s[this.i] !== "\n") this.fail();
    this.i++;
  }

  private key(): string[] {
    const parts: string[] = [];
    for (;;) {
      this.skipBlank(false);
      const ch = this.s[this.i];
      if (ch === '"') parts.push(this.basicString());
      else if (ch === "'") parts.push(this.literalString());
      else {
        const start = this.i;
        while (this.i < this.s.length && BARE_KEY.test(this.s[this.i]!)) this.i++;
        if (this.i === start) this.fail();
        parts.push(this.s.slice(start, this.i));
      }
      this.skipBlank(false);
      if (this.s[this.i] !== ".") return parts;
      this.i++;
    }
  }

  private value(): unknown {
    const s = this.s;
    if (s.startsWith('"""', this.i)) return this.multilineBasic();
    if (s.startsWith("'''", this.i)) return this.multilineLiteral();
    const ch = s[this.i];
    if (ch === '"') return this.basicString();
    if (ch === "'") return this.literalString();
    if (ch === "[") return this.array();
    if (ch === "{") return this.inlineTable();
    const start = this.i;
    while (this.i < s.length && SCALAR.test(s[this.i]!)) this.i++;
    // Datetimes may contain one space between date and time.
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(s.slice(start, this.i)) &&
      /^ \d/.test(s.slice(this.i, this.i + 2))
    ) {
      this.i++;
      while (this.i < s.length && SCALAR.test(s[this.i]!)) this.i++;
    }
    const raw = s.slice(start, this.i);
    if (raw === "") this.fail();
    if (raw === "true") return true;
    if (raw === "false") return false;
    const n = Number(raw.replaceAll("_", ""));
    return Number.isFinite(n) && /^[+-]?[0-9]/.test(raw) && !raw.includes(":") ? n : raw;
  }

  private basicString(): string {
    this.i++;
    let out = "";
    while (this.i < this.s.length) {
      const ch = this.s[this.i]!;
      if (ch === '"') {
        this.i++;
        return out;
      }
      if (ch === "\n") this.fail();
      if (ch === "\\") out += this.escape();
      else {
        out += ch;
        this.i++;
      }
    }
    return this.fail();
  }

  private multilineBasic(): string {
    this.i += 3;
    if (this.s[this.i] === "\r") this.i++;
    if (this.s[this.i] === "\n") this.i++;
    let out = "";
    while (this.i < this.s.length) {
      if (this.s.startsWith('"""', this.i)) {
        this.i += 3;
        return out;
      }
      const ch = this.s[this.i]!;
      if (ch === "\\" && /^\\[ \t]*\r?\n/.test(this.s.slice(this.i, this.i + 64))) {
        this.i++;
        while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
      } else if (ch === "\\") out += this.escape();
      else {
        out += ch;
        this.i++;
      }
    }
    return this.fail();
  }

  private escape(): string {
    const code = this.s[this.i + 1];
    if (code === undefined) this.fail();
    if (code === "u" || code === "U") {
      const len = code === "u" ? 4 : 8;
      const hex = this.s.slice(this.i + 2, this.i + 2 + len);
      if (!new RegExp(`^[0-9A-Fa-f]{${len}}$`).test(hex)) this.fail();
      this.i += 2 + len;
      const point = Number.parseInt(hex, 16);
      if (point > 0x10ffff) this.fail();
      return String.fromCodePoint(point);
    }
    const mapped = ESCAPES[code];
    if (mapped === undefined) this.fail();
    this.i += 2;
    return mapped;
  }

  private literalString(): string {
    const end = this.s.indexOf("'", this.i + 1);
    if (end === -1) this.fail();
    const out = this.s.slice(this.i + 1, end);
    if (out.includes("\n")) this.fail();
    this.i = end + 1;
    return out;
  }

  private multilineLiteral(): string {
    const end = this.s.indexOf("'''", this.i + 3);
    if (end === -1) this.fail();
    const out = this.s.slice(this.i + 3, end).replace(/^\r?\n/, "");
    this.i = end + 3;
    return out;
  }

  private array(): unknown[] {
    this.i++;
    const out: unknown[] = [];
    for (;;) {
      this.skipBlank(true);
      if (this.s[this.i] === "]") {
        this.i++;
        return out;
      }
      out.push(this.value());
      this.skipBlank(true);
      if (this.s[this.i] === ",") this.i++;
      else if (this.s[this.i] !== "]") this.fail();
    }
  }

  private inlineTable(): Table {
    this.i++;
    const out = newTable();
    this.skipBlank(false);
    if (this.s[this.i] === "}") {
      this.i++;
      return out;
    }
    for (;;) {
      const keys = this.key();
      this.expect("=");
      this.skipBlank(false);
      assign(out, keys, this.value());
      this.skipBlank(false);
      const ch = this.s[this.i];
      this.i++;
      if (ch === "}") return out;
      if (ch !== ",") this.fail();
    }
  }
}

/** Descends to (creating) the table at `keys`; the last element of an array of tables counts. */
function walk(root: Table, keys: readonly string[]): Table {
  let table = root;
  for (const key of keys) {
    let next = table[key];
    if (next === undefined) {
      next = newTable();
      table[key] = next;
    }
    if (Array.isArray(next)) next = next.at(-1);
    if (!isTable(next)) throw new SyntaxError("Invalid TOML");
    table = next;
  }
  return table;
}

function arrayTable(root: Table, keys: readonly string[]): Table {
  const parent = walk(root, keys.slice(0, -1));
  const last = keys.at(-1)!;
  const list = parent[last] ?? [];
  if (!Array.isArray(list)) throw new SyntaxError("Invalid TOML");
  const table = newTable();
  list.push(table);
  parent[last] = list;
  return table;
}

function assign(table: Table, keys: readonly string[], value: unknown): void {
  const target = walk(table, keys.slice(0, -1));
  const last = keys.at(-1)!;
  if (last in target) throw new SyntaxError("Invalid TOML");
  target[last] = value;
}

// ponytail: stub so UI compiles; engine agent replaces the body.
import type { ParseOptions, ParseResult } from "./types";
export * from "./types";

export function parseText(text: string, _opts: ParseOptions = {}): ParseResult {
  const rows = text.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => [l]);
  return {
    format: "none",
    hasHeader: false,
    columns: [{ id: "c0", name: "Column 1", type: "string" }],
    rows,
    confidence: 0,
  };
}

/** Sort-key extraction for a typed cell. Numbers for typed columns, string otherwise. */
export function sortKey(value: string, type: import("./types").ColumnType): number | string {
  return value;
}

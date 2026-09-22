/** Contract shared by parser engine, UI, export and tests. Keep stable. */

export type Format =
  | "auto"
  | "tab"
  | "comma"
  | "semicolon"
  | "pipe"
  | "aligned"
  | "jsonl"
  | "syslog"
  | "none";

export type ColumnType =
  | "string"
  | "number"
  | "percentage"
  | "size"
  | "duration"
  | "ratio"
  | "datetime"
  | "ip";

export interface Column {
  /** Stable id, "c0", "c1", ... */
  id: string;
  /** Display header text. "Column 1" etc. when no header row. */
  name: string;
  type: ColumnType;
}

export interface ParseResult {
  /** Detected (or forced) format. "none" when nothing parseable → one-column fallback. */
  format: Exclude<Format, "auto">;
  /** Whether first input row was treated as header. */
  hasHeader: boolean;
  columns: Column[];
  /** rows[i][j] is the raw cell string for columns[j]. Always rectangular. */
  rows: string[][];
  /** Detection confidence 0..1 for the chosen format. */
  confidence: number;
}

export interface ParseOptions {
  /** Force a format instead of auto-detecting. Default "auto". */
  format?: Format;
  /** Force header on/off. Default: auto-detect. */
  hasHeader?: boolean;
}

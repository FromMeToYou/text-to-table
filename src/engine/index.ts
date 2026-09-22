/**
 * Text -> rectangular table. One pure function, no user interaction.
 *
 *   preprocess -> score every candidate parser -> pick max -> header -> types
 */
import Papa from "papaparse";
import { parseAligned } from "./aligned";
import { parseSpace } from "./space";
import { cellType, inferColumnType } from "./infer";
import type { Column, ColumnType, Format, ParseOptions, ParseResult } from "./types";

export * from "./types";
export * from "./export";
export { sortKey, inferColumnType, matchesType, cellType } from "./infer";

type Detected = Exclude<Format, "auto">;

// CSI + OSC escape sequences. Covers colour, cursor moves and window titles.
const ANSI_RE =
  /[\x1B\x9B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-PR-TZcf-nqry=><]|\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g;

const RULE_CHARS = /^[-=_+|:~\s\u2500-\u257F]+$/;
const RULE_BODY = /[-=\u2500\u2501\u2550_]{3,}/;

interface Preprocessed {
  /** Non-blank content lines, for the line-based parsers. */
  lines: string[];
  /** Same lines with interior blanks kept, for Papa Parse (quoted newlines). */
  csvText: string;
}

function preprocess(text: string): Preprocessed {
  const normalized = text.replace(ANSI_RE, "").replace(/\r\n?/g, "\n");
  let kept = normalized.split("\n").map((l) => l.replace(/[ \t]+$/, ""));
  while (kept.length > 0 && kept[0].trim() === "") kept.shift();
  while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();
  kept = kept.filter((l) => !(l.trim() !== "" && RULE_CHARS.test(l) && RULE_BODY.test(l)));
  return { lines: kept.filter((l) => l.trim() !== ""), csvText: kept.join("\n") };
}

interface Candidate {
  format: Detected;
  weight: number;
  grid: string[][];
  /** Column names for jsonl, which carries its own header. */
  names?: string[];
  /** 0..1; defaults to modal column-count consistency of `grid`. */
  consistency?: number;
}

function modalCount(grid: string[][]): { modal: number; fraction: number } {
  if (grid.length === 0) return { modal: 0, fraction: 0 };
  const counts = new Map<number, number>();
  for (const r of grid) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
  let modal = 0;
  let hits = 0;
  for (const [n, c] of counts) {
    if (c > hits || (c === hits && n > modal)) {
      modal = n;
      hits = c;
    }
  }
  return { modal, fraction: hits / grid.length };
}

function papa(text: string, delimiter: string): string[][] {
  const out = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true });
  return out.data.filter(Array.isArray).map((r) => r.map((c) => (c ?? "").trim()));
}

const PIPE_SPLIT = /[|\u2502\u2503\u2551]/;
const PIPE_EDGE_L = /^[|\u2502\u2503\u2551+\u251C\u2560]+/;
const PIPE_EDGE_R = /[|\u2502\u2503\u2551+\u2524\u2563]+$/;

function parsePipe(lines: string[]): string[][] {
  return lines.map((l) => {
    const s = l.trim().replace(PIPE_EDGE_L, "").replace(PIPE_EDGE_R, "");
    return s.split(PIPE_SPLIT).map((c) => c.trim());
  });
}

function parseJsonl(lines: string[]): { names: string[]; grid: string[][]; ok: number } {
  const names: string[] = [];
  const objects: Record<string, unknown>[] = [];
  let ok = 0;
  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      objects.push({});
      continue;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      objects.push({});
      continue;
    }
    ok++;
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj)) if (!names.includes(k)) names.push(k);
    objects.push(obj);
  }
  const grid = objects.map((o) => names.map((k) => stringifyCell(o[k])));
  return { names, grid, ok };
}

function stringifyCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/**
 * A comma that is the line's only comma and always sits between two digits is a
 * decimal mark, not a delimiter: "2026-09-21 10:00:01,123 INFO ...". Papa still
 * reports a perfectly consistent 2-column split, so trim the confidence and let
 * a parser that reads the whole line win.
 * ponytail: ceiling is a genuine two-column all-numeric CSV ("1,2"). It keeps
 * 0.56, which still beats every other candidate on that input.
 */
const DECIMAL_COMMA = /(?<=\d),(?=\d)/;
function commaConsistency(lines: string[], grid: string[][]): number {
  const { fraction } = modalCount(grid);
  const singles = lines.filter((l) => {
    const commas = l.split(",").length - 1;
    return commas === 1 && DECIMAL_COMMA.test(l);
  }).length;
  return singles / Math.max(lines.length, 1) >= 0.9 ? fraction * 0.7 : fraction;
}

/** Build one candidate parse for `format`, or null when the format doesn't apply. */
function buildCandidate(format: Detected, pre: Preprocessed): Candidate | null {
  switch (format) {
    case "tab":
      return { format, weight: 1.0, grid: pre.lines.map((l) => l.split("\t")) };
    case "comma": {
      const grid = papa(pre.csvText, ",");
      return { format, weight: 0.8, grid, consistency: commaConsistency(pre.lines, grid) };
    }
    case "semicolon":
      return { format, weight: 0.9, grid: papa(pre.csvText, ";") };
    case "pipe":
      return { format, weight: 1.0, grid: parsePipe(pre.lines) };
    case "jsonl": {
      const jsonl = parseJsonl(pre.lines);
      if (jsonl.names.length === 0) return null;
      return {
        format,
        weight: 1.0,
        grid: jsonl.grid,
        names: jsonl.names,
        consistency: pre.lines.length === 0 ? 0 : jsonl.ok / pre.lines.length,
      };
    }
    case "space": {
      const sp = parseSpace(pre.lines);
      if (!sp) return null;
      // ponytail: 0.65 sits under `aligned` (0.7) on purpose. Where a terminal
      // table parses cleanly by character position, that reading wins; `space`
      // is for lines that only whitespace holds together.
      return { format, weight: 0.65, grid: sp.grid, names: sp.names, consistency: sp.consistency };
    }
    case "aligned": {
      const aligned = parseAligned(pre.lines);
      if (!aligned) return null;
      // ponytail: the aligned parser always returns a rectangle, so plain column-count
      // consistency would be a constant 1.0 and say nothing. Its own alignment/fill
      // quality is the honest stand-in.
      return { format, weight: 0.7, grid: aligned.rows, consistency: aligned.quality };
    }
    default:
      return null;
  }
}

const ALL_FORMATS: Detected[] = ["tab", "comma", "semicolon", "pipe", "jsonl", "space", "aligned"];

/** Lines used to pick a format. Detection needs a sample, not the whole input. */
const DETECT_SAMPLE_LINES = 200;

function sample(pre: Preprocessed): Preprocessed {
  if (pre.lines.length <= DETECT_SAMPLE_LINES) return pre;
  // ponytail: csvText keeps interior blanks, so cut it by raw lines (a bit more than
  // the sample) rather than mapping indices; a quoted newline split at the cut only
  // dents the sample's score, never the final parse.
  const csvLines = pre.csvText.split("\n");
  return {
    lines: pre.lines.slice(0, DETECT_SAMPLE_LINES),
    csvText: csvLines.slice(0, DETECT_SAMPLE_LINES + 20).join("\n"),
  };
}

function score(c: Candidate): number {
  const { modal, fraction } = modalCount(c.grid);
  if (modal < 2) return 0;
  const consistency = c.consistency ?? fraction;
  return consistency * c.weight;
}

function rectangular(grid: string[][], n: number): string[][] {
  return grid.map((r) => {
    const row = r.slice(0, n).map((c) => c ?? "");
    while (row.length < n) row.push("");
    return row;
  });
}

/**
 * First row is a header unless it looks like data: a cell that carries the same
 * non-string type as its column's body is evidence of data, not of a title.
 * Ambiguous input defaults to "header", per spec section 7.
 */
function detectHeader(grid: string[][]): boolean {
  if (grid.length < 2) return false;
  const n = grid[0].length;
  const body = grid.slice(1);
  for (let j = 0; j < n; j++) {
    const bodyType = inferColumnType(body.map((r) => r[j]));
    if (bodyType === "string") continue;
    if (grid[0][j].trim() === "") continue;
    if (cellType(grid[0][j]) === bodyType) return false;
  }
  return true;
}

function fallback(lines: string[]): ParseResult {
  return {
    format: "none",
    hasHeader: false,
    columns: [{ id: "c0", name: "Column 1", type: inferColumnType(lines) }],
    rows: lines.map((l) => [l]),
    confidence: 0,
  };
}

function assemble(
  format: Detected,
  grid: string[][],
  confidence: number,
  opts: ParseOptions,
  presetNames?: string[],
): ParseResult {
  const { modal } = modalCount(grid);
  const n = Math.max(modal, 1);
  const rect = rectangular(grid, n);

  let hasHeader: boolean;
  if (opts.hasHeader !== undefined) hasHeader = opts.hasHeader;
  else if (presetNames) hasHeader = true;
  else hasHeader = detectHeader(rect);

  let names: string[];
  let body: string[][];
  if (presetNames) {
    names = presetNames.slice(0, n);
    body = rect;
  } else if (hasHeader && rect.length > 0) {
    names = rect[0].map((c) => c.trim());
    body = rect.slice(1);
  } else {
    names = [];
    body = rect;
  }
  while (names.length < n) names.push(`Column ${names.length + 1}`);

  const columns: Column[] = names.map((name, j) => ({
    id: `c${j}`,
    // ponytail: an empty header cell stays unnamed (free -m's first column).
    name: hasHeader || presetNames ? name : `Column ${j + 1}`,
    type: inferColumnType(body.map((r) => r[j])) as ColumnType,
  }));
  // A generated name on a datetime column says nothing; call it Time.
  // ponytail: only auto-generated "Column N" names are renamed, never user headers.
  let timeIdx = 0;
  for (const c of columns) {
    if (c.type === "datetime" && /^Column \d+$/.test(c.name)) {
      c.name = timeIdx === 0 ? "Time" : `Time ${timeIdx + 1}`;
      timeIdx++;
    }
  }

  return { format, hasHeader, columns, rows: body, confidence };
}

/** Turn pasted text into a rectangular table. Never throws, never returns 0 columns. */
export function parseText(text: string, opts: ParseOptions = {}): ParseResult {
  try {
    const pre = preprocess(text ?? "");
    if (pre.lines.length === 0) {
      return {
        format: "none",
        hasHeader: false,
        columns: [{ id: "c0", name: "Column 1", type: "string" }],
        rows: [],
        confidence: 0,
      };
    }

    const forced = opts.format && opts.format !== "auto" ? opts.format : undefined;
    if (forced) {
      if (forced === "none") return fallback(pre.lines);
      const picked = buildCandidate(forced, pre);
      if (!picked) return fallback(pre.lines);
      return assemble(forced, picked.grid, score(picked), opts, picked.names);
    }

    // Score every format on a sample, then run only the winner on the full input.
    const pre200 = sample(pre);
    let best: Candidate | null = null;
    let bestScore = 0;
    for (const f of ALL_FORMATS) {
      const c = buildCandidate(f, pre200);
      if (!c) continue;
      const s = score(c);
      // Ties go to the higher reliability weight.
      if (s > bestScore || (s === bestScore && best !== null && c.weight > best.weight)) {
        best = c;
        bestScore = s;
      }
    }
    if (!best || bestScore < 0.5) return fallback(pre.lines);
    const full = pre200 === pre ? best : buildCandidate(best.format, pre);
    if (!full) return fallback(pre.lines);
    return assemble(best.format, full.grid, bestScore, opts, full.names);
  } catch {
    // Never throw: worst case is a one-column table.
    const lines = (text ?? "").split(/\r?\n/).filter((l) => l.trim() !== "");
    return fallback(lines);
  }
}

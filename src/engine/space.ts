/**
 * Generic space-separated parser.
 *
 * No format-specific rules. It looks at whitespace-separated tokens, gives each
 * one a coarse class, and keeps taking columns from the left for as long as the
 * class at that position is stable across lines. The first position that stops
 * being stable is where free text begins, and everything from there is one
 * "Message" column.
 *
 * That single idea covers syslog, journalctl, nginx access logs, Java and
 * Python application logs without knowing any of them by name.
 */

export type TokenClass =
  | "iso"
  | "date"
  | "time"
  | "month"
  | "num"
  | "ip"
  | "level"
  | "bracket"
  | "quoted"
  | "word";

export interface SpaceTable {
  grid: string[][];
  names: string[];
  /** 0..1, used as the candidate's consistency by the detector. */
  consistency: number;
}

const ISO_TOKEN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const DATE_TOKEN = /^\d{4}[-/]\d{2}[-/]\d{2}$/;
const TIME_TOKEN = /^\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?$/;
const MONTH_TOKEN = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i;
const NUM_TOKEN = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/;
const IP_TOKEN = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?$/;
const LEVEL_TOKEN =
  /^\[?(?:TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL|CRITICAL|NOTICE)\]?$/i;
const QUOTED_TOKEN = /^".*"$/;
const BRACKET_TOKEN = /^\[.*\]$/;

/** Structural single-character markers: " - ", " | ", " > ". */
const SEPARATOR_TOKEN = /^[-|:>=]{1,2}$/;
/** "name[1234]" -> a name column and an id column. */
const PID_TOKEN = /^(.+?)\[(\d+)\]$/;

const COLUMN_FIT = 0.9;
const LINE_FIT = 0.9;
const COLON_FIT = 0.6;
const SPLIT_FIT = 0.8;
const CONSTANT_FIT = 0.9;

export function classify(token: string): TokenClass {
  if (ISO_TOKEN.test(token)) return "iso";
  if (DATE_TOKEN.test(token)) return "date";
  if (TIME_TOKEN.test(token)) return "time";
  if (MONTH_TOKEN.test(token)) return "month";
  if (IP_TOKEN.test(token)) return "ip";
  if (NUM_TOKEN.test(token)) return "num";
  if (LEVEL_TOKEN.test(token)) return "level";
  if (QUOTED_TOKEN.test(token)) return "quoted";
  if (BRACKET_TOKEN.test(token)) return "bracket";
  return "word";
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

/** Index just past the group opened at `i`, or i + 1 when it never closes. */
function scanGroup(line: string, i: number, open: string, close: string): number {
  let depth = 0;
  for (let k = i; k < line.length; k++) {
    if (line[k] === open) depth++;
    else if (line[k] === close) {
      depth--;
      if (depth === 0) return k + 1;
    }
  }
  return i + 1;
}

function scanQuote(line: string, i: number): number {
  for (let k = i + 1; k < line.length; k++) {
    if (line[k] === '"' && line[k - 1] !== "\\") return k + 1;
  }
  return i + 1;
}

/**
 * Split on runs of whitespace, but `[...]`, `"..."` and `(...)` stay whole so an
 * nginx `[21/Sep/2026:10:00:00 +0900]` or `"GET / HTTP/1.1"` is one token.
 * Trailing punctuation sticks to the group, so `(com.apple.foo):` stays one token.
 */
export function tokenizeSpace(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && isSpace(line[i])) i++;
    if (i >= line.length) break;
    const start = i;
    while (i < line.length && !isSpace(line[i])) {
      const ch = line[i];
      if (ch === '"') i = scanQuote(line, i);
      else if (ch === "[") i = scanGroup(line, i, "[", "]");
      else if (ch === "(") i = scanGroup(line, i, "(", ")");
      else i++;
    }
    out.push(line.slice(start, i));
  }
  return out;
}

interface Position {
  /** Tokens present at this position, one per line that is long enough. */
  tokens: string[];
  cls: TokenClass;
  /** Share of present tokens carrying `cls`. */
  fit: number;
  /** Share of lines that have a token here at all. */
  coverage: number;
}

function positionAt(rows: string[][], j: number): Position {
  const tokens = rows.filter((r) => r.length > j).map((r) => r[j]);
  const counts = new Map<TokenClass, number>();
  for (const t of tokens) {
    const c = classify(t);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let cls: TokenClass = "word";
  let hits = 0;
  for (const [c, n] of counts) {
    if (n > hits) {
      cls = c;
      hits = n;
    }
  }
  return {
    tokens,
    cls,
    fit: tokens.length === 0 ? 0 : hits / tokens.length,
    coverage: rows.length === 0 ? 0 : tokens.length / rows.length,
  };
}

function share(tokens: string[], test: (t: string) => boolean): number {
  if (tokens.length === 0) return 0;
  return tokens.filter(test).length / tokens.length;
}

/** Is one token repeated in (nearly) every line? A constant field is structure. */
function isConstant(tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return Math.max(...counts.values()) / tokens.length >= CONSTANT_FIT;
}

/**
 * Does line 0 look like a title row rather than data? Only a typed body can say
 * so: a word where every other line holds a number or a timestamp.
 */
function looksLikeHeader(head: string[], body: string[][]): boolean {
  const width = Math.min(head.length, Math.max(...body.map((r) => r.length), 0));
  for (let j = 0; j < width; j++) {
    const p = positionAt(body, j);
    if (p.cls === "word" || p.fit < COLUMN_FIT || p.coverage < LINE_FIT) continue;
    if (classify(head[j]) !== p.cls) return true;
  }
  return false;
}

interface Structure {
  /** Number of leading positions that form fixed columns. */
  prefix: number;
  /** Index of the first token of the free-text tail, or -1 when there is none. */
  tailStart: number;
  /** Prefix position whose trailing ":" is a label terminator, or -1. */
  colonAt: number;
  /** True when the tail begins at an explicit marker rather than at a class clash. */
  marked: boolean;
  positions: Position[];
}

function findStructure(rows: string[][]): Structure {
  const widest = Math.max(...rows.map((r) => r.length), 0);
  const positions: Position[] = [];
  let end = 0;
  for (let j = 0; j < widest; j++) {
    const p = positionAt(rows, j);
    if (p.coverage < LINE_FIT || p.fit < COLUMN_FIT) break;
    positions.push(p);
    end = j + 1;
  }

  // A column of label terminators ends the fixed part: "sshd[1234]:", "kernel:".
  // ponytail: it must not be the very first column -- "Mem:  7938 2129 ..." would
  // otherwise collapse `free -m` into a label plus one blob of free text.
  for (let j = 1; j < end; j++) {
    if (share(positions[j].tokens, (t) => t.endsWith(":")) >= COLON_FIT) {
      return { prefix: j + 1, tailStart: j + 1, colonAt: j, marked: true, positions };
    }
  }

  const equalWidth =
    share(
      rows.map((r) => String(r.length)),
      (n) => n === String(widest),
    ) >= LINE_FIT;
  if (end === widest && equalWidth) {
    return { prefix: end, tailStart: -1, colonAt: -1, marked: false, positions };
  }

  // A constant punctuation token with nothing but plain words after it is the
  // other way logs mark "message starts here": "... com.foo.Bar - message".
  // ponytail: ceiling is a real column of dashes mid-table followed by word
  // columns; it would be dropped and the rest folded into the message.
  for (let p = end - 1; p >= 1; p--) {
    const here = positions[p];
    if (!isConstant(here.tokens) || !SEPARATOR_TOKEN.test(here.tokens[0])) continue;
    let restAreWords = true;
    for (let k = p + 1; k < end; k++) if (positions[k].cls !== "word") restAreWords = false;
    if (restAreWords && p + 1 < end) {
      return { prefix: p, tailStart: p + 1, colonAt: -1, marked: true, positions };
    }
  }

  return { prefix: end, tailStart: end, colonAt: -1, marked: false, positions };
}

type ColumnKind = "time" | "ip" | "level" | "id" | "message" | "plain";

interface BuiltColumn {
  cells: string[];
  kind: ColumnKind;
}

function nameFor(kind: ColumnKind, index: number): string {
  switch (kind) {
    case "time": return "Time";
    case "ip": return "IP";
    case "level": return "Level";
    case "id": return "ID";
    case "message": return "Message";
    default: return `Column ${index + 1}`;
  }
}

function kindOf(cls: TokenClass): ColumnKind {
  if (cls === "iso" || cls === "time" || cls === "date") return "time";
  if (cls === "ip") return "ip";
  if (cls === "level") return "level";
  return "plain";
}

/** (month num time) and (date time) are one timestamp split by spaces. */
const MERGES: TokenClass[][] = [
  ["month", "num", "time"],
  ["date", "time"],
];

function mergeColumns(cols: BuiltColumn[], classes: TokenClass[]): BuiltColumn[] {
  for (const pattern of MERGES) {
    for (let j = 0; j + pattern.length <= classes.length; j++) {
      if (!pattern.every((c, k) => classes[j + k] === c)) continue;
      const merged: BuiltColumn = {
        kind: "time",
        cells: cols[j].cells.map((_, r) =>
          pattern
            .map((_c, k) => cols[j + k].cells[r])
            .filter((v) => v !== "")
            .join(" "),
        ),
      };
      cols.splice(j, pattern.length, merged);
      classes.splice(j, pattern.length, "iso");
      return mergeColumns(cols, classes);
    }
  }
  return cols;
}

function splitPidColumns(cols: BuiltColumn[]): BuiltColumn[] {
  for (let j = 0; j < cols.length; j++) {
    if (cols[j].kind === "message" || cols[j].kind === "time") continue;
    const present = cols[j].cells.filter((c) => c !== "");
    if (share(present, (c) => PID_TOKEN.test(c)) < SPLIT_FIT) continue;
    const names = cols[j].cells.map((c) => PID_TOKEN.exec(c)?.[1] ?? c);
    const ids = cols[j].cells.map((c) => PID_TOKEN.exec(c)?.[2] ?? "");
    cols.splice(j, 1, { cells: names, kind: "plain" }, { cells: ids, kind: "id" });
    j++;
  }
  return cols;
}

/**
 * Parse whitespace-separated lines. Returns null when the input is too short or
 * yields fewer than two columns.
 */
export function parseSpace(lines: string[]): SpaceTable | null {
  if (lines.length < 3) return null;
  const all = lines.map(tokenizeSpace);

  let head: string[] | null = null;
  let body = all;
  if (all.length >= 3 && looksLikeHeader(all[0], all.slice(1))) {
    head = all[0];
    body = all.slice(1);
  }
  if (body.length < 2) return null;

  const st = findStructure(body);
  if (st.prefix < 1) return null;

  const hasTail = st.tailStart >= 0;
  const classes = st.positions.slice(0, st.prefix).map((p) => p.cls);

  const cellAt = (row: string[], j: number): string => {
    const raw = row[j] ?? "";
    return j === st.colonAt ? raw.replace(/:$/, "") : raw;
  };

  let cols: BuiltColumn[] = classes.map((cls, j) => ({
    cells: body.map((row) => cellAt(row, j)),
    kind: kindOf(cls),
  }));
  cols = mergeColumns(cols, [...classes]);
  cols = splitPidColumns(cols);
  if (hasTail) {
    cols.push({
      cells: body.map((row) => row.slice(st.tailStart).join(" ")),
      kind: "message",
    });
  }
  if (cols.length < 2) return null;

  const names = headerNames(head, cols, st.prefix);
  let grid = body.map((_row, r) => cols.map((c) => c.cells[r]));
  if (head && !names) {
    // ponytail: the title row did not line up with the columns, so it is not a
    // usable set of names -- keep it as data instead of silently dropping it.
    grid = [padRow(head, cols.length), ...grid];
  }

  // Consistency. A line fits when it reaches every fixed position and carries
  // the expected class there.
  const fits = body.filter((row) => {
    if (row.length < st.prefix) return false;
    return classes.every((cls, j) => classify(row[j]) === cls);
  }).length;
  const fitFraction = fits / body.length;

  // Support: how well the data actually evidences this reading.
  //  - a tail that is empty on most lines means the "message" is really more
  //    columns, i.e. a terminal table that `aligned` reads properly;
  //  - a tail that begins at an explicit marker (a "label:" or a " - ") is
  //    strong evidence on its own;
  //  - otherwise the columns themselves must carry it: typed or constant
  //    tokens. All-word columns are just an aligned table seen through the
  //    wrong parser, which is how `ps aux` and `top` get turned away here.
  // ponytail: ceiling is a log with no marker AND untyped prefix columns; it
  // scores low and falls back to one column rather than being split badly.
  const prefixPositions = st.positions.slice(0, st.prefix);
  const typed =
    prefixPositions.filter((p) => p.cls !== "word" || isConstant(p.tokens)).length /
    prefixPositions.length;
  const tailFill = hasTail
    ? share(
        body.map((row) => row.slice(st.tailStart).join(" ")),
        (t) => t !== "",
      )
    : 1;
  const support = tailFill * (st.marked ? 1 : typed);

  return {
    grid,
    names: names ?? cols.map((c, j) => nameFor(c.kind, j)),
    consistency: fitFraction * support,
  };
}

/** Spread a raw token list over `width` cells, last cell absorbing the rest. */
function padRow(tokens: string[], width: number): string[] {
  const row = tokens.slice(0, width - 1);
  while (row.length < width - 1) row.push("");
  row.push(tokens.slice(width - 1).join(" "));
  return row;
}

/** Use the title row's tokens as names when its width lines up. */
function headerNames(
  head: string[] | null,
  cols: BuiltColumn[],
  prefix: number,
): string[] | null {
  if (!head) return null;
  if (head.length === cols.length || head.length === prefix + 1) {
    const names = head.slice(0, cols.length);
    while (names.length < cols.length) names.push(`Column ${names.length + 1}`);
    return names;
  }
  return null;
}

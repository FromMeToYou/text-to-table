/**
 * Aligned (fixed-width / multi-space) terminal output parser.
 *
 * Shape of the problem: cells may contain single spaces ("2 hours ago",
 * "Up 3 hours (healthy)", a ps COMMAND), numeric columns are right-aligned so
 * data starts left of the header token, and one long value can shift a whole
 * row (kubectl "CrashLoopBackOff").
 *
 * Approach: tokenize each line twice (split on runs of >=2 spaces, and on any
 * whitespace), take every plausible column count, build a table for each, and
 * keep whichever scores best on alignment / fill / collisions. No priority
 * list, same idea as the outer format detection.
 */

export interface Tok {
  text: string;
  start: number;
  /** exclusive */
  end: number;
}

export interface AlignedTable {
  rows: string[][];
  columns: number;
  /** 0..1 internal quality, used as the aligned candidate's consistency. */
  quality: number;
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

/** Split a line into tokens separated by runs of >= minGap whitespace. */
export function tokenize(line: string, minGap: number): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && isSpace(line[i])) i++;
    if (i >= line.length) break;
    const start = i;
    let lastNonSpace = i;
    while (i < line.length) {
      if (isSpace(line[i])) {
        let j = i;
        while (j < line.length && isSpace(line[j])) j++;
        if (j - i >= minGap) break;
        i = j;
      } else {
        lastNonSpace = i;
        i++;
      }
    }
    toks.push({ text: line.slice(start, lastNonSpace + 1), start, end: lastNonSpace + 1 });
  }
  return toks;
}

type Range = [number, number];

function overlap(t: Tok, r: Range): number {
  return Math.max(0, Math.min(t.end, r[1]) - Math.max(t.start, r[0]));
}

function assign(t: Tok, ranges: Range[]): number {
  let best = 0;
  let bestOv = -1;
  let bestDist = Infinity;
  for (let j = 0; j < ranges.length; j++) {
    const ov = overlap(t, ranges[j]);
    const dist = t.start < ranges[j][0] ? ranges[j][0] - t.end : t.start - ranges[j][1];
    if (ov > bestOv || (ov === bestOv && ov === 0 && dist < bestDist)) {
      best = j;
      bestOv = ov;
      bestDist = dist;
    }
  }
  return best;
}

function spans(t: Tok, ranges: Range[]): number {
  return ranges.reduce((n, r) => n + (overlap(t, r) > 0 ? 1 : 0), 0);
}

function modalFraction(values: number[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Math.max(...counts.values()) / values.length;
}

/**
 * A token straddling two column ranges is usually a header cell the >=2-space
 * tokenizer could not split ("Proto Recv-Q Send-Q"). Re-split it on single
 * spaces, but only keep the split when every piece lands in its own column --
 * otherwise the token really is one wide value ("Restarting (1) 10 seconds ago")
 * and must stay whole.
 * ponytail: ceiling is a header cell that spans columns AND has a two-word name
 * in one of them; that one stays merged.
 */
function resplit(t: Tok, ranges: Range[]): Tok[] {
  if (spans(t, ranges) < 2) return [t];
  const subs = tokenize(t.text, 1).map((s) => ({
    text: s.text,
    start: t.start + s.start,
    end: t.start + s.end,
  }));
  if (subs.length < 2) return [t];
  const cols = new Set(subs.map((s) => assign(s, ranges)));
  return cols.size === subs.length ? subs : [t];
}

/** Build one candidate table for a given tokenizer gap and column count. */
function build(lines: string[], minGap: number, n: number): AlignedTable | null {
  if (n < 2) return null;
  const toks = lines.map((l) => tokenize(l, minGap));
  const template = toks.filter((t) => t.length === n);
  if (template.length === 0) return null;

  const ranges: Range[] = [];
  for (let j = 0; j < n; j++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of template) {
      lo = Math.min(lo, t[j].start);
      hi = Math.max(hi, t[j].end);
    }
    ranges.push([lo, hi]);
  }

  const rows: string[][] = [];
  const colStarts: number[][] = Array.from({ length: n }, () => []);
  const colEnds: number[][] = Array.from({ length: n }, () => []);
  let filled = 0;
  let collisions = 0;

  for (let r = 0; r < lines.length; r++) {
    const groups: Tok[][] = Array.from({ length: n }, () => []);
    if (toks[r].length === n) {
      toks[r].forEach((t, j) => groups[j].push(t));
    } else {
      for (const t of toks[r]) {
        for (const piece of resplit(t, ranges)) groups[assign(piece, ranges)].push(piece);
      }
    }
    const row: string[] = new Array<string>(n).fill("");
    for (let j = 0; j < n; j++) {
      const g = groups[j];
      if (g.length === 0) continue;
      // Slice the original line so the cell keeps its inner spacing.
      row[j] = lines[r].slice(g[0].start, g[g.length - 1].end).trim();
      if (row[j] !== "") {
        filled++;
        colStarts[j].push(g[0].start);
        colEnds[j].push(g[g.length - 1].end);
      }
      if (g.length > 1) collisions++;
    }
    rows.push(row);
  }

  // Alignment: in real terminal output every column is either left- or
  // right-aligned, so cell starts or cell ends agree. That is the signal that
  // separates a correct split from a plausible-looking wrong one.
  let align = 0;
  for (let j = 0; j < n; j++) {
    align += Math.max(modalFraction(colStarts[j]), modalFraction(colEnds[j]));
  }
  align /= n;

  const total = rows.length * n;
  const fill = total === 0 ? 0 : filled / total;
  const collisionRate = total === 0 ? 0 : collisions / total;
  return { rows, columns: n, quality: align * fill * (1 - collisionRate) };
}

/**
 * Parse aligned text. Returns null when nothing with >= 2 columns is plausible.
 */
export function parseAligned(inputLines: string[]): AlignedTable | null {
  const lines = dropPreamble(inputLines);
  if (lines.length === 0) return null;

  const built: AlignedTable[] = [];
  for (const minGap of [2, 1]) {
    const counts = lines.map((l) => tokenize(l, minGap).length);
    const seen = new Map<number, number>();
    for (const c of counts) seen.set(c, (seen.get(c) ?? 0) + 1);
    for (const [n, hits] of seen) {
      if (n < 2 || hits / lines.length < 0.25) continue;
      const cand = build(lines, minGap, n);
      if (cand) built.push(cand);
    }
  }
  if (built.length === 0) return null;

  // ponytail: among near-equal splits take the one that recovers more columns.
  // `free -m`'s short Swap row makes a 4-column read score slightly higher than
  // the correct 7-column one; 5% slack picks the informative split. Ceiling: an
  // over-segmenting split that lands within 5% of the right one wins.
  const top = Math.max(...built.map((c) => c.quality));
  let best = built[0];
  for (const c of built) {
    if (c.quality < top * 0.95) continue;
    if (c.columns > best.columns || best.quality < top * 0.95) best = c;
  }
  return best;
}

/**
 * Drop leading lines that carry no column structure at all: netstat's
 * "Active Internet connections ..." banner, `ls -l`'s "total 251464".
 * ponytail: the test is "fewer than 2 tokens when splitting on >=2 spaces",
 * which is cheap and matches every preamble we have. Ceiling: a real first
 * data row whose cells are only single-space separated would be dropped.
 */
function dropPreamble(lines: string[]): string[] {
  let k = 0;
  while (k < lines.length && tokenize(lines[k], 2).length < 2) k++;
  if (k === 0 || k >= lines.length || lines.length - k < 2) return lines;
  return lines.slice(k);
}

/** Column type inference and sort keys. Pure, no deps. */
import type { ColumnType } from "./types";

const NUMBER_RE = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
const PERCENT_RE = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?%$/;
// ponytail: size units are case-SENSITIVE on purpose so "45m" (45 minutes) is not read
// as 45 megabytes. Ceiling: a tool that prints lowercase "m" for megabytes is misread.
const SIZE_RE =
  /^[-+]?\d+(?:\.\d+)?\s?(B|Bi|k|K|Ki|kB|KB|KiB|M|Mi|MB|MiB|G|Gi|GB|GiB|T|Ti|TB|TiB|P|Pi|PB|PiB)$/;
const SIZE_UNIT_RE = /([A-Za-z]+)$/;
// ponytail: duration units are lowercase-only for the same reason.
const DURATION_RE = /^(?:\d+(?:\.\d+)?(?:ns|us|ms|[dhms]))+$/;
const CLOCK_RE = /^\d{1,6}:[0-5]\d(?::[0-5]\d)?(?:\.\d+)?$/;
const RATIO_RE = /^\d+\/\d+$/;
const ISO_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const SYSLOG_RE = /^([A-Z][a-z]{2}) {1,2}(\d{1,2}) (\d{2}):(\d{2}):(\d{2})$/;
// Common Log Format timestamp, brackets and all: [21/Sep/2026:10:00:00 +0900]
const CLF_RE =
  /^\[?(\d{1,2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})\]?$/;
const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const KI = 1024;
const SIZE_MULT: Record<string, number> = {
  B: 1, Bi: 1,
  k: KI, K: KI, Ki: KI, kB: KI, KB: KI, KiB: KI,
  M: KI ** 2, Mi: KI ** 2, MB: KI ** 2, MiB: KI ** 2,
  G: KI ** 3, Gi: KI ** 3, GB: KI ** 3, GiB: KI ** 3,
  T: KI ** 4, Ti: KI ** 4, TB: KI ** 4, TiB: KI ** 4,
  P: KI ** 5, Pi: KI ** 5, PB: KI ** 5, PiB: KI ** 5,
};
const DUR_MULT: Record<string, number> = {
  ns: 1e-9, us: 1e-6, ms: 1e-3, s: 1, m: 60, h: 3600, d: 86400,
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isIp(v: string): boolean {
  const m = IP_RE.exec(v);
  if (!m) return false;
  return [1, 2, 3, 4].every((i) => Number(m[i]) <= 255);
}

/** Does one cell look like `type`? A bare number counts as a size (bytes). */
export function matchesType(value: string, type: ColumnType): boolean {
  const v = value.trim();
  if (v === "") return false;
  switch (type) {
    case "number": return NUMBER_RE.test(v);
    case "percentage": return PERCENT_RE.test(v);
    case "size": return SIZE_RE.test(v) || NUMBER_RE.test(v);
    case "duration": return DURATION_RE.test(v) || CLOCK_RE.test(v);
    case "ratio": return RATIO_RE.test(v);
    case "datetime": return ISO_RE.test(v) || SYSLOG_RE.test(v) || CLF_RE.test(v);
    case "ip": return isIp(v);
    case "string": return true;
  }
}

/** Checked in this order; first type matching >=80% of non-empty cells wins. */
const TYPE_ORDER: ColumnType[] = [
  "number", "percentage", "ratio", "ip", "size", "duration", "datetime",
];

export function inferColumnType(cells: readonly string[]): ColumnType {
  const nonEmpty = cells.filter((c) => c.trim() !== "");
  if (nonEmpty.length === 0) return "string";
  for (const t of TYPE_ORDER) {
    const hits = nonEmpty.reduce((n, c) => n + (matchesType(c, t) ? 1 : 0), 0);
    if (hits / nonEmpty.length >= 0.8) return t;
  }
  return "string";
}

/** Type of a single cell, used by header detection. "string" when nothing else fits. */
export function cellType(value: string): ColumnType {
  for (const t of TYPE_ORDER) if (matchesType(value, t)) return t;
  return "string";
}

function durationSeconds(v: string): number {
  if (CLOCK_RE.test(v)) {
    const parts = v.split(":");
    const nums = parts.map(Number);
    // ponytail: 2 parts are read as M:SS (ps TIME "3392:36.54"), 3 as H:MM:SS.
    if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
    return nums[0] * 60 + nums[1];
  }
  let total = 0;
  const re = /(\d+(?:\.\d+)?)(ns|us|ms|[dhms])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v)) !== null) total += Number(m[1]) * DUR_MULT[m[2]];
  return total;
}

function sizeBytes(v: string): number {
  if (NUMBER_RE.test(v)) return Number(v.replace(/,/g, ""));
  const unit = SIZE_UNIT_RE.exec(v);
  if (!unit) return NaN;
  const mult = SIZE_MULT[unit[1]];
  const num = Number(v.slice(0, v.length - unit[1].length).trim());
  return mult === undefined ? NaN : num * mult;
}

function datetimeMs(v: string): number {
  const c = CLF_RE.exec(v);
  if (c) {
    const month = MONTHS.indexOf(c[2]);
    if (month < 0) return NaN;
    const offset = (Number(c[8]) * 60 + Number(c[9])) * (c[7] === "-" ? -1 : 1);
    return (
      Date.UTC(Number(c[3]), month, Number(c[1]), Number(c[4]), Number(c[5]), Number(c[6])) -
      offset * 60000
    );
  }
  const s = SYSLOG_RE.exec(v);
  if (s) {
    // ponytail: syslog omits the year; pin it to 1970 so sorting is stable and
    // deterministic. Ceiling: a log spanning a year boundary sorts wrong.
    const month = MONTHS.indexOf(s[1]);
    if (month < 0) return NaN;
    return Date.UTC(1970, month, Number(s[2]), Number(s[3]), Number(s[4]), Number(s[5]));
  }
  const iso = v.replace(",", ".");
  const t = Date.parse(iso.includes("T") || iso.length <= 10 ? iso : iso.replace(" ", "T"));
  return Number.isNaN(t) ? NaN : t;
}

/**
 * Sort key for a cell. Numeric for typed columns, lowercased string otherwise.
 * Empty cells give NaN so callers can push them last.
 */
export function sortKey(value: string, type: ColumnType): number | string {
  const v = value.trim();
  if (v === "") return type === "string" ? "" : NaN;
  switch (type) {
    case "number": return Number(v.replace(/,/g, "").replace(/^\+/, ""));
    case "percentage": return Number(v.replace(/[%,\s]/g, ""));
    case "size": return sizeBytes(v);
    case "duration": return durationSeconds(v);
    case "ratio": return Number(v.split("/")[0]);
    case "datetime": return datetimeMs(v);
    case "ip": {
      const m = IP_RE.exec(v);
      if (!m) return NaN;
      return ((Number(m[1]) * 256 + Number(m[2])) * 256 + Number(m[3])) * 256 + Number(m[4]);
    }
    case "string": return v.toLowerCase();
  }
}

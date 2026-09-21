/** Export a ParseResult to the formats the UI offers. */
import type { ParseResult } from "./types";

function needsQuote(cell: string, delimiter: string): boolean {
  return (
    cell.includes(delimiter) ||
    cell.includes('"') ||
    cell.includes("\n") ||
    cell.includes("\r")
  );
}

/** RFC 4180 field: wrap in quotes when needed, double any inner quote. */
function quote(cell: string, delimiter: string): string {
  return needsQuote(cell, delimiter) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function grid(r: ParseResult): string[][] {
  return [r.columns.map((c) => c.name), ...r.rows];
}

export function toCSV(r: ParseResult, delimiter = ","): string {
  return grid(r)
    .map((row) => row.map((c) => quote(c ?? "", delimiter)).join(delimiter))
    .join("\n");
}

export function toTSV(r: ParseResult): string {
  return toCSV(r, "\t");
}

export function toMarkdown(r: ParseResult): string {
  const esc = (c: string) => (c ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const names = r.columns.map((c) => esc(c.name));
  const out = [
    `| ${names.join(" | ")} |`,
    `| ${names.map(() => "---").join(" | ")} |`,
    ...r.rows.map((row) => `| ${row.map(esc).join(" | ")} |`),
  ];
  return out.join("\n");
}

export function toJSON(r: ParseResult): string {
  const objects = r.rows.map((row) => {
    const o: Record<string, string> = {};
    r.columns.forEach((c, j) => {
      o[c.name] = row[j] ?? "";
    });
    return o;
  });
  return JSON.stringify(objects, null, 2);
}

/**
 * Returns .xlsx bytes (browser Blob-ready). Uses exceljs's writeBuffer so no
 * Node fs is touched and the same call works in the browser bundle.
 */
export async function toXLSX(r: ParseResult): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(r.columns.map((c) => c.name));
  for (const row of r.rows) sheet.addRow(row.map((c) => c ?? ""));
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

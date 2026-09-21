// ponytail: stub signatures; engine agent implements.
import type { ParseResult } from "./types";

export function toCSV(r: ParseResult, delimiter = ","): string { return ""; }
export function toTSV(r: ParseResult): string { return toCSV(r, "\t"); }
export function toMarkdown(r: ParseResult): string { return ""; }
export function toJSON(r: ParseResult): string { return "[]"; }
/** Returns .xlsx bytes (browser Blob-ready). */
export async function toXLSX(r: ParseResult): Promise<Uint8Array> { return new Uint8Array(); }

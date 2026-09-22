"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DataTable from "@/components/DataTable";
import DetectionBar from "@/components/DetectionBar";
import ExportMenu from "@/components/ExportMenu";
import { SAMPLES } from "@/components/samples";
import TextInput from "@/components/TextInput";
import { parseText } from "@/engine";
import type { Format, ParseResult } from "@/engine/types";

const DEBOUNCE_MS = 300;
// ponytail: parsing is synchronous on the main thread; these caps keep it near 1s
// (100k aligned rows ≈ 1.1s). Move parsing to a Web Worker if the cap has to grow.
const MAX_LINES = 100_000;
const MAX_BYTES = 5 * 1024 * 1024;

/** Keep only the head of oversized input; report how many lines the full text had. */
function capInput(raw: string): { text: string; totalLines: number; keptLines: number } {
  let lines = 0;
  let cut = -1;
  for (let i = raw.indexOf("\n"); i !== -1; i = raw.indexOf("\n", i + 1)) {
    lines++;
    if (cut === -1 && (lines === MAX_LINES || i >= MAX_BYTES)) cut = i;
  }
  const totalLines = raw.length === 0 ? 0 : lines + (raw.endsWith("\n") ? 0 : 1);
  if (cut === -1) return { text: raw, totalLines, keptLines: totalLines };
  const kept = raw.slice(0, cut);
  return { text: kept, totalLines, keptLines: kept.split("\n").length };
}

export default function Home() {
  const [text, setText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [format, setFormat] = useState<Format>("auto");
  const [headerOverride, setHeaderOverride] = useState<boolean | undefined>(undefined);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [parseFailed, setParseFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [truncation, setTruncation] = useState<{ totalLines: number; keptLines: number } | null>(null);
  const [visibleRows, setVisibleRows] = useState<string[][]>([]);

  const skipNextDebounceRef = useRef(true);
  const prevColumnSignatureRef = useRef("");

  // Debounce text -> debouncedText, unless a paste/drop asked to skip the wait.
  useEffect(() => {
    if (skipNextDebounceRef.current) {
      skipNextDebounceRef.current = false;
      setDebouncedText(text);
      return;
    }
    const timer = setTimeout(() => setDebouncedText(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Parse immediately whenever the debounced text, format, or header override changes.
  useEffect(() => {
    try {
      const parsed = parseText(debouncedText, { format, hasHeader: headerOverride });
      setResult(parsed);
      setParseFailed(false);
    } catch {
      setParseFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedText, format, headerOverride]);

  function handleTextChange(next: string) {
    const capped = capInput(next);
    setText(capped.text);
    setTruncation(capped.text === next ? null : { totalLines: capped.totalLines, keptLines: capped.keptLines });
  }

  function handleBeforePaste() {
    skipNextDebounceRef.current = true;
    // A paste/drop replaces the whole buffer; a search or sort left over
    // from the previous content no longer means anything.
    setSearch("");
  }

  function handleSampleClick(sampleText: string) {
    skipNextDebounceRef.current = true;
    setText(sampleText);
  }

  function handleFormatChange(next: Format) {
    setFormat(next);
  }

  function handleHasHeaderChange(next: boolean) {
    setHeaderOverride(next);
  }

  // A "different" paste is detected by comparing column *names*, not just
  // presence of a result: column ids are recycled ("c0", "c1", ...) across
  // unrelated datasets, so sort/size state keyed by id would otherwise leak
  // from one paste into the next.
  const columnSignature = useMemo(
    () => (result ? result.columns.map((c) => c.name).join("|") : ""),
    [result]
  );

  useEffect(() => {
    if (columnSignature !== prevColumnSignatureRef.current) {
      prevColumnSignatureRef.current = columnSignature;
      setSearch("");
    }
  }, [columnSignature]);

  const filteredRows = useMemo(() => {
    if (!result) return [];
    const q = search.trim().toLowerCase();
    if (!q) return result.rows;
    return result.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(q)));
  }, [result, search]);

  const exportResult = useMemo<ParseResult | null>(() => {
    if (!result) return null;
    return { ...result, rows: visibleRows };
  }, [result, visibleRows]);

  const hasInput = text.trim().length > 0;

  return (
    <div className="appShell">
      <header className="siteHeader">
        <h1>Text to Table</h1>
        <p className="subtitle">Paste any text. It becomes a table.</p>
        <p className="privacyLine">
          <span aria-hidden="true">🔒</span> Your data never leaves your browser.
        </p>
      </header>

      <main>
        <TextInput value={text} onChange={handleTextChange} onBeforePaste={handleBeforePaste} />

        {truncation && (
          <p className="largeInputWarning" role="status">
            Showing the first {truncation.keptLines.toLocaleString()} of{" "}
            {truncation.totalLines.toLocaleString()} lines. Input is capped at{" "}
            {MAX_LINES.toLocaleString()} lines or {MAX_BYTES / 1024 / 1024} MB so the page stays responsive.
          </p>
        )}

        {parseFailed ? (
          <p className="parseError">Could not parse.</p>
        ) : hasInput && result ? (
          <>
            <DetectionBar
              detectedFormat={result.format}
              rows={result.rows.length}
              cols={result.columns.length}
              formatOverride={format}
              onFormatChange={handleFormatChange}
              hasHeader={result.hasHeader}
              onHasHeaderChange={handleHasHeaderChange}
            />

            <div className="toolbar">
              <input
                type="search"
                className="searchInput"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search table"
              />
              <ExportMenu result={exportResult} />
            </div>

            <DataTable
              // Remounts (resetting sort + column sizing) whenever a paste
              // brings in a genuinely different table shape.
              key={columnSignature}
              columns={result.columns}
              rows={filteredRows}
              sizingRows={result.rows}
              emptyMessage={search.trim() ? "No rows match your search." : "No rows to display."}
              onVisibleRowsChange={setVisibleRows}
            />
          </>
        ) : (
          <div className="emptyState">
            <p>Paste terminal output, CSV, TSV, JSON Lines, or any aligned text to see it as a table.</p>
            <div className="sampleChips">
              {SAMPLES.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  className="chip"
                  onClick={() => handleSampleClick(sample.text)}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="siteFooter">
        <p>
          Processing happens entirely in your browser. We never see your data.{" "}
          <Link href="/how-it-works">How this works</Link>
        </p>
      </footer>
    </div>
  );
}

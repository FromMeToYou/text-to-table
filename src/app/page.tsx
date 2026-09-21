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
const LARGE_INPUT_BYTES = 10 * 1024 * 1024;

export default function Home() {
  const [text, setText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [format, setFormat] = useState<Format>("auto");
  const [headerOverride, setHeaderOverride] = useState<boolean | undefined>(undefined);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [parseFailed, setParseFailed] = useState(false);
  const [search, setSearch] = useState("");
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
    setText(next);
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
  const isLargeInput = text.length > LARGE_INPUT_BYTES;

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

        {isLargeInput && (
          <p className="largeInputWarning">
            That&apos;s a lot of text (10MB+). Parsing will still be attempted, but it may be slow.
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

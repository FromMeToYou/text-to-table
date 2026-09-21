"use client";

import { useEffect, useRef, useState } from "react";
import { toCSV, toJSON, toMarkdown, toTSV, toXLSX } from "@/engine";
import type { ParseResult } from "@/engine/types";

interface ExportMenuProps {
  result: ParseResult | null;
}

export default function ExportMenu({ result }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(timer);
  }, [toast]);

  const disabled = !result || result.rows.length === 0;

  async function copyText(text: string) {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied");
    } catch {
      setToast("Copy failed");
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    setOpen(false);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleDownloadCSV() {
    if (!result) return;
    downloadBlob(new Blob([toCSV(result)], { type: "text/csv;charset=utf-8" }), "table.csv");
  }

  async function handleDownloadXLSX() {
    if (!result) return;
    const bytes = await toXLSX(result);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, "table.xlsx");
  }

  return (
    <div className="exportMenu" ref={containerRef}>
      <button
        type="button"
        className="exportTrigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Export ▾
      </button>
      {open && (
        <div className="exportDropdown" role="menu">
          <button type="button" role="menuitem" onClick={() => result && copyText(toMarkdown(result))}>
            Copy as Markdown
          </button>
          <button type="button" role="menuitem" onClick={() => result && copyText(toCSV(result))}>
            Copy as CSV
          </button>
          <button type="button" role="menuitem" onClick={() => result && copyText(toTSV(result))}>
            Copy as TSV
          </button>
          <button type="button" role="menuitem" onClick={() => result && copyText(toJSON(result))}>
            Copy as JSON
          </button>
          <div className="exportDivider" role="separator" />
          <button type="button" role="menuitem" onClick={handleDownloadCSV}>
            Download CSV
          </button>
          <button type="button" role="menuitem" onClick={handleDownloadXLSX}>
            Download Excel (.xlsx)
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

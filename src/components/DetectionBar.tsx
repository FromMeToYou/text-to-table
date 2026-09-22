"use client";

import type { ChangeEvent } from "react";
import type { Format } from "@/engine/types";

export const FORMAT_LABELS: Record<Exclude<Format, "auto">, string> = {
  tab: "Tab-separated",
  comma: "CSV",
  semicolon: "Semicolon-separated",
  pipe: "Pipe / Markdown table",
  aligned: "Aligned columns",
  jsonl: "JSON Lines",
  space: "Space-separated",
  none: "Plain text",
};

const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "tab", label: "Tab" },
  { value: "comma", label: "Comma" },
  { value: "semicolon", label: "Semicolon" },
  { value: "pipe", label: "Pipe" },
  { value: "aligned", label: "Aligned columns" },
  { value: "jsonl", label: "JSONL" },
  { value: "space", label: "Spaces" },
];

interface DetectionBarProps {
  detectedFormat: Exclude<Format, "auto">;
  rows: number;
  cols: number;
  formatOverride: Format;
  onFormatChange: (format: Format) => void;
  hasHeader: boolean;
  onHasHeaderChange: (hasHeader: boolean) => void;
}

export default function DetectionBar({
  detectedFormat,
  rows,
  cols,
  formatOverride,
  onFormatChange,
  hasHeader,
  onHasHeaderChange,
}: DetectionBarProps) {
  function handleFormatSelect(e: ChangeEvent<HTMLSelectElement>) {
    onFormatChange(e.target.value as Format);
  }

  function handleHeaderToggle(e: ChangeEvent<HTMLInputElement>) {
    onHasHeaderChange(e.target.checked);
  }

  return (
    <div className="detectionBar">
      <span className="detectionSummary">
        Detected: {FORMAT_LABELS[detectedFormat]} · {rows} row{rows === 1 ? "" : "s"} · {cols}{" "}
        column{cols === 1 ? "" : "s"}
      </span>
      <label className="detectionFormatSelect">
        Format
        <select value={formatOverride} onChange={handleFormatSelect}>
          {FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="detectionHeaderCheckbox">
        <input type="checkbox" checked={hasHeader} onChange={handleHeaderToggle} />
        First row is header
      </label>
    </div>
  );
}

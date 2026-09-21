"use client";

import type { ChangeEvent, DragEvent } from "react";

interface TextInputProps {
  value: string;
  onChange: (text: string) => void;
  /** Called synchronously before the pasted text lands in state, so the parse
   * that follows skips the 300ms debounce. */
  onBeforePaste: () => void;
}

const ACCEPTED_EXTENSIONS = /\.(txt|csv|tsv|log)$/i;

export default function TextInput({ value, onChange, onBeforePaste }: TextInputProps) {
  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
  }

  function handleDrop(e: DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !ACCEPTED_EXTENSIONS.test(file.name)) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onBeforePaste();
        onChange(reader.result);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function handleDragOver(e: DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
  }

  return (
    <textarea
      className="textInput"
      value={value}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      autoComplete="off"
      spellCheck={false}
      placeholder="Paste text here…"
      onChange={handleChange}
      onPaste={onBeforePaste}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    />
  );
}

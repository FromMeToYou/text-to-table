import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Text to Table – Paste any text, get a table",
  description:
    "Paste any text and get an instant, sortable, searchable table. Detects CSV, TSV, JSON Lines, Markdown tables, and aligned terminal output automatically. Everything runs in your browser — nothing is ever uploaded.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

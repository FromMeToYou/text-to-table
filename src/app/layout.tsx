import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Text to Table – Paste any text, get a table",
  description:
    "Paste any text and get an instant, sortable, searchable table. Detects CSV, TSV, JSON Lines, Markdown tables, and aligned terminal output automatically. Everything runs in your browser — nothing is ever uploaded.",
};

// React dev mode needs eval for stack reconstruction; production never uses it.
const SCRIPT_SRC = process.env.NODE_ENV === "development" ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
const CSP = `default-src 'self'; script-src ${SCRIPT_SRC}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        {/* Enforced in-page so the privacy guarantee holds on any static host, not only
            those that honour public/_headers. 'unsafe-inline' is required by Next's
            bootstrap scripts; connect-src 'self' is the part that matters. */}
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
      </head>
      <body>{children}</body>
    </html>
  );
}

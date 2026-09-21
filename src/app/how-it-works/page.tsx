import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How this works – Text to Table",
  description: "What Text to Table does and does not send over the network, and how to verify it yourself.",
};

export default function HowItWorksPage() {
  return (
    <div className="appShell">
      <header className="siteHeader">
        <h1>How this works</h1>
        <p className="subtitle">
          <Link href="/">← Back to Text to Table</Link>
        </p>
      </header>

      <main className="howItWorks">
        <p>
          Text to Table parses, sorts, searches, and exports entirely in your browser. Nothing you
          paste, upload, or type is sent to a server.
        </p>

        <ul>
          <li>
            <strong>No server processing.</strong> This site is a static export — there is no backend
            that ever receives your text. Parsing, type inference, sorting, and search all run as
            JavaScript in your browser tab.
          </li>
          <li>
            <strong>CSP <code>connect-src &apos;self&apos;</code>.</strong> The page&apos;s Content
            Security Policy restricts outgoing network requests to the site&apos;s own origin, so the
            browser itself blocks any script from phoning your data home.
          </li>
          <li>
            <strong>No error reporting tools.</strong> No Sentry, no crash reporters, no third-party
            SDK that could capture your input as part of a stack trace or breadcrumb.
          </li>
          <li>
            <strong>No external scripts.</strong> Every script this page runs is bundled at build
            time and served from this origin. Nothing is loaded from a CDN at runtime.
          </li>
          <li>
            <strong>Pageview-only analytics, if any.</strong> Any analytics in use count visits, not
            content. Your pasted text, clipboard contents, and file names are never attached to an
            event.
          </li>
        </ul>

        <h2>How to verify it yourself</h2>
        <ol>
          <li>Open your browser&apos;s DevTools and go to the Network tab.</li>
          <li>Paste a large block of text into the table on the home page.</li>
          <li>Sort a column, search, and export to CSV, TSV, Markdown, JSON, or Excel.</li>
          <li>
            Confirm that no request in the Network tab carries your pasted text, and that no request
            goes to a third-party domain.
          </li>
        </ol>
      </main>

      <footer className="siteFooter">
        <p>
          Processing happens entirely in your browser. We never see your data.{" "}
          <Link href="/">Back to the app</Link>
        </p>
      </footer>
    </div>
  );
}

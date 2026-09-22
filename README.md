# Text to Table

Paste any text. It becomes a table. Nothing leaves your browser.

Single-page static site: paste terminal output (`kubectl`, `docker ps`, `ps aux`, `df -h`, …), CSV/TSV/semicolon, pipe/Markdown tables or JSON Lines and get an instant sortable, searchable table with CSV / Excel / Markdown / JSON export. All parsing runs client-side; there is no backend.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine fixture corpus + unit tests (vitest)
npm run build      # static export → out/
```

## Layout

- `src/engine/` — pure parsing engine: preprocess → scored format detection → parser → header detection → type inference. `parseText(text) → { format, columns, rows }`. No DOM, no React.
- `src/engine/export.ts` — CSV/TSV/Markdown/JSON/XLSX.
- `fixtures/` — real command outputs and sample files with `.expected.json`; every fixture is a regression test.
- `src/app/`, `src/components/` — the page.
- `public/_headers` — Cloudflare Pages headers (CSP `connect-src 'self'`).

## Deploy

Live: https://frommetoyou.github.io/text-to-table/ (GitHub Pages, `npm run deploy`). CSP is enforced by an in-page meta tag so it holds on any static host.

### Cloudflare Pages (alternative)

Build command `npm run build`, output directory `out`. The `_headers` file is copied into `out/` automatically and enforces the CSP. No environment variables, no server functions.

## Privacy contract

No server processing, no error reporting SDK, no external scripts, `connect-src 'self'`. Analytics, if ever added, must be pageview-only and never include input text. See `/how-it-works`.

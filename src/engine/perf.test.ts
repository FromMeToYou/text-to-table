import { expect, it } from "vitest";
import { parseText } from "./index";

/**
 * Guard against detection getting quadratic. The engine runs on the paste path
 * with a 300ms debounce, so 10k rows have to land well inside one frame budget
 * of slack. Measured ~100ms; the 500ms bar leaves room for slower CI hardware.
 */
it("parses 10k aligned rows in under 500ms", () => {
  const lines = ["NAME            STATUS    RESTARTS   CPU     MEMORY     AGE"];
  for (let i = 0; i < 10000; i++) {
    const name = `api-${String(i).padStart(6, "0")}`.padEnd(16, " ");
    const status = (i % 17 === 0 ? "Pending" : "Running").padEnd(10, " ");
    const restarts = String(i % 9).padEnd(11, " ");
    const cpu = `${i % 100}%`.padEnd(8, " ");
    const mem = `${(i % 900) + 12}Mi`.padEnd(11, " ");
    lines.push(`${name}${status}${restarts}${cpu}${mem}${(i % 30) + 1}d`);
  }
  const text = lines.join("\n");

  const started = performance.now();
  const r = parseText(text);
  const elapsed = performance.now() - started;

  expect(r.format).toBe("aligned");
  expect(r.hasHeader).toBe(true);
  expect(r.columns).toHaveLength(6);
  expect(r.rows).toHaveLength(10000);
  expect(r.rows[9999][0]).toBe("api-009999");
  expect(elapsed).toBeLessThan(500);
});

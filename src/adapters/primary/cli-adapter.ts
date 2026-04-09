// Primary adapter: CLI for schema diff and response diff
// Imports only from ports

import type { DiffPresenterPort } from "../../core/ports/index.js";
import type { DiffResult, MigrationGuide, SchemaCompareResult } from "../../core/domain/types.js";
import { SEVERITY_MAP } from "../../core/domain/types.js";

const CHANGE_COLORS: Record<string, string> = {
  removed: "\x1b[31m",    // red
  "type-change": "\x1b[33m", // amber
  renamed: "\x1b[34m",    // blue
  moved: "\x1b[35m",      // purple
  changed: "\x1b[33m",    // amber
  added: "\x1b[32m",      // green
  unchanged: "\x1b[90m",  // muted
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

export class CliAdapter implements DiffPresenterPort {
  presentDiffResults(results: DiffResult[]): void {
    const changed = results.filter((r) => r.type !== "unchanged");
    if (changed.length === 0) {
      console.log("\n  No changes detected.\n");
      return;
    }

    console.log(`\n  ${BOLD}${changed.length} change(s) detected${RESET}\n`);
    console.log("  " + "─".repeat(60));

    for (const r of changed) {
      const color = CHANGE_COLORS[r.type] ?? "";
      const badge = `[${r.type}]`.padEnd(14);
      let line = `  ${color}${badge}${RESET} ${r.path}`;

      if (r.newPath) line += ` → ${r.newPath}`;
      if (r.old !== undefined && r.type !== "renamed" && r.type !== "moved") {
        line += `  ${CHANGE_COLORS.removed}${truncate(r.old)}${RESET}`;
      }
      if (r.new !== undefined && r.type !== "renamed" && r.type !== "moved") {
        line += ` → ${CHANGE_COLORS.added}${truncate(r.new)}${RESET}`;
      }
      console.log(line);
    }

    console.log("  " + "─".repeat(60));
    printSummary(changed);
  }

  presentSchemaResult(result: SchemaCompareResult): void {
    if (result.output) console.log(result.output);
    console.log(
      `\n  ${result.breakingCount} breaking  |  ${result.deprecatedCount} deprecated  |  ${result.nonBreakingCount} non-breaking\n`,
    );
  }

  presentGuide(guide: MigrationGuide): void {
    console.log(`\n  ${BOLD}${guide.title}${RESET}`);
    if (guide.sunsetDate) console.log(`  Sunset: ${guide.sunsetDate}`);
    console.log("");

    for (const change of guide.changes) {
      const sev = change.severity === "breaking" ? "\x1b[31m" : change.severity === "deprecated" ? "\x1b[33m" : "\x1b[32m";
      console.log(`  ${sev}[${change.severity}]${RESET} ${change.summary}`);
      for (const item of change.checklistItems) {
        console.log(`    [ ] ${item.text}`);
      }
    }
    console.log("");
  }

  presentError(message: string): void {
    console.error(`\n  ${CHANGE_COLORS.removed}Error:${RESET} ${message}\n`);
  }
}

function truncate(value: unknown, max = 40): string {
  const s = JSON.stringify(value);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function printSummary(results: DiffResult[]): void {
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.type] = (counts[r.type] ?? 0) + 1;
  const parts = Object.entries(counts).map(([type, count]) => `${count} ${type}`);
  console.log(`\n  ${parts.join("  |  ")}\n`);
}

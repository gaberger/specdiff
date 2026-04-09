import { describe, expect, test } from "bun:test";
import { buildGuide } from "../../src/core/domain/guide-builder.js";
import type { DiffResult } from "../../src/core/domain/types.js";

describe("buildGuide", () => {
  const diffs: DiffResult[] = [
    { type: "removed", path: "billing", old: "charge_automatically" },
    { type: "renamed", path: "sources", newPath: "payment_methods", old: [], new: [] },
    { type: "added", path: "collection_method", new: "charge_automatically" },
    { type: "unchanged", path: "id", old: "cus_123", new: "cus_123" },
  ];

  test("produces a guide with correct title and versions", () => {
    const guide = buildGuide(diffs, "v1", "v2");
    expect(guide.title).toBe("Migration guide: v1 → v2");
    expect(guide.versions).toEqual({ base: "v1", revision: "v2" });
  });

  test("excludes unchanged fields from changes", () => {
    const guide = buildGuide(diffs, "v1", "v2");
    expect(guide.changes).toHaveLength(3); // removed, renamed, added — not unchanged
  });

  test("classifies severity correctly", () => {
    const guide = buildGuide(diffs, "v1", "v2");
    const severities = guide.changes.map((c) => c.severity);
    expect(severities).toContain("breaking");
    expect(severities).toContain("non-breaking");
  });

  test("generates checklist items for each change", () => {
    const guide = buildGuide(diffs, "v1", "v2");
    for (const change of guide.changes) {
      expect(change.checklistItems.length).toBeGreaterThan(0);
      for (const item of change.checklistItems) {
        expect(item.completed).toBe(false);
        expect(item.id).toBeTruthy();
      }
    }
  });

  test("includes sunset date in timeline when provided", () => {
    const guide = buildGuide(diffs, "v1", "v2", "2025-06-01");
    expect(guide.sunsetDate).toBe("2025-06-01");
    const sunsetStep = guide.timeline.find((s) => s.label === "Sunset");
    expect(sunsetStep).toBeDefined();
    expect(sunsetStep!.date).toBe("2025-06-01");
  });

  test("generates code examples for breaking changes", () => {
    const guide = buildGuide(diffs, "v1", "v2");
    const removed = guide.changes.find((c) => c.diffResult.type === "removed");
    expect(removed!.codeExamples.node).toBeDefined();
    expect(removed!.codeExamples.python).toBeDefined();
  });
});

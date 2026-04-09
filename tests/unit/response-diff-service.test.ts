import { describe, expect, test, beforeEach } from "bun:test";
import { ResponseDiffService } from "../../src/core/usecases/response-diff-service.js";
import type { ChecklistStoragePort } from "../../src/core/ports/index.js";

// London-school: mock the port
class MockStorage implements ChecklistStoragePort {
  private store = new Map<string, Record<string, boolean>>();
  async save(key: string, items: Record<string, boolean>) {
    this.store.set(key, items);
  }
  async load(key: string) {
    return this.store.get(key) ?? {};
  }
}

describe("ResponseDiffService", () => {
  let service: ResponseDiffService;
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
    service = new ResponseDiffService(storage);
  });

  test("diff returns structured results", () => {
    const results = service.diff({ name: "a" }, { name: "b" });
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe("changed");
  });

  test("generateGuide returns a complete guide", () => {
    const guide = service.generateGuide(
      { billing: "auto" },
      { collection_method: "auto" },
      "v1",
      "v2",
    );
    expect(guide.title).toContain("v1");
    expect(guide.changes.length).toBeGreaterThan(0);
  });

  test("filterByType filters to breaking only", () => {
    const results = service.diff(
      { a: 1, b: "x", c: true },
      { a: 1, c: 42 },
    );
    const breaking = service.filterByType(results, "breaking");
    for (const r of breaking) {
      expect(["removed", "type-change", "renamed", "moved"]).toContain(r.type);
    }
  });

  test("filterByType 'all' returns everything", () => {
    const results = service.diff({ a: 1 }, { a: 2 });
    const all = service.filterByType(results, "all");
    expect(all).toEqual(results);
  });

  test("checklist state round-trips through storage", async () => {
    await service.saveChecklistState("guide-1", { "chk-1": true });
    const state = await service.loadChecklistState("guide-1");
    expect(state["chk-1"]).toBe(true);
  });
});

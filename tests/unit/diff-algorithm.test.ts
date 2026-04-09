import { describe, expect, test } from "bun:test";
import { computeDiff } from "../../src/core/domain/diff-algorithm.js";

describe("computeDiff", () => {
  test("detects unchanged fields", () => {
    const results = computeDiff({ name: "Alice" }, { name: "Alice" });
    expect(results).toEqual([
      { type: "unchanged", path: "name", old: "Alice", new: "Alice" },
    ]);
  });

  test("detects removed fields", () => {
    const results = computeDiff({ name: "Alice", age: 30 }, { name: "Alice" });
    const removed = results.filter((r) => r.type === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0]!.path).toBe("age");
  });

  test("detects added fields", () => {
    const results = computeDiff({ name: "Alice" }, { name: "Alice", email: "a@b.c" });
    const added = results.filter((r) => r.type === "added");
    expect(added).toHaveLength(1);
    expect(added[0]!.path).toBe("email");
  });

  test("detects value changes", () => {
    const results = computeDiff({ status: "active" }, { status: "inactive" });
    const changed = results.filter((r) => r.type === "changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]!.old).toBe("active");
    expect(changed[0]!.new).toBe("inactive");
  });

  test("detects type changes", () => {
    const results = computeDiff({ count: "5" }, { count: 5 });
    const typeChanges = results.filter((r) => r.type === "type-change");
    expect(typeChanges).toHaveLength(1);
    expect(typeChanges[0]!.oldType).toBe("string");
    expect(typeChanges[0]!.newType).toBe("number");
  });

  test("detects renames (same value, different key)", () => {
    const results = computeDiff(
      { billing: "charge_automatically" },
      { collection_method: "charge_automatically" },
    );
    const renamed = results.filter((r) => r.type === "renamed");
    expect(renamed).toHaveLength(1);
    expect(renamed[0]!.path).toBe("billing");
    expect(renamed[0]!.newPath).toBe("collection_method");
  });

  test("detects moves (same leaf name and value, different path)", () => {
    const results = computeDiff(
      { address: { city: "SF" } },
      { location: { city: "SF" } },
    );
    const moved = results.filter((r) => r.type === "moved");
    expect(moved).toHaveLength(1);
    expect(moved[0]!.path).toBe("address.city");
    expect(moved[0]!.newPath).toBe("location.city");
  });

  test("handles nested object changes", () => {
    const results = computeDiff(
      { user: { name: "Alice", role: "admin" } },
      { user: { name: "Alice", role: "member" } },
    );
    const changed = results.filter((r) => r.type === "changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]!.path).toBe("user.role");
  });

  test("detects array length changes as type-change", () => {
    const results = computeDiff(
      { tags: ["a", "b"] },
      { tags: ["a", "b", "c"] },
    );
    const typeChanges = results.filter((r) => r.type === "type-change");
    expect(typeChanges).toHaveLength(1);
    expect(typeChanges[0]!.oldType).toBe("array[2]");
    expect(typeChanges[0]!.newType).toBe("array[3]");
  });

  test("detects array content changes as value-changed when same length", () => {
    const results = computeDiff(
      { tags: ["a", "b"] },
      { tags: ["a", "x"] },
    );
    const changed = results.filter((r) => r.type === "changed");
    expect(changed).toHaveLength(1);
  });

  test("handles empty objects as input", () => {
    const results = computeDiff({}, {});
    expect(results).toEqual([]);
  });

  test("handles full Stripe-like response diff", () => {
    const v1 = {
      id: "cus_123",
      object: "customer",
      billing: "charge_automatically",
      sources: { data: [] },
      account_balance: 0,
    };
    const v2 = {
      id: "cus_123",
      object: "customer",
      collection_method: "charge_automatically",
      payment_methods: { data: [] },
      balance: 0,
    };
    const results = computeDiff(v1, v2);
    const types = results.map((r) => r.type);

    expect(types).toContain("unchanged"); // id, object
    expect(types).toContain("renamed");   // billing -> collection_method
  });
});

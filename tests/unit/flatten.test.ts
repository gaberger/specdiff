import { describe, expect, test } from "bun:test";
import { flatten, leafName, describeType } from "../../src/core/domain/flatten.js";

describe("flatten", () => {
  test("flattens nested objects to dot-notation", () => {
    const result = flatten({
      address: { line1: "123 Main St", city: "San Francisco" },
      billing: "charge_automatically",
    });
    expect(result).toEqual({
      "address.line1": "123 Main St",
      "address.city": "San Francisco",
      billing: "charge_automatically",
    });
  });

  test("treats arrays as leaf values", () => {
    const result = flatten({ tags: ["a", "b"], name: "test" });
    expect(result).toEqual({ tags: ["a", "b"], name: "test" });
  });

  test("treats empty objects as leaf values", () => {
    const result = flatten({ meta: {}, name: "test" });
    expect(result).toEqual({ meta: {}, name: "test" });
  });

  test("treats null as leaf value", () => {
    const result = flatten({ value: null, name: "test" });
    expect(result).toEqual({ value: null, name: "test" });
  });

  test("handles deeply nested objects", () => {
    const result = flatten({ a: { b: { c: { d: 42 } } } });
    expect(result).toEqual({ "a.b.c.d": 42 });
  });

  test("handles flat objects unchanged", () => {
    const result = flatten({ x: 1, y: 2 });
    expect(result).toEqual({ x: 1, y: 2 });
  });
});

describe("leafName", () => {
  test("returns last segment of dot path", () => {
    expect(leafName("a.b.c")).toBe("c");
  });

  test("returns full string if no dots", () => {
    expect(leafName("name")).toBe("name");
  });
});

describe("describeType", () => {
  test("null", () => expect(describeType(null)).toBe("null"));
  test("undefined", () => expect(describeType(undefined)).toBe("undefined"));
  test("array", () => expect(describeType([1, 2])).toBe("array[2]"));
  test("string", () => expect(describeType("hi")).toBe("string"));
  test("number", () => expect(describeType(42)).toBe("number"));
  test("object", () => expect(describeType({})).toBe("object"));
});

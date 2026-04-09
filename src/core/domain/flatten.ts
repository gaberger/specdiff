// Pure function: deep object flattening to dot-notation paths
// Zero external imports — domain only

import type { FlatMap } from "./types.js";

export function flatten(obj: unknown, prefix = ""): FlatMap {
  const result: Record<string, unknown> = {};

  if (obj === null || obj === undefined) {
    if (prefix) result[prefix] = obj;
    return result;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      if (prefix) result[prefix] = obj;
      return result;
    }
    // Arrays of objects: recurse using name/id/$ref as key, or stable content key
    if (typeof obj[0] === "object" && obj[0] !== null && !Array.isArray(obj[0])) {
      for (let i = 0; i < obj.length; i++) {
        const item = obj[i] as Record<string, unknown>;
        const itemKey = typeof item.name === "string" ? item.name
          : typeof item.id === "string" ? item.id
          : typeof item.$ref === "string" ? item.$ref
          // For anonymous objects (allOf/oneOf items), use first property key as stable identifier
          : Object.keys(item).length > 0 ? `[${Object.keys(item)[0]}:${String(Object.values(item)[0]).slice(0, 30)}]`
          : String(i);
        const path = prefix ? `${prefix}.${itemKey}` : itemKey;
        Object.assign(result, flatten(item, path));
      }
      return result;
    }
    // Arrays of primitives or mixed: keep as leaf
    if (prefix) result[prefix] = obj;
    return result;
  }

  if (typeof obj !== "object") {
    if (prefix) result[prefix] = obj;
    return result;
  }

  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record);

  // Empty objects are leaf values
  if (keys.length === 0) {
    if (prefix) result[prefix] = obj;
    return result;
  }

  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = record[key];

    if (
      value !== null &&
      value !== undefined &&
      typeof value === "object" &&
      Object.keys(value as object).length > 0
    ) {
      // Recurse into non-empty objects and arrays of objects
      Object.assign(result, flatten(value, path));
    } else {
      result[path] = value;
    }
  }

  return result;
}

export function leafName(path: string): string {
  const parts = path.split(".");
  return parts[parts.length - 1] ?? path;
}

export function describeType(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `array[${value.length}]`;
  return typeof value;
}

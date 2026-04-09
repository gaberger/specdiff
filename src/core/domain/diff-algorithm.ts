// Pure diff algorithm — zero external imports, domain only
// Implements the change detection algorithm from ARCHITECTURE.md

import type { DiffResult, FlatMap } from "./types.js";
import { flatten, leafName, describeType } from "./flatten.js";

function parentPath(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx > 0 ? path.slice(0, idx) : "";
}

function sharedAncestorDepth(a: string, b: string): number {
  const partsA = a.split(".");
  const partsB = b.split(".");
  let shared = 0;
  for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
    if (partsA[i] === partsB[i]) shared++;
    else break;
  }
  return shared;
}

function isRelated(a: string, b: string): boolean {
  const depth = Math.max(a.split(".").length, b.split(".").length);
  const shared = sharedAncestorDepth(a, b);
  // Short paths (<=3 segments): need at least 1 shared ancestor
  // Medium paths (4-6): need at least 2
  // Long paths (7+): need at least 3 or 40% of depth
  const required = depth <= 3 ? 1 : depth <= 6 ? 2 : Math.max(3, Math.ceil(depth * 0.4));
  return shared >= required;
}

export function computeDiff(a: unknown, b: unknown): DiffResult[] {
  const fa = flatten(a);
  const fb = flatten(b);
  return diffFlatMaps(fa, fb);
}

export function diffFlatMaps(fa: FlatMap, fb: FlatMap): DiffResult[] {
  const results: DiffResult[] = [];
  const aKeys = Object.keys(fa);
  const bKeys = Object.keys(fb);
  const allKeys = new Set([...aKeys, ...bKeys]);
  const processed = new Set<string>();

  // Pre-build indexes for O(1) rename/move lookups instead of O(n²)
  // Index: serialized value → [keys in fb that are NOT in fa]
  const fbOnlyByValue = new Map<string, string[]>();
  // Index: (leaf+serialized) → [keys in fb that are NOT in fa]
  const fbOnlyByLeafValue = new Map<string, string[]>();

  for (const fbKey of bKeys) {
    if (fbKey in fa) continue;
    const ser = serialize(fb[fbKey]);
    const leaf = leafName(fbKey);

    let byVal = fbOnlyByValue.get(ser);
    if (!byVal) { byVal = []; fbOnlyByValue.set(ser, byVal); }
    byVal.push(fbKey);

    const leafKey = leaf + "\0" + ser;
    let byLeaf = fbOnlyByLeafValue.get(leafKey);
    if (!byLeaf) { byLeaf = []; fbOnlyByLeafValue.set(leafKey, byLeaf); }
    byLeaf.push(fbKey);
  }

  for (const key of allKeys) {
    if (processed.has(key)) continue;

    const inA = key in fa;
    const inB = key in fb;

    if (inA && inB) {
      const oldVal = fa[key];
      const newVal = fb[key];

      if (serialize(oldVal) === serialize(newVal)) {
        results.push({ type: "unchanged", path: key, old: oldVal, new: newVal });
      } else if (describeType(oldVal) !== describeType(newVal)) {
        results.push({
          type: "type-change",
          path: key,
          old: oldVal,
          new: newVal,
          oldType: describeType(oldVal),
          newType: describeType(newVal),
        });
      } else {
        results.push({ type: "changed", path: key, old: oldVal, new: newVal });
      }
    } else if (inA && !inB) {
      const ser = serialize(fa[key]);
      const leaf = leafName(key);

      // Check for rename: same value, different leaf name
      // Require same parent path OR both are top-level keys
      const renamePool = fbOnlyByValue.get(ser);
      let renamedTo: string | null = null;
      if (renamePool) {
        const keyParent = parentPath(key);
        for (const fbKey of renamePool) {
          if (processed.has(fbKey)) continue;
          if (leafName(fbKey) === leaf) continue;
          // Same parent (siblings) — always valid rename
          if (parentPath(fbKey) === keyParent) { renamedTo = fbKey; break; }
          // Different parent — require shared ancestor (min 2 levels) to avoid cross-schema matches
          if (isRelated(key, fbKey)) { renamedTo = fbKey; break; }
        }
      }

      if (renamedTo) {
        results.push({ type: "renamed", path: key, newPath: renamedTo, old: fa[key], new: fb[renamedTo] });
        processed.add(renamedTo);
      } else {
        // Check for move: same leaf name + value
        // Require: shared ancestor (min 2) OR same depth with same parent structure
        // This blocks cross-schema false positives while allowing parent renames
        const movePool = fbOnlyByLeafValue.get(leaf + "\0" + ser);
        let movedTo: string | null = null;
        if (movePool) {
          const keyDepth = key.split(".").length;
          for (const fbKey of movePool) {
            if (processed.has(fbKey)) continue;
            // Short paths (<=3): same depth is enough (address.city → location.city)
            if (keyDepth <= 3 && fbKey.split(".").length === keyDepth) { movedTo = fbKey; break; }
            // Longer paths: always require meaningful shared ancestry
            if (isRelated(key, fbKey)) { movedTo = fbKey; break; }
          }
        }

        if (movedTo) {
          results.push({ type: "moved", path: key, newPath: movedTo, old: fa[key], new: fb[movedTo] });
          processed.add(movedTo);
        } else {
          results.push({ type: "removed", path: key, old: fa[key] });
        }
      }
    } else {
      // inB only — added
      results.push({ type: "added", path: key, new: fb[key] });
    }

    processed.add(key);
  }

  return results;
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

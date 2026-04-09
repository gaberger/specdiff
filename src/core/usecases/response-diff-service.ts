// Use case: orchestrate response diffing
// Imports from domain + ports only

import { computeDiff } from "../domain/diff-algorithm.js";
import { buildGuide } from "../domain/guide-builder.js";
import type { DiffResult, MigrationGuide } from "../domain/types.js";
import type { ChecklistStoragePort } from "../ports/index.js";

export class ResponseDiffService {
  constructor(private readonly storage: ChecklistStoragePort) {}

  diff(oldResponse: unknown, newResponse: unknown): DiffResult[] {
    return computeDiff(oldResponse, newResponse);
  }

  generateGuide(
    oldResponse: unknown,
    newResponse: unknown,
    baseVersion: string,
    revisionVersion: string,
    sunsetDate?: string,
  ): MigrationGuide {
    const diffs = this.diff(oldResponse, newResponse);
    return buildGuide(diffs, baseVersion, revisionVersion, sunsetDate);
  }

  async saveChecklistState(
    guideKey: string,
    items: Record<string, boolean>,
  ): Promise<void> {
    await this.storage.save(guideKey, items);
  }

  async loadChecklistState(
    guideKey: string,
  ): Promise<Record<string, boolean>> {
    return this.storage.load(guideKey);
  }

  filterByType(results: DiffResult[], type: string): DiffResult[] {
    if (type === "all") return results;
    if (type === "breaking") {
      return results.filter((r) =>
        ["removed", "type-change", "renamed", "moved"].includes(r.type),
      );
    }
    return results.filter((r) => r.type === type);
  }
}

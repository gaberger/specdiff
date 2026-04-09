// Use case: orchestrate schema-level diffing via oasdiff
// Imports from domain + ports only

import type { SchemaCompareMode, SchemaCompareResult } from "../domain/types.js";
import type { SchemaFetchPort, OasdiffPort } from "../ports/index.js";

export class SchemaDiffService {
  constructor(
    private readonly schemaFetch: SchemaFetchPort,
    private readonly oasdiff: OasdiffPort,
  ) {}

  async compare(
    baseUrl: string,
    revisionUrl: string,
    mode: SchemaCompareMode,
  ): Promise<SchemaCompareResult> {
    const binaryPath = await this.oasdiff.ensureInstalled();

    const basePath = await this.schemaFetch.fetch(baseUrl, "base");
    const revisionPath = await this.schemaFetch.fetch(revisionUrl, "revision");

    try {
      return await this.oasdiff.compare(basePath, revisionPath, mode);
    } finally {
      await this.schemaFetch.cleanup(basePath);
      await this.schemaFetch.cleanup(revisionPath);
    }
  }

  hasBreakingChanges(result: SchemaCompareResult): boolean {
    return result.breakingCount > 0;
  }

  formatSummary(result: SchemaCompareResult): string {
    const parts: string[] = [];
    if (result.breakingCount > 0) parts.push(`${result.breakingCount} breaking`);
    if (result.deprecatedCount > 0) parts.push(`${result.deprecatedCount} deprecated`);
    if (result.nonBreakingCount > 0) parts.push(`${result.nonBreakingCount} non-breaking`);
    return parts.length > 0 ? parts.join("  |  ") : "No changes detected";
  }
}

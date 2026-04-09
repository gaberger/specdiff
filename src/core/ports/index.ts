// Port interfaces — contracts between layers
// May only import from domain

import type {
  DiffResult,
  MigrationGuide,
  SchemaCompareMode,
  SchemaCompareResult,
  ChecklistItem,
  ResolvedSpec,
} from "../domain/types.js";

/** Fetches an OpenAPI spec from a URL or file path, returns local file path */
export interface SchemaFetchPort {
  fetch(urlOrPath: string, label: string): Promise<string>;
  cleanup(path: string): Promise<void>;
}

/** Runs the oasdiff binary and returns structured output */
export interface OasdiffPort {
  compare(
    basePath: string,
    revisionPath: string,
    mode: SchemaCompareMode,
  ): Promise<SchemaCompareResult>;
  ensureInstalled(): Promise<string>;
}

/** Persists and retrieves migration checklist state */
export interface ChecklistStoragePort {
  save(guideKey: string, items: Record<string, boolean>): Promise<void>;
  load(guideKey: string): Promise<Record<string, boolean>>;
}

/** Renders diff results to a user-facing format */
export interface DiffPresenterPort {
  presentDiffResults(results: DiffResult[]): void;
  presentGuide(guide: MigrationGuide): void;
  presentError(message: string): void;
}

/** Serves the web UI for browser-based workflows */
export interface WebServerPort {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
}

/** Acquires and validates OpenAPI 2.0/3.0/3.1 specs from URLs or files */
export interface SpecInputPort {
  fromUrl(url: string): Promise<ResolvedSpec>;
  fromFile(content: string, filename: string): Promise<ResolvedSpec>;
}

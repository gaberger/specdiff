// Secondary adapter: acquires and validates OpenAPI specs
// Imports only from ports

import type { SpecInputPort } from "../../core/ports/index.js";
import type { ResolvedSpec, OpenApiFormat } from "../../core/domain/types.js";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import { parse as parseYaml } from "yaml";

const MAX_SPEC_SIZE = 10 * 1024 * 1024; // 10MB
const FETCH_TIMEOUT_MS = 10_000;

export class SpecInputAdapter implements SpecInputPort {
  async fromUrl(url: string): Promise<ResolvedSpec> {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "application/json, application/yaml, text/yaml, */*" },
      });
    } catch (e) {
      throw new Error(`Failed to fetch spec from ${url}: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch spec from ${url}: HTTP ${response.status}`);
    }

    const text = await response.text();
    if (text.length > MAX_SPEC_SIZE) {
      throw new Error(`Spec exceeds maximum size of ${MAX_SPEC_SIZE / 1024 / 1024}MB`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isYaml = contentType.includes("yaml") || url.endsWith(".yaml") || url.endsWith(".yml");
    const parsed = isYaml ? parseYamlSafe(text) : parseJsonSafe(text);

    return this.resolve(parsed);
  }

  async fromFile(content: string, filename: string): Promise<ResolvedSpec> {
    if (!content || content.trim().length === 0) {
      throw new Error("Empty file — nothing to parse");
    }

    if (content.length > MAX_SPEC_SIZE) {
      throw new Error(`Spec exceeds maximum size of ${MAX_SPEC_SIZE / 1024 / 1024}MB`);
    }

    const isYaml = /\.ya?ml$/i.test(filename);
    const parsed = isYaml ? parseYamlSafe(content) : parseJsonSafe(content);

    return this.resolve(parsed);
  }

  private async resolve(parsed: unknown): Promise<ResolvedSpec> {
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Unsupported format — expected a JSON/YAML object with 'openapi' or 'swagger' field");
    }

    const doc = parsed as Record<string, unknown>;
    const format = detectFormat(doc);

    let resolved: unknown;
    try {
      resolved = await $RefParser.dereference(structuredClone(doc));
    } catch (e) {
      throw new Error(`$ref resolution failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const metadata = extractMetadata(doc, format);

    return { format, document: resolved, metadata };
  }
}

function detectFormat(doc: Record<string, unknown>): OpenApiFormat {
  if (typeof doc["swagger"] === "string" && doc["swagger"].startsWith("2.")) {
    return "openapi-2.0";
  }
  if (typeof doc["openapi"] === "string") {
    const ver = doc["openapi"] as string;
    if (ver.startsWith("3.0")) return "openapi-3.0";
    if (ver.startsWith("3.1")) return "openapi-3.1";
  }
  throw new Error("Unsupported format — expected OpenAPI 2.0 (swagger: '2.0') or 3.x (openapi: '3.x.x')");
}

function extractMetadata(
  doc: Record<string, unknown>,
  format: OpenApiFormat,
): { title: string; version: string } {
  const info = (typeof doc["info"] === "object" && doc["info"] !== null)
    ? doc["info"] as Record<string, unknown>
    : {};
  return {
    title: typeof info["title"] === "string" ? info["title"] : "Untitled",
    version: typeof info["version"] === "string" ? info["version"] : format,
  };
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function parseYamlSafe(text: string): unknown {
  try {
    return parseYaml(text);
  } catch (e) {
    throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`);
  }
}
